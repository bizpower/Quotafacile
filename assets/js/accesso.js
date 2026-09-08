/* ============================================================
   QuotaFacile — Accesso dei collaboratori
   ------------------------------------------------------------
   Il titolare entra con la chiave di amministrazione. I
   collaboratori no: hanno un'utenza personale, con email e
   password proprie.

   La differenza non è di comodità. Con una chiave condivisa non
   si sa mai chi ha fatto cosa, e "l'area di ciascuno" non esiste
   davvero: esiste solo una cartella che tutti possono aprire.
   Con un'utenza per persona, invece, è il database a sapere chi
   sta chiedendo — e le regole di accesso stanno lì, dove nessuna
   schermata nuova può dimenticarsi di applicarle.

   LA CHIAVE PUBBLICA QUI SOTTO NON È UN SEGRETO
   È la chiave "publishable" di Supabase: è progettata per stare
   nelle pagine. Da sola non apre nulla, perché su ogni tabella è
   attiva la Row Level Security e senza una sessione valida non
   c'è alcuna riga leggibile. Serve solo a dire *quale* progetto
   si sta interrogando.

   La sessione vive nel sessionStorage e muore con la scheda: su
   un computer condiviso è la differenza fra chiudere il browser
   ed essere ancora dentro il giorno dopo.
   ============================================================ */
"use strict";

(function () {

  const URL_BASE = "https://vainqxalnxyzjqautcop.supabase.co";
  const CHIAVE_PUBBLICA = "sb_publishable_ofAGsWAlB6ClreUUg5xXwg_Y3fsYl_X";
  const CHIAVE_SESSIONE = "qf_sessione_collaboratore";
  const BUCKET = "documenti";

  let sessione = null;   // { access_token, refresh_token, expires_at, user }
  let io = null;         // riga di crm_collaboratori di chi è entrato

  /* ---------------- Memoria della sessione ---------------- */
  function ricorda(s) {
    sessione = s;
    try {
      if (s) sessionStorage.setItem(CHIAVE_SESSIONE, JSON.stringify(s));
      else sessionStorage.removeItem(CHIAVE_SESSIONE);
    } catch (e) { /* storage negato: la sessione vive comunque in memoria */ }
  }

  function recupera() {
    if (sessione) return sessione;
    try {
      const s = sessionStorage.getItem(CHIAVE_SESSIONE);
      if (s) sessione = JSON.parse(s);
    } catch (e) { /* no-op */ }
    return sessione;
  }

  /* ---------------- Chiamate ---------------- */
  const intestazioni = (extra = {}) => {
    const h = { apikey: CHIAVE_PUBBLICA, ...extra };
    if (sessione?.access_token) h.Authorization = "Bearer " + sessione.access_token;
    return h;
  };

  async function grezza(percorso, opzioni = {}) {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), 30000);
    try {
      return await fetch(URL_BASE + percorso, { ...opzioni, signal: stop.signal });
    } finally {
      clearTimeout(t);
    }
  }

  /* Il token dura poco per scelta di Supabase. Prima di ogni
     chiamata si controlla se è ancora buono e, se non lo è, lo si
     rinnova con quello di aggiornamento: così una sessione lunga
     non costringe a rientrare ogni ora. */
  async function tokenValido() {
    const s = recupera();
    if (!s) return false;
    const scadeFra = (s.expires_at || 0) * 1000 - Date.now();
    if (scadeFra > 60000) return true;
    if (!s.refresh_token) { ricorda(null); return false; }
    try {
      const r = await grezza("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { apikey: CHIAVE_PUBBLICA, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token })
      });
      if (!r.ok) { ricorda(null); io = null; return false; }
      ricorda(await r.json());
      return true;
    } catch (e) {
      return false;
    }
  }

  async function api(percorso, opzioni = {}) {
    if (!await tokenValido()) return { ok: false, status: 401, errore: "Sessione scaduta: rientra." };
    try {
      const r = await grezza(percorso, { ...opzioni, headers: intestazioni(opzioni.headers) });
      if (r.status === 204) return { ok: true, dati: null };
      const testo = await r.text();
      const dati = testo ? JSON.parse(testo) : null;
      if (!r.ok) {
        return { ok: false, status: r.status, errore: dati?.message || dati?.error_description || "Operazione non riuscita" };
      }
      return { ok: true, status: r.status, dati };
    } catch (e) {
      return { ok: false, status: 0, errore: e.name === "AbortError" ? "Tempo scaduto" : "Servizio non raggiungibile" };
    }
  }

  /* ---------------- Entrare e uscire ---------------- */
  async function entra(email, password) {
    try {
      const r = await grezza("/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { apikey: CHIAVE_PUBBLICA, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        /* I messaggi di Supabase sono in inglese e tecnici: qui
           servono frasi che dicano cosa fare. */
        const m = String(d.error_description || d.msg || d.message || "");
        if (/banned/i.test(m)) return { ok: false, errore: "Questo accesso è stato sospeso. Rivolgiti al titolare." };
        if (/invalid/i.test(m)) return { ok: false, errore: "Email o password non corrette." };
        return { ok: false, errore: m || "Accesso non riuscito." };
      }
      ricorda(d);
      const scheda = await caricaScheda();
      if (!scheda.ok) { await esci(); return scheda; }
      return { ok: true, io };
    } catch (e) {
      return { ok: false, errore: "Servizio non raggiungibile." };
    }
  }

  async function esci() {
    if (sessione?.access_token) {
      try { await grezza("/auth/v1/logout", { method: "POST", headers: intestazioni() }); }
      catch (e) { /* la sessione locale va tolta comunque */ }
    }
    ricorda(null);
    io = null;
  }

  /* Chi è entrato. La scheda arriva dal database, non dal token:
     ruolo e stato possono cambiare mentre la sessione è aperta, e
     ciò che vale è quello che dice il database adesso. */
  async function caricaScheda() {
    const e = await api("/rest/v1/crm_collaboratori?select=*&limit=1");
    if (!e.ok) return { ok: false, errore: e.errore };
    if (!e.dati || !e.dati.length) {
      return { ok: false, errore: "Questa utenza non è collegata a nessun collaboratore attivo." };
    }
    io = e.dati[0];
    return { ok: true, io };
  }

  const autenticato = () => !!recupera();

  async function ripristina() {
    if (!recupera()) return false;
    if (!await tokenValido()) return false;
    if (!io) { const e = await caricaScheda(); if (!e.ok) { await esci(); return false; } }
    return true;
  }

  async function cambiaPassword(nuova) {
    if (String(nuova).length < 10) {
      return { ok: false, errore: "Serve una password di almeno 10 caratteri." };
    }
    const e = await api("/auth/v1/user", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: nuova })
    });
    return e.ok ? { ok: true } : { ok: false, errore: e.errore };
  }

  /* ---------------- Documenti ---------------- */
  const CATEGORIE = {
    contratto: "Contratto",
    documento_identita: "Documento d'identità",
    polizza: "Polizza",
    fattura: "Fattura",
    formazione: "Formazione",
    altro: "Altro"
  };

  async function documenti() {
    const e = await api("/rest/v1/crm_documenti?select=*&order=creato_il.desc");
    return e.ok ? { ok: true, documenti: e.dati || [] } : { ok: false, errore: e.errore };
  }

  /* La produzione è una vista, non una colonna: si ricalcola dai
     fatti registrati. Il collaboratore vede la propria riga
     perché la vista eredita le policy delle tabelle sotto. */
  async function produzione() {
    const e = await api(`/rest/v1/crm_produzione?select=*&collaboratore_id=eq.${encodeURIComponent(io?.id || "")}`);
    return e.ok && e.dati?.length ? e.dati[0] : null;
  }

  /* Il nome del file diventa il nome mostrato; il percorso invece
     è ripulito e reso unico. Un file caricato due volte non deve
     sovrascrivere il precedente, e un nome con accenti o barre non
     deve poter uscire dalla cartella di chi lo carica. */
  function percorsoPer(nomeFile) {
    const pulito = String(nomeFile)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-80) || "file";
    const unico = (crypto.randomUUID?.() || String(Date.now())).slice(0, 8);
    return `${io.id}/${unico}-${pulito}`;
  }

  async function carica(file, meta = {}) {
    if (!io) return { ok: false, errore: "Sessione non valida." };
    if (file.size > 15 * 1024 * 1024) {
      return { ok: false, errore: "Il file supera i 15 MB consentiti." };
    }
    const percorso = percorsoPer(file.name);

    /* Prima il file, poi la sua scheda: se la scheda fallisse
       resterebbe un file orfano nell'archivio, e viene tolto. Il
       contrario — una scheda che indica un file inesistente —
       sarebbe peggio, perché sembrerebbe tutto a posto. */
    const su = await api(`/storage/v1/object/${BUCKET}/${percorso}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file
    });
    if (!su.ok) return { ok: false, errore: su.errore };

    const riga = await api("/rest/v1/crm_documenti", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        collaboratore_id: io.id,
        percorso,
        nome_file: String(file.name).slice(0, 300),
        tipo_mime: file.type || null,
        dimensione: file.size,
        categoria: CATEGORIE[meta.categoria] ? meta.categoria : "altro",
        note: meta.note ? String(meta.note).slice(0, 2000) : null,
        scadenza: meta.scadenza || null,
        caricato_da: sessione?.user?.id || null
      })
    });
    if (!riga.ok) {
      await api(`/storage/v1/object/${BUCKET}/${percorso}`, { method: "DELETE" });
      return { ok: false, errore: riga.errore };
    }
    return { ok: true, documento: riga.dati?.[0] };
  }

  /* Il file non è raggiungibile da un indirizzo pubblico: si
     scarica con la sessione di chi ha diritto di vederlo, e il
     browser lo riceve come dato, non come collegamento. */
  async function scarica(doc) {
    if (!await tokenValido()) return { ok: false, errore: "Sessione scaduta: rientra." };
    try {
      const r = await grezza(`/storage/v1/object/${BUCKET}/${doc.percorso}`, { headers: intestazioni() });
      if (!r.ok) return { ok: false, errore: "File non disponibile." };
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = doc.nome_file;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 30000);
      return { ok: true };
    } catch (e) {
      return { ok: false, errore: "Scaricamento non riuscito." };
    }
  }

  async function elimina(doc) {
    const f = await api(`/storage/v1/object/${BUCKET}/${doc.percorso}`, { method: "DELETE" });
    if (!f.ok && f.status !== 404) return { ok: false, errore: f.errore };
    const r = await api(`/rest/v1/crm_documenti?id=eq.${encodeURIComponent(doc.id)}`, { method: "DELETE" });
    return r.ok ? { ok: true } : { ok: false, errore: r.errore };
  }

  window.QF_ACCESSO = {
    entra, esci, ripristina, autenticato, cambiaPassword,
    documenti, carica, scarica, elimina, produzione,
    CATEGORIE,
    get io() { return io; }
  };
})();
