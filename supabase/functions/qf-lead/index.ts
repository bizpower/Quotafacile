// ============================================================
// QuotaFacile — Lead locali
// ------------------------------------------------------------
// Ricerca di attività per zona e categoria, con le API ufficiali
// Google: Geocoding per trasformare un indirizzo in coordinate,
// Places (New) per trovare le attività in un raggio.
//
// L'ANAGRAFICA VIENE DALLE API UFFICIALI, NON DA PAGINE RASCHIATE.
// Non è prudenza formale: raccogliere dati d'impresa da fonti
// ufficiali, conservandone la provenienza, è ciò che tiene la
// raccolta dentro il perimetro del legittimo interesse.
//
// C'è una sola eccezione, ed è dichiarata: l'email. Google non la
// restituisce, e quando l'operatore la chiede esplicitamente
// viene letta sul sito che l'attività pubblica da sé — una delle
// tre fonti già elencate nell'informativa alle imprese. Si apre
// la homepage e al massimo due pagine di contatti, con un tetto
// di tempo e di byte e presentandosi con un User-Agent che
// rimanda all'informativa. Leggere la pagina dei contatti di
// un'azienda non è scandagliare un sito, e deve restare tale:
// l'email salvata porta con sé email_fonte, così la scheda può
// dire da dove viene.
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

// La chiave sta in un posto solo: l'impronta in impostazioni_admin.
//
// Prima ce n'erano due, e il segreto QF_ADMIN_TOKEN vinceva sul
// database. Sembrava prudente - la chiave non tocca il database -
// ma nella pratica creava una situazione in cui nessuno sapeva
// piu' quale delle due fosse attiva: cambiare l'impronta non
// aveva alcun effetto finche' il segreto esisteva, e il segreto
// non e' leggibile da nessuna schermata dell'applicazione.
//
// Una sola fonte, quindi. Nel database resta comunque soltanto
// l'impronta SHA-256: la frase non e' conservata da nessuna
// parte e non e' recuperabile. Per cambiarla:
//
//   update impostazioni_admin
//      set token_hash = encode(digest('nuova-frase','sha256'),'hex'),
//          aggiornato_il = now()
//    where id = 1;
async function improntaAttesa(): Promise<string | null> {
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

// ---------------- L'email pubblica ----------------
//
// Google Places non restituisce indirizzi email, e non e' una
// dimenticanza: non fanno parte della scheda. L'unica fonte
// lecita e' il sito che l'attivita' pubblica da se', dove il
// recapito e' scritto proprio per essere usato.
//
// E' anche una delle tre fonti gia' dichiarate nell'informativa
// alle imprese ("Dal tuo sito o da un registro pubblico, quando
// l'indirizzo email e' pubblicato per essere contattati"), quindi
// qui non si sta aprendo una strada nuova: si sta rendendo
// concreta una che era gia' prevista. Per questo il lead salva
// anche email_fonte: la scheda deve poter dire da dove viene.
//
// Cosa NON fa, deliberatamente: non scandaglia il sito. Apre la
// homepage e al massimo due pagine di contatti, con un tetto di
// tempo e di byte. Leggere la pagina dei contatti di un'azienda
// non e' una scansione del sito, ed e' bene che resti tale.

const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;

// Caselle che non sono un contatto commerciale, segnaposto dei
// temi grafici, e "indirizzi" che in realta' sono nomi di file
// (logo@2x.png e' la trappola piu' comune).
const NON_CONTATTI = /^(no-?reply|donotreply|postmaster|abuse|mailer-daemon|webmaster|hostmaster|nome|tuonome|esempio|example|email|indirizzo|user|utente)$/i;
const DOMINI_FINTI = /(example\.(com|org|net|it)|dominio\.|tuosito|tuodominio|wixpress\.com|sentry\.io|schema\.org|w3\.org|godaddy|squarespace)/i;
const PARE_UN_FILE = /\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf)$/i;

const PAGINE_CONTATTI = ["/", "/contatti", "/contatti.html", "/contact", "/chi-siamo"];

async function scaricaTesto(url: string, ms = 6000): Promise<string> {
  const stop = new AbortController();
  const t = setTimeout(() => stop.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: stop.signal,
      redirect: "follow",
      headers: {
        // Ci si presenta. Chi vuole escluderci puo' farlo, ed e'
        // giusto che possa: l'indirizzo rimanda all'informativa.
        "User-Agent": "QuotaFacileBot/1.0 (+https://www.quotafacile.net/privacy-imprese/)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!r.ok) return "";
    if (!/text\/html|text\/plain/i.test(r.headers.get("content-type") ?? "")) return "";
    const buf = await r.arrayBuffer();
    // trecento kilobyte bastano: oltre c'e' solo il corpo della
    // pagina, non i contatti
    return new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 300_000));
  } catch (_e) {
    return "";
  } finally {
    clearTimeout(t);
  }
}

// info@ e contatti@ valgono piu' di una casella personale trovata
// in fondo a una pagina: sono quelle pubblicate per essere usate,
// e scrivere alla casella generica e' anche piu' corretto.
function preferito(lista: string[]): string {
  for (const p of ["info@", "contatti@", "contatto@", "commerciale@", "amministrazione@", "segreteria@", "direzione@"]) {
    const t = lista.find((e) => e.startsWith(p));
    if (t) return t;
  }
  return lista[0];
}

function emailDa(html: string, dominio: string | null): string | null {
  const grezzi = new Set<string>();
  // I mailto: valgono piu' del testo libero: sono un contatto
  // dichiarato, non una stringa che somiglia a un indirizzo.
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    try { grezzi.add(decodeURIComponent(m[1])); } catch (_e) { grezzi.add(m[1]); }
  }
  for (const m of html.matchAll(RE_EMAIL)) grezzi.add(m[0]);

  const buone = [...grezzi]
    .map((e) => e.trim().toLowerCase().replace(/^[.,;:<>()]+|[.,;:<>()]+$/g, ""))
    .filter((e) => e.length <= 120 && (e.match(/@/g) ?? []).length === 1)
    .filter((e) => !PARE_UN_FILE.test(e))
    .filter((e) => !DOMINI_FINTI.test(e))
    .filter((e) => !NON_CONTATTI.test(e.split("@")[0]));

  if (!buone.length) return null;
  if (dominio) {
    const propri = buone.filter((e) => e.split("@")[1] === dominio || e.split("@")[1]?.endsWith("." + dominio));
    if (propri.length) return preferito(propri);
  }
  return preferito(buone);
}

async function emailDelSito(sito: string): Promise<string | null> {
  let base: URL;
  try { base = new URL(sito); } catch (_e) { return null; }
  if (base.protocol !== "http:" && base.protocol !== "https:") return null;
  const dominio = base.hostname.replace(/^www\./, "");

  let aperte = 0;
  for (const p of PAGINE_CONTATTI) {
    if (aperte >= 3) break;
    aperte++;
    const html = await scaricaTesto(new URL(p, base).toString());
    if (!html) continue;
    const e = emailDa(html, dominio);
    if (e) return e;
  }
  return null;
}

// Sei alla volta: abbastanza per non far aspettare mezzo minuto,
// poco per non sembrare un attacco a nessuno.
async function aggiungiEmail(righe: Record<string, unknown>[], paralleli = 6) {
  const coda = righe.filter((r) => r.sito);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(paralleli, coda.length) }, async () => {
      while (i < coda.length) {
        const r = coda[i++];
        const e = await emailDelSito(String(r.sito));
        if (e) { r.email = e; r.email_fonte = "sito_web"; }
      }
    }),
  );
}

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

  // L'email pubblica, solo se richiesta. Aprire il sito di ogni
  // risultato costa secondi, e non serve a chi sta esplorando una
  // zona per capire chi c'è: serve a chi sta preparando una lista
  // per il mail marketing, e a quello servono solo i contatti che
  // può davvero usare. Per questo è una scelta e non un
  // comportamento predefinito.
  let righe = [...trovate.values()];
  if (d.soloConEmail === true) {
    await aggiungiEmail(righe);
    const prima = righe.length;
    righe = righe.filter((r) => r.email);
    const scartate = prima - righe.length;
    if (scartate > 0) {
      avvisi.push(
        `${scartate} attività su ${prima} sono state escluse: sul loro sito non risulta un indirizzo email pubblicato.`,
      );
    }
  }

  // Quali sono già in archivio: mostrarlo evita di riproporre
  // come nuovo un contatto che qualcuno sta già lavorando.
  const ids = righe.map((r) => r.place_id as string);
  const { data: gia } = ids.length
    ? await db.from("crm_lead").select("place_id").in("place_id", ids)
    : { data: [] };
  const giaPresenti = new Set((gia ?? []).map((x: { place_id: string }) => x.place_id));

  return {
    risultati: righe.map((r) => ({ ...r, gia: giaPresenti.has(r.place_id as string) })),
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
    // L'email non viene da Google: quando c'è, è stata letta sul
    // sito dell'attività. La scheda deve dirlo.
    email: testo(r.email, 200),
    email_fonte: r.email ? "sito_web" : null,
    email_trovata_il: r.email ? new Date().toISOString() : null,
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
  const [lead, etichette, applicate, attivita] = await Promise.all([
    db.from("crm_lead").select("*").order("creato_il", { ascending: false }).limit(500),
    db.from("crm_etichette").select("*").order("nome"),
    db.from("crm_lead_etichette").select("*"),
    db.from("crm_attivita").select("*").order("quando", { ascending: false }).limit(1000),
  ]);
  if (lead.error) throw new Error(lead.error.message);
  return {
    lead: lead.data ?? [],
    etichette: etichette.data ?? [],
    applicate: applicate.data ?? [],
    attivita: attivita.data ?? [],
    categorie: CATEGORIE,
    letteIl: new Date().toISOString(),
  };
}

// ---------------- Etichette ----------------

const COLORI = ["verde", "oro", "rosso", "blu", "grigio"];

async function etichettaCrea(d: Record<string, unknown>) {
  const nome = testo(d.nome, 60);
  if (!nome) throw new ErroreCliente("Serve un nome per l'etichetta");
  const colore = COLORI.includes(String(d.colore)) ? String(d.colore) : "verde";
  const { data, error } = await db.from("crm_etichette")
    .insert({ nome, colore }).select("id").single();
  if (error) {
    throw new ErroreCliente(error.code === "23505"
      ? "Esiste già un'etichetta con questo nome"
      : error.message);
  }
  return { id: data.id };
}

// Eliminare un'etichetta la toglie da tutti i lead che la
// portano: è una scelta, non un effetto collaterale. Un'etichetta
// che sopravvive solo su qualche lead diventa un residuo che
// nessuno sa più cosa significhi.
async function etichettaElimina(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo dell'etichetta");
  const { error } = await db.from("crm_etichette").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { eliminata: true };
}

async function etichettaApplica(d: Record<string, unknown>) {
  const leadId = testo(d.leadId, 40);
  const etichettaId = testo(d.etichettaId, 40);
  if (!leadId || !etichettaId) throw new ErroreCliente("Indica il lead e l'etichetta");

  if (d.applica === false) {
    const { error } = await db.from("crm_lead_etichette")
      .delete().eq("lead_id", leadId).eq("etichetta_id", etichettaId);
    if (error) throw new Error(error.message);
    return { applicata: false };
  }

  const { error } = await db.from("crm_lead_etichette")
    .upsert({ lead_id: leadId, etichetta_id: etichettaId }, { onConflict: "lead_id,etichetta_id", ignoreDuplicates: true });
  if (error) {
    throw error.code === "23503"
      ? new ErroreCliente("Il lead o l'etichetta non esistono più.")
      : new Error(error.message);
  }
  return { applicata: true };
}

// ---------------- Attività ----------------

async function attivitaRegistra(d: Record<string, unknown>) {
  const leadId = testo(d.leadId, 40);
  const tipo = String(d.tipo ?? "nota");
  if (!leadId) throw new ErroreCliente("Manca il lead");
  if (!["chiamata", "email", "incontro", "preventivo", "nota"].includes(tipo)) {
    throw new ErroreCliente("Tipo di attività non riconosciuto");
  }
  const esito = testo(d.esito, 30);
  if (esito && !["positivo", "da_richiamare", "negativo", "nessuna_risposta"].includes(esito)) {
    throw new ErroreCliente("Esito non riconosciuto");
  }

  const { data, error } = await db.from("crm_attivita").insert({
    lead_id: leadId,
    collaboratore_id: testo(d.collaboratoreId, 40),
    tipo,
    testo: testo(d.testo, 3000),
    esito,
    quando: testo(d.quando, 40) ?? new Date().toISOString(),
  }).select("id").single();
  if (error) {
    throw error.code === "23503"
      ? new ErroreCliente("Il lead o il collaboratore non esistono più.")
      : new Error(error.message);
  }

  // Una chiamata o un'email fatta significa che il contatto è
  // avvenuto: portare avanti lo stato da soli evita di doverlo
  // ricordare due volte, e soprattutto evita che resti "nuovo"
  // un lead con tre chiamate alle spalle.
  if (["chiamata", "email", "incontro"].includes(tipo)) {
    await db.from("crm_lead")
      .update({ stato: "contattato", contattato_il: new Date().toISOString() })
      .eq("id", leadId).eq("stato", "nuovo");
  }
  return { id: data.id };
}

async function attivitaElimina(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo dell'attività");
  const { error } = await db.from("crm_attivita").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { eliminata: true };
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
  "etichetta-crea": etichettaCrea,
  "etichetta-elimina": etichettaElimina,
  "etichetta-applica": etichettaApplica,
  "attivita-registra": attivitaRegistra,
  "attivita-elimina": attivitaElimina,
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
