// ============================================================
// QuotaFacile — moderazione (area riservata)
// ------------------------------------------------------------
// Qui l'accesso è un controllo vero, non un deterrente: la
// chiave arriva nell'intestazione x-qf-admin e viene confrontata
// lato server. Nel sito e nel repository non compare mai.
//
// Si configura in un posto solo: l'impronta SHA-256 conservata
// in impostazioni_admin. Se manca, ogni azione viene rifiutata:
// meglio una console inattiva che una aperta a chiunque.
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

const testo = (v: unknown, max = 3000) =>
  v === undefined || v === null ? null : String(v).trim().slice(0, max) || null;

// ---------------- Accesso ----------------

const enc = new TextEncoder();

async function impronta(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Confronto a tempo costante: un confronto normale rivela la
// lunghezza del prefisso corretto a chi misura i tempi.
function uguali(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// La chiave sta in un posto solo, e si rilegge a ogni richiesta.
//
// Prima ce n'erano due: il segreto QF_ADMIN_TOKEN vinceva sul
// database, cambiare l'impronta non aveva alcun effetto finche'
// il segreto esisteva, e il segreto non e' leggibile da nessuna
// schermata dell'applicazione. Ora la fonte e' una sola:
// l'impronta SHA-256 in impostazioni_admin.
//
// E non viene tenuta in memoria fra una richiesta e l'altra.
// Costa la lettura di una riga su chiave primaria - niente,
// accanto a quello che la funzione fa comunque - e in cambio un
// cambio di chiave vale subito, dappertutto. Con la copia in
// memoria un'istanza gia' avviata avrebbe continuato ad
// accettare la chiave vecchia finche' non veniva spenta: e'
// esattamente il "quale delle due e' attiva?" che si voleva
// togliere di mezzo.
//
// Nel database resta soltanto l'impronta: la frase non e'
// conservata da nessuna parte e non e' recuperabile. Si cambia
// dalla console, oppure a mano:
//
//   update impostazioni_admin
//      set token_hash = encode(digest('nuova-frase','sha256'),'hex'),
//          aggiornato_il = now()
//    where id = 1;
async function improntaAttesa(): Promise<string | null> {
  const { data } = await db.from("impostazioni_admin")
    .select("token_hash").eq("id", 1).maybeSingle();
  return data?.token_hash ?? null;
}

// ---------------- Azioni ----------------

// Le risposte vengono restituite in ogni stato, comprese le
// rimosse: la console deve poter mostrare cosa è stato tolto e
// perché, non solo cosa è online.
async function panoramica() {
  const [richieste, iscrizioni, segnalazioni, domande, risposte, waitlist, chiave] = await Promise.all([
    db.from("richieste").select("*").order("creato_il", { ascending: false }).limit(300),
    db.from("iscrizioni_pro").select("*").order("creato_il", { ascending: false }).limit(300),
    db.from("segnalazioni").select("*").order("creato_il", { ascending: false }).limit(300),
    db.from("domande").select("*").order("creato_il", { ascending: false }).limit(500),
    db.from("risposte").select("*").order("creato_il", { ascending: false }).limit(800),
    db.from("waitlist").select("id, creato_il, email").order("creato_il", { ascending: false }).limit(500),
    // Solo la data: l'impronta non esce da qui. Serve a dire in
    // console "l'unica chiave attiva è stata decisa il …", che è
    // l'unica cosa verificabile su una chiave che nessuno può
    // rileggere — nemmeno il titolare, nemmeno questa funzione.
    db.from("impostazioni_admin").select("aggiornato_il").eq("id", 1).maybeSingle(),
  ]);
  return {
    richieste: richieste.data ?? [],
    iscrizioni: iscrizioni.data ?? [],
    segnalazioni: segnalazioni.data ?? [],
    domande: domande.data ?? [],
    risposte: risposte.data ?? [],
    waitlist: waitlist.data ?? [],
    chiaveAggiornataIl: chiave.data?.aggiornato_il ?? null,
    letteIl: new Date().toISOString(),
  };
}

// Cambiare la chiave di amministrazione.
//
// Chi arriva qui ha gia' superato il controllo nel Deno.serve
// qui sotto: sta usando la chiave in corso. Non serve chiederla
// una seconda volta, serve che la nuova sia scritta in un posto
// solo e valga subito ovunque - e vale, perche' nessuna funzione
// tiene piu' l'impronta in memoria.
//
// La lunghezza minima non e' un vezzo: questa frase e' l'unica
// cosa che separa il CRM da chiunque, non c'e' un secondo
// fattore e non c'e' un blocco dopo N tentativi. Sedici caratteri
// e' il minimo sotto il quale non ha senso parlare di segreto.
async function cambiaChiave(d: Record<string, unknown>) {
  const nuova = testo(d.nuova, 200);
  if (!nuova) throw new Error("Manca la nuova chiave");
  if (nuova.length < 16) {
    throw new Error("La chiave deve essere lunga almeno 16 caratteri: è l'unica cosa che protegge la console.");
  }

  const nuovaImpronta = await impronta(nuova);
  const attuale = await improntaAttesa();
  if (attuale && uguali(nuovaImpronta, attuale)) {
    throw new Error("Questa è già la chiave in uso.");
  }

  const aggiornatoIl = new Date().toISOString();
  const { error } = await db.from("impostazioni_admin")
    .update({ token_hash: nuovaImpronta, aggiornato_il: aggiornatoIl })
    .eq("id", 1);
  if (error) throw new Error(error.message);

  return { cambiata: true, aggiornatoIl };
}

async function moderaRisposta(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  const decisione = String(d.decisione ?? "");
  if (!id) throw new Error("Manca l'identificativo della risposta");

  if (decisione === "pubblica") {
    await db.from("risposte").update({ stato: "pubblicata", motivo_rimozione: null, moderata_il: new Date().toISOString() }).eq("id", id);
    return { stato: "pubblicata" };
  }
  if (decisione === "rimuovi") {
    // La motivazione non è burocrazia: l'art. 17 del DSA impone
    // di comunicare all'autore perché il contenuto è stato tolto.
    const motivo = testo(d.motivo, 1000);
    if (!motivo) throw new Error("La rimozione richiede una motivazione");
    await db.from("risposte").update({
      stato: "rimossa", migliore: false, motivo_rimozione: motivo, moderata_il: new Date().toISOString(),
    }).eq("id", id);
    return { stato: "rimossa" };
  }
  if (decisione === "migliore") {
    const { data: r } = await db.from("risposte")
      .select("domanda_id, domanda_chiave").eq("id", id).single();
    if (r) {
      // una sola migliore risposta per domanda
      const q = db.from("risposte").update({ migliore: false });
      await (r.domanda_id ? q.eq("domanda_id", r.domanda_id) : q.eq("domanda_chiave", r.domanda_chiave));
    }
    await db.from("risposte").update({ migliore: true, stato: "pubblicata" }).eq("id", id);
    return { migliore: true };
  }
  throw new Error("Decisione non riconosciuta");
}

async function moderaDomanda(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  const motivo = testo(d.motivo, 1000);
  if (!id || !motivo) throw new Error("Servono identificativo e motivazione");
  await db.from("domande").update({
    stato: "rimossa", motivo_rimozione: motivo, rimossa_il: new Date().toISOString(),
  }).eq("id", id);
  return { stato: "rimossa" };
}

async function pubblicaGuida(d: Record<string, unknown>) {
  const domanda = testo(d.domanda, 500);
  const risposta = testo(d.risposta, 20000);
  const categoria = testo(d.categoria, 30);
  if (!domanda || !risposta || !categoria) throw new Error("Domanda, risposta e categoria sono obbligatorie");
  const { data, error } = await db.from("domande").insert({
    tipo: "guida", categoria, domanda,
    keyword: testo(d.keyword, 200),
    volume: testo(d.volume, 60),
    difficolta: testo(d.difficolta, 40),
    titolo_seo: testo(d.titolo, 200),
    meta_seo: testo(d.meta, 400),
    risposta_redazionale: risposta,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}

async function verificaPro(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  const stato = String(d.stato ?? "");
  if (!id || !["in_attesa", "verificato", "respinto"].includes(stato)) {
    throw new Error("Stato di verifica non valido");
  }
  await db.from("iscrizioni_pro").update({
    stato_verifica: stato,
    verificato_il: stato === "verificato" ? new Date().toISOString() : null,
    note_admin: testo(d.note, 1000),
  }).eq("id", id);
  return { stato };
}

async function chiudiSegnalazione(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  const stato = String(d.stato ?? "");
  const esito = testo(d.esito, 1000);
  if (!id || !["accolta", "respinta"].includes(stato)) throw new Error("Esito non valido");
  if (!esito) throw new Error("Serve una motivazione della decisione");
  await db.from("segnalazioni").update({ stato, esito, chiusa_il: new Date().toISOString() }).eq("id", id);
  return { stato };
}

async function aggiornaRichiesta(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  const stato = String(d.stato ?? "");
  if (!id || !["nuova", "presa_in_carico", "chiusa"].includes(stato)) throw new Error("Stato non valido");
  await db.from("richieste").update({ stato }).eq("id", id);
  return { stato };
}

const AZIONI: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
  panoramica: () => panoramica(),
  "modera-risposta": moderaRisposta,
  "modera-domanda": moderaDomanda,
  "pubblica-guida": pubblicaGuida,
  "verifica-pro": verificaPro,
  "chiudi-segnalazione": chiudiSegnalazione,
  "aggiorna-richiesta": aggiornaRichiesta,
  "cambia-chiave": cambiaChiave,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return rispondi({ ok: false, errore: "Metodo non consentito" }, 405);

  const atteso = await improntaAttesa();
  if (!atteso) {
    return rispondi({
      ok: false,
      errore: "Moderazione non attiva: non risulta configurata alcuna chiave di amministrazione.",
      configurazioneMancante: true,
    }, 503);
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
    const messaggio = e instanceof Error ? e.message : "Errore imprevisto";
    console.error("[qf-admin]", e);
    return rispondi({ ok: false, errore: messaggio }, 400);
  }
});
