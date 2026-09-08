// ============================================================
// QuotaFacile — CRM Bizpower
// ------------------------------------------------------------
// Amministrazione della società: collaboratori, lead, documenti,
// produzione. È cosa diversa dalla moderazione del marketplace,
// che sta in qf-admin, e per questo ha una funzione sua: i due
// mondi crescono in direzioni diverse e non devono intrecciarsi.
//
// L'accesso usa la stessa chiave dell'area riservata, con lo
// stesso confronto lato server. Quando i collaboratori avranno
// un'utenza propria, questa funzione riconoscerà anche quella:
// per ora entra solo il titolare.
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

// ---------------- Azioni ----------------

async function panoramica() {
  const { data: collaboratori, error } = await db.from("crm_collaboratori")
    .select("*").order("attivo", { ascending: false }).order("nome");
  if (error) throw new Error(error.message);
  return { collaboratori: collaboratori ?? [], letteIl: new Date().toISOString() };
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
async function attivaCollaboratore(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new Error("Manca l'identificativo del collaboratore");
  const { error } = await db.from("crm_collaboratori")
    .update({ attivo: d.attivo === true }).eq("id", id);
  if (error) throw new Error(error.message);
  return { attivo: d.attivo === true };
}

const AZIONI: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
  panoramica: () => panoramica(),
  "salva-collaboratore": salvaCollaboratore,
  "attiva-collaboratore": attivaCollaboratore,
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
