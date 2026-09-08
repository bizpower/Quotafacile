// ============================================================
// QuotaFacile — Mail Marketing
// ------------------------------------------------------------
// Il modulo che su Lovable stava nel progetto Bizpower, portato
// dentro QuotaFacile. Undici sezioni; questa funzione le serve
// tutte, una azione per volta.
//
// Passo 1: la panoramica. Restituisce i mittenti, le caselle di
// invio, le liste, le campagne e le email in uscita, più il
// riepilogo che la Dashboard mostra in cima.
//
// I CONTI SI FANNO QUI, NON NEL BROWSER
// Su Lovable la Dashboard scaricava fino a 2000 email e le
// contava in pagina. Funziona finché le email sono poche: al
// primo mese di invii veri diventa un megabyte di JSON per
// mostrare otto numeri. Qui i conteggi li fa il database, che è
// il posto in cui contare costa meno.
//
// ACCESSO: la stessa chiave dell'area riservata, confrontata per
// impronta a tempo costante. Nessun dato esce senza.
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

class ErroreCliente extends Error {
  constructor(msg: string, readonly status = 400) { super(msg); }
}

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

// ---------------- Stato della posta ----------------

/* La Dashboard deve poter dire "non puoi ancora spedire" prima
   che qualcuno prepari una campagna intera. Questi sono i
   segreti che servono all'invio: se mancano, si vede subito. */
function statoInvio() {
  const host = Deno.env.get("QF_SMTP_HOST");
  const user = Deno.env.get("QF_SMTP_USER");
  const pass = Deno.env.get("QF_SMTP_PASS");
  return {
    configurato: !!(host && user && pass),
    host: host ?? null,
    porta: Number(Deno.env.get("QF_SMTP_PORT") || 465),
    utente: user ?? null,
    mancanti: [
      !host && "QF_SMTP_HOST",
      !user && "QF_SMTP_USER",
      !pass && "QF_SMTP_PASS",
    ].filter(Boolean) as string[],
  };
}

// ---------------- Panoramica ----------------

/* Un conteggio non ha bisogno delle righe: head:true chiede al
   database solo quante sono. */
const numero = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

async function panoramica() {
  const ora = new Date();
  const ieri = new Date(ora.getTime() - 86400000).toISOString();
  const settimana = new Date(ora.getTime() - 7 * 86400000).toISOString();
  const cont = { count: "exact", head: true } as const;

  const [
    mittenti, smtp, liste, campagne, ultimeInviate, ultimiErrori,
    perStato, seriePerGiorno,
    lead, leadNoContatto, blacklist, inviateOggi, ultimi7,
  ] = await Promise.all([
    db.from("mm_mittenti").select("*").order("creato_il"),
    db.from("mm_smtp").select("*").order("creato_il"),
    db.from("mm_liste").select("*").order("creata_il", { ascending: false }),
    db.from("mm_campagne").select("*").order("creata_il", { ascending: false }).limit(50),
    db.from("mm_email").select("id,destinatario,oggetto,inviata_il,mittente_id")
      .eq("stato", "inviata").order("inviata_il", { ascending: false }).limit(6),
    db.from("mm_email").select("id,destinatario,oggetto,errore,creata_il")
      .eq("stato", "fallita").order("creata_il", { ascending: false }).limit(4),
    db.from("mm_email").select("stato"),
    db.from("mm_email").select("inviata_il").eq("stato", "inviata")
      .gte("inviata_il", new Date(ora.getTime() - 14 * 86400000).toISOString()),
    numero(db.from("crm_lead").select("id", cont)),
    numero(db.from("crm_lead").select("id", cont).eq("no_contatto", true)),
    numero(db.from("mm_blacklist").select("id", cont)),
    numero(db.from("mm_email").select("id", cont).eq("stato", "inviata").gte("inviata_il", ieri)),
    numero(db.from("mm_email").select("id", cont).gte("creata_il", settimana)),
  ]);

  const errore = [mittenti, smtp, liste, campagne, perStato].find((r) => r.error);
  if (errore?.error) throw new Error(errore.error.message);

  /* Un solo passaggio sugli stati invece di sei conteggi
     separati: le righe sono le stesse, le query no. */
  const stati: Record<string, number> = {
    bozza: 0, pronta: 0, in_coda: 0, inviata: 0, fallita: 0, annullata: 0,
  };
  for (const r of (perStato.data ?? []) as { stato: string }[]) {
    stati[r.stato] = (stati[r.stato] ?? 0) + 1;
  }

  /* Quattordici colonne, una per giorno, comprese quelle a zero:
     un grafico che salta i giorni vuoti mente sull'andamento. */
  const giorni: { giorno: string; quante: number }[] = [];
  const indice = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(ora);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    indice.set(k, giorni.length);
    giorni.push({ giorno: k, quante: 0 });
  }
  for (const r of (seriePerGiorno.data ?? []) as { inviata_il: string }[]) {
    if (!r.inviata_il) continue;
    const k = new Date(r.inviata_il).toISOString().slice(0, 10);
    const i = indice.get(k);
    if (i !== undefined) giorni[i].quante++;
  }

  const consegnate = stati.inviata;
  const fallite = stati.fallita;
  const denom = consegnate + fallite;

  return {
    mittenti: mittenti.data ?? [],
    smtp: smtp.data ?? [],
    liste: liste.data ?? [],
    campagne: campagne.data ?? [],
    ultimeInviate: ultimeInviate.data ?? [],
    ultimiErrori: ultimiErrori.data ?? [],
    giorni,
    invio: statoInvio(),
    numeri: {
      inviateOggi,
      inviateTotali: consegnate,
      inCoda: stati.in_coda,
      pronte: stati.pronta,
      bozze: stati.bozza,
      fallite,
      ultimi7,
      lead,
      leadNoContatto,
      blacklist,
      liste: (liste.data ?? []).length,
      // null e non 0: "nessun invio ancora" non è "0% di consegne"
      consegna: denom === 0 ? null : Math.round((consegnate / denom) * 100),
    },
  };
}

const AZIONI: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
  panoramica: () => panoramica(),
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return rispondi({ ok: false, errore: "Metodo non consentito" }, 405);

  const atteso = await improntaAttesa();
  if (!atteso) {
    return rispondi({
      ok: false,
      errore: "Modulo non attivo: nessuna chiave di amministrazione configurata.",
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
    if (e instanceof ErroreCliente) return rispondi({ ok: false, errore: e.message }, e.status);
    console.error("[qf-mm]", e);
    return rispondi({ ok: false, errore: e instanceof Error ? e.message : "Errore imprevisto" }, 500);
  }
});
