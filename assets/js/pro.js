/* ============================================================
   QuotaFacile — Account degli intermediari
   ------------------------------------------------------------
   Fino a ieri il "profilo professionista" era un oggetto JSON nel
   localStorage del visitatore. Andava benissimo finché l'Area Pro
   era una vetrina da compilare. Non va più bene dal momento in cui
   si vende un abbonamento, per un motivo che non si aggira
   scrivendo altro codice nel browser: se lo stato "abbonato"
   stesse nel localStorage, chiunque se lo concederebbe da solo
   dalla console. Una funzione a pagamento sbloccabile gratis
   riscrivendo una riga non è una funzione a pagamento.

   Da qui in poi l'identità è un'utenza vera e il profilo è una
   riga di pro_profili. Il localStorage resta solo come specchio
   di ciò che il server ha già detto: si riempie dopo l'accesso e
   si svuota uscendo.

   LA CHIAVE PUBBLICA NON È UN SEGRETO
   È la "publishable" di Supabase, progettata per stare nelle
   pagine. Da sola non apre niente: su pro_profili la Row Level
   Security lascia leggere la propria riga e nient'altro, il
   permesso di INSERT non è concesso a nessuno, e in UPDATE le
   colonne scrivibili sono elencate una per una — punti,
   stato_verifica e il cliente Stripe non sono fra quelle.

   LA SESSIONE STA NEL localStorage, NON NEL sessionStorage
   È la scelta opposta a quella fatta per i collaboratori, ed è
   voluta: un collaboratore entra dal computer dell'ufficio, un
   intermediario dal proprio, e chiedere a chi paga un abbonamento
   di rifare l'accesso ogni volta che chiude il browser è il modo
   di trasformare un abbonato in una richiesta di assistenza.
   Uscendo, la sessione viene revocata anche sul server.
   ============================================================ */
"use strict";

(function () {

  const URL_BASE = "https://vainqxalnxyzjqautcop.supabase.co";
  const CHIAVE_PUBBLICA = "sb_publishable_ofAGsWAlB6ClreUUg5xXwg_Y3fsYl_X";
  const API_PRO = URL_BASE + "/functions/v1/qf-pro";
  const CHIAVE_SESSIONE = "qf_sessione_pro";

  let sessione = null;
  const stato = { profilo: null, abbonamento: null, caricato: false, errore: null };

  const ascoltatori = [];
  const avvisa = () => ascoltatori.forEach(fn => { try { fn(stato); } catch (e) { /* no-op */ } });

  /* ---------------- Memoria della sessione ---------------- */
  function ricorda(s) {
    sessione = s;
    try {
      if (s) localStorage.setItem(CHIAVE_SESSIONE, JSON.stringify(s));
      else localStorage.removeItem(CHIAVE_SESSIONE);
    } catch (e) { /* storage negato: la sessione vive in memoria */ }
  }

  function recupera() {
    if (sessione) return sessione;
    try {
      const s = localStorage.getItem(CHIAVE_SESSIONE);
      if (s) sessione = JSON.parse(s);
    } catch (e) { /* no-op */ }
    return sessione;
  }

  /* ---------------- Chiamate ---------------- */
  async function grezza(url, opzioni = {}) {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), 30000);
    try {
      return await fetch(url, { ...opzioni, signal: stop.signal });
    } finally {
      clearTimeout(t);
    }
  }

  /* Il token dura un'ora. Prima di ogni chiamata si guarda se è
     ancora buono e, se non lo è, lo si rinnova: una sessione lunga
     non deve costringere a rientrare mentre si sta compilando. */
  async function tokenValido() {
    const s = recupera();
    if (!s) return false;
    if ((s.expires_at || 0) * 1000 - Date.now() > 60000) return true;
    if (!s.refresh_token) { ricorda(null); return false; }
    try {
      const r = await grezza(URL_BASE + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { apikey: CHIAVE_PUBBLICA, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token })
      });
      if (!r.ok) { ricorda(null); svuota(); return false; }
      ricorda(await r.json());
      return true;
    } catch (e) { return false; }
  }

  async function api(percorso, opzioni = {}) {
    if (!await tokenValido()) return { ok: false, status: 401, errore: "Sessione scaduta: rientra." };
    try {
      const r = await grezza(URL_BASE + percorso, {
        ...opzioni,
        headers: {
          apikey: CHIAVE_PUBBLICA,
          Authorization: "Bearer " + sessione.access_token,
          ...(opzioni.headers || {})
        }
      });
      if (r.status === 204) return { ok: true, dati: null };
      const t = await r.text();
      const dati = t ? JSON.parse(t) : null;
      if (!r.ok) return { ok: false, status: r.status, errore: dati?.message || "Operazione non riuscita" };
      return { ok: true, status: r.status, dati };
    } catch (e) {
      return { ok: false, status: 0, errore: e.name === "AbortError" ? "Tempo scaduto" : "Servizio non raggiungibile" };
    }
  }

  /* La funzione qf-pro: registrazione, checkout, portale. Le prime
     due hanno bisogno di sapere chi chiede, e lo sanno dal token —
     non da un campo del corpo, che chiunque potrebbe riscrivere. */
  async function funzione(azione, dati = {}, conSessione = true) {
    if (conSessione && !await tokenValido()) {
      return { ok: false, errore: "Sessione scaduta: rientra." };
    }
    try {
      const r = await grezza(API_PRO, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(conSessione ? { Authorization: "Bearer " + sessione.access_token } : {})
        },
        body: JSON.stringify({ azione, dati })
      });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok && j.ok === true, status: r.status, ...j };
    } catch (e) {
      return { ok: false, errore: "Servizio non raggiungibile." };
    }
  }

  /* ---------------- Il profilo ---------------- */

  /* La riga del database parla il linguaggio del database; il
     resto del sito parla quello della QuotaPass. La traduzione sta
     qui e in un posto solo: due mappature che divergono sono il
     modo di ritrovarsi il telefono che sparisce a ogni salvataggio. */
  function daRiga(r, abbonamento) {
    return {
      id: "me",
      profiloId: r.id,
      nome: r.nome,
      ruolo: r.ruolo || "Intermediario",
      azienda: r.azienda || "",
      rui: r.rui_numero || "",
      ruiSezione: r.rui_sezione || "",
      citta: r.citta || "",
      tel: r.telefono || "",
      email: r.email || "",
      bio: r.bio || "",
      spec: r.specializzazioni || [],
      punti: r.punti ?? 0,
      risposte: r.risposte ?? 0,
      pubblico: r.pubblico === true,
      statoVerifica: r.stato_verifica || "in_attesa",
      verificato: r.stato_verifica === "verificato",
      abbonamento: abbonamento || null
    };
  }

  const ATTIVI = ["trialing", "active"];

  async function caricaProfilo() {
    const [p, a] = await Promise.all([
      api("/rest/v1/pro_profili?select=*&limit=1"),
      api("/rest/v1/pro_abbonamenti?select=*&order=creato_il.desc&limit=1")
    ]);
    if (!p.ok) { stato.errore = p.errore; stato.caricato = true; avvisa(); return stato; }
    if (!p.dati || !p.dati.length) {
      stato.errore = "Questa utenza non ha un profilo professionista.";
      stato.caricato = true; avvisa(); return stato;
    }
    stato.abbonamento = (a.ok && a.dati && a.dati[0]) || null;
    stato.profilo = daRiga(p.dati[0], stato.abbonamento);
    stato.errore = null;
    stato.caricato = true;
    specchia();
    avvisa();
    return stato;
  }

  /* Lo specchio dentro DB.proProfile: il resto del sito lo legge
     da lì da sempre, e riscrivere diciassette punti per cambiare
     il nome della variabile non avrebbe migliorato niente. La
     differenza è che adesso quel valore arriva dal server e non è
     più la fonte: modificarlo dalla console cambia quello che si
     vede, non quello che si è. */
  function specchia() {
    const QF = window.QF;
    if (!QF) return;
    QF.DB.proProfile = stato.profilo;
    try { QF.saveDB?.(); } catch (e) { /* no-op */ }
  }

  function svuota() {
    stato.profilo = null; stato.abbonamento = null; stato.caricato = false; stato.errore = null;
    if (window.QF) { window.QF.DB.proProfile = null; try { window.QF.saveDB?.(); } catch (e) { /* no-op */ } }
  }

  /* ---------------- Entrare, registrarsi, uscire ---------------- */

  async function entra(email, password) {
    try {
      const r = await grezza(URL_BASE + "/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { apikey: CHIAVE_PUBBLICA, "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(email).trim().toLowerCase(), password })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const m = String(d.error_description || d.msg || d.message || "");
        if (/banned/i.test(m)) return { ok: false, errore: "Questo accesso è stato sospeso. Scrivici." };
        if (/invalid/i.test(m)) return { ok: false, errore: "Email o password non corrette." };
        return { ok: false, errore: m || "Accesso non riuscito." };
      }
      ricorda(d);
      const s = await caricaProfilo();
      if (!s.profilo) { await esci(); return { ok: false, errore: s.errore }; }
      return { ok: true, profilo: s.profilo };
    } catch (e) {
      return { ok: false, errore: "Servizio non raggiungibile." };
    }
  }

  /* La registrazione non passa dal database ma dalla funzione: su
     pro_profili nessuno ha il permesso di inserire, ed è voluto —
     chi si inserisce da solo si inserisce già verificato. Dopo la
     creazione si entra subito, così non si chiede due volte la
     stessa password. */
  async function registrati(d) {
    const e = await funzione("registrati", d, false);
    if (!e.ok) return { ok: false, errore: e.errore || "Registrazione non riuscita." };
    return await entra(d.email, d.password);
  }

  async function esci() {
    if (sessione?.access_token) {
      try {
        await grezza(URL_BASE + "/auth/v1/logout", {
          method: "POST",
          headers: { apikey: CHIAVE_PUBBLICA, Authorization: "Bearer " + sessione.access_token }
        });
      } catch (e) { /* la sessione locale va tolta comunque */ }
    }
    ricorda(null);
    svuota();
    avvisa();
  }

  /* Al ricaricamento della pagina il token c'è ancora ma il
     profilo no: quello che vale è cosa dice il database adesso —
     una verifica RUI può essere arrivata nel frattempo. */
  async function ripristina() {
    if (!recupera()) return null;
    if (stato.caricato) return stato.profilo;
    await caricaProfilo();
    return stato.profilo;
  }

  /* ---------------- Salvare il profilo ---------------- */
  /* Solo le colonne che il database lascia scrivere: punti,
     stato_verifica, pubblicazione del cliente Stripe e utente_id
     non sono nell'elenco, e non per dimenticanza. */
  async function salvaProfilo(campi) {
    if (!stato.profilo) return { ok: false, errore: "Nessun profilo da salvare." };
    const riga = {
      nome: campi.nome,
      ruolo: campi.ruolo,
      azienda: campi.azienda || null,
      rui_numero: campi.rui || null,
      rui_sezione: campi.ruiSezione || null,
      citta: campi.citta || null,
      telefono: campi.tel || null,
      email: campi.email || null,
      bio: campi.bio || null,
      specializzazioni: campi.spec || null
    };
    if (campi.pubblico !== undefined) riga.pubblico = !!campi.pubblico;

    const e = await api("/rest/v1/pro_profili?id=eq." + encodeURIComponent(stato.profilo.profiloId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(riga)
    });
    if (!e.ok) return { ok: false, errore: e.errore };
    if (e.dati && e.dati[0]) {
      stato.profilo = daRiga(e.dati[0], stato.abbonamento);
      specchia();
      avvisa();
    }
    return { ok: true };
  }

  /* ---------------- Abbonamento ---------------- */
  const ritorno = () => location.origin + (window.QF?.base || "/");

  async function checkout(piano) {
    const e = await funzione("checkout", { piano, ritorno: ritorno() });
    if (!e.ok || !e.url) return { ok: false, errore: e.errore || "Non sono riuscito ad aprire il pagamento." };
    location.href = e.url;
    return { ok: true };
  }

  async function portale() {
    const e = await funzione("portale", { ritorno: ritorno() });
    if (!e.ok || !e.url) return { ok: false, errore: e.errore || "Gestione abbonamento non disponibile." };
    location.href = e.url;
    return { ok: true };
  }

  const abbonamentoAttivo = () => {
    const a = stato.abbonamento;
    if (!a || !ATTIVI.includes(a.stato)) return false;
    return !a.periodo_fine || new Date(a.periodo_fine) > new Date();
  };

  window.QF_PRO = {
    stato,
    autenticato: () => !!recupera(),
    ripristina, entra, registrati, esci,
    caricaProfilo, salvaProfilo,
    checkout, portale, abbonamentoAttivo,
    ascolta: fn => { ascoltatori.push(fn); return () => ascoltatori.splice(ascoltatori.indexOf(fn), 1); }
  };
})();
