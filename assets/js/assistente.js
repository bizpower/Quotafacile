/* ============================================================
   QuotaFacile — L'assistente, ovunque nell'area riservata
   ------------------------------------------------------------
   Prima era una scheda del CRM, fra Collaboratori e Posta. Il
   guaio di una scheda è che per parlarci bisogna andarci: se stai
   guardando il registro degli invii e ti viene in mente una cosa,
   devi uscire, dire la frase, e tornare — e quando torni hai perso
   il punto in cui eri. Un assistente che si usa così si usa poco.

   Qui è un bottone che sta fermo nell'angolo in basso a destra di
   ogni schermata dell'area riservata, CRM e Mail Marketing e
   Magazine comprese, e apre un pannello di fianco senza portare
   via la pagina sotto.

   PERCHÉ VIVE FUORI DA #app
   Il router riscrive #app da capo a ogni cambio di rotta. Un
   pannello disegnato lì dentro sparirebbe a ogni passaggio,
   portandosi via la conversazione a metà. Questo si appende al
   body — come fa il banner dei cookie — e del router non si
   accorge nemmeno.

   COSA ARRIVA AL MODELLO
   Solo la frase scritta o dettata. Mai una riga del CRM: le
   risposte le compone il server con i dati che ha già in mano, e
   il modello non ha modo di chiederne altri. Quello che il
   modello propone si vede a schermo, campo per campo, prima che
   venga scritto — e si può correggere lì.
   ============================================================ */
"use strict";

(function () {
  const API_CHAT = "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-chat";

  const QF = () => window.QF;
  const esc = s => window.QF.esc(s);
  const chiave = () => window.QF_ADMIN?.chiave() || "";

  /* Il riconoscimento vocale è di Chrome: su Firefox e su Safari
     per desktop non c'è. Dove manca, il microfono non compare e
     si scrive — non si mostra un bottone che non fa niente. */
  const VOCE = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  /* ---------------- STATO ----------------
     Vive qui e non dentro una vista, così resta com'è mentre la
     pagina sotto cambia. */
  let aperto = false;
  let chat = [];            // { da: "io" | "qf", testo }
  let proposta = null;      // la proposta in attesa di conferma
  let bozza = "";           // quel che c'è nella casella fra un disegno e l'altro
  let inCorso = false;
  let ultimoLead = null;    // per "aggiungilo alla lista X"
  let ascolto = null;       // il riconoscimento vocale attivo

  const ESEMPI = [
    "Salva Autofficina Bianchi, info@bianchi.it, telefono 02 1234567, Milano",
    "Crea una lista che si chiama Carrozzerie Lombardia",
    "Aggiungi Autofficina Bianchi alla lista Carrozzerie Lombardia"
  ];

  const dice = (da, testo) => chat.push({ da, testo });

  /* ---------------- DIALOGO COL SERVER ---------------- */

  async function chiama(azione, dati, timeout = 30000) {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), timeout);
    try {
      const r = await fetch(API_CHAT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qf-admin": chiave() },
        body: JSON.stringify({ azione, dati }),
        signal: stop.signal
      });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok && j.ok === true, status: r.status, ...j };
    } catch (e) {
      return {
        ok: false, status: 0,
        errore: e.name === "AbortError" ? "Tempo scaduto" : "Assistente non raggiungibile"
      };
    } finally {
      clearTimeout(t);
    }
  }

  async function chiedi(frase) {
    dice("io", frase);
    proposta = null;
    inCorso = true;
    bozza = "";
    disegna();

    const e = await chiama("interpreta", { frase, ultimoLead });
    inCorso = false;

    if (!e.ok) dice("qf", e.errore || "Non sono riuscito a interpretare la frase.");
    else if (e.proposta) { proposta = e.proposta; dice("qf", e.proposta.titolo); }
    else dice("qf", e.messaggio || "Non ho capito.");
    disegna();
  }

  async function conferma() {
    if (!proposta) return;
    const val = k => {
      const c = document.querySelector(`[data-qa-campo="${k}"]`);
      return c ? c.value.trim() : null;
    };

    /* I campi si rileggono dallo schermo, non dalla proposta: se
       il dettato ha sbagliato il nome e tu l'hai corretto a mano,
       deve finire nell'archivio la tua correzione. */
    let campi;
    if (proposta.azione === "salva_lead") {
      campi = {
        nome: val("nome"), email: val("email"), telefono: val("telefono"),
        citta: val("citta"), provincia: val("provincia"),
        categoria: val("categoria"), note: val("note")
      };
    } else if (proposta.azione === "crea_lista") {
      campi = { nome: val("nome"), descrizione: val("descrizione") };
    } else {
      campi = { lead_id: val("lead_id"), lista_id: val("lista_id") };
    }

    inCorso = true;
    disegna();
    const e = await chiama("esegui", { azione: proposta.azione, campi, frase: proposta.frase }, 25000);
    inCorso = false;

    if (!e.ok) { dice("qf", e.errore || "Non sono riuscito a salvare."); disegna(); return; }
    proposta = null;
    if (e.leadId) ultimoLead = e.leadId;
    dice("qf", e.messaggio || "Fatto.");
    disegna();

    /* L'archivio a schermo deve corrispondere a quello vero. Se
       sotto c'è il CRM lo si fa rileggere in silenzio: senza,
       resterebbe a mostrare i dati di un minuto fa. */
    window.QF_CRM?.ricarica?.();
  }

  /* ---------------- IL MICROFONO ---------------- */

  const ERRORI_VOCE = {
    "not-allowed": "Il browser non mi dà il microfono: va concesso dal lucchetto accanto all'indirizzo.",
    "service-not-allowed": "Il browser non mi dà il microfono: va concesso dal lucchetto accanto all'indirizzo.",
    "no-speech": "Non ho sentito niente.",
    "audio-capture": "Non trovo un microfono collegato.",
    network: "Il riconoscimento vocale ha bisogno della rete e non è riuscito a raggiungerla."
  };

  function micAggiorna() {
    const b = document.querySelector("#qa-mic");
    if (b) b.classList.toggle("qa-mic-attivo", !!ascolto);
  }

  function ascolta() {
    if (!VOCE) return;
    if (ascolto) { ascolto.stop(); return; }

    const r = new VOCE();
    r.lang = "it-IT";
    r.interimResults = true;
    r.continuous = false;
    /* Il testo va nella casella, non parte da solo: è il momento
       in cui ti accorgi che ha capito "Grossi" invece di "Rossi". */
    r.onresult = ev => {
      let s = "";
      for (let i = 0; i < ev.results.length; i++) s += ev.results[i][0].transcript;
      bozza = s;
      const c = document.querySelector("#qa-testo");
      if (c) c.value = s;
    };
    r.onerror = ev => {
      ascolto = null; micAggiorna();
      QF()?.toast(ERRORI_VOCE[ev.error] || "Il riconoscimento vocale non ha funzionato.");
    };
    r.onend = () => { ascolto = null; micAggiorna(); };

    ascolto = r;
    try { r.start(); micAggiorna(); } catch (e) { ascolto = null; micAggiorna(); }
  }

  /* ---------------- DISEGNO ---------------- */

  function propostaHtml(p) {
    /* Note e descrizione sono testo libero: una colonna sola le
       taglia a metà parola mentre si rilegge quello che sta per
       essere scritto. */
    const campo = (k, etichetta, v, tipo = "text") => `
      <label class="qa-campo ${k === "note" || k === "descrizione" ? "qa-campo-largo" : ""}">
        <span>${etichetta}</span>
        <input type="${tipo}" data-qa-campo="${k}" value="${esc(v || "")}" placeholder="—">
      </label>`;

    let corpo;
    if (p.azione === "salva_lead") {
      const c = p.campi;
      corpo = `
        ${campo("nome", "Nome", c.nome)}
        ${campo("email", "Email", c.email, "email")}
        ${campo("telefono", "Telefono", c.telefono, "tel")}
        ${campo("citta", "Città", c.citta)}
        ${campo("provincia", "Provincia", c.provincia)}
        ${campo("categoria", "Categoria", c.categoria)}
        ${campo("note", "Note", c.note)}`;
    } else if (p.azione === "crea_lista") {
      corpo = `
        ${campo("nome", "Nome della lista", p.campi.nome)}
        ${campo("descrizione", "Descrizione", p.campi.descrizione)}`;
    } else {
      const s = p.scelte || { lead: [], liste: [] };
      corpo = `
        <label class="qa-campo"><span>Contatto</span>
          <select data-qa-campo="lead_id">
            ${s.lead.map(l => `<option value="${esc(l.id)}">${esc(l.nome)}${l.citta ? " — " + esc(l.citta) : ""}${l.email ? " · " + esc(l.email) : ""}</option>`).join("")}
          </select></label>
        <label class="qa-campo"><span>Lista</span>
          <select data-qa-campo="lista_id">
            ${s.liste.map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join("")}
          </select></label>`;
    }

    return `
    <div class="qa-proposta">
      <span class="qa-etichetta">Azione proposta</span>
      <strong>${esc(p.titolo)}</strong>
      <p class="qa-nota">Controlla i campi: quello che vedi qui è quello che verrà scritto.</p>
      ${(p.avvisi || []).map(a => `<div class="qa-avviso">${esc(a)}</div>`).join("")}
      <div class="qa-campi">${corpo}</div>
      <div class="qa-azioni">
        <button class="btn btn-ghost btn-sm" data-qa-annulla>Annulla</button>
        <button class="btn btn-primary btn-sm" data-qa-conferma>Conferma e salva</button>
      </div>
    </div>`;
  }

  function pannelloHtml() {
    return `
    <div class="qa-velo" data-qa-velo></div>
    <div class="qa-pannello" role="dialog" aria-modal="false" aria-labelledby="qa-titolo">
      <div class="qa-testa">
        <h2 id="qa-titolo">✨ Assistente</h2>
        <button class="qa-chiudi" data-qa-chiudi aria-label="Chiudi l'assistente">✕</button>
      </div>

      <div class="qa-storia" id="qa-storia">
        ${chat.length ? chat.map(m => `
          <div class="qa-riga qa-${m.da}"><span>${esc(m.testo)}</span></div>`).join("")
        : `<p class="qa-vuoto">Dimmi cosa devo fare. Per cominciare, prova con una di queste:</p>
           ${ESEMPI.map(e => `<button type="button" class="chip qa-esempio" data-qa-esempio="${esc(e)}">${esc(e)}</button>`).join(" ")}`}
        ${inCorso ? `<div class="qa-riga qa-qf qa-attesa"><span>Sto leggendo…</span></div>` : ""}
        ${proposta ? propostaHtml(proposta) : ""}
      </div>

      <div class="qa-barra">
        ${VOCE ? `<button type="button" class="qa-mic" id="qa-mic" title="Detta" aria-label="Detta con la voce">🎤</button>` : ""}
        <input type="text" id="qa-testo" placeholder="Scrivi o detta…"
               value="${esc(bozza)}" autocomplete="off" ${inCorso ? "disabled" : ""}>
        <button class="btn btn-primary btn-sm" id="qa-invia" ${inCorso ? "disabled" : ""}>Invia</button>
      </div>

      <p class="qa-privacy">
        La frase che scrivi o detti passa da Google (Gemini) per essere tradotta in un
        comando. Quello che è già in archivio non esce mai da qui: al modello non viene
        mandata nessuna riga del CRM.
      </p>
    </div>`;
  }

  const radice = () => {
    let r = document.getElementById("qa-root");
    if (!r) { r = document.createElement("div"); r.id = "qa-root"; document.body.appendChild(r); }
    return r;
  };

  /* Si mostra solo nell'area riservata e solo a chi è entrato:
     il bottone non deve comparire sul sito pubblico, e nemmeno
     davanti alla richiesta della chiave. */
  const visibile = () =>
    (location.hash || "").startsWith("#/admin") && !!chiave();

  function disegna() {
    const r = radice();
    if (!visibile()) { r.innerHTML = ""; return; }

    r.innerHTML = `
      <button class="qa-bottone ${aperto ? "qa-bottone-aperto" : ""}" data-qa-apri
              aria-label="${aperto ? "Chiudi l'assistente" : "Apri l'assistente"}"
              aria-expanded="${aperto}">${aperto ? "✕" : "✨"}</button>
      ${aperto ? pannelloHtml() : ""}`;

    if (!aperto) return;

    /* La conversazione si legge dal basso, come tutte le
       conversazioni — tranne quando in fondo c'è una proposta.
       Quella è alta quanto mezzo pannello, e portarla in fondo
       significa lasciare fuori dall'alto il titolo e il primo
       campo: si finisce a confermare una scrittura di cui si
       vede solo la metà inferiore. Allora si porta a schermo il
       suo inizio. */
    const storia = document.querySelector("#qa-storia");
    const prop = document.querySelector(".qa-proposta");
    if (prop && storia) storia.scrollTop = prop.offsetTop - storia.offsetTop;
    else if (storia) storia.scrollTop = storia.scrollHeight;
    micAggiorna();

    const casella = document.querySelector("#qa-testo");
    if (casella && !inCorso) {
      casella.focus();
      casella.setSelectionRange(casella.value.length, casella.value.length);
    }
  }

  /* ---------------- EVENTI ----------------
     Delegati sul documento una volta sola: il pannello viene
     ridisegnato di continuo e attaccare gli eventi ogni volta
     vorrebbe dire dimenticarsene una. */

  function invia() {
    const c = document.querySelector("#qa-testo");
    const t = c ? c.value.trim() : "";
    if (!t || inCorso) return;
    if (ascolto) { ascolto.stop(); ascolto = null; }
    chiedi(t);
  }

  document.addEventListener("click", ev => {
    if (ev.target.closest("[data-qa-apri]")) {
      aperto = !aperto; disegna(); return;
    }
    if (ev.target.closest("[data-qa-chiudi]") || ev.target.closest("[data-qa-velo]")) {
      aperto = false; if (ascolto) { ascolto.stop(); ascolto = null; } disegna(); return;
    }
    if (ev.target.closest("#qa-invia")) { invia(); return; }
    if (ev.target.closest("#qa-mic")) { ascolta(); return; }

    const es = ev.target.closest("[data-qa-esempio]");
    if (es) { chiedi(es.dataset.qaEsempio); return; }

    if (ev.target.closest("[data-qa-conferma]")) { conferma(); return; }
    if (ev.target.closest("[data-qa-annulla]")) {
      proposta = null; dice("qf", "Annullato: non ho scritto niente."); disegna(); return;
    }
  });

  document.addEventListener("keydown", ev => {
    if (ev.key === "Escape" && aperto) {
      aperto = false; if (ascolto) { ascolto.stop(); ascolto = null; } disegna(); return;
    }
    if (ev.key === "Enter" && ev.target?.id === "qa-testo") {
      ev.preventDefault(); invia();
    }
  });

  /* La bozza si tiene aggiornata a ogni tasto: senza, un
     ridisegno nel mezzo di una frase la cancellerebbe. */
  document.addEventListener("input", ev => {
    if (ev.target?.id === "qa-testo") bozza = ev.target.value;
  });

  window.addEventListener("hashchange", disegna);

  window.QF_ASSISTENTE = {
    /* app.js la chiama dopo ogni disegno: è il momento in cui si
       scopre che la chiave è appena stata inserita, o che si è
       usciti dall'area riservata. */
    aggiorna: disegna,
    apri: () => { aperto = true; disegna(); },
    chiudi: () => { aperto = false; disegna(); }
  };

  disegna();
})();
