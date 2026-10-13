/* ============================================================
   QuotaFacile — CRM
   ------------------------------------------------------------
   Rotta: #/admin/crm — dentro l'area riservata, dietro la stessa
   chiave della console di piattaforma.

   Si chiamava «CRM Bizpower». Il nome raccontava com'era nato —
   un modulo della società che gestisce il sito — e non cosa fa
   per chi lo apre. Chi ci entra sta amministrando QuotaFacile,
   non una seconda azienda: due marchi dietro la stessa porta
   erano una distinzione interna fatta leggere a chi lavora.

   Due cose distinte dietro quella porta, e restano distinte:
   - la console di PIATTAFORMA modera ciò che si vede da fuori
     (bacheca, richieste, intermediari);
   - il CRM è il lavoro che resta in ufficio: collaboratori,
     lead, posta.
   Tenerli separati evita l'errore più facile, cioè mostrare in
   pubblico un dato che non doveva uscire dall'ufficio.

   Le sezioni arrivano una alla volta. Quelle non ancora
   costruite dicono cosa faranno invece di fingere di esserci:
   una scheda vuota che sembra funzionante è peggio di una che
   dichiara di non esserlo.
   ============================================================ */
"use strict";

(function () {

  const API = "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-crm";
  const API_LEAD = "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-lead";
  const API_MAIL = "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-mail";
  /* Le liste di lead non sono una cosa del CRM: sono le stesse
     del Mail Marketing, nelle stesse due tabelle. Qui si chiede
     a quella funzione, con la stessa chiave di amministrazione.

     Costruirne di nuove qui sarebbe stato più rapido e sbagliato:
     lo stesso lead sarebbe finito in due raccolte che da lì in
     poi invecchiano separate, ed è esattamente il difetto che
     questo progetto si è portato dietro da Lovable e ha già
     corretto una volta. Una lista fatta nel CRM si vede nel Mail
     Marketing e viceversa, perché è la stessa lista. */
  const API_MM = "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-mm";
  /* Leggere la casella è una funzione a sé: apre un socket verso
     un server di posta esterno e ci mette qualche secondo, mentre
     tutto il resto del CRM risponde in millisecondi. Tenerle
     insieme vorrebbe dire che una lettura lenta rallenta anche
     chi stava solo guardando i collaboratori. */
  const API_POSTA = "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-posta";

  const QF = () => window.QF;
  const esc = s => window.QF.esc(s);

  /* La chiave è la stessa dell'area riservata: la legge admin.js,
     qui la si chiede a lui per non avere due copie della stessa
     verità. */
  const chiave = () => window.QF_ADMIN?.chiave() || "";

  let dati = null;
  let fase = "vuoto";      // vuoto | caricamento | pronto | errore
  let avviso = null;
  let modifica = null;     // id del collaboratore in modifica, o "nuovo"
  /* Vero quando la pagina mostrata è il mail marketing: bind()
     non riceve l'indirizzo, e senza questo attaccherebbe gli
     eventi del CRM a una schermata che non è la sua. */
  let dentroMail = false;
  let dentroMagazine = false;
  /* Quale scheda è a schermo. bind() non riceve l'indirizzo, e le
     liste si chiedono al server solo quando si apre la scheda che
     le usa. */
  let sezioneCorrente = "panoramica";
  /* Credenziali appena generate. Restano a schermo finché non le
     si chiude, perché è l'unico momento in cui la password è
     leggibile: dopo, nel database, c'è solo la sua forma cifrata
     e nemmeno il titolare può rileggerla. */
  let credenziali = null;

  /* ---------------- DIALOGO CON IL SERVER ---------------- */
  /* La ricerca dei lead può richiedere più tempo: interroga
     Google più volte, una per categoria e per pagina. */
  /* Il minuto basta per tutto tranne una cosa: cercare le email
     apre fino a quaranta siti, sei alla volta, e ciascuno può
     prendersi i suoi secondi prima di rispondere o di non
     rispondere. Per quella il chiamante passa il suo tempo. */
  async function chiamaLead(azione, d = {}, ms = 60000) {
    return chiama(azione, d, API_LEAD, ms);
  }

  /* L'invio passa da un server di posta esterno: può metterci
     più di una richiesta normale. */
  async function chiamaMail(azione, d = {}) {
    return chiama(azione, d, API_MAIL, 45000);
  }

  /* Le liste: stessa chiave, altra funzione. */
  async function chiamaMM(azione, d = {}) {
    return chiama(azione, d, API_MM, 30000);
  }

  async function chiama(azione, d = {}, endpoint = API, timeout = 20000) {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), timeout);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qf-admin": chiave() },
        body: JSON.stringify({ azione, dati: d }),
        signal: stop.signal
      });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok && j.ok === true, status: r.status, ...j };
    } catch (e) {
      return { ok: false, status: 0, errore: e.name === "AbortError" ? "Tempo scaduto" : "Servizio non raggiungibile" };
    } finally {
      clearTimeout(t);
    }
  }

  /* Silenzioso: rilegge i dati senza far sparire la schermata
     dietro un "caricamento". Serve dopo una scrittura fatta
     dall'assistente, dove la conversazione deve restare dov'è. */
  async function carica(silenzioso = false) {
    if (!silenzioso) {
      fase = "caricamento";
      QF().render();
    }
    /* I lead stanno in una funzione a parte: se quella non
       risponde il resto del CRM deve funzionare lo stesso, invece
       di bloccarsi tutto per una sezione sola. */
    const [e, l, m] = await Promise.all([chiama("panoramica"), chiamaLead("elenco"), chiamaMail("elenco")]);
    if (e.ok) {
      dati = {
        ...e,
        lead: l.ok ? (l.lead || []) : [],
        etichette: l.ok ? (l.etichette || []) : [],
        applicate: l.ok ? (l.applicate || []) : [],
        attivita: l.ok ? (l.attivita || []) : [],
        modelli: m.ok ? (m.modelli || []) : [],
        inviate: m.ok ? (m.inviate || []) : [],
        postaConfigurata: m.ok ? m.configurata : null
      };
      fase = "pronto"; avviso = null;
    } else {
      fase = "errore"; avviso = e.errore || "CRM non raggiungibile.";
    }
    QF().render();
  }

  async function agisci(azione, d, messaggio) {
    const e = await chiama(azione, d);
    if (!e.ok) { QF().toast(e.errore || "Operazione non riuscita."); return false; }
    QF().toast(messaggio);
    await carica();
    return true;
  }

  /* ---------------- DATI ---------------- */
  const D = () => dati || { collaboratori: [], documenti: [], lead: [], etichette: [], applicate: [], attivita: [], produzione: [], modelli: [], inviate: [] };
  const attivi = () => D().collaboratori.filter(c => c.attivo);
  const dataBreve = s => s ? new Date(s).toLocaleDateString("it-IT") : "—";
  const dataOra = s => s ? new Date(s).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—";
  /* "1 chiamate" si nota, e fa sembrare trascurato tutto il resto. */
  const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

  const RUOLI = {
    titolare: "Titolare",
    direttore: "Direttore",
    account: "Account",
    commerciale: "Commerciale",
    consulente: "Consulente"
  };

  /* ---------------- SEZIONE · PANORAMICA ---------------- */
  function panoramicaView() {
    const c = D().collaboratori;
    const perRuolo = {};
    attivi().forEach(x => { perRuolo[x.ruolo] = (perRuolo[x.ruolo] || 0) + 1; });

    const tile = (v, l, hint) => `
      <div class="kpi-tile"><strong>${v}</strong><span>${l}</span>${hint ? `<em>${hint}</em>` : ""}</div>`;

    return `
    <div class="kpi-grid">
      ${tile(attivi().length, "Collaboratori attivi", `${attivi().filter(x => x.utente_id).length} con accesso · ${c.length - attivi().length} disattivati`)}
      ${tile(D().lead.length, "Lead in archivio", (() => {
        const n = D().lead.filter(l => l.stato === "nuovo").length;
        return n ? `${n} ancora da contattare` : "tutti presi in carico";
      })())}
      ${tile(D().lead.filter(l => l.email).length, "Lead con email", (() => {
        const n = D().lead.filter(l => l.email).length;
        const t = D().lead.length;
        return t ? `${Math.round((n / t) * 100)}% dell'archivio — sono quelli scrivibili` : "—";
      })())}
      ${tile((D().inviate || []).filter(x => new Date(x.inviata_il) > new Date(Date.now() - 30 * 86400000)).length, "Email inviate (30 giorni)", (() => {
        const f = (D().inviate || []).filter(x => x.esito === "fallita").length;
        return f ? `⚠️ ${f} non partite` : "tutte partite";
      })())}
    </div>

    <div class="grid-2" style="align-items:start;margin-top:1.2rem">
      <div class="card">
        <h3>👥 La squadra</h3>
        ${attivi().length ? attivi().map(x => `
          <div class="leader-row">
            <span class="mini-avatar">${esc(QF().initials(x.nome))}</span>
            <span class="leader-info"><strong>${esc(x.nome)}</strong>
              <span>${esc(RUOLI[x.ruolo] || x.ruolo)}${x.email ? " · " + esc(x.email) : ""}</span></span>
            <span class="leader-pts">${(D().produzione.find(p => p.collaboratore_id === x.id) || {}).punti ?? 0} pt</span>
          </div>`).join("")
        : `<p class="muted" style="font-size:.9rem">Nessun collaboratore ancora inserito. Comincia dalla scheda <strong>Collaboratori</strong>.</p>`}
      </div>
      <div class="card">
        <h3>🧭 Come procede il CRM</h3>
        <p class="muted" style="font-size:.85rem">Le sezioni entrano una alla volta, provate prima di essere dichiarate finite.</p>
        <div class="crm-avanzamento">
          ${[
            ["Collaboratori e anagrafica squadra", true],
            ["Accessi personali dei collaboratori", true],
            ["Lead locali (ricerca per zona e categoria)", true],
            ["Mail: modelli, invio, registro", true]
          ].map(([t, fatto]) => `
            <div class="crm-passo ${fatto ? "fatto" : ""}">
              <span>${fatto ? "✓" : "○"}</span><span>${esc(t)}</span>
            </div>`).join("")}
        </div>
      </div>
    </div>`;
  }

  /* ---------------- SEZIONE · COLLABORATORI ---------------- */
  function collaboratoriView() {
    const lista = D().collaboratori;
    const inModifica = modifica && modifica !== "nuovo"
      ? lista.find(c => c.id === modifica)
      : null;

    const form = (c = null) => `
      <div class="card" style="margin-bottom:1.2rem">
        <h3>${c ? "✏️ Modifica " + esc(c.nome) : "➕ Nuovo collaboratore"}</h3>
        <form id="crm-collab-form" data-id="${c ? esc(c.id) : ""}">
          <div class="grid-2" style="gap:.6rem">
            <div class="field"><label for="cb-nome">Nome e cognome *</label>
              <input id="cb-nome" required value="${c ? esc(c.nome) : ""}" placeholder="Mario Rossi"></div>
            <div class="field"><label for="cb-email">Email *</label>
              <input id="cb-email" type="email" required value="${c ? esc(c.email) : ""}" placeholder="mario.rossi@bizpower.it"></div>
          </div>
          <div class="grid-2" style="gap:.6rem;margin-top:.6rem">
            <div class="field"><label for="cb-ruolo">Ruolo</label>
              <select id="cb-ruolo">${Object.entries(RUOLI).map(([k, v]) =>
                `<option value="${k}" ${c && c.ruolo === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
            <div class="field"><label for="cb-tel">Telefono</label>
              <input id="cb-tel" value="${c && c.telefono ? esc(c.telefono) : ""}" placeholder="+39 ..."></div>
          </div>
          <div class="field" style="margin-top:.6rem"><label for="cb-note">Note interne</label>
            <textarea id="cb-note" rows="2" placeholder="Zona di competenza, rami seguiti, accordi...">${c && c.note ? esc(c.note) : ""}</textarea>
            <p class="privacy-hint">Note visibili solo qui dentro. Non finiscono in nessuna pagina pubblica.</p>
          </div>
          <div style="display:flex;gap:.5rem;margin-top:.9rem;flex-wrap:wrap">
            <button class="btn btn-primary" type="submit">${c ? "Salva le modifiche" : "Aggiungi alla squadra"}</button>
            <button class="btn btn-ghost" type="button" data-crm-annulla>Annulla</button>
          </div>
        </form>
      </div>`;

    return `
    <p class="admin-hint">Le persone che lavorano con te. Da qui si crea anche l'accesso personale di ciascuno: chi ce l'ha entra dalla stessa porta con la propria email, vede la sua area e carica i propri documenti. Non vede la squadra, non vede il marketplace, non può cambiarsi il ruolo — e non perché manchi la schermata: glielo nega il database.</p>

    ${credenziali ? `
      <div class="card credenziali">
        <h3>🔑 Credenziali di ${esc(credenziali.nome || credenziali.email)}</h3>
        <p class="muted" style="font-size:.88rem">Consegnale tu, di persona o su un canale che consideri sicuro. <strong>Questa password non è più recuperabile</strong>: qui è in chiaro solo adesso, nel database c'è solo la sua forma cifrata. Se si perde, se ne genera un'altra.</p>
        <table class="admin-kv" style="margin-top:.6rem">
          <tr><th>Email</th><td><code>${esc(credenziali.email)}</code></td></tr>
          <tr><th>Password</th><td><code class="password-generata">${esc(credenziali.password)}</code></td></tr>
        </table>
        <div class="admin-actions">
          <button class="btn btn-outline btn-sm" data-crm-copia="${esc(credenziali.email)}&#10;${esc(credenziali.password)}">📋 Copia</button>
          <button class="btn btn-ghost btn-sm" data-crm-chiudi-cred>Ho preso nota, chiudi</button>
        </div>
        <p class="privacy-hint">Al primo accesso il collaboratore dovrebbe cambiarla dalla sua area: una password passata da un messaggio non è più un segreto fra lui e il sistema.</p>
      </div>` : ""}

    ${modifica ? form(inModifica) : `
      <div style="margin-bottom:1.2rem">
        <button class="btn btn-primary" data-crm-nuovo>➕ Nuovo collaboratore</button>
      </div>`}

    ${lista.length ? lista.map(c => `
      <div class="card admin-q ${c.attivo ? "" : "admin-rimossa"}">
        <div class="qa-meta">
          <span class="badge-cat">${esc(RUOLI[c.ruolo] || c.ruolo)}</span>
          ${c.attivo ? "" : `<span class="pill">disattivato</span>`}
          <span>in squadra dal ${dataBreve(c.creato_il)}</span>
          ${c.utente_id ? `<span class="pill">🔑 accesso attivo</span>` : `<span class="pill">senza accesso</span>`}
        </div>
        <h3 style="margin:.4rem 0 .2rem">${esc(c.nome)}</h3>
        <table class="admin-kv">
          <tr><th>Email</th><td><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></td></tr>
          ${c.telefono ? `<tr><th>Telefono</th><td><a href="tel:${esc(String(c.telefono).replace(/\s/g, ""))}">${esc(c.telefono)}</a></td></tr>` : ""}
          <tr><th>Produzione</th><td>${(D().produzione.find(p => p.collaboratore_id === c.id) || {}).punti ?? 0} punti <span class="muted">(calcolati dalle attività registrate)</span></td></tr>
          ${c.note ? `<tr><th>Note</th><td>${esc(c.note)}</td></tr>` : ""}
        </table>
        <div class="admin-actions">
          <button class="btn btn-outline btn-sm" data-crm-modifica="${esc(c.id)}">✏️ Modifica</button>
          ${c.attivo ? (c.utente_id
            ? `<button class="btn btn-outline btn-sm" data-crm-rigenera="${esc(c.id)}">🔑 Nuova password</button>
               <button class="btn btn-ghost btn-sm danger" data-crm-revoca="${esc(c.id)}">Revoca accesso</button>`
            : `<button class="btn btn-primary btn-sm" data-crm-accesso="${esc(c.id)}">🔑 Crea accesso</button>`) : ""}
          <button class="btn btn-ghost btn-sm ${c.attivo ? "danger" : ""}" data-crm-attiva="${esc(c.id)}:${c.attivo ? "no" : "si"}">
            ${c.attivo ? "Disattiva" : "Riattiva"}
          </button>
        </div>
        ${c.attivo ? "" : `<p class="privacy-hint">Disattivare chiude davvero la porta: l'utenza viene sospesa e la password non funziona più, non è solo una riga nascosta da un elenco. La sua storia però — lead lavorati, email inviate, produzione — resta al suo posto. Per questo non si cancella.</p>`}
      </div>`).join("") : `<p class="muted">Nessun collaboratore inserito.</p>`}`;
  }

  /* ---------------- SEZIONE · LEAD LOCALI ----------------
     Ricerca di attività per zona e categoria attraverso le API
     ufficiali Google. La chiave non passa da questa pagina: la
     ricerca la fa il server. Una chiave Places in un file
     JavaScript è pubblica per definizione, e la si ritrova
     consumata da altri sul conto di chi l'ha esposta. */
  /* Le venti categorie vivono in lead-ricerca.js, insieme al
     modulo che le disegna: averne due elenchi vorrebbe dire due
     chiavi che con il tempo divergono, e una ricerca che torna
     vuota senza spiegazione. Si legge quando serve, non al
     caricamento: i file dell'area riservata arrivano in
     parallelo. */
  const CATEGORIE_LEAD = () => window.QF_RICERCA?.CATEGORIE || {};

  const STATI_LEAD = {
    nuovo: "🔵 Nuovo", contattato: "🟡 Contattato",
    in_trattativa: "🟠 In trattativa", cliente: "🟢 Cliente", scartato: "⚪ Scartato"
  };

  /* Stato della ricerca. Vive solo finché la scheda è aperta: i
     risultati non salvati non sono un archivio, sono una lista
     della spesa.

     La forma è quella che lead-ricerca.js si aspetta, ed è la
     stessa nel mail marketing. Cambia un valore iniziale e non è
     una svista: qui soloConEmail nasce spento, perché nel CRM si
     esplora una zona per capire chi c'è e aprire il sito di ogni
     risultato costerebbe secondi a chi non li ha chiesti. Nel
     mail marketing nasce acceso, perché lì le liste servono a
     mandare email. */
  const ricerca = {
    modalita: "rapida",
    campi: { zona: "", via: "", citta: "Milano", provincia: "MI", cap: "", regione: "Lombardia" },
    categorie: ["ristorazione"],
    raggio: 2000,
    soloQualita: true,
    soloConEmail: false,
    inCorso: false,
    esito: null,       // { risultati, centro, query, avvisi }
    errore: null,
    scelti: new Set(),
    filtroStato: "tutti",
    /* La categoria con cui l'attività è stata trovata.
       Non è un vezzo da archivio: una ricerca per zona riporta
       quello che c'è in zona, e in novantaquattro lead c'erano
       quarantanove agenzie assicurative, diciotto officine,
       quindici supermercati e dodici studi. Se il messaggio da
       mandare parla di automazioni per agenzie assicurative, i
       quarantacinque che non lo sono non sono un bacino più
       grande: sono reclami per spam sul dominio da cui parte la
       posta. */
    filtroCategoria: "tutte"
  };

  /* Il recupero delle email mancanti. Una riga di stato sola,
     perché l'operazione è una: apre i siti dei lead che si hanno
     già e cerca l'indirizzo. `inCorso` serve a non farla partire
     due volte — apre fino a quaranta siti e ci mette dei
     secondi, e un doppio clic vorrebbe dire aprirli due volte a
     ciascuno. */
  const recupero = { inCorso: false };

  /* Stato delle liste. Separato da `ricerca` perché risponde a
     un'altra domanda: lì si sceglie fra attività appena trovate
     — identificate dal place_id di Google — qui fra lead già in
     archivio, che hanno un id nostro. Tenere un solo insieme di
     "scelti" per due cose diverse è il modo più rapido per
     aggiungere a una lista il contatto sbagliato.

     Si carica alla prima apertura della scheda e non al
     caricamento del CRM: la panoramica del mail marketing è una
     dozzina di interrogazioni, e la maggior parte delle visite
     al CRM non riguarda le liste. */
  const liste = {
    dati: [],
    fase: "vuoto",     // vuoto | caricamento | pronto | errore
    errore: null,
    aperta: "",        // id della lista mostrata; "" = tutto l'archivio
    dentro: null,      // { id, ids: Set } — chi c'è nella lista aperta
    scelti: new Set(), // id dei lead spuntati nell'archivio
    dest: "",          // lista di destinazione della barra azioni
    nuovaNome: ""
  };

  async function caricaListe(forza = false) {
    if (liste.fase === "caricamento") return;
    if (liste.fase === "pronto" && !forza) return;
    liste.fase = "caricamento";
    const e = await chiamaMM("panoramica");
    if (e.ok) { liste.dati = e.liste || []; liste.fase = "pronto"; liste.errore = null; }
    else { liste.fase = "errore"; liste.errore = e.errore || "Liste non raggiungibili."; }
    QF().render();
  }

  /* Il server restituisce i lead della lista con le colonne che
     servono al mail marketing: non ci sono stato della trattativa
     né assegnazione. Quelli ce li ha già il CRM. Quindi di qui si
     prendono solo gli identificativi, e le schede restano quelle
     complete dell'archivio. */
  async function apriLista(id) {
    liste.aperta = id;
    liste.scelti = new Set();
    liste.dentro = null;
    if (!id) { QF().render(); return; }
    QF().render();
    const e = await chiamaMM("lista-contenuto", { id });
    if (!e.ok) { QF().toast(e.errore || "Lista non leggibile."); liste.aperta = ""; QF().render(); return; }
    liste.dentro = { id, ids: new Set((e.lead || []).map(l => l.id)) };
    QF().render();
  }

  /* Cosa sta guardando l'archivio adesso: la lista aperta, se ce
     n'è una, e dentro quella il filtro di stato. Lo chiedono sia
     la schermata sia «seleziona i visibili», e tenerne due copie
     vorrebbe dire selezionare righe che non si vedono. */
  /* L'archivio ristretto alla lista aperta, prima del filtro per
     categoria: serve a contare quante categorie ci sono dentro,
     che è una domanda da farsi su tutto il contenuto della lista
     e non su quello che il filtro sta già mostrando. */
  function baseNellaLista() {
    const salvati = D().lead || [];
    if (!liste.aperta) return salvati;
    return liste.dentro ? salvati.filter(l => liste.dentro.ids.has(l.id)) : [];
  }

  /* E qui dentro anche la categoria.
     Mettere il filtro così in basso — nella funzione che tutto il
     resto della schermata usa come punto di partenza — fa sì che
     lo seguano da soli i conteggi degli stati, «seleziona i
     visibili», quanti si possono scrivere e quanti hanno un sito
     da aprire. Se fosse applicato solo all'elenco delle schede,
     quei numeri parlerebbero di novantaquattro lead mentre sotto
     se ne vedono quarantanove. */
  function baseVisibile() {
    const c = ricerca.filtroCategoria;
    const b = baseNellaLista();
    return c === "tutte" ? b : b.filter(l => (l.categoria || "—") === c);
  }

  function elencoVisibile() {
    const b = baseVisibile();
    return ricerca.filtroStato === "tutti" ? b : b.filter(l => l.stato === ricerca.filtroStato);
  }

  function leadView() {
    const salvati = D().lead || [];
    const L = liste;
    /* Con una lista aperta l'archivio si restringe a lei, e i
       conteggi sulle linguette degli stati contano quello che si
       sta guardando: numeri che non tornano con le schede sotto
       sono peggio di nessun numero. */
    const base = baseVisibile();
    const perStato = {};
    base.forEach(l => { perStato[l.stato] = (perStato[l.stato] || 0) + 1; });
    const elenco = elencoVisibile();

    const R = ricerca;
    const precisa = R.modalita === "precisa";

    const modulo = `
      <div class="card">
        <h3>🔎 Cerca attività</h3>
        <p class="muted" style="font-size:.85rem">Anagrafica d'impresa dalle API ufficiali di Google, non da pagine raschiate. L'email fa eccezione — Google non la fornisce — e quando la chiedi viene letta sul sito che l'attività pubblica da sé: è una delle fonti già dichiarate nell'informativa alle imprese. Di ogni contatto salvato resta scritto da dove viene, email compresa: è la risposta a «dove avete preso il mio recapito», ed è ciò che tiene la raccolta dentro il legittimo interesse.</p>
        ${window.QF_RICERCA.moduloHtml(R)}
      </div>`;

    const risultati = () => {
      if (R.errore) {
        return `<div class="legal-warning" role="alert" style="margin-top:1.2rem"><strong>Ricerca non riuscita.</strong> ${esc(R.errore)}</div>`;
      }
      if (!R.esito) return "";
      /* Quaranta righe più in basso la stessa lettura è già
         difesa — `R.esito?.risultati || []` — e qui no: se la
         risposta arrivasse senza l'elenco, o senza il centro, la
         schermata dei lead resterebbe bianca invece di dire che
         non ha trovato niente. Una pagina vuota non si distingue
         da un guasto, e questa è la schermata da cui si lavora. */
      const r = R.esito.risultati || [];
      const nuovi = r.filter(x => !x.gia);
      const centro = R.esito.centro?.indirizzo;
      return `
      <div class="card" style="margin-top:1.2rem">
        <h3>Trovate ${r.length} attività <span class="pill">${nuovi.length} non ancora in archivio</span></h3>
        ${centro ? `<p class="muted" style="font-size:.82rem">Centro della ricerca: ${esc(centro)}</p>` : ""}
        ${(R.esito.avvisi || []).map(a => `<p class="privacy-hint">⚠️ ${esc(a)}</p>`).join("")}

        ${r.length ? `
        <div class="admin-actions" style="margin:.8rem 0">
          <button class="btn btn-outline btn-sm" data-lead-tutti>Seleziona tutte le nuove</button>
          <button class="btn btn-ghost btn-sm" data-lead-nessuno>Deseleziona</button>
          <button class="btn btn-primary btn-sm" data-lead-salva ${R.scelti.size ? "" : "disabled"}>
            Salva ${R.scelti.size || ""} in archivio
          </button>
        </div>

        ${r.map(x => `
          <label class="lead-riga ${x.gia ? "gia" : ""}">
            <input type="checkbox" data-lead-scegli="${esc(x.place_id)}"
                   ${x.gia ? "disabled" : ""} ${R.scelti.has(x.place_id) ? "checked" : ""}>
            <span class="lead-corpo">
              <strong>${esc(x.nome)}</strong>
              <span>${esc(x.indirizzo || "—")}</span>
              <span class="lead-meta">
                ${x.telefono ? `📞 ${esc(x.telefono)}` : `<span class="muted">senza telefono</span>`}
                ${x.email ? ` · ✉️ ${esc(x.email)}` : ""}
                ${x.sito ? ` · 🌐 <a href="${esc(x.sito)}" target="_blank" rel="noopener">sito</a>` : ""}
                ${x.valutazione ? ` · ⭐ ${x.valutazione} (${x.recensioni})` : ""}
                ${x.tipo_google ? ` · ${esc(x.tipo_google)}` : ""}
              </span>
            </span>
            ${x.gia ? `<span class="pill">già in archivio</span>` : ""}
          </label>`).join("")}`
        : `<p class="muted">Nessun risultato con questi criteri. Prova ad allargare il raggio o a togliere il filtro qualità.</p>`}
      </div>`;
    };

    /* Le liste sono quelle del Mail Marketing, non una seconda
       raccolta: la stessa azienda sta in una riga sola e le liste
       ci puntano. Da qui si scelgono i lead e li si mette dentro;
       rinominarle o cancellarle resta di là, dove c'è la scheda
       che fa solo quello. */
    const scelta = L.fase === "pronto";
    const apertaOra = L.dati.find(x => x.id === L.aperta) || null;

    const barraListe = L.fase === "errore" ? `
        <p class="privacy-hint">Liste non disponibili: ${esc(L.errore || "")}
          <button class="btn btn-ghost btn-sm" data-liste-riprova>Riprova</button></p>`
      : L.fase !== "pronto" ? `<p class="muted" style="font-size:.82rem">Carico le liste…</p>`
      : `
        <div class="filterbar" style="margin:.6rem 0">
          <button class="chip ${L.aperta ? "" : "active"}" data-lista-filtro="">Tutto l'archivio (${salvati.length})</button>
          ${L.dati.map(x => `
            <button class="chip ${L.aperta === x.id ? "active" : ""}" data-lista-filtro="${esc(x.id)}">${esc(x.nome)} (${x.quanti ?? 0})</button>`).join("")}
        </div>
        <p class="muted" style="font-size:.78rem;margin:-.2rem 0 .6rem">
          Le liste sono le stesse del <a href="#/admin/crm/mail/liste">Mail Marketing</a>: una creata qui si vede di là, e viceversa.
          ${L.dati.length ? "Di là si rinominano e si eliminano." : "Scegli dei lead qui sotto per crearne la prima."}
        </p>`;

    /* Il ponte verso il Mail Marketing.
       Scrivere le email e programmarne l'invio esiste già di là,
       finito: la scrittura assistita prende una lista, le bozze
       si rileggono in Email Ready, «Programma» chiede giorno e
       ora e il resto lo fa il giro della coda, che passa ogni
       minuto. Rifare qui anche solo il bottone avrebbe voluto
       dire due strade per la stessa cosa.
       Quindi di qui si parte soltanto: l'indirizzo porta con sé
       la lista, e la finestra di là si apre già su quella.

       Il numero di scrivibili non è un di più. Il modello scrive
       solo a chi ha un'email, e un'azienda su due non ce l'ha in
       archivio perché Google non la fornisce: saperlo prima di
       pagare una generazione evita di scoprirlo dopo, davanti a
       «nessuna bozza scritta». */
    const scrivibili = base.filter(l => l.email && !l.no_contatto).length;

    /* «Non ha un'email» e «nessuno l'ha cercata» non sono la
       stessa cosa, e per un po' si sono assomigliate troppo.
       La ricerca dell'email è una scelta al momento della ricerca:
       quando è spenta il lead entra in archivio con un sito e
       nessun indirizzo, identico a uno il cui sito è stato aperto
       e l'indirizzo non c'era. Sembra già controllato, e nessuno
       lo ricontrolla.
       Adesso email_cercata_il distingue i due casi, e questi due
       numeri li tengono separati in schermata. */
    /* Le categorie presenti nell'archivio (o nella lista aperta),
       con quante ce ne sono. Solo quelle che ci sono davvero: un
       elenco di venti categorie di cui diciassette a zero fa
       scorrere molto e scegliere niente. */
    const nellaLista = baseNellaLista();
    const perCategoria = {};
    nellaLista.forEach(l => {
      const k = l.categoria || "—";
      perCategoria[k] = (perCategoria[k] || 0) + 1;
    });
    const categorie = Object.keys(perCategoria).sort((a, b) => perCategoria[b] - perCategoria[a]);

    const barraCategorie = categorie.length > 1 ? `
          <div class="filterbar" style="margin:.6rem 0">
            <button class="chip ${R.filtroCategoria === "tutte" ? "active" : ""}" data-archivio-cat="tutte">Tutte le categorie (${nellaLista.length})</button>
            ${categorie.map(c => `
              <button class="chip ${R.filtroCategoria === c ? "active" : ""}" data-archivio-cat="${esc(c)}">${esc(CATEGORIE_LEAD()[c] || c)} (${perCategoria[c]})</button>`).join("")}
          </div>
          ${R.filtroCategoria !== "tutte" ? `
            <p class="muted" style="font-size:.78rem;margin:-.2rem 0 .6rem">
              Stai guardando solo <strong>${esc(CATEGORIE_LEAD()[R.filtroCategoria] || R.filtroCategoria)}</strong>.
              Tutto quello che sta sotto — conteggi, selezione, ricerca delle email — vale su questi ${base.length}.
            </p>` : ""}`
      : "";

    const daGuardare = base.filter(l => l.sito && !l.email && !l.email_cercata_il);
    const guardatiInvano = base.filter(l => l.sito && !l.email && l.email_cercata_il).length;

    const barraRecupero = daGuardare.length ? `
        <div class="admin-actions" style="margin:.6rem 0;align-items:center">
          <button class="btn btn-outline btn-sm" data-email-recupera ${recupero.inCorso ? "disabled" : ""}>
            ${recupero.inCorso ? "Apro i siti…" : `✉️ Cerca le email mancanti (${daGuardare.length})`}
          </button>
          <span class="muted" style="font-size:.78rem">
            ${plurale(daGuardare.length, "ha un sito che non è mai stato aperto", "hanno un sito che non è mai stato aperto")}:
            l'indirizzo potrebbe esserci. Non consuma ricerche Google — apre solo i siti che hai già in archivio.
            ${guardatiInvano ? (guardatiInvano === 1
              ? "Un altro è già stato guardato e sul suo sito l'email non c'è."
              : `Altri ${guardatiInvano} sono già stati guardati e sui loro siti l'email non c'è.`) : ""}
          </span>
        </div>`
      : guardatiInvano ? `
        <p class="muted" style="font-size:.78rem;margin:.4rem 0">
          ✉️ ${plurale(guardatiInvano, "lead ha un sito già guardato senza trovare un'email", "lead hanno un sito già guardato senza trovare un'email")}:
          non c'è altro da cercare lì.
        </p>`
      : "";

    const barraInvio = apertaOra ? `
        <div class="admin-actions" style="margin:.6rem 0;align-items:center">
          ${scrivibili ? `
            <a class="btn btn-primary btn-sm" href="#/admin/crm/mail/pronte?genera=${esc(apertaOra.id)}">✨ Scrivi le email con l'AI</a>`
          : `<button class="btn btn-primary btn-sm" disabled title="Nessuno di questi lead ha un'email">✨ Scrivi le email con l'AI</button>`}
          <a class="btn btn-ghost btn-sm" href="#/admin/crm/mail/liste?l=${esc(apertaOra.id)}">Apri nel Mail Marketing</a>
          <span class="muted" style="font-size:.78rem">
            ${scrivibili
              ? `${scrivibili} su ${base.length} ${scrivibili === 1 ? "ha" : "hanno"} un'email. Le bozze si rileggono e si programmano in Email Ready.`
              : daGuardare.length
                /* Prima qui c'era scritto «rifai la ricerca con
                   solo con email pubblica». Era l'unica strada e
                   costava quota Google per ritrovare aziende già
                   in archivio — che per via di ignoreDuplicates
                   non si sarebbero nemmeno aggiornate. Adesso
                   c'è il bottone qui sopra, che apre solo i siti
                   e non parla con Google. */
                ? `Nessuno di questi lead ha un'email, ma ${daGuardare.length} ${daGuardare.length === 1 ? "ha un sito mai aperto" : "hanno un sito mai aperto"}: premi «Cerca le email mancanti» qui sopra.`
                : "Nessuno di questi lead ha un'email in archivio, e i siti sono già stati guardati: aggiungila a mano dal Mail Marketing, oppure cerca in un'altra zona."}
          </span>
        </div>` : "";

    const barraScelta = scelta && L.scelti.size ? `
        <div class="admin-actions" style="margin:.8rem 0;align-items:center">
          <strong style="font-size:.85rem">${plurale(L.scelti.size, "lead scelto", "lead scelti")}</strong>
          <select data-lista-dest class="crm-lista-dest">
            <option value="">— in quale lista —</option>
            ${L.dati.map(x => `<option value="${esc(x.id)}" ${L.dest === x.id ? "selected" : ""}>${esc(x.nome)} (${x.quanti ?? 0})</option>`).join("")}
            <option value="__nuova__" ${L.dest === "__nuova__" ? "selected" : ""}>＋ Crea una lista nuova</option>
          </select>
          ${L.dest === "__nuova__" ? `
            <input data-lista-nome class="crm-lista-nome" value="${esc(L.nuovaNome)}" placeholder="Ristoranti Milano · settembre">` : ""}
          <button class="btn btn-primary btn-sm" data-lista-aggiungi ${L.dest ? "" : "disabled"}>Aggiungi alla lista</button>
          <button class="btn btn-ghost btn-sm" data-lista-nessuno>Deseleziona</button>
        </div>` : "";

    const archivio = `
      <div class="card" style="margin-top:1.2rem">
        <h3>📇 ${apertaOra ? `Lista «${esc(apertaOra.nome)}» (${base.length})` : `Lead in archivio (${salvati.length})`}</h3>
        ${salvati.length ? `
          ${barraListe}
          ${barraCategorie}
          ${barraRecupero}
          ${barraInvio}
          <div class="filterbar" style="margin:.6rem 0">
            <button class="chip ${R.filtroStato === "tutti" ? "active" : ""}" data-lead-filtro="tutti">Tutti</button>
            ${Object.entries(STATI_LEAD).map(([k, v]) => `
              <button class="chip ${R.filtroStato === k ? "active" : ""}" data-lead-filtro="${k}">${v}${perStato[k] ? ` (${perStato[k]})` : ""}</button>`).join("")}
          </div>
          ${scelta && elenco.length ? `
            <div class="admin-actions" style="margin:.6rem 0">
              <button class="btn btn-outline btn-sm" data-lista-tutti>Seleziona i ${elenco.length} visibili</button>
            </div>` : ""}
          ${barraScelta}
          ${L.aperta && !L.dentro ? `<p class="muted">Carico la lista…</p>` : ""}
          ${elenco.map(l => `
            <div class="lead-scheda">
              <div class="lead-corpo">
                ${scelta ? `
                  <label class="lead-scelta">
                    <input type="checkbox" data-lista-scegli="${esc(l.id)}" ${L.scelti.has(l.id) ? "checked" : ""}>
                    <strong>${esc(l.nome)}</strong>
                  </label>`
                : `<strong>${esc(l.nome)}</strong>`}
                <span>${esc(l.indirizzo || "—")}</span>
                <span class="lead-meta">
                  ${l.telefono ? `<a href="tel:${esc(String(l.telefono).replace(/\s/g, ""))}">📞 ${esc(l.telefono)}</a>` : `<span class="muted">senza telefono</span>`}
                  <!-- L'email mancava, e si notava appena dopo aver
                       premuto «Cerca le email mancanti»: il bottone
                       diceva di averne trovate tre e in schermata non
                       se ne vedeva nessuna. Qui c'è anche perché è il
                       dato che decide se a un lead si può scrivere o
                       solo telefonare. -->
                  ${l.email ? ` · <a href="mailto:${esc(l.email)}">✉️ ${esc(l.email)}</a>`
                    : l.sito && l.email_cercata_il ? ` · <span class="muted">email non pubblicata</span>` : ""}
                  ${l.sito ? ` · <a href="${esc(l.sito)}" target="_blank" rel="noopener">🌐 sito</a>` : ""}
                  ${l.valutazione ? ` · ⭐ ${l.valutazione}` : ""}
                  · <span class="muted">${esc(CATEGORIE_LEAD()[l.categoria] || l.categoria || "—")}</span>
                </span>
                <span class="lead-meta muted">Trovato il ${dataBreve(l.raccolto_il)} cercando «${esc(l.query_origine || "—")}» su Google Places</span>
                ${l.no_contatto ? `
                  <span class="lead-meta"><span class="pill">🚫 si è opposto</span>
                  ${l.no_contatto_il ? `<span class="muted">dal ${dataBreve(l.no_contatto_il)}</span>` : ""}
                  ${l.no_contatto_motivo ? `<span class="muted">— ${esc(l.no_contatto_motivo)}</span>` : ""}</span>` : ""}
              </div>
              <div class="lead-lavorazione">
                <select data-lead-stato="${esc(l.id)}">
                  ${Object.entries(STATI_LEAD).map(([k, v]) =>
                    `<option value="${k}" ${l.stato === k ? "selected" : ""}>${v}</option>`).join("")}
                </select>
                <select data-lead-assegna="${esc(l.id)}">
                  <option value="">Non assegnato</option>
                  ${attivi().map(c => `<option value="${esc(c.id)}" ${l.assegnato_a === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}
                </select>
                ${l.no_contatto
                  ? `<button class="btn btn-ghost btn-sm" data-lead-riapri="${esc(l.id)}" title="Riapri il contatto">Riapri</button>`
                  : `<button class="btn btn-ghost btn-sm" data-lead-nocontatto="${esc(l.id)}" title="Registra che si è opposto a essere contattato">🚫 Si è opposto</button>`}
                ${L.aperta ? `
                  <button class="btn btn-ghost btn-sm" data-lista-togli="${esc(l.id)}" title="Togli da questa lista — il lead resta in archivio">Togli dalla lista</button>` : ""}
                <button class="btn btn-ghost btn-sm danger" data-lead-elimina="${esc(l.id)}">🗑</button>
              </div>
            </div>`).join("") || (
              L.aperta && !L.dentro ? ""
              : L.aperta ? `<p class="muted">${ricerca.filtroStato === "tutti"
                  ? "Questa lista è vuota. Torna a «Tutto l'archivio», scegli dei lead e aggiungili qui."
                  : "Nessun lead con questo filtro, dentro questa lista."}</p>`
              : `<p class="muted">Nessun lead con questo filtro.</p>`)}`
        : `<p class="muted">Nessun lead in archivio. Fai una ricerca qui sopra e salva quelli che ti interessano.</p>`}
      </div>`;

    return modulo + risultati() + archivio;
  }

  /* La sezione PRODUZIONE non c'è più.
     Era una classifica a punti dei collaboratori, calcolata dalle
     attività registrate. Il calcolo resta nel database — la vista
     `crm_interno.produzione` e i pesi delle attività sono dove
     erano, e il punteggio continua a comparire nella scheda di
     ogni collaboratore. Sparisce la classifica come scheda a sé:
     una graduatoria fra colleghi è una cosa che si guarda ogni
     giorno e misura poco, e chiedeva una voce nella barra accanto
     a quelle da cui si lavora davvero.
     Niente è stato cancellato: se un giorno serve di nuovo, i
     dati ci sono tutti. */

  /* ---------------- SEZIONE · POSTA ----------------
     Quello che arriva, non quello che parte.

     Qui c'era l'invio: modelli, un modulo per scrivere a un lead,
     il registro di ciò che era partito. Tutte e tre quelle cose
     esistono anche nel Mail Marketing — gli stessi modelli, letti
     dalla stessa funzione, e un registro che sa anche cosa è
     fallito e perché. Erano due schermate per lo stesso lavoro, e
     la domanda che restava senza risposta era l'altra: «mi hanno
     risposto?».

     C'era scritto che leggere la casella non si poteva fare,
     perché IMAP vuole una connessione lunga. Mezza verità: IMAP
     ha due modi, e quello che tiene la connessione aperta (IDLE)
     davvero non sta in una Edge Function. Collegarsi, chiedere
     cosa è arrivato e chiudere invece sì — è la stessa forma
     dell'invio, che da mesi funziona. La legge qf-posta.

     Niente viene salvato: la casella è già l'archivio, e copiare
     il corpo di email altrui in un database sarebbe un
     trattamento in più da dichiarare. Si legge e si mostra, come
     fa un programma di posta. */

  /* La posta in arrivo. Si chiede quando si apre la scheda, non
     al caricamento del CRM: è una connessione a un server esterno
     e qualche secondo di attesa, e la maggior parte delle visite
     al CRM non riguarda la casella. */
  const arrivo = {
    fase: "vuoto",      // vuoto | caricamento | pronto | errore
    messaggi: [],
    errore: null,
    giorni: 14,
    guardati: 0,
    casella: null,
    soloRisposte: false
  };

  async function chiamaPosta(azione, d = {}) {
    return chiama(azione, d, API_POSTA, 60000);
  }

  async function caricaArrivo(forza = false) {
    if (arrivo.fase === "caricamento") return;
    if (arrivo.fase === "pronto" && !forza) return;
    arrivo.fase = "caricamento"; arrivo.errore = null;
    QF().render();
    const e = await chiamaPosta("leggi", { giorni: arrivo.giorni, quante: 40 });
    if (e.ok) {
      arrivo.messaggi = e.messaggi || [];
      arrivo.guardati = e.guardati || 0;
      arrivo.casella = e.casella || null;
      arrivo.fase = "pronto";
    } else {
      arrivo.fase = "errore";
      arrivo.errore = e.errore || "Casella non raggiungibile.";
    }
    QF().render();
  }

  function mailView() {
    const A = arrivo;
    const elenco = A.soloRisposte ? A.messaggi.filter(m => m.risposta_a_campagna) : A.messaggi;
    const risposte = A.messaggi.filter(m => m.risposta_a_campagna).length;
    const opposizioni = A.messaggi.filter(m => m.pare_opposizione).length;

    const testa = `
      <div class="card">
        <div class="admin-top" style="margin:0">
          <div>
            <h3 style="margin:0">\u2709\ufe0f Posta in arrivo</h3>
            <p class="muted" style="margin:.3rem 0 0;font-size:.85rem">
              ${A.casella ? `Casella <strong>${esc(A.casella)}</strong> \u00b7 ` : ""}ultimi ${A.giorni} giorni.
              Le risposte alle email partite dal Mail Marketing stanno in cima.
              Qui non si salva niente: la posta resta nella casella e si legge da l\u00ec ogni volta.
            </p>
          </div>
          <div class="admin-actions">
            <select data-arrivo-giorni class="crm-lista-dest">
              ${[7, 14, 30, 60].map(g => `<option value="${g}" ${A.giorni === g ? "selected" : ""}>ultimi ${g} giorni</option>`).join("")}
            </select>
            <button class="btn btn-outline btn-sm" data-arrivo-ricarica ${A.fase === "caricamento" ? "disabled" : ""}>
              ${A.fase === "caricamento" ? "Leggo\u2026" : "\u21bb Rileggi"}</button>
          </div>
        </div>
      </div>`;

    if (A.fase === "caricamento") {
      return testa + `<div class="card" style="margin-top:1.2rem"><p class="muted">Mi collego alla casella\u2026 ci vuole qualche secondo.</p></div>`;
    }

    if (A.fase === "errore") {
      return testa + `
      <div class="legal-warning" role="alert" style="margin-top:1.2rem">
        <strong>Non sono riuscito a leggere la casella.</strong> ${esc(A.errore || "")}
        <p class="muted" style="font-size:.85rem;margin:.6rem 0 0">
          Serve la stessa password per le app usata per l'invio, e l'accesso IMAP acceso sulla
          casella. Su Gmail: Impostazioni \u2192 Inoltro e POP/IMAP \u2192 attiva IMAP.
        </p>
        <button class="btn btn-outline btn-sm" style="margin-top:.6rem" data-arrivo-ricarica>Riprova</button>
      </div>`;
    }

    if (A.fase === "vuoto") {
      return testa + `<div class="card" style="margin-top:1.2rem"><p class="muted">Carico\u2026</p></div>`;
    }

    return testa + `
      <div class="card" style="margin-top:1.2rem">
        <div class="filterbar" style="margin-bottom:.6rem">
          <button class="chip ${A.soloRisposte ? "" : "active"}" data-arrivo-filtro="tutte">Tutte (${A.messaggi.length})</button>
          <button class="chip ${A.soloRisposte ? "active" : ""}" data-arrivo-filtro="risposte">Risposte alle campagne (${risposte})</button>
        </div>

        ${opposizioni ? `
          <div class="legal-warning" role="status" style="margin-bottom:.8rem">
            <strong>${plurale(opposizioni, "messaggio sembra", "messaggi sembrano")} dire di no.</strong>
            Sono in cima, con il bollino arancione. Leggili: se \u00e8 davvero un'opposizione,
            registrala dalla scheda del lead \u2014 l'art. 21 del GDPR vuole che basti chiederlo,
            e il piede di ogni nostra email promette che basta rispondere NO.
            <span class="muted">Non la registro da solo: se sbagliassi a leggere bloccherei
            per sempre un'azienda che voleva dire altro.</span>
          </div>` : ""}

        ${elenco.length ? elenco.map(m => `
          <div class="lead-scheda">
            <div class="lead-corpo">
              <strong>${esc(m.oggetto)}</strong>
              <span>${esc(m.da)}</span>
              <span class="lead-meta">
                ${m.pare_opposizione ? `<span class="pill" style="background:var(--gold-100);color:var(--gold-testo)">\u26a0 sembra un NO</span> ` : ""}
                ${m.risposta_a_campagna
                  ? `<span class="pill">\u21a9 risposta a una nostra email</span>`
                  : `<span class="muted">non risulta fra chi abbiamo scritto</span>`}
                ${m.quando ? ` \u00b7 <span class="muted">${esc(m.quando)}</span>` : ""}
              </span>
              ${m.nostra_email ? `
                <span class="lead-meta muted">Noi gli avevamo scritto \u00ab${esc(m.nostra_email.oggetto)}\u00bb il ${dataBreve(m.nostra_email.inviata_il)}</span>` : ""}
              ${m.anteprima ? `<span class="lead-meta" style="color:var(--ink)">${esc(m.anteprima)}</span>` : ""}
            </div>
            <div class="lead-lavorazione">
              ${m.lead_id ? `<a class="btn btn-ghost btn-sm" href="#/admin/crm/lead">Vedi il lead</a>` : ""}
              <a class="btn btn-ghost btn-sm" href="https://mail.google.com/mail/u/0/#search/${encodeURIComponent(m.email)}" target="_blank" rel="noopener">Apri in Gmail</a>
            </div>
          </div>`).join("")
        : `<p class="muted">${A.soloRisposte
            ? "Nessuna risposta alle campagne in questo periodo."
            : "Niente di nuovo in questo periodo."}</p>`}

        <p class="privacy-hint" style="margin-top:.8rem">
          Guardati ${plurale(A.guardati, "messaggio", "messaggi")} negli ultimi ${A.giorni} giorni,
          mostrati i pi\u00f9 recenti. Per rispondere si usa la casella: questa schermata serve a
          sapere <em>chi</em> ha risposto, non a sostituire il programma di posta.
          I modelli e il registro degli invii sono nel
          <a href="#/admin/crm/mail/modelli">Mail Marketing</a>.
        </p>
      </div>`;
  }

  /* L'assistente non sta più qui.

     Era una scheda fra le altre, e il guaio di una scheda è
     che per parlarci bisogna andarci: se stai guardando il
     registro degli invii e ti viene in mente una cosa, devi
     uscire, dirla, e tornare — e quando torni hai perso il
     punto in cui eri. Adesso è il bottone in basso a destra,
     che sta fermo su ogni schermata dell'area riservata e
     apre un pannello di fianco senza portare via la pagina.
     Vive in assistente.js, appeso al body, perché il router
     riscrive #app a ogni cambio di rotta e si porterebbe via
     la conversazione a metà. */

  /* ---------------- SEZIONI IN ARRIVO ---------------- */
  /* Una scheda vuota che sembra funzionante è peggio di una che
     dichiara di non esserlo: qui c'è scritto cosa farà e da dove
     nasce, così sai cosa stai aspettando. */
  const INARRIVO = {
  };

  function inArrivoView(k) {
    const s = INARRIVO[k];
    return `
    <div class="card crm-inarrivo">
      <span class="pill">In arrivo</span>
      <h3 style="margin:.6rem 0">${s.titolo}</h3>
      <table class="admin-kv">
        <tr><th>Cosa farà</th><td>${s.cosa}</td></tr>
        <tr><th>Come</th><td>${s.come}</td></tr>
        <tr><th>Cosa serve</th><td>${s.serve}</td></tr>
      </table>
      <p class="privacy-hint">Questa scheda non è un segnaposto grafico: è quello che verrà costruito, scritto prima di costruirlo così puoi correggermi finché costa poco.</p>
    </div>`;
  }

  /* ---------------- SHELL ---------------- */
  const SEZIONI = {
    panoramica: ["📊 Panoramica", panoramicaView],
    collaboratori: ["👥 Collaboratori", collaboratoriView],
    lead: ["🔎 Lead locali", leadView],
    posta: ["✉️ Posta", mailView],
    mail: ["📮 Mail Marketing", null],
    magazine: ["📰 Magazine", null]
  };

  /* Il mail marketing è un modulo a sé, con le sue undici voci e
     la sua funzione sul server: la scheda del CRM è solo la porta
     da cui ci si entra. Da qui in giù l'indirizzo lo governa lui. */
  function view(path) {
    const parti = Array.isArray(path) ? path.filter(Boolean) : (path ? [path] : []);
    const sub = parti[0];
    /* Il mail marketing prende la pagina intera: ha una barra
       laterale sua, dati suoi e undici voci, e sopra la sua non
       ci sta anche questa. Il ritorno al CRM è nel suo angolo in
       alto a sinistra. Non aspetta nemmeno che il CRM abbia
       finito di caricare: sono due funzioni diverse sul server. */
    dentroMail = sub === "mail";
    if (dentroMail) {
      return `
      <section class="section admin-shell"><div class="container">
        ${window.QF_MM ? window.QF_MM.view(parti[1]) : ""}
      </div></section>`;
    }

    /* Il Magazine, come il mail marketing, è un modulo con dati
       propri e una funzione propria sul server. Prende la pagina
       intera e da qui in giù l'indirizzo lo governa lui: l'elenco,
       l'articolo nuovo, quello che si sta modificando. */
    dentroMagazine = sub === "magazine";
    if (dentroMagazine) {
      return `
      <section class="section admin-shell"><div class="container">
        ${window.QF_MAGAZINE ? window.QF_MAGAZINE.view(parti.slice(1)) : ""}
      </div></section>`;
    }

    const sezione = SEZIONI[sub] ? sub : "panoramica";
    sezioneCorrente = sezione;

    const testa = `
      <div class="admin-top">
        <div>
          <a class="crm-indietro" href="#/admin">← Area riservata</a>
          <span class="eyebrow">Area riservata</span>
          <h1 style="font-size:clamp(1.6rem,3.5vw,2.2rem);margin:0">CRM</h1>
        </div>
        <button class="btn btn-ghost btn-sm" id="crm-ricarica">↻ Aggiorna</button>
      </div>`;

    if (fase !== "pronto") {
      return `
      <section class="section admin-shell"><div class="container">
        ${testa}
        ${fase === "errore" ? `
          <div class="legal-warning" role="alert">
            <strong>CRM non disponibile.</strong> ${esc(avviso || "")}
            <br><button class="btn btn-outline btn-sm" style="margin-top:.6rem" id="crm-riprova">Riprova</button>
          </div>`
        : `<div class="card"><p class="muted">Caricamento del CRM…</p></div>`}
      </div></section>`;
    }

    return `
    <section class="section admin-shell">
      <div class="container">
        ${testa}
        <div class="filterbar" role="tablist">
          ${Object.entries(SEZIONI).map(([k, [label]]) => `
            <a class="chip ${sezione === k ? "active" : ""}" role="tab" href="#/admin/crm/${k}">${label}</a>`).join("")}
        </div>
        ${SEZIONI[sezione][1]()}
      </div>
    </section>`;
  }

  /* ---------------- EVENTI ---------------- */
  function bind() {
    const $ = s => document.querySelector(s);

    if (dentroMail) { window.QF_MM?.bind(); return; }
    if (dentroMagazine) { window.QF_MAGAZINE?.bind(); return; }

    if (fase === "vuoto") { carica(); return; }

    /* Avvolti in una funzione: passare `carica` direttamente
       gli consegnerebbe l'evento del click come primo argomento,
       e un MouseEvent è vero — l'aggiornamento a mano diventerebbe
       silenzioso proprio quando si vuole vederlo. */
    $("#crm-ricarica")?.addEventListener("click", () => carica());
    $("#crm-riprova")?.addEventListener("click", () => carica());

    $("[data-crm-nuovo]")?.addEventListener("click", () => { modifica = "nuovo"; QF().render(); });
    $("[data-crm-annulla]")?.addEventListener("click", () => { modifica = null; QF().render(); });
    document.querySelectorAll("[data-crm-modifica]").forEach(b =>
      b.addEventListener("click", () => { modifica = b.dataset.crmModifica; QF().render(); }));

    /* ---- lead locali ---- */
    const R = ricerca;

    /* Modalità, tendine a cascata, categorie e invio stanno in
       lead-ricerca.js: sono gli stessi del mail marketing, e la
       volta che ne ho corretta una sola — il comune facoltativo —
       l'altra è rimasta indietro per settimane. Qui resta solo
       cosa fare dei risultati, che è l'unica cosa diversa fra le
       due schermate. */
    /* Col punto interrogativo, come due righe più su per le
       categorie. I cinque file dell'area riservata arrivano
       insieme e di norma c'è: ma se uno solo tarda o non arriva,
       qui saltava tutto il resto di bind() — e il CRM restava a
       schermo con i bottoni che non rispondevano, senza dire
       niente. Una schermata che non reagisce è il guasto più
       difficile da riferire: non si sa nemmeno cosa raccontare. */
    window.QF_RICERCA?.lega(R, async (dati) => {
      R.scelti = new Set();
      R.errore = null;
      const esito = await chiamaLead("cerca", dati);
      if (esito.ok) { R.esito = esito; R.errore = null; }
      else { R.esito = null; R.errore = esito.errore || "Ricerca non riuscita."; }
    });

    document.querySelectorAll("[data-lead-scegli]").forEach(b =>
      b.addEventListener("change", () => {
        const id = b.dataset.leadScegli;
        if (b.checked) R.scelti.add(id); else R.scelti.delete(id);
        /* Solo il pulsante di salvataggio cambia: ridisegnare
           tutto azzererebbe lo scorrimento a metà elenco. */
        const salva = document.querySelector("[data-lead-salva]");
        if (salva) {
          salva.disabled = R.scelti.size === 0;
          salva.textContent = `Salva ${R.scelti.size || ""} in archivio`;
        }
      }));

    $("[data-lead-tutti]")?.addEventListener("click", () => {
      (R.esito?.risultati || []).filter(x => !x.gia).forEach(x => R.scelti.add(x.place_id));
      QF().render();
    });
    $("[data-lead-nessuno]")?.addEventListener("click", () => { R.scelti.clear(); QF().render(); });

    $("[data-lead-salva]")?.addEventListener("click", async ev => {
      const scelti = (R.esito?.risultati || []).filter(x => R.scelti.has(x.place_id));
      if (!scelti.length) return;
      ev.currentTarget.disabled = true;
      ev.currentTarget.textContent = "Salvataggio…";
      const esito = await chiamaLead("salva", { lead: scelti, query: R.esito.query });
      if (!esito.ok) { QF().toast(esito.errore || "Salvataggio non riuscito."); QF().render(); return; }
      QF().toast(esito.salvati === esito.richiesti
        ? `${esito.salvati} lead salvati in archivio.`
        : `${esito.salvati} salvati, ${esito.richiesti - esito.salvati} erano già presenti.`);
      R.scelti = new Set();
      R.esito = null;
      await carica();
    });

    document.querySelectorAll("[data-lead-filtro]").forEach(b =>
      b.addEventListener("click", () => { R.filtroStato = b.dataset.leadFiltro; QF().render(); }));

    /* Cerca le email dei lead che si hanno già.
       Non parla con Google: apre i siti che sono in archivio. Per
       questo non chiede conferma — non spende quota, non scrive a
       nessuno e non cancella niente: al massimo scopre che
       l'indirizzo non c'è, e lo annota perché la volta dopo non
       si riapra lo stesso sito per niente. */
    /* data-archivio-cat e non data-lead-cat: quest'ultimo è già
       di lead-ricerca.js, che con lo stesso nome disegna le venti
       categorie del modulo di ricerca. Chiamandolo allo stesso
       modo i due gestori si sovrapponevano: scegliere «Officine»
       nel modulo di ricerca filtrava di nascosto anche
       l'archivio, e i due pulsanti nuovi finivano a spuntare
       categorie da cercare. Due cose diverse, due nomi. */
    document.querySelectorAll("[data-archivio-cat]").forEach(b =>
      b.addEventListener("click", () => { R.filtroCategoria = b.dataset.archivioCat; QF().render(); }));

    document.querySelector("[data-email-recupera]")?.addEventListener("click", async () => {
      if (recupero.inCorso) return;

      /* Si mandano gli identificativi, non un «guarda tu quali».
         Il bottone conta quelli che si stanno guardando — dentro
         la lista aperta e dentro la categoria scelta — e deve
         aprire esattamente quelli. Lasciando scegliere al server
         aprirebbe i quaranta più recenti dell'intero archivio: se
         il filtro è su «assicurazioni», finirebbe ad aprire i
         siti dei supermercati, cioè il contrario di quello che
         chiede chi ha filtrato. */
      const daGuardare = baseVisibile()
        .filter(l => l.sito && !l.email && !l.email_cercata_il);
      if (!daGuardare.length) { QF().toast("Non è rimasto nessun sito da aprire."); return; }
      const ids = daGuardare.slice(0, 40).map(l => l.id);

      recupero.inCorso = true; QF().render();
      const e = await chiamaLead("email-recupera", { ids }, 180000);
      recupero.inCorso = false;
      if (!e.ok) { QF().toast(e.errore || "Ricerca non riuscita."); QF().render(); return; }
      /* Si dice quante ne sono state trovate e quante restano: chi
         ha premuto deve sapere se ha finito o se deve premere
         ancora, perché il giro si ferma a quaranta siti. */
      /* Quanti restano si conta su quello che si stava guardando,
         non sul numero che torna dal server: quello è globale, e
         con un filtro attivo direbbe «ne restano nove» mentre in
         questa categoria non ne resta nessuno. */
      const restanti = Math.max(0, daGuardare.length - (e.esaminati ?? 0));
      const parti = [
        `${plurale(e.trovate, "email trovata", "email trovate")} su ${e.esaminati} ${e.esaminati === 1 ? "sito aperto" : "siti aperti"}`,
        e.senzaEmail ? `${e.senzaEmail} non la pubblicano` : null,
        restanti ? `${restanti} ancora da guardare: premi di nuovo` : null
      ].filter(Boolean);
      QF().toast(parti.join("; ") + ".");
      await carica();
    });

    /* ---- liste di lead ----
       Le stesse del Mail Marketing: qui si compongono, di là si
       usano per scrivere. */
    if (sezioneCorrente === "lead" && liste.fase === "vuoto") caricaListe();

    $("[data-liste-riprova]")?.addEventListener("click", () => { liste.fase = "vuoto"; caricaListe(true); });

    document.querySelectorAll("[data-lista-filtro]").forEach(b =>
      b.addEventListener("click", () => apriLista(b.dataset.listaFiltro)));

    document.querySelectorAll("[data-lista-scegli]").forEach(c =>
      c.addEventListener("change", () => {
        const id = c.dataset.listaScegli;
        if (c.checked) liste.scelti.add(id); else liste.scelti.delete(id);
        /* Si ridisegna soltanto quando la barra delle azioni
           compare o sparisce: a metà elenco, spuntare una casella
           non deve riportare in cima la pagina. */
        const barra = document.querySelector("[data-lista-aggiungi]");
        if (!barra || liste.scelti.size === 0) QF().render();
        else {
          const quanti = barra.parentElement?.querySelector("strong");
          if (quanti) quanti.textContent = plurale(liste.scelti.size, "lead scelto", "lead scelti");
        }
      }));

    $("[data-lista-tutti]")?.addEventListener("click", () => {
      elencoVisibile().forEach(l => liste.scelti.add(l.id));
      QF().render();
    });
    $("[data-lista-nessuno]")?.addEventListener("click", () => { liste.scelti.clear(); QF().render(); });

    $("[data-lista-dest]")?.addEventListener("change", ev => {
      liste.dest = ev.currentTarget.value;
      QF().render();
    });
    /* Il nome si legge a ogni battuta: il ridisegno successivo
       ricostruisce il campo da capo, e quello che c'era scritto
       deve sopravvivergli. */
    $("[data-lista-nome]")?.addEventListener("input", ev => { liste.nuovaNome = ev.currentTarget.value; });

    $("[data-lista-aggiungi]")?.addEventListener("click", async ev => {
      const ids = [...liste.scelti];
      if (!ids.length || !liste.dest) return;
      const b = ev.currentTarget;
      b.disabled = true; b.textContent = "Aggiungo…";

      let destinazione = liste.dest;
      if (destinazione === "__nuova__") {
        const nome = (liste.nuovaNome || "").trim();
        if (!nome) { QF().toast("Dai un nome alla lista."); b.disabled = false; b.textContent = "Aggiungi alla lista"; return; }
        const c = await chiamaMM("lista-salva", { nome });
        if (!c.ok) { QF().toast(c.errore || "Lista non creata."); QF().render(); return; }
        destinazione = c.id;
      }

      const e = await chiamaMM("lista-aggiungi", { lista_id: destinazione, lead_ids: ids });
      if (!e.ok) { QF().toast(e.errore || "Aggiunta non riuscita."); QF().render(); return; }
      QF().toast(e.aggiunti === e.richiesti
        ? `${plurale(e.aggiunti, "lead aggiunto", "lead aggiunti")} alla lista.`
        : `${e.aggiunti} nella lista, ${e.richiesti - e.aggiunti} c'erano già.`);
      liste.scelti = new Set();
      liste.dest = "";
      liste.nuovaNome = "";
      await caricaListe(true);
      if (liste.aperta) await apriLista(liste.aperta);
    });

    document.querySelectorAll("[data-lista-togli]").forEach(b =>
      b.addEventListener("click", async () => {
        const e = await chiamaMM("lista-togli", { lista_id: liste.aperta, lead_id: b.dataset.listaTogli });
        if (!e.ok) { QF().toast(e.errore || "Operazione non riuscita."); return; }
        QF().toast("Tolto dalla lista. Il lead resta in archivio.");
        liste.scelti.delete(b.dataset.listaTogli);
        await caricaListe(true);
        await apriLista(liste.aperta);
      }));

    document.querySelectorAll("[data-lead-stato]").forEach(s =>
      s.addEventListener("change", async () => {
        const e = await chiamaLead("aggiorna", { id: s.dataset.leadStato, stato: s.value });
        if (!e.ok) { QF().toast(e.errore || "Aggiornamento non riuscito."); return; }
        QF().toast("Stato aggiornato.");
        await carica();
      }));

    document.querySelectorAll("[data-lead-assegna]").forEach(s =>
      s.addEventListener("change", async () => {
        const e = await chiamaLead("aggiorna", { id: s.dataset.leadAssegna, assegnato_a: s.value || null });
        if (!e.ok) { QF().toast(e.errore || "Assegnazione non riuscita."); return; }
        QF().toast(s.value ? "Lead assegnato." : "Assegnazione tolta.");
        await carica();
      }));

    document.querySelectorAll("[data-lead-elimina]").forEach(b =>
      b.addEventListener("click", async () => {
        if (!confirm("Eliminare questo lead dall'archivio?\n\nSe ricompare in una ricerca futura potrai risalvarlo, ma le note e lo stato di lavorazione andranno persi.")) return;
        const e = await chiamaLead("elimina", { id: b.dataset.leadElimina });
        if (!e.ok) { QF().toast(e.errore || "Eliminazione non riuscita."); return; }
        QF().toast("Lead eliminato.");
        await carica();
      }));

    /* L'opposizione al contatto stava nella scheda della
       pipeline. Tolta quella, sarebbe rimasta senza casa: e non e'
       una funzione fra le altre, e' l'art. 21 del GDPR. La
       promessa nel piede di ogni email - "rispondi NO e non ti
       scriveremo piu'" - vale quanto il posto in cui si registra
       quel NO. Quindi si registra qui, nell'archivio dei lead.

       Da quel momento l'invio e' bloccato dal server, non solo
       nascosto da questa schermata. */
    document.querySelectorAll("[data-lead-nocontatto]").forEach(b =>
      b.addEventListener("click", async () => {
        const motivo = prompt("Come ha comunicato di non voler essere contattato?\n(es. \u00abha risposto NO all'email\u00bb, \u00abl'ha detto al telefono\u00bb)");
        if (motivo === null) return;
        const e = await chiamaMail("no-contatto", { id: b.dataset.leadNocontatto, attivo: true, motivo: motivo.trim() || null });
        if (!e.ok) { QF().toast(e.errore || "Registrazione non riuscita."); return; }
        QF().toast("Opposizione registrata: a questo contatto non partira' piu' nulla.");
        await carica();
      }));

    document.querySelectorAll("[data-lead-riapri]").forEach(b =>
      b.addEventListener("click", async () => {
        if (!confirm("Riaprire il contatto?\n\nFallo solo se e' stato lui a chiedertelo: l'opposizione la revoca chi l'ha espressa, non chi la subisce.")) return;
        const e = await chiamaMail("no-contatto", { id: b.dataset.leadRiapri, attivo: false });
        if (!e.ok) { QF().toast(e.errore || "Operazione non riuscita."); return; }
        QF().toast("Contatto riaperto.");
        await carica();
      }));

    /* ---- posta in arrivo ---- */
    if (sezioneCorrente === "posta" && arrivo.fase === "vuoto") caricaArrivo();

    document.querySelectorAll("[data-arrivo-ricarica]").forEach(b =>
      b.addEventListener("click", () => caricaArrivo(true)));

    document.querySelectorAll("[data-arrivo-filtro]").forEach(b =>
      b.addEventListener("click", () => {
        arrivo.soloRisposte = b.dataset.arrivoFiltro === "risposte";
        QF().render();
      }));

    $("[data-arrivo-giorni]")?.addEventListener("change", ev => {
      arrivo.giorni = Number(ev.currentTarget.value) || 14;
      caricaArrivo(true);
    });

    /* ---- accessi ---- */
    const nomeDi = id => D().collaboratori.find(c => c.id === id)?.nome || "";

    $("[data-crm-chiudi-cred]")?.addEventListener("click", () => { credenziali = null; QF().render(); });

    $("[data-crm-copia]")?.addEventListener("click", async ev => {
      const testo = ev.currentTarget.dataset.crmCopia;
      try {
        await navigator.clipboard.writeText(testo);
        QF().toast("Credenziali copiate negli appunti.");
      } catch (e) {
        /* Senza permesso per gli appunti restano comunque a schermo:
           meglio dirlo che lasciare credere che siano state copiate. */
        QF().toast("Copia non consentita dal browser: prendile dallo schermo.");
      }
    });

    document.querySelectorAll("[data-crm-accesso]").forEach(b =>
      b.addEventListener("click", async () => {
        const id = b.dataset.crmAccesso;
        if (!confirm(`Creare l'accesso per ${nomeDi(id)}?\n\nVerrà generata una password che potrai leggere una volta sola.`)) return;
        b.disabled = true;
        const e = await chiama("crea-accesso", { id });
        b.disabled = false;
        if (!e.ok) { QF().toast(e.errore || "Creazione non riuscita."); return; }
        credenziali = { nome: nomeDi(id), email: e.email, password: e.password };
        QF().toast("Accesso creato.");
        await carica();
      }));

    document.querySelectorAll("[data-crm-rigenera]").forEach(b =>
      b.addEventListener("click", async () => {
        const id = b.dataset.crmRigenera;
        if (!confirm(`Generare una nuova password per ${nomeDi(id)}?\n\nQuella attuale smetterà di funzionare subito.`)) return;
        b.disabled = true;
        const e = await chiama("rigenera-password", { id });
        b.disabled = false;
        if (!e.ok) { QF().toast(e.errore || "Operazione non riuscita."); return; }
        credenziali = { nome: nomeDi(id), email: e.email, password: e.password };
        QF().toast("Nuova password generata.");
        QF().render();
      }));

    document.querySelectorAll("[data-crm-revoca]").forEach(b =>
      b.addEventListener("click", () => {
        const id = b.dataset.crmRevoca;
        if (!confirm(`Revocare l'accesso di ${nomeDi(id)}?\n\nL'utenza viene eliminata e la persona non entra più. La sua scheda e i suoi documenti restano.`)) return;
        agisci("revoca-accesso", { id }, "Accesso revocato.");
      }));

    document.querySelectorAll("[data-crm-attiva]").forEach(b =>
      b.addEventListener("click", () => {
        const i = b.dataset.crmAttiva.lastIndexOf(":");
        const id = b.dataset.crmAttiva.slice(0, i);
        const attivo = b.dataset.crmAttiva.slice(i + 1) === "si";
        agisci("attiva-collaboratore", { id, attivo }, attivo ? "Collaboratore riattivato." : "Collaboratore disattivato.");
      }));

    $("#crm-collab-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      const etichetta = btn?.textContent;
      if (btn) { btn.disabled = true; btn.textContent = "Salvataggio…"; }
      const id = e.target.dataset.id || null;
      const ok = await agisci("salva-collaboratore", {
        id,
        nome: $("#cb-nome").value.trim(),
        email: $("#cb-email").value.trim(),
        ruolo: $("#cb-ruolo").value,
        telefono: $("#cb-tel").value.trim(),
        note: $("#cb-note").value.trim()
      }, id ? "Scheda aggiornata." : "Collaboratore aggiunto alla squadra.");
      if (ok) modifica = null;
      else if (btn) { btn.disabled = false; btn.textContent = etichetta; }
      QF().render();
    });
  }

  /* Quando si esce dall'area riservata i dati del CRM non devono
     restare in memoria in attesa del prossimo che apre la scheda. */
  /* All'uscita dall'area riservata esce dalla memoria anche ciò
     che il mail marketing aveva caricato: sono dati della
     società come tutti gli altri. */
  function dimentica() {
    dati = null; fase = "vuoto"; avviso = null; modifica = null; dentroMail = false; dentroMagazine = false;
    window.QF_MM?.dimentica();
    window.QF_MAGAZINE?.dimentica();
  }

  /* `ricarica` la chiama l'assistente dopo una scrittura: rilegge
     l'archivio senza far sparire la schermata dietro un
     "caricamento", e non fa niente se il CRM non è quello che si
     sta guardando — i dati li ricaricherà comunque all'ingresso. */
  window.QF_CRM = { view, bind, dimentica, ricarica: () => carica(true) };
})();
