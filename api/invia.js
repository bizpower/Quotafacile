/* ============================================================
   QuotaFacile — Funzione serverless di consegna
   ------------------------------------------------------------
   Riceve i moduli del sito e li inoltra alle caselle di
   destinazione passando dal servizio form-to-email.

   Perché esiste, invece di chiamare il servizio dal browser:
   - l'indirizzo di destinazione non compare più nel sorgente
     della pagina, quindi non viene raccolto dagli spambot;
   - niente CORS e niente chiavi esposte lato client;
   - se un giorno si passa a un provider SMTP vero (Resend,
     Postmark, SES) cambia solo questo file, non il sito.

   Funziona su Vercel. Se il sito viene servito da un host senza
   funzioni serverless (es. GitHub Pages) la chiamata fallisce e
   assets/js/mailer.js ripiega da solo sull'invio diretto.

   Configurazione via variabili d'ambiente, con valori di
   ripiego per non lasciare il servizio muto se mancano:
     QF_DESTINATARIO   casella della piattaforma
     QF_FORMSUBMIT     indirizzo o alias usato dal servizio
   ============================================================ */

const DESTINATARIO_DEFAULT = "r.difalco@lori-crm.it";
const MAX_CAMPI = 40;
const MAX_LUNGHEZZA = 5000;

/* ⚠️ VERIFICATO SUL CAMPO: FormSubmit è dietro una protezione
   Cloudflare che risponde alle chiamate da server con una pagina di
   sfida ("Just a moment…") invece che con l'API. Dai browser degli
   utenti funziona, da un datacenter no — e questa funzione gira su un
   datacenter.

   Perciò: se è configurata la chiave Web3Forms la funzione la usa, ed
   è la strada da preferire (nessuna attivazione per indirizzo, nessuna
   sfida, indirizzo mai esposto). Senza chiave tenta comunque
   FormSubmit, ma è probabile che venga bloccata: in quel caso il sito
   ripiega da solo sull'invio dal browser, che invece passa.

   Variabili d'ambiente su Vercel:
     QF_WEB3FORMS_KEY  chiave gratuita da web3forms.com  ← consigliata
     QF_DESTINATARIO   casella della piattaforma */

async function viaWeb3Forms(destinatario, oggetto, campi, chiave) {
  const r = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      access_key: chiave, subject: oggetto, from_name: "QuotaFacile",
      to: destinatario, ...campi
    })
  });
  const esito = await r.json().catch(() => ({}));
  return { ok: r.ok && esito.success === true, messaggio: esito.message || ("HTTP " + r.status) };
}

async function viaFormSubmit(destinatario, oggetto, campi) {
  const r = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(destinatario), {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ _subject: oggetto, _template: "table", _captcha: "false", ...campi })
  });
  const testo = await r.text();
  if (/Just a moment|challenge-platform/i.test(testo)) {
    return { ok: false, messaggio: "Bloccato dalla protezione Cloudflare del servizio: configura QF_WEB3FORMS_KEY" };
  }
  let esito = {};
  try { esito = JSON.parse(testo); } catch (e) { /* risposta non JSON */ }
  const ok = r.ok && (esito.success === true || esito.success === "true");
  return { ok, messaggio: esito.message || ("HTTP " + r.status) };
}

async function inoltra(destinatario, oggetto, campi) {
  const chiave = process.env.QF_WEB3FORMS_KEY;
  return chiave
    ? viaWeb3Forms(destinatario, oggetto, campi, chiave)
    : viaFormSubmit(destinatario, oggetto, campi);
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

    /* Sanificazione: i campi arrivano dal browser, quindi si
       limitano numero e dimensione prima di inoltrarli. */
    const campi = {};
    Object.entries(body.dati || {}).slice(0, MAX_CAMPI).forEach(([k, v]) => {
      if (v === undefined || v === null || String(v).trim() === "") return;
      campi[String(k).slice(0, 80)] = String(v).slice(0, MAX_LUNGHEZZA);
    });
    if (!Object.keys(campi).length) {
      return res.status(400).json({ ok: false, errore: "Nessun dato da inviare" });
    }

    const piattaforma = process.env.QF_DESTINATARIO || DESTINATARIO_DEFAULT;
    const destinatari = [piattaforma];
    /* Copia al professionista solo se è un indirizzo plausibile:
       il valore arriva dal client e non va inoltrato alla cieca. */
    if (extra && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(extra) && extra !== piattaforma) {
      destinatari.push(extra);
    }

    const esiti = await Promise.all(destinatari.map(d => inoltra(d, oggetto, campi)));
    const consegnati = destinatari.filter((_, i) => esiti[i].ok);

    return res.status(200).json({
      ok: consegnati.length > 0,
      consegnati,
      dettagli: esiti.map((e, i) => ({ destinatario: destinatari[i], ok: e.ok, messaggio: e.messaggio }))
    });
  } catch (e) {
    return res.status(500).json({ ok: false, errore: e.message });
  }
};
