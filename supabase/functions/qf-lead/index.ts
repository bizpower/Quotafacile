// ============================================================
// QuotaFacile — Lead locali
// ------------------------------------------------------------
// Ricerca di attività per zona e categoria, con le API ufficiali
// Google: Geocoding per trasformare un indirizzo in coordinate,
// Places (New) per trovare le attività in un raggio.
//
// NIENTE SCRAPING. Non è prudenza formale: raccogliere dati
// d'impresa da fonti ufficiali, conservandone la provenienza, è
// ciò che tiene la raccolta dentro il perimetro del legittimo
// interesse. Prenderli raschiando pagine altrui, no.
//
// LA CHIAVE GOOGLE STA SOLO QUI
// Mai nella pagina. Una chiave Places in un file JavaScript è
// pubblica per definizione, e la si ritrova consumata da altri
// sul conto di chi l'ha esposta.
//
// Serve il segreto QF_GOOGLE_KEY fra quelli del progetto, con
// abilitate "Places API (New)" e "Geocoding API". Finché manca,
// la funzione risponde 503 e lo dice: meglio dirlo che restituire
// un elenco vuoto, che sembrerebbe "nessun risultato".
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qf-admin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const rispondi = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });

const testo = (v: unknown, max = 500) =>
  v === undefined || v === null ? null : String(v).trim().slice(0, max) || null;

// ---------------- Accesso ----------------

const enc = new TextEncoder();

async function impronta(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function uguali(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

let improntaDb: string | null | undefined;

async function improntaAttesa(): Promise<string | null> {
  const segreto = Deno.env.get("QF_ADMIN_TOKEN");
  if (segreto) return await impronta(segreto);
  if (improntaDb === undefined) {
    const { data } = await db.from("impostazioni_admin")
      .select("token_hash").eq("id", 1).maybeSingle();
    improntaDb = data?.token_hash ?? null;
  }
  return improntaDb;
}

class ErroreCliente extends Error {
  constructor(msg: string, readonly status = 400) { super(msg); }
}

// ---------------- Categorie ----------------
// Un "type" solo di Places non basta quasi mai: per certe
// categorie non esiste, o è troppo largo. Si cerca per parole,
// con i sinonimi che la gente usa davvero nelle insegne.
const CATEGORIE: Record<string, string> = {
  ristorazione: "ristorante trattoria pizzeria",
  bar: "bar caffetteria",
  hotel: "hotel albergo bed and breakfast",
  cantine: "cantina azienda vinicola winery",
  enoteche: "enoteca wine shop",
  agriturismi: "agriturismo",
  officine: "officina meccanica autoriparazioni",
  concessionarie: "concessionaria auto rivenditore auto",
  edilizia: "impresa edile costruzioni ristrutturazioni",
  impiantisti: "idraulico elettricista impianti termoidraulici",
  studi: "studio commercialista consulente del lavoro",
  avvocati: "studio legale avvocato",
  medici: "studio medico poliambulatorio dentista",
  palestre: "palestra centro fitness",
  parrucchieri: "parrucchiere barbiere centro estetico",
  negozi: "negozio abbigliamento calzature",
  supermercati: "supermercato alimentari minimarket",
  trasporti: "autotrasporti spedizioni logistica",
  agenzie_immobiliari: "agenzia immobiliare",
  assicurazioni: "agenzia assicurativa broker assicurazioni",
};

const RAGGI = [500, 1000, 2000, 5000, 10000];

// ---------------- Google ----------------

function chiaveGoogle(): string {
  const k = Deno.env.get("QF_GOOGLE_KEY");
  if (!k) {
    throw new ErroreCliente(
      "Ricerca non attiva: manca il segreto QF_GOOGLE_KEY fra le impostazioni del progetto Supabase. " +
      "Serve una chiave Google con abilitate «Places API (New)» e «Geocoding API».",
      503,
    );
  }
  return k;
}

// Da indirizzo a coordinate. La precisione conta: con un
// risultato approssimativo il cerchio di ricerca è centrato nel
// posto sbagliato, e i risultati sembrano casuali senza che si
// capisca perché. Meglio dirlo che lasciarlo indovinare.
async function coordinate(indirizzo: string, provincia: string | null) {
  const u = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  u.searchParams.set("address", indirizzo);
  u.searchParams.set("key", chiaveGoogle());
  u.searchParams.set("language", "it");
  u.searchParams.set("components", provincia
    ? `country:IT|administrative_area:${provincia}`
    : "country:IT");

  const r = await fetch(u);
  const d = await r.json();
  if (d.status === "ZERO_RESULTS") {
    throw new ErroreCliente("Indirizzo non trovato: prova con una zona più ampia o controlla la scrittura.");
  }
  if (d.status !== "OK") {
    throw new ErroreCliente("Geocoding non riuscito: " + (d.error_message || d.status));
  }
  const primo = d.results[0];
  const tipo = primo.geometry?.location_type;
  return {
    lat: primo.geometry.location.lat,
    lng: primo.geometry.location.lng,
    indirizzoTrovato: primo.formatted_address,
    preciso: tipo === "ROOFTOP" || tipo === "RANGE_INTERPOLATED",
    tipo,
  };
}

const CAMPI = [
  "places.id", "places.displayName", "places.formattedAddress",
  "places.nationalPhoneNumber", "places.websiteUri",
  "places.rating", "places.userRatingCount", "places.location",
  "places.primaryTypeDisplayName", "places.businessStatus",
  "places.addressComponents",
  "nextPageToken",
].join(",");

async function paginaPlaces(query: string, centro: { lat: number; lng: number },
                            raggio: number, pageToken?: string) {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": chiaveGoogle(),
      "X-Goog-FieldMask": CAMPI,
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "it",
      regionCode: "IT",
      pageSize: 20,
      ...(pageToken ? { pageToken } : {}),
      locationRestriction: {
        circle: { center: { latitude: centro.lat, longitude: centro.lng }, radius: raggio },
      },
    }),
  });
  const d = await r.json();
  if (!r.ok) {
    throw new ErroreCliente("Places ha rifiutato la richiesta: " +
      (d?.error?.message || r.status) +
      ". Controlla che «Places API (New)» sia abilitata e che la chiave non abbia restrizioni che escludono questo server.");
  }
  return d;
}

const componente = (p: Record<string, unknown>, tipo: string) => {
  const c = (p.addressComponents as Array<Record<string, unknown>> | undefined)
    ?.find((x) => (x.types as string[] | undefined)?.includes(tipo));
  return (c?.shortText as string | undefined) ?? (c?.longText as string | undefined) ?? null;
};

async function cerca(d: Record<string, unknown>) {
  const categorie = Array.isArray(d.categorie)
    ? d.categorie.map(String).filter((c) => CATEGORIE[c]).slice(0, 4)
    : [];
  if (!categorie.length) throw new ErroreCliente("Scegli almeno una categoria");

  const raggio = RAGGI.includes(Number(d.raggio)) ? Number(d.raggio) : 2000;
  const soloQualita = d.soloQualita === true;
  const massimo = Math.min(Number(d.massimo) || 50, 50);

  // La query di geocoding: o la zona così com'è, o i campi
  // strutturati messi in fila dal più specifico al più generico.
  const provincia = testo(d.provincia, 4);
  const indirizzo = d.modalita === "precisa"
    ? [testo(d.via, 120), testo(d.cap, 10), testo(d.citta, 120), provincia ? `(${provincia})` : null, "Italia"]
        .filter(Boolean).join(", ")
    : testo(d.zona, 200);
  if (!indirizzo) throw new ErroreCliente("Indica dove cercare");

  const centro = await coordinate(indirizzo, d.modalita === "precisa" ? provincia : null);

  const trovate = new Map<string, Record<string, unknown>>();
  const avvisi: string[] = [];
  if (!centro.preciso) {
    avvisi.push("L'indirizzo è stato individuato in modo approssimativo: aggiungi il numero civico o il CAP per centrare meglio la ricerca.");
  }

  for (const cat of categorie) {
    let token: string | undefined;
    // tre pagine da 20 sono il massimo che Places restituisce
    for (let pagina = 0; pagina < 3 && trovate.size < massimo; pagina++) {
      const d2 = await paginaPlaces(CATEGORIE[cat], centro, raggio, token);
      for (const p of (d2.places ?? [])) {
        if (trovate.size >= massimo) break;
        if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
        if (soloQualita && !((p.rating ?? 0) >= 3.5 && (p.userRatingCount ?? 0) >= 5)) continue;
        if (trovate.has(p.id)) continue;
        trovate.set(p.id, {
          place_id: p.id,
          nome: p.displayName?.text ?? "—",
          categoria: cat,
          tipo_google: p.primaryTypeDisplayName?.text ?? null,
          indirizzo: p.formattedAddress ?? null,
          citta: componente(p, "locality") ?? componente(p, "administrative_area_level_3"),
          provincia: componente(p, "administrative_area_level_2"),
          cap: componente(p, "postal_code"),
          telefono: p.nationalPhoneNumber ?? null,
          sito: p.websiteUri ?? null,
          valutazione: p.rating ?? null,
          recensioni: p.userRatingCount ?? null,
          lat: p.location?.latitude ?? null,
          lng: p.location?.longitude ?? null,
        });
      }
      token = d2.nextPageToken;
      if (!token) break;
    }
  }

  // Quali sono già in archivio: mostrarlo evita di riproporre
  // come nuovo un contatto che qualcuno sta già lavorando.
  const ids = [...trovate.keys()];
  const { data: gia } = ids.length
    ? await db.from("crm_lead").select("place_id").in("place_id", ids)
    : { data: [] };
  const giaPresenti = new Set((gia ?? []).map((x: { place_id: string }) => x.place_id));

  return {
    risultati: [...trovate.values()].map((r) => ({ ...r, gia: giaPresenti.has(r.place_id as string) })),
    centro: { lat: centro.lat, lng: centro.lng, indirizzo: centro.indirizzoTrovato },
    query: indirizzo,
    avvisi,
  };
}

// ---------------- Archivio ----------------

async function salva(d: Record<string, unknown>) {
  const righe = Array.isArray(d.lead) ? d.lead.slice(0, 50) : [];
  if (!righe.length) throw new ErroreCliente("Nessun lead selezionato");
  const query = testo(d.query, 300);

  const daScrivere = righe.map((r: Record<string, unknown>) => ({
    place_id: testo(r.place_id, 200),
    nome: testo(r.nome, 200) ?? "—",
    categoria: testo(r.categoria, 60),
    indirizzo: testo(r.indirizzo, 300),
    citta: testo(r.citta, 120),
    provincia: testo(r.provincia, 10),
    cap: testo(r.cap, 10),
    telefono: testo(r.telefono, 60),
    sito: testo(r.sito, 300),
    valutazione: r.valutazione ?? null,
    recensioni: r.recensioni ?? null,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    fonte: "google_places",
    query_origine: query,
  }));

  // ignoreDuplicates: chi è già in archivio resta com'è, con la
  // sua lavorazione e le sue note. Una nuova ricerca non deve
  // riportare indietro un lead che qualcuno ha già mosso.
  const { data, error } = await db.from("crm_lead")
    .upsert(daScrivere, { onConflict: "place_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return { salvati: data?.length ?? 0, richiesti: daScrivere.length };
}

async function elenco() {
  const { data, error } = await db.from("crm_lead")
    .select("*").order("creato_il", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return { lead: data ?? [], categorie: CATEGORIE, letteIl: new Date().toISOString() };
}

async function aggiorna(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo del lead");
  const patch: Record<string, unknown> = {};

  if (d.stato !== undefined) {
    const s = String(d.stato);
    if (!["nuovo", "contattato", "in_trattativa", "cliente", "scartato"].includes(s)) {
      throw new ErroreCliente("Stato non valido");
    }
    patch.stato = s;
    if (s === "contattato") patch.contattato_il = new Date().toISOString();
  }
  if (d.assegnato_a !== undefined) patch.assegnato_a = testo(d.assegnato_a, 40);
  if (d.note !== undefined) patch.note = testo(d.note, 2000);
  if (!Object.keys(patch).length) throw new ErroreCliente("Niente da aggiornare");

  const { error } = await db.from("crm_lead").update(patch).eq("id", id);
  // 23503 = riferimento a un collaboratore che non esiste. È un
  // errore di chi chiama, non un guasto: va detto come tale.
  if (error) {
    throw error.code === "23503"
      ? new ErroreCliente("Il collaboratore indicato non esiste più.")
      : new Error(error.message);
  }
  return { aggiornato: true };
}

async function elimina(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo del lead");
  const { error } = await db.from("crm_lead").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { eliminato: true };
}

const AZIONI: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
  cerca, salva, elenco: () => elenco(), aggiorna, elimina,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return rispondi({ ok: false, errore: "Metodo non consentito" }, 405);

  const atteso = await improntaAttesa();
  if (!atteso) {
    return rispondi({ ok: false, errore: "CRM non attivo: nessuna chiave di amministrazione configurata.", configurazioneMancante: true }, 503);
  }
  const fornita = req.headers.get("x-qf-admin");
  if (!fornita || !uguali(await impronta(fornita), atteso)) {
    return rispondi({ ok: false, errore: "Chiave di amministrazione errata" }, 401);
  }

  try {
    const body = await req.json();
    const azione = AZIONI[String(body?.azione ?? "")];
    if (!azione) return rispondi({ ok: false, errore: "Azione non riconosciuta" }, 400);
    return rispondi({ ok: true, ...(await azione(body.dati ?? {}) as object) });
  } catch (e) {
    if (e instanceof ErroreCliente) return rispondi({ ok: false, errore: e.message }, e.status);
    console.error("[qf-lead]", e);
    return rispondi({ ok: false, errore: e instanceof Error ? e.message : "Errore imprevisto" }, 500);
  }
});
