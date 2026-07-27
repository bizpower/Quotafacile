/* ============================================================
   QuotaFacile — Consent Management Platform (cookie banner)
   ------------------------------------------------------------
   Conforme alle Linee guida del Garante Privacy (provv. 231
   del 10/06/2021) e all'art. 122 d.lgs. 196/2003:
   - nessuno strumento non necessario prima della scelta;
   - "Rifiuta tutti" con la stessa evidenza di "Accetta tutti";
   - chiusura con la X = nessun consenso (non equivale ad accettare);
   - consenso granulare per categoria, revocabile in ogni momento;
   - registrazione della scelta con data e versione (accountability);
   - il banner non viene riproposto per 6 mesi dopo un rifiuto.

   API pubblica
     QFConsent.has("analytics")   → true/false
     QFConsent.get()              → record completo
     QFConsent.open()             → apre il centro preferenze
     QFConsent.onChange(fn)       → callback ad ogni variazione
   ============================================================ */
"use strict";

(function () {
  const KEY = "qf_consent_v1";
  const VERSION = 1;
  const SEI_MESI = 182 * 86400000;

  const CATEGORIE = [
    {
      id: "necessari", nome: "Strumenti necessari", locked: true,
      desc: "Indispensabili per far funzionare il sito e per ricordare le tue scelte sulla privacy. Non possono essere disattivati e non richiedono consenso."
    },
    {
      id: "preferenze", nome: "Preferenze", locked: false,
      desc: "Memorizzano impostazioni non essenziali (filtri della bacheca, bozze di risposta) per non fartele reimpostare ogni volta."
    },
    {
      id: "statistici", nome: "Statistici", locked: false,
      desc: "Ci dicono in forma aggregata quali contenuti sono utili e da dove arriva il traffico. Nessuno strumento di questa categoria è attualmente attivo."
    },
    {
      id: "marketing", nome: "Marketing", locked: false,
      desc: "Permettono di mostrare annunci pertinenti e misurarne il rendimento. Nessuno strumento di questa categoria è attualmente attivo."
    }
  ];

  const listeners = [];
  let stato = leggi();

  function leggi() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s.v !== VERSION) return null;
      return s;
    } catch (e) { return null; }
  }

  function scrivi(categorie, metodo) {
    stato = {
      v: VERSION,
      ts: new Date().toISOString(),
      metodo,                       // accept-all | reject-all | custom | dismissed
      categorie: { necessari: true, ...categorie }
    };
    try { localStorage.setItem(KEY, JSON.stringify(stato)); } catch (e) { /* storage negato */ }
    listeners.forEach(fn => { try { fn(stato); } catch (e) { /* no-op */ } });
    applica();
  }

  /* Qui vanno attivati gli script condizionati al consenso.
     Finché non ci sono analytics/marketing, la funzione è un no-op
     documentato: aggiungere qui il caricamento, mai in <head>. */
  function applica() {
    if (has("statistici")) {
      /* es. caricamento analytics — attualmente nessuno strumento attivo */
    }
    if (has("marketing")) {
      /* es. pixel pubblicitari — attualmente nessuno strumento attivo */
    }
  }

  const has = cat => cat === "necessari" ? true : !!(stato && stato.categorie && stato.categorie[cat]);

  function vaMostrato() {
    if (!stato) return true;
    if (stato.metodo === "dismissed") {
      /* chiusura con X: nessun consenso, ma non si ripropone per 6 mesi */
      return (Date.now() - new Date(stato.ts).getTime()) > SEI_MESI;
    }
    return false;
  }

  /* ---------------- UI ---------------- */
  function bannerHTML() {
    return `
    <div class="cc-banner" role="dialog" aria-modal="false" aria-labelledby="cc-title" aria-describedby="cc-desc">
      <button class="cc-x" data-cc="dismiss" aria-label="Chiudi senza accettare">✕</button>
      <h2 id="cc-title">🍪 Rispettiamo la tua privacy</h2>
      <p id="cc-desc">
        Usiamo strumenti tecnici necessari a far funzionare il sito. Con il tuo consenso vorremmo
        usarne altri per ricordare le tue preferenze e capire in forma aggregata quali contenuti
        sono utili. Puoi accettare, rifiutare o scegliere categoria per categoria: la scelta è
        modificabile in ogni momento dal footer.
        <a href="#/cookie-policy">Cookie Policy</a> · <a href="#/privacy">Privacy Policy</a>
      </p>
      <div class="cc-actions">
        <button class="btn btn-outline" data-cc="reject">Rifiuta tutti</button>
        <button class="btn btn-ghost" data-cc="custom">Personalizza</button>
        <button class="btn btn-primary" data-cc="accept">Accetta tutti</button>
      </div>
      <p class="cc-note">Chiudere con la ✕ equivale a rifiutare gli strumenti non necessari.</p>
    </div>`;
  }

  function modaleHTML() {
    const on = id => (stato && stato.categorie && stato.categorie[id]) ? "checked" : "";
    return `
    <div class="cc-overlay" data-cc="backdrop">
      <div class="cc-modal" role="dialog" aria-modal="true" aria-labelledby="cc-m-title">
        <div class="cc-modal-head">
          <h2 id="cc-m-title">Preferenze sulla privacy</h2>
          <button class="cc-x" data-cc="close" aria-label="Chiudi">✕</button>
        </div>
        <div class="cc-modal-body">
          <p class="muted" style="font-size:.9rem">
            Scegli quali categorie di strumenti autorizzare. Il dettaglio completo, con l'elenco
            nominativo e le durate, è nella <a href="#/cookie-policy">Cookie Policy</a>.
          </p>
          ${CATEGORIE.map(c => `
            <div class="cc-cat">
              <label class="cc-switch">
                <input type="checkbox" data-cat="${c.id}" ${c.locked ? "checked disabled" : on(c.id)}>
                <span class="cc-slider"></span>
              </label>
              <div>
                <strong>${c.nome}${c.locked ? ` <span class="pill pill-on">sempre attivi</span>` : ""}</strong>
                <p class="muted">${c.desc}</p>
              </div>
            </div>`).join("")}
          ${stato ? `<p class="cc-record">Ultima scelta registrata il
            ${new Date(stato.ts).toLocaleString("it-IT")} (${stato.metodo}).</p>` : ""}
        </div>
        <div class="cc-modal-foot">
          <button class="btn btn-outline btn-sm" data-cc="reject">Rifiuta tutti</button>
          <button class="btn btn-ghost btn-sm" data-cc="accept">Accetta tutti</button>
          <button class="btn btn-primary btn-sm" data-cc="save">Salva le preferenze</button>
        </div>
      </div>
    </div>`;
  }

  const root = () => {
    let r = document.getElementById("cc-root");
    if (!r) { r = document.createElement("div"); r.id = "cc-root"; document.body.appendChild(r); }
    return r;
  };

  function mostraBanner() { root().innerHTML = bannerHTML(); }
  function apriModale() { root().innerHTML = modaleHTML(); }
  function chiudi() { root().innerHTML = ""; }

  function tutte(valore) {
    return Object.fromEntries(CATEGORIE.filter(c => !c.locked).map(c => [c.id, valore]));
  }

  document.addEventListener("click", e => {
    const t = e.target.closest("[data-cc]");
    if (t) {
      const az = t.dataset.cc;
      if (az === "accept") { scrivi(tutte(true), "accept-all"); chiudi(); toastCC("Preferenze salvate: hai accettato tutte le categorie."); }
      else if (az === "reject") { scrivi(tutte(false), "reject-all"); chiudi(); toastCC("Preferenze salvate: solo strumenti necessari."); }
      else if (az === "custom") apriModale();
      else if (az === "dismiss") { scrivi(tutte(false), "dismissed"); chiudi(); }
      else if (az === "close" || az === "backdrop") {
        if (az === "backdrop" && e.target !== t) return;
        stato ? chiudi() : mostraBanner();
      }
      else if (az === "save") {
        const sel = {};
        document.querySelectorAll("[data-cat]").forEach(i => { if (!i.disabled) sel[i.dataset.cat] = i.checked; });
        scrivi(sel, "custom"); chiudi(); toastCC("Preferenze sulla privacy aggiornate.");
      }
      return;
    }
    if (e.target.closest("[data-open-consent]")) { e.preventDefault(); apriModale(); }
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && document.querySelector(".cc-overlay")) { stato ? chiudi() : mostraBanner(); }
  });

  function toastCC(msg) {
    if (typeof window.toast === "function") window.toast(msg);
  }

  window.QFConsent = {
    has, get: () => stato, open: apriModale,
    onChange: fn => listeners.push(fn),
    categorie: CATEGORIE
  };

  applica();
  if (vaMostrato()) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mostraBanner);
    else mostraBanner();
  }
})();
