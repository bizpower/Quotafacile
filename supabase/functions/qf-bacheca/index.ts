// ============================================================
// QuotaFacile — bacheca condivisa
// ------------------------------------------------------------
// GET   elenco pubblico di domande e risposte
// POST  nuova domanda, nuova risposta, voto "utile"
//
// Le nove guide editoriali restano nel repository, dove sono
// scritte e versionate: qui passa ciò che nasce dagli utenti.
// Una risposta può riferirsi a una domanda del database oppure
// a un contenuto del repository ("k1" per una guida, "d12" per
// una domanda del giorno), tramite domanda_chiave.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

class ErroreCliente extends Error {
  constructor(msg: string, readonly status = 400) { super(msg); }
}

const rispondi = (corpo: unknown, status = 200, cache = false) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
      // la bacheca cambia di rado: qualche secondo di cache
      // evita di interrogare il database ad ogni navigazione
      ...(cache ? { "Cache-Control": "public, max-age=30" } : {}),
    },
  });

const testo = (v: unknown, max = 5000) =>
  v === undefined || v === null ? null : String(v).trim().slice(0, max) || null;

const CATEGORIE = ["Auto", "Casa", "Vita", "Impresa", "Salute", "Viaggi", "Cyber"];

// ---------------- Lettura ----------------

async function elenco() {
  const [d, r] = await Promise.all([
    db.from("domande")
      .select("id, creato_il, tipo, categoria, domanda, keyword, titolo_seo, meta_seo, risposta_redazionale")
      .eq("stato", "pubblicata")
      .order("creato_il", { ascending: false })
      .limit(300),
    db.from("risposte")
      .select("id, creato_il, domanda_id, domanda_chiave, autore_nome, autore_ruolo, autore_azienda, autore_rui, testo, voti, migliore")
      .eq("stato", "pubblicata")
      .order("migliore", { ascending: false })
      .order("voti", { ascending: false })
      .limit(2000),
  ]);
  if (d.error) throw new Error(d.error.message);
  if (r.error) throw new Error(r.error.message);

  // raggruppate lato server: il client le trova già pronte
  const perDomanda: Record<string, unknown[]> = {};
  const perChiave: Record<string, unknown[]> = {};
  for (const x of r.data ?? []) {
    const dove = x.domanda_id ? perDomanda : perChiave;
    const k = String(x.domanda_id ?? x.domanda_chiave);
    (dove[k] ??= []).push(x);
  }
  return { domande: d.data ?? [], perDomanda, perChiave };
}

// ---------------- Scrittura ----------------

async function nuovaDomanda(d: Record<string, unknown>) {
  const domanda = testo(d.domanda, 500);
  const categoria = testo(d.categoria, 30);
  if (!domanda || domanda.length < 10) {
    throw new ErroreCliente("La domanda è troppo breve: scrivila per esteso");
  }
  if (!categoria || !CATEGORIE.includes(categoria)) throw new ErroreCliente("Categoria non valida");
  if (d.consenso !== true) throw new ErroreCliente("Consenso alla pubblicazione mancante");

  // Le domande sono pubbliche subito, quindi servono due freni:
  // il doppio invio accidentale e il flusso automatico.
  const unOraFa = new Date(Date.now() - 3600_000).toISOString();
  const [{ data: gemella }, { count }] = await Promise.all([
    db.from("domande").select("id").eq("domanda", domanda).gte("creato_il", unOraFa).maybeSingle(),
    db.from("domande").select("id", { count: "exact", head: true }).gte("creato_il", unOraFa),
  ]);
  if (gemella) throw new ErroreCliente("Questa domanda è già stata pubblicata poco fa", 409);
  if ((count ?? 0) >= 30) {
    throw new ErroreCliente("Troppe domande pubblicate nell'ultima ora: riprova più tardi", 429);
  }

  const { data, error } = await db.from("domande")
    .insert({ tipo: "utente", categoria, domanda })
    .select("id").single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}

async function nuovaRisposta(d: Record<string, unknown>) {
  const testoRisposta = testo(d.testo, 6000);
  const autore = testo(d.autoreNome, 200);
  if (!testoRisposta || testoRisposta.length < 30) {
    throw new ErroreCliente("La risposta è troppo breve per essere utile");
  }
  if (!autore) throw new ErroreCliente("Manca il nome di chi risponde");

  const domandaId = testo(d.domandaId, 40);
  const chiave = testo(d.domandaChiave, 40);
  if (!domandaId === !chiave) {
    throw new ErroreCliente("Indicare la domanda a cui si risponde");
  }

  const { data, error } = await db.from("risposte").insert({
    domanda_id: domandaId,
    domanda_chiave: chiave,
    autore_nome: autore,
    autore_ruolo: testo(d.autoreRuolo, 60),
    autore_azienda: testo(d.autoreAzienda, 200),
    autore_rui: testo(d.autoreRui, 40),
    autore_email: testo(d.autoreEmail, 200),
    testo: testoRisposta,
    // in attesa per scelta: senza autenticazione chiunque
    // potrebbe firmarsi con il nome di un intermediario reale
    stato: "in_attesa",
  }).select("id").single();
  if (error) throw new Error(error.message);
  return { id: data.id, inAttesa: true };
}

async function voto(d: Record<string, unknown>) {
  const risposta = testo(d.rispostaId, 40);
  const votante = testo(d.votante, 60);
  if (!risposta || !votante) throw new ErroreCliente("Voto incompleto");

  const { error } = await db.from("voti").insert({ risposta_id: risposta, votante });
  // 23505 = violazione di unicità: ha già votato, non è un errore
  if (error && error.code !== "23505") throw new Error(error.message);

  const { data } = await db.from("risposte").select("voti").eq("id", risposta).single();
  return { voti: data?.voti ?? 0, gia: error?.code === "23505" };
}

const AZIONI: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
  domanda: nuovaDomanda, risposta: nuovaRisposta, voto,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    if (req.method === "GET") return rispondi({ ok: true, ...(await elenco()) }, 200, true);

    if (req.method === "POST") {
      const body = await req.json();
      const azione = AZIONI[String(body?.azione ?? "")];
      if (!azione) throw new ErroreCliente("Azione non riconosciuta");
      return rispondi({ ok: true, ...(await azione(body.dati ?? {}) as object) });
    }

    return rispondi({ ok: false, errore: "Metodo non consentito" }, 405);
  } catch (e) {
    if (e instanceof ErroreCliente) return rispondi({ ok: false, errore: e.message }, e.status);
    console.error("[qf-bacheca]", e);
    return rispondi({ ok: false, errore: "Errore nel servizio della bacheca" }, 500);
  }
});
