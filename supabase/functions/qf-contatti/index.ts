// ============================================================
// QuotaFacile — ricezione dei contatti dal sito
// ------------------------------------------------------------
// Endpoint pubblico chiamato dal browser. Fa una cosa sola ma
// bene: SALVA PRIMA, NOTIFICA POI.
//
// È il punto centrale del disegno. Finché la consegna dipendeva
// da un servizio email, una richiesta poteva sparire senza che
// nessuno se ne accorgesse. Ora il contatto viene scritto nel
// database e solo dopo si tenta l'avviso: se la posta fallisce,
// il lead resta al sicuro e recuperabile dall'area admin.
//
// Le notifiche sono opzionali e si configurano con variabili
// d'ambiente. Nessuna configurata = il sito funziona lo stesso,
// i contatti si leggono dal database.
//   QF_RESEND_KEY / QF_RESEND_FROM         avviso via email
//   QF_TELEGRAM_TOKEN / QF_TELEGRAM_CHAT   avviso sul telefono
//   QF_DESTINATARIO                        casella della piattaforma
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

class ErroreCliente extends Error {
  constructor(msg: string, readonly status = 400) { super(msg); }
}

const rispondi = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const testo = (v: unknown, max = 5000) =>
  v === undefined || v === null ? null : String(v).trim().slice(0, max) || null;

const emailValida = (v: string | null) =>
  !!v && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v);

// ---------------- Notifiche (mai bloccanti) ----------------

async function avvisaTelegram(oggetto: string, campi: Record<string, unknown>) {
  const token = Deno.env.get("QF_TELEGRAM_TOKEN");
  const chat = Deno.env.get("QF_TELEGRAM_CHAT");
  if (!token || !chat) return null;
  const righe = Object.entries(campi)
    .filter(([, v]) => v)
    .map(([k, v]) => `<b>${k}</b>: ${String(v).replace(/[<>&]/g, "")}`)
    .join("\n");
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, parse_mode: "HTML", text: `<b>${oggetto}</b>\n\n${righe}` }),
  });
  const esito = await r.json().catch(() => ({}));
  return !!esito.ok;
}

async function avvisaEmail(a: string[], oggetto: string, campi: Record<string, unknown>) {
  const chiave = Deno.env.get("QF_RESEND_KEY");
  if (!chiave) return null;
  const mittente = Deno.env.get("QF_RESEND_FROM") || "QuotaFacile <onboarding@resend.dev>";
  const righe = Object.entries(campi)
    .filter(([, v]) => v)
    .map(([k, v]) =>
      `<tr><th align="left" style="padding:6px 12px 6px 0;color:#4C5F55;vertical-align:top;white-space:nowrap">${k}</th><td style="padding:6px 0">${String(v)}</td></tr>`
    ).join("");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${chiave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: mittente,
      to: a,
      // rispondendo dalla propria casella si scrive al cliente
      reply_to: campi["Email"] || undefined,
      subject: oggetto,
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#12291C"><table style="border-collapse:collapse">${righe}</table><p style="margin-top:18px;font-size:12px;color:#4C5F55">Inviato dal sito QuotaFacile.</p></div>`,
    }),
  });
  const esito = await r.json().catch(() => ({}));
  return r.ok && !!esito.id;
}

async function notifica(oggetto: string, campi: Record<string, unknown>, extra?: string | null) {
  const piattaforma = Deno.env.get("QF_DESTINATARIO") || "r.difalco@lori-crm.it";
  const a = [piattaforma];
  if (extra && emailValida(extra) && extra !== piattaforma) a.push(extra);
  const [email, telegram] = await Promise.all([
    avvisaEmail(a, oggetto, campi).catch(() => false),
    avvisaTelegram(oggetto, campi).catch(() => false),
  ]);
  // null = canale non configurato: non è un fallimento di consegna
  const configurati = [email, telegram].filter((x) => x !== null);
  if (configurati.length === 0) {
    return { inviata: false, errore: "Nessun canale di notifica configurato: la richiesta è salvata e va letta dall'area admin" };
  }
  const riuscita = configurati.some(Boolean);
  return { inviata: riuscita, errore: riuscita ? null : "Tutti i canali configurati hanno fallito" };
}

// ---------------- Gestori per tipo di invio ----------------

async function richiesta(d: Record<string, unknown>) {
  const nome = testo(d.nome, 200);
  const email = testo(d.email, 200);
  if (!nome || !emailValida(email)) throw new ErroreCliente("Nome ed email sono obbligatori");
  if (d.consenso !== true) throw new ErroreCliente("Consenso al trattamento mancante");

  // L'endpoint è pubblico per necessità: un modulo di preventivo
  // non può chiedere di autenticarsi. Il freno evita che basti
  // uno script per riempire il database e la casella.
  const { data: troppe } = await db.rpc("qf_troppe_richieste", { p_email: email });
  if (troppe === true) {
    throw new ErroreCliente(
      "Hai già inviato più richieste nell'ultima ora. Attendi un momento oppure contatta direttamente l'intermediario.",
      429,
    );
  }

  const destEmail = testo(d.destinatarioEmail, 200);
  const riga = {
    tipo: ["preventivo", "consulenza", "revisione"].includes(String(d.tipo)) ? String(d.tipo) : "preventivo",
    ramo: testo(d.ramo, 60),
    nome,
    citta: testo(d.citta, 120),
    email,
    telefono: testo(d.telefono, 60),
    note: testo(d.note),
    destinatario_id: testo(d.destinatarioId, 60),
    destinatario_nome: testo(d.destinatarioNome, 200),
    destinatario_email: emailValida(destEmail) ? destEmail : null,
    consenso_privacy: true,
    consenso_testo: testo(d.consensoTesto, 1000),
    origine: testo(d.origine, 300),
  };

  const { data, error } = await db.from("richieste").insert(riga).select("id").single();
  if (error) throw new Error("Salvataggio non riuscito: " + error.message);

  await db.from("consensi").insert({
    contesto: "richiesta-preventivo",
    testo: riga.consenso_testo,
    riferimento: data.id,
  });

  const esito = await notifica(
    `Nuova richiesta ${riga.tipo} · ramo ${riga.ramo ?? "-"} · ${riga.nome}`,
    {
      "Tipo": riga.tipo, "Ramo": riga.ramo, "Nome": riga.nome, "Città": riga.citta,
      "Email": riga.email, "Telefono": riga.telefono, "Note": riga.note,
      "Intermediario": riga.destinatario_nome ?? "da smistare per ramo",
    },
    riga.destinatario_email,
  );
  await db.from("richieste")
    .update({ notifica_inviata: esito.inviata, notifica_errore: esito.errore })
    .eq("id", data.id);

  return { id: data.id, notificata: esito.inviata };
}

async function iscrizionePro(d: Record<string, unknown>) {
  const nome = testo(d.nome, 200);
  const email = testo(d.email, 200);
  if (!nome || !emailValida(email)) throw new ErroreCliente("Nome ed email sono obbligatori");
  if (d.consensoRui !== true || d.consensoTermini !== true) {
    throw new ErroreCliente("Dichiarazione RUI e accettazione dei termini sono obbligatorie");
  }
  const riga = {
    nome, email,
    ruolo: testo(d.ruolo, 60),
    azienda: testo(d.azienda, 200),
    rui_numero: testo(d.rui, 40),
    rui_sezione: testo(d.ruiSezione, 4),
    opera_per_conto: testo(d.operaPerConto, 200),
    citta: testo(d.citta, 120),
    telefono: testo(d.telefono, 60),
    specializzazioni: Array.isArray(d.spec) ? d.spec.slice(0, 5).map((s) => String(s).slice(0, 40)) : null,
    bio: testo(d.bio, 1000),
    consenso_rui: true,
    consenso_termini: true,
  };
  const { data, error } = await db.from("iscrizioni_pro").insert(riga).select("id").single();
  if (error) throw new Error("Salvataggio non riuscito: " + error.message);

  await db.from("consensi").insert({
    contesto: "registrazione-pro",
    testo: "Dichiarazione iscrizione RUI e accettazione dei Termini",
    riferimento: data.id,
  });

  await notifica(`Nuovo professionista iscritto · ${nome} · RUI da verificare`, {
    "Nome": nome, "Ruolo": riga.ruolo, "Azienda": riga.azienda,
    "RUI dichiarato": riga.rui_numero, "Sezione": riga.rui_sezione,
    "Opera per conto di": riga.opera_per_conto,
    "Città": riga.citta, "Telefono": riga.telefono, "Email": email,
    "Da fare": "verificare su servizi.ivass.it/RuirPubblica e approvare in #/admin",
  });
  return { id: data.id };
}

async function waitlist(d: Record<string, unknown>) {
  const email = testo(d.email, 200);
  if (!emailValida(email)) throw new ErroreCliente("Email non valida");
  if (d.consenso !== true) throw new ErroreCliente("Consenso mancante");
  const { error } = await db.from("waitlist")
    .upsert({ email, consenso: true }, { onConflict: "email", ignoreDuplicates: true });
  if (error) throw new Error("Salvataggio non riuscito: " + error.message);
  await db.from("consensi").insert({
    contesto: "waitlist-app",
    testo: "Consenso all'uso dell'email per la notifica di lancio",
  });
  await notifica("Nuova iscrizione alla waitlist app", { "Email": email });
  return { ok: true };
}

async function segnalazione(d: Record<string, unknown>) {
  const motivo = testo(d.motivo, 200);
  const dettaglio = testo(d.dettaglio, 3000);
  if (!motivo || !dettaglio) throw new ErroreCliente("Motivo e dettaglio sono obbligatori");
  const emailSeg = testo(d.email, 200);
  const riga = {
    target: testo(d.target, 120) ?? "-",
    motivo, dettaglio,
    email_segnalante: emailValida(emailSeg) ? emailSeg : null,
  };
  const { data, error } = await db.from("segnalazioni").insert(riga).select("id").single();
  if (error) throw new Error("Salvataggio non riuscito: " + error.message);
  await notifica(`Segnalazione di contenuto · ${motivo}`, {
    "Contenuto": riga.target, "Motivo": motivo, "Dettaglio": dettaglio,
    "Segnalante": riga.email_segnalante ?? "anonimo",
  });
  return { id: data.id };
}

const GESTORI: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
  richiesta, "iscrizione-pro": iscrizionePro, waitlist, segnalazione,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return rispondi({ ok: false, errore: "Metodo non consentito" }, 405);

  try {
    const body = await req.json();
    const gestore = GESTORI[String(body?.tipo ?? "")];
    if (!gestore) return rispondi({ ok: false, errore: "Tipo di invio non riconosciuto" }, 400);
    const esito = await gestore(body.dati ?? {});
    return rispondi({ ok: true, ...esito });
  } catch (e) {
    // Un errore di validazione è colpa del client e va detto come
    // tale; un errore di scrittura è nostro e non va mascherato.
    if (e instanceof ErroreCliente) return rispondi({ ok: false, errore: e.message }, e.status);
    console.error("[qf-contatti]", e);
    return rispondi({ ok: false, errore: "Errore nel salvataggio della richiesta" }, 500);
  }
});
