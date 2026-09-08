// ============================================================
// QuotaFacile — CRM Bizpower
// ------------------------------------------------------------
// Amministrazione della società: collaboratori, accessi, lead,
// documenti, produzione. È cosa diversa dalla moderazione del
// marketplace, che sta in qf-admin, e per questo ha una funzione
// sua: i due mondi crescono in direzioni diverse e non devono
// intrecciarsi.
//
// CHI PUÒ CHIAMARE QUESTA FUNZIONE
// Solo il titolare, con la chiave di amministrazione. I
// collaboratori non passano di qui: entrano con la propria
// utenza e parlano direttamente con il database, dove le
// policy decidono cosa possono vedere. La differenza conta:
// creare un'utenza o cambiare un ruolo sono cose che nessun
// collaboratore deve poter fare, nemmeno per sbaglio.
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

const emailValida = (v: string | null) =>
  !!v && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v);

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

const RUOLI = ["titolare", "direttore", "account", "commerciale", "consulente"];

// Password iniziale: generata qui, letta una volta sola e mai
// più recuperabile — nel database resta solo la sua forma cifrata.
// Alfabeto senza caratteri che si confondono a voce o a schermo
// (0/O, 1/l/I), perché questa password viene dettata o incollata
// in un messaggio, non digitata da un gestore di password.
function passwordIniziale(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => alfabeto[x % alfabeto.length]).join("");
}

// ---------------- Azioni ----------------

async function panoramica() {
  const [collaboratori, documenti, produzione] = await Promise.all([
    db.from("crm_collaboratori").select("*")
      .order("attivo", { ascending: false }).order("nome"),
    db.from("crm_documenti").select("*")
      .order("creato_il", { ascending: false }).limit(500),
    // La produzione è una vista: si ricalcola a ogni lettura dai
    // fatti registrati. Non c'è un numero salvato da fidarsi.
    db.from("crm_produzione").select("*").order("punti", { ascending: false }),
  ]);
  if (collaboratori.error) throw new Error(collaboratori.error.message);
  return {
    collaboratori: collaboratori.data ?? [],
    documenti: documenti.data ?? [],
    produzione: produzione.data ?? [],
    letteIl: new Date().toISOString(),
  };
}

async function salvaCollaboratore(d: Record<string, unknown>) {
  const nome = testo(d.nome, 200);
  const email = testo(d.email, 200);
  const ruolo = String(d.ruolo ?? "commerciale");
  if (!nome) throw new Error("Il nome è obbligatorio");
  if (!emailValida(email)) throw new Error("Serve un indirizzo email valido");
  if (!RUOLI.includes(ruolo)) throw new Error("Ruolo non riconosciuto");

  const riga = {
    nome, email, ruolo,
    telefono: testo(d.telefono, 60),
    note: testo(d.note, 2000),
    attivo: d.attivo !== false,
  };

  const id = testo(d.id, 40);
  if (id) {
    const { error } = await db.from("crm_collaboratori").update(riga).eq("id", id);
    if (error) throw new Error(error.message);
    return { id, aggiornato: true };
  }

  const { data, error } = await db.from("crm_collaboratori")
    .insert(riga).select("id").single();
  // 23505 = email già presente: è un errore dell'utente, non del sistema
  if (error) {
    throw new Error(error.code === "23505"
      ? "Esiste già un collaboratore con questa email"
      : error.message);
  }
  return { id: data.id, creato: true };
}

// Un collaboratore che se ne va si disattiva, non si cancella:
// cancellarlo porterebbe via la storia di ciò che ha prodotto.
// Disattivarlo però deve chiudergli davvero la porta, non solo
// nasconderlo da un elenco: per questo l'utenza viene bandita.
async function attivaCollaboratore(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new Error("Manca l'identificativo del collaboratore");
  const attivo = d.attivo === true;

  const { data: c, error: errLettura } = await db.from("crm_collaboratori")
    .select("utente_id").eq("id", id).single();
  if (errLettura) throw new Error(errLettura.message);

  const { error } = await db.from("crm_collaboratori")
    .update({ attivo }).eq("id", id);
  if (error) throw new Error(error.message);

  if (c?.utente_id) {
    // "none" toglie il divieto, "876000h" (100 anni) lo impone
    await db.auth.admin.updateUserById(c.utente_id, {
      ban_duration: attivo ? "none" : "876000h",
    });
  }
  return { attivo, utenzaAggiornata: !!c?.utente_id };
}

// Crea l'utenza di un collaboratore e restituisce la password
// iniziale. È l'unico momento in cui quella password è leggibile:
// da qui in poi nel database c'è solo la sua forma cifrata, e
// nemmeno il titolare può rileggerla — può solo generarne un'altra.
async function creaAccesso(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new Error("Manca l'identificativo del collaboratore");

  const { data: c, error } = await db.from("crm_collaboratori")
    .select("id, nome, email, attivo, utente_id").eq("id", id).single();
  if (error) throw new Error(error.message);
  if (!c.attivo) throw new Error("Il collaboratore è disattivato: riattivalo prima di dargli un accesso");
  if (c.utente_id) throw new Error("Questo collaboratore ha già un accesso");

  const password = passwordIniziale();
  // email_confirm: l'indirizzo lo conosce già il titolare, che ha
  // inserito la scheda. Chiedere una conferma per posta bloccherebbe
  // l'accesso dietro una casella che potrebbe non essere pronta.
  const { data: utente, error: errAuth } = await db.auth.admin.createUser({
    email: c.email,
    password,
    email_confirm: true,
    user_metadata: { nome: c.nome, collaboratore_id: c.id },
  });
  if (errAuth) {
    throw new Error(
      /already/i.test(errAuth.message)
        ? "Esiste già un'utenza con questa email"
        : errAuth.message,
    );
  }

  const { error: errLegame } = await db.from("crm_collaboratori")
    .update({ utente_id: utente.user.id }).eq("id", id);
  if (errLegame) {
    // l'utenza è nata ma non è agganciata a nessuno: meglio
    // toglierla che lasciarla orfana e capace di entrare
    await db.auth.admin.deleteUser(utente.user.id);
    throw new Error("Utenza creata ma non collegata: annullata. " + errLegame.message);
  }

  return { email: c.email, password, creato: true };
}

async function rigeneraPassword(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new Error("Manca l'identificativo del collaboratore");
  const { data: c, error } = await db.from("crm_collaboratori")
    .select("email, utente_id").eq("id", id).single();
  if (error) throw new Error(error.message);
  if (!c.utente_id) throw new Error("Questo collaboratore non ha ancora un accesso");

  const password = passwordIniziale();
  const { error: errAuth } = await db.auth.admin
    .updateUserById(c.utente_id, { password });
  if (errAuth) throw new Error(errAuth.message);
  return { email: c.email, password, rigenerata: true };
}

// Togliere l'accesso cancella l'utenza ma non la scheda: la
// persona esce, la sua storia resta.
async function revocaAccesso(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new Error("Manca l'identificativo del collaboratore");
  const { data: c, error } = await db.from("crm_collaboratori")
    .select("utente_id").eq("id", id).single();
  if (error) throw new Error(error.message);
  if (!c.utente_id) throw new Error("Questo collaboratore non ha un accesso da revocare");

  const { error: errAuth } = await db.auth.admin.deleteUser(c.utente_id);
  if (errAuth) throw new Error(errAuth.message);
  await db.from("crm_collaboratori").update({ utente_id: null }).eq("id", id);
  return { revocato: true };
}

const AZIONI: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
  panoramica: () => panoramica(),
  "salva-collaboratore": salvaCollaboratore,
  "attiva-collaboratore": attivaCollaboratore,
  "crea-accesso": creaAccesso,
  "rigenera-password": rigeneraPassword,
  "revoca-accesso": revocaAccesso,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return rispondi({ ok: false, errore: "Metodo non consentito" }, 405);

  const atteso = await improntaAttesa();
  if (!atteso) {
    return rispondi({
      ok: false,
      errore: "CRM non attivo: non risulta configurata alcuna chiave di amministrazione.",
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
    console.error("[qf-crm]", e);
    return rispondi({ ok: false, errore: messaggio }, 400);
  }
});
