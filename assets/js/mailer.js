/* ============================================================
   QuotaFacile — Consegna delle richieste via email
   ------------------------------------------------------------
   Il sito è statico: non c'è un server che possa spedire email.
   La consegna passa quindi da un servizio form-to-email di terza
   parte, che riceve i dati del modulo e li inoltra alla casella
   indicata.

   COSA SUCCEDE AI DATI
   Il servizio scelto diventa un RESPONSABILE DEL TRATTAMENTO ai
   sensi dell'art. 28 GDPR: riceve nome, email, telefono e note
   dell'utente. È dichiarato nella Privacy Policy, sezione
   "A chi comunichiamo i dati". Se cambi provider, aggiorna anche
   quella sezione in assets/js/legal.js.

   ⚠️ PRIMA CHE FUNZIONI: UN'ATTIVAZIONE DA FARE UNA VOLTA SOLA
   Con FormSubmit la prima richiesta inviata a un indirizzo non
   viene recapitata: arriva invece un'email di conferma a quella
   casella, con un link da cliccare. Da quel momento in poi tutte
   le richieste arrivano normalmente. Vale per la casella della
   piattaforma e per quella di ogni professionista.

   COME PASSARE A UN ALTRO PROVIDER
   - Web3Forms (consigliato: non espone l'indirizzo nel sorgente)
     registra una chiave gratuita su web3forms.com, incollala in
     `web3formsKey` e porta `provider` a "web3forms".
   - FormSubmit con alias: dopo l'attivazione, FormSubmit fornisce
     un alias del tipo "el/xxxxxxxx". Incollalo in
     `destinatarioPiattaforma` al posto dell'indirizzo email: le
     richieste continuano ad arrivare, ma l'indirizzo non è più
     leggibile nel codice sorgente (meno spam).
   ============================================================ */
"use strict";

(function () {

  const MAILER = {
    provider: "formsubmit",                       // "formsubmit" | "web3forms" | "mailto"
    destinatarioPiattaforma: "r.difalco@lori-crm.it",
    web3formsKey: "",                             // richiesto solo con provider "web3forms"
    /* Se true, quando la richiesta è indirizzata a un professionista
       una copia parte anche verso la sua casella. */
    copiaAlProfessionista: true,
    mittenteEtichetta: "QuotaFacile"
  };

  const ENDPOINT = {
    formsubmit: dest => `https://formsubmit.co/ajax/${encodeURIComponent(dest)}`,
    web3forms: () => "https://api.web3forms.com/submit"
  };

  /* Corpo leggibile: il servizio inoltra i campi così come arrivano,
     quindi le etichette devono essere comprensibili in una email. */
  function corpo(dati) {
    return Object.entries(dati)
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
  }

  function mailtoUrl(dest, oggetto, dati) {
    return `mailto:${dest}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(corpo(dati))}`;
  }

  async function postJson(url, payload) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json().catch(() => ({}));
  }

  /* Invia a un singolo destinatario. Restituisce true/false senza
     lanciare: la chiamante decide cosa mostrare all'utente. */
  async function inviaA(dest, oggetto, dati) {
    if (!dest || /^«.*»$/.test(dest)) return false;
    try {
      if (MAILER.provider === "web3forms") {
        if (!MAILER.web3formsKey) return false;
        await postJson(ENDPOINT.web3forms(), {
          access_key: MAILER.web3formsKey,
          subject: oggetto,
          from_name: MAILER.mittenteEtichetta,
          to: dest,
          ...dati
        });
        return true;
      }
      if (MAILER.provider === "formsubmit") {
        await postJson(ENDPOINT.formsubmit(dest), {
          _subject: oggetto,
          _template: "table",
          _captcha: "false",
          ...dati
        });
        return true;
      }
      return false; // provider "mailto": gestito dal fallback
    } catch (e) {
      return false;
    }
  }

  /* API pubblica.
     `dest` aggiuntivo = casella del professionista destinatario.
     Esito: { consegnato, fallback } — `fallback` è un mailto: da
     proporre all'utente quando la consegna automatica non riesce,
     così una richiesta non va mai persa in silenzio. */
  async function invia({ oggetto, dati, destinatarioExtra = null }) {
    const arricchiti = {
      ...dati,
      Origine: location.origin + location.pathname,
      Inviato: new Date().toLocaleString("it-IT")
    };

    const destinatari = [MAILER.destinatarioPiattaforma];
    if (MAILER.copiaAlProfessionista && destinatarioExtra) destinatari.push(destinatarioExtra);

    const esiti = await Promise.all(destinatari.map(d => inviaA(d, oggetto, arricchiti)));
    const consegnato = esiti.some(Boolean);

    return {
      consegnato,
      destinatari: destinatari.filter((_, i) => esiti[i]),
      fallback: consegnato ? null : mailtoUrl(MAILER.destinatarioPiattaforma, oggetto, arricchiti)
    };
  }

  window.QFMailer = { invia, config: MAILER };
})();
