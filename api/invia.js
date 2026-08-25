/* ============================================================
   QuotaFacile — Funzione serverless di consegna
   ------------------------------------------------------------
   Riceve i moduli del sito e li recapita.

   PERCHÉ SERVE SEMPRE UNA CREDENZIALE
   Spedire email richiede un'identità autenticata: nessun servizio
   accetta posta da un mittente anonimo, altrimenti sarebbe un
   relay di spam. Non è una limitazione di questo codice, è il
   funzionamento della posta elettronica (SPF, DKIM, DMARC).
   Quello che si può scegliere è QUALE credenziale usare — e la
   meno onerosa è quasi sempre una che si possiede già.

   CANALI SUPPORTATI, IN ORDINE DI PREFERENZA
   1. SMTP della propria casella  ← consigliato
      Nessun servizio terzo, nessun account nuovo, i dati degli
      utenti non passano da nessuno. Migliore anche sul piano
      GDPR: un responsabile del trattamento in meno.
        QF_SMTP_HOST, QF_SMTP_PORT, QF_SMTP_USER, QF_SMTP_PASS
        QF_SMTP_FROM (facoltativo, default = QF_SMTP_USER)
   2. Resend — API moderna, dominio verificabile
        QF_RESEND_KEY, QF_RESEND_FROM
   3. Web3Forms — nessuna attivazione per indirizzo
        QF_WEB3FORMS_KEY
   4. FormSubmit — ultimo ripiego: è dietro Cloudflare e rifiuta
      le chiamate da server, quindi qui funziona di rado
        (nessuna configurazione)

   CANALE AGGIUNTIVO, NON ALTERNATIVO
   Telegram: notifica immediata sul telefono, si affianca
   all'email invece di sostituirla. Il token si ottiene da
   @BotFather in trenta secondi, senza registrazioni.
        QF_TELEGRAM_TOKEN, QF_TELEGRAM_CHAT

   Comune a tutti:
        QF_DESTINATARIO — casella della piattaforma
   ============================================================ */

const DESTINATARIO_DEFAULT = "r.difalco@lori-crm.it";
const MAX_CAMPI = 40;
const MAX_LUNGHEZZA = 5000;

const env = k => (process.env[k] || "").trim();

/* ---------------- Composizione del messaggio ---------------- */
const esc = s => String(s).replace(/[&<>"]/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const testoSemplice = campi =>
  Object.entries(campi).map(([k, v]) => `${k}: ${v}`).join("\n");

const testoHtml = campi => `
<div style="font-family:system-ui,sans-serif;font-size:15px;color:#12291C">
  <table style="border-collapse:collapse;width:100%;max-width:620px">
    ${Object.entries(campi).map(([k, v]) => `
      <tr>
        <th style="text-align:left;padding:8px 12px 8px 0;border-bottom:1px solid #DCE5E0;
                   white-space:nowrap;vertical-align:top;color:#4C5F55">${esc(k)}</th>
        <td style="padding:8px 0;border-bottom:1px solid #DCE5E0">${esc(v).replace(/\n/g, "<br>")}</td>
      </tr>`).join("")}
  </table>
  <p style="margin-top:18px;font-size:12px;color:#4C5F55">Inviato dal sito QuotaFacile.</p>
</div>`;

/* ---------------- Canale 1 · SMTP proprio ---------------- */
async function viaSmtp(destinatario, oggetto, campi) {
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch (e) {
    return { ok: false, messaggio: "Dipendenza nodemailer non installata sull'host" };
  }
  const porta = Number(env("QF_SMTP_PORT") || 587);
  const trasporto = nodemailer.createTransport({
    host: env("QF_SMTP_HOST"),
    port: porta,
    secure: porta === 465,
    auth: { user: env("QF_SMTP_USER"), pass: env("QF_SMTP_PASS") }
  });
  try {
    await trasporto.sendMail({
      from: env("QF_SMTP_FROM") || env("QF_SMTP_USER"),
      to: destinatario,
      replyTo: campi.Email || undefined,
      subject: oggetto,
      text: testoSemplice(campi),
      html: testoHtml(campi)
    });
    return { ok: true, messaggio: "Inviata via SMTP" };
  } catch (e) {
    return { ok: false, messaggio: "SMTP: " + e.message };
  }
}

/* ---------------- Canale 2 · Resend ---------------- */
async function viaResend(destinatario, oggetto, campi) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env("QF_RESEND_KEY"),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env("QF_RESEND_FROM") || "QuotaFacile <onboarding@resend.dev>",
      to: [destinatario],
      reply_to: campi.Email || undefined,
      subject: oggetto,
      html: testoHtml(campi)
    })
  });
  const esito = await r.json().catch(() => ({}));
  return { ok: r.ok && !!esito.id, messaggio: esito.message || esito.id || ("HTTP " + r.status) };
}

/* ---------------- Canale 3 · Web3Forms ---------------- */
async function viaWeb3Forms(destinatario, oggetto, campi) {
  const r = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      access_key: env("QF_WEB3FORMS_KEY"), subject: oggetto,
      from_name: "QuotaFacile", to: destinatario, ...campi
    })
  });
  const esito = await r.json().catch(() => ({}));
  return { ok: r.ok && esito.success === true, messaggio: esito.message || ("HTTP " + r.status) };
}

/* ---------------- Canale 4 · FormSubmit (ripiego) ---------------- */
async function viaFormSubmit(destinatario, oggetto, campi) {
  const r = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(destinatario), {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ _subject: oggetto, _template: "table", _captcha: "false", ...campi })
  });
  const testo = await r.text();
  if (/Just a moment|challenge-platform/i.test(testo)) {
    return { ok: false, messaggio: "Bloccato dalla protezione Cloudflare del servizio: configura un canale proprio (SMTP, Resend o Web3Forms)" };
  }
  let esito = {};
  try { esito = JSON.parse(testo); } catch (e) { /* risposta non JSON */ }
  return {
    ok: r.ok && (esito.success === true || esito.success === "true"),
    messaggio: esito.message || ("HTTP " + r.status)
  };
}

/* ---------------- Canale parallelo · Telegram ---------------- */
async function viaTelegram(oggetto, campi) {
  const token = env("QF_TELEGRAM_TOKEN"), chat = env("QF_TELEGRAM_CHAT");
  if (!token || !chat) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        parse_mode: "HTML",
        text: `<b>${esc(oggetto)}</b>\n\n` +
          Object.entries(campi).map(([k, v]) => `<b>${esc(k)}</b>: ${esc(v)}`).join("\n")
      })
    });
    const esito = await r.json().catch(() => ({}));
    return { ok: !!esito.ok, messaggio: esito.description || "Telegram" };
  } catch (e) {
    return { ok: false, messaggio: "Telegram: " + e.message };
  }
}

/* Sceglie il primo canale email configurato. */
function canaleEmail() {
  if (env("QF_SMTP_HOST") && env("QF_SMTP_USER")) return { nome: "smtp", fn: viaSmtp };
  if (env("QF_RESEND_KEY")) return { nome: "resend", fn: viaResend };
  if (env("QF_WEB3FORMS_KEY")) return { nome: "web3forms", fn: viaWeb3Forms };
  return { nome: "formsubmit", fn: viaFormSubmit };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, errore: "Metodo non consentito" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const oggetto = String(body.oggetto || "Nuovo messaggio da QuotaFacile").slice(0, 200);
    const extra = body.destinatarioExtra ? String(body.destinatarioExtra).trim() : null;

    /* I campi arrivano dal browser: se ne limitano numero e
       dimensione prima di inoltrarli o comporli in un messaggio. */
    const campi = {};
    Object.entries(body.dati || {}).slice(0, MAX_CAMPI).forEach(([k, v]) => {
      if (v === undefined || v === null || String(v).trim() === "") return;
      campi[String(k).slice(0, 80)] = String(v).slice(0, MAX_LUNGHEZZA);
    });
    if (!Object.keys(campi).length) {
      return res.status(400).json({ ok: false, errore: "Nessun dato da inviare" });
    }

    const piattaforma = env("QF_DESTINATARIO") || DESTINATARIO_DEFAULT;
    const destinatari = [piattaforma];
    /* Copia al professionista solo se l'indirizzo è plausibile:
       il valore arriva dal client e non va inoltrato alla cieca. */
    if (extra && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(extra) && extra !== piattaforma) {
      destinatari.push(extra);
    }

    const canale = canaleEmail();
    const esiti = await Promise.all(destinatari.map(d => canale.fn(d, oggetto, campi)));
    const telegram = await viaTelegram(oggetto, campi);

    const consegnati = destinatari.filter((_, i) => esiti[i].ok);
    /* Anche la sola notifica Telegram è una consegna riuscita: il
       contatto ti è arrivato, e questo è ciò che conta. */
    const ok = consegnati.length > 0 || !!(telegram && telegram.ok);

    return res.status(200).json({
      ok,
      canale: canale.nome,
      consegnati,
      telegram: telegram ? telegram.ok : null,
      dettagli: esiti.map((e, i) => ({ destinatario: destinatari[i], ok: e.ok, messaggio: e.messaggio }))
    });
  } catch (e) {
    return res.status(500).json({ ok: false, errore: e.message });
  }
};
