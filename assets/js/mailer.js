/* ============================================================
   QuotaFacile — Consegna delle richieste
   ------------------------------------------------------------
   Le richieste vengono inviate a una funzione serverless su
   Supabase che le SALVA in un database e solo dopo tenta di
   avvisare per email o Telegram.

   Perché conta l'ordine: finché la consegna dipendeva da un
   servizio di posta, una richiesta poteva sparire senza che
   nessuno se ne accorgesse. Ora il contatto è registrato prima
   che si provi a spedire alcunché. Se l'avviso fallisce, il
   lead resta comunque nel database e nell'area admin.

   Di conseguenza cambia anche cosa comunichiamo all'utente:
   "richiesta ricevuta" significa salvata, non "email partita".
   Il ripiego con il mailto compare solo se nemmeno il
   salvataggio è riuscito — cioè se il servizio è irraggiungibile.

   Il database non è raggiungibile dal browser: questa pagina
   parla solo con la funzione, che valida lato server.
   ============================================================ */
"use strict";

(function () {

  const CONFIG = {
    endpoint: "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-contatti",
    /* Usato solo per comporre il mailto di ripiego quando il
       servizio non risponde. */
    emailRipiego: "r.difalco@lori-crm.it",
    timeoutMs: 15000
  };

  const corpoTesto = dati => Object.entries(dati)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${v}`).join("\n");

  const mailtoRipiego = (oggetto, dati) =>
    `mailto:${CONFIG.emailRipiego}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(corpoTesto(dati))}`;

  /* Il timeout evita che l'utente resti su "invio in corso" a
     tempo indeterminato se la rete è lenta o il servizio è giù. */
  async function chiama(payload) {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), CONFIG.timeoutMs);
    try {
      const r = await fetch(CONFIG.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: stop.signal
      });
      const esito = await r.json().catch(() => ({}));
      return { ok: r.ok && esito.ok === true, status: r.status, ...esito };
    } catch (e) {
      return { ok: false, status: 0, errore: e.name === "AbortError" ? "Tempo scaduto" : e.message };
    } finally {
      clearTimeout(t);
    }
  }

  /* API pubblica.
     tipo: "richiesta" | "iscrizione-pro" | "waitlist" | "segnalazione"
     Esito: { salvato, notificata, errore, fallback }
       salvato   → il contatto è al sicuro, si può confermare all'utente
       notificata→ è partito anche l'avviso (informativa, non critica)
       fallback  → mailto da proporre solo se il salvataggio è fallito */
  async function invia(tipo, dati, { oggettoRipiego = "Richiesta da QuotaFacile", datiRipiego = null } = {}) {
    const esito = await chiama({ tipo, dati });
    if (esito.ok) {
      return { salvato: true, notificata: esito.notificata !== false, errore: null, fallback: null };
    }
    return {
      salvato: false,
      notificata: false,
      errore: esito.errore || "Servizio non raggiungibile",
      /* Un errore di validazione (400) non si risolve riscrivendo
         a mano: si risolve correggendo il modulo. Il ripiego ha
         senso solo quando è il servizio a non rispondere. */
      fallback: esito.status >= 400 && esito.status < 500
        ? null
        : mailtoRipiego(oggettoRipiego, datiRipiego || dati)
    };
  }

  window.QFMailer = { invia, config: CONFIG };
})();
