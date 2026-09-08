/* ============================================================
   QuotaFacile — CRM Bizpower
   ------------------------------------------------------------
   Rotta: #/admin/crm — dentro l'area riservata, dietro la stessa
   chiave della console di piattaforma.

   Due cose distinte dietro la stessa porta:
   - la console di PIATTAFORMA modera QuotaFacile (bacheca,
     richieste, intermediari): riguarda il marketplace;
   - questo CRM amministra BIZPOWER: collaboratori, lead,
     documenti, produzione. Riguarda la società.
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
  /* Credenziali appena generate. Restano a schermo finché non le
     si chiude, perché è l'unico momento in cui la password è
     leggibile: dopo, nel database, c'è solo la sua forma cifrata
     e nemmeno il titolare può rileggerla. */
  let credenziali = null;

  /* ---------------- DIALOGO CON IL SERVER ---------------- */
  /* La ricerca dei lead può richiedere più tempo: interroga
     Google più volte, una per categoria e per pagina. */
  async function chiamaLead(azione, d = {}) {
    return chiama(azione, d, API_LEAD, 60000);
  }

  /* L'invio passa da un server di posta esterno: può metterci
     più di una richiesta normale. */
  async function chiamaMail(azione, d = {}) {
    return chiama(azione, d, API_MAIL, 45000);
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

  async function carica() {
    fase = "caricamento";
    QF().render();
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
      ${tile(D().documenti.length, "Documenti archiviati", (() => {
        const s = D().documenti.filter(d => d.scadenza && new Date(d.scadenza) < new Date(Date.now() + 60 * 86400000)).length;
        return s ? `⚠️ ${s} in scadenza o scaduti` : "nessuna scadenza vicina";
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
            ["Pipeline: etichette, attività, viste per fase", true],
            ["Documenti e contratti", true],
            ["Mail: modelli, invio, registro", true],
            ["Produzione e classifica", true]
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
    <p class="admin-hint">La squadra di Bizpower. Da qui si crea anche l'accesso personale di ciascuno: chi ce l'ha entra dalla stessa porta con la propria email, vede la sua area e carica i propri documenti. Non vede la squadra, non vede il marketplace, non può cambiarsi il ruolo — e non perché manchi la schermata: glielo nega il database.</p>

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
          <tr><th>Documenti</th><td>${D().documenti.filter(d => d.collaboratore_id === c.id).length}</td></tr>
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
        ${c.attivo ? "" : `<p class="privacy-hint">Disattivare chiude davvero la porta: l'utenza viene sospesa e la password non funziona più, non è solo una riga nascosta da un elenco. La sua storia però — documenti caricati, lead lavorati, produzione — resta al suo posto. Per questo non si cancella.</p>`}
      </div>`).join("") : `<p class="muted">Nessun collaboratore inserito.</p>`}`;
  }

  /* ---------------- SEZIONE · DOCUMENTI ----------------
     Qui il titolare vede l'archivio di tutti. I file però non
     passano da questa pagina: chi li ha caricati li scarica dalla
     propria area, con la propria utenza. Questa è la vista di
     controllo — cosa c'è, di chi è, quando scade. */
  function documentiView() {
    const docs = D().documenti;
    const perCollaboratore = {};
    docs.forEach(d => { (perCollaboratore[d.collaboratore_id] ||= []).push(d); });

    const nome = id => D().collaboratori.find(c => c.id === id)?.nome || "Collaboratore rimosso";
    const peso = n => !n ? "—" : n < 1024 * 1024
      ? Math.round(n / 1024) + " KB"
      : (n / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";

    /* Le scadenze in evidenza: è il motivo per cui questo è un
       archivio e non una cartella condivisa. */
    const inScadenza = docs
      .filter(d => d.scadenza)
      .map(d => ({ ...d, giorni: Math.ceil((new Date(d.scadenza + "T00:00:00") - new Date()) / 86400000) }))
      .filter(d => d.giorni <= 60)
      .sort((a, b) => a.giorni - b.giorni);

    return `
    <p class="admin-hint">L'archivio della squadra. I documenti li carica ciascuno dalla propria area, con la propria utenza: così si sa sempre chi ha caricato cosa. I file stanno in un archivio privato e non sono raggiungibili da alcun indirizzo pubblico.</p>

    ${inScadenza.length ? `
      <div class="legal-warning">
        <strong>${inScadenza.length} document${inScadenza.length === 1 ? "o" : "i"} in scadenza o scadut${inScadenza.length === 1 ? "o" : "i"}.</strong>
        <ul style="margin:.5rem 0 0;padding-left:1.1rem">
          ${inScadenza.slice(0, 8).map(d => `<li>${esc(d.nome_file)} — ${esc(nome(d.collaboratore_id))} — ${d.giorni < 0 ? `scaduto da ${-d.giorni} giorni` : `fra ${d.giorni} giorni`}</li>`).join("")}
        </ul>
      </div>` : ""}

    ${docs.length ? Object.entries(perCollaboratore).map(([id, elenco]) => `
      <div class="card" style="margin-bottom:1rem">
        <h3>${esc(nome(id))} <span class="pill">${elenco.length} document${elenco.length === 1 ? "o" : "i"}</span></h3>
        ${elenco.map(d => `
          <div class="lead-row">
            <span class="lead-icon">${/pdf/i.test(d.tipo_mime || "") ? "📕" : /image/i.test(d.tipo_mime || "") ? "🖼️" : "📄"}</span>
            <span class="leader-info">
              <strong>${esc(d.nome_file)}</strong>
              <span>${esc(d.categoria.replace(/_/g, " "))} · ${peso(d.dimensione)} · ${dataBreve(d.creato_il)}${d.scadenza ? ` · scade il ${dataBreve(d.scadenza)}` : ""}</span>
              ${d.note ? `<span class="muted" style="font-size:.8rem">${esc(d.note)}</span>` : ""}
            </span>
          </div>`).join("")}
      </div>`).join("")
    : `<p class="muted">Nessun documento caricato. Comincerà ad arrivare qualcosa quando i collaboratori entreranno con il loro accesso.</p>`}`;
  }

  /* ---------------- SEZIONE · LEAD LOCALI ----------------
     Ricerca di attività per zona e categoria attraverso le API
     ufficiali Google. La chiave non passa da questa pagina: la
     ricerca la fa il server. Una chiave Places in un file
     JavaScript è pubblica per definizione, e la si ritrova
     consumata da altri sul conto di chi l'ha esposta. */
  const CATEGORIE_LEAD = {
    ristorazione: "Ristoranti e pizzerie", bar: "Bar e caffetterie",
    hotel: "Hotel e B&B", cantine: "Cantine e aziende vinicole",
    enoteche: "Enoteche", agriturismi: "Agriturismi",
    officine: "Officine e autoriparazioni", concessionarie: "Concessionarie auto",
    edilizia: "Imprese edili", impiantisti: "Impiantisti",
    studi: "Commercialisti e consulenti", avvocati: "Studi legali",
    medici: "Studi medici e dentisti", palestre: "Palestre e centri fitness",
    parrucchieri: "Parrucchieri ed estetica", negozi: "Negozi al dettaglio",
    supermercati: "Supermercati e alimentari", trasporti: "Trasporti e logistica",
    agenzie_immobiliari: "Agenzie immobiliari", assicurazioni: "Agenzie assicurative"
  };

  const STATI_LEAD = {
    nuovo: "🔵 Nuovo", contattato: "🟡 Contattato",
    in_trattativa: "🟠 In trattativa", cliente: "🟢 Cliente", scartato: "⚪ Scartato"
  };

  /* Stato della ricerca. Vive solo finché la scheda è aperta: i
     risultati non salvati non sono un archivio, sono una lista
     della spesa. */
  const ricerca = {
    modalita: "rapida",
    campi: { zona: "", via: "", citta: "Milano", provincia: "MI", cap: "" },
    categorie: ["ristorazione"],
    raggio: 2000,
    soloQualita: true,
    inCorso: false,
    esito: null,       // { risultati, centro, query, avvisi }
    errore: null,
    scelti: new Set(),
    filtroStato: "tutti"
  };

  function leadView() {
    const salvati = D().lead || [];
    const perStato = {};
    salvati.forEach(l => { perStato[l.stato] = (perStato[l.stato] || 0) + 1; });
    const elenco = ricerca.filtroStato === "tutti"
      ? salvati : salvati.filter(l => l.stato === ricerca.filtroStato);

    const R = ricerca;
    const precisa = R.modalita === "precisa";

    const modulo = `
      <div class="card">
        <h3>🔎 Cerca attività</h3>
        <p class="muted" style="font-size:.85rem">Dati d'impresa dalle API ufficiali Google, non da pagine raschiate. Di ogni contatto salvato resta scritto da dove viene e con quale ricerca è stato trovato: è la risposta a «dove avete preso il mio recapito», ed è ciò che tiene la raccolta dentro il legittimo interesse.</p>

        <div class="filterbar" style="margin:.9rem 0 .6rem">
          <button class="chip ${!precisa ? "active" : ""}" data-lead-modalita="rapida">Ricerca rapida</button>
          <button class="chip ${precisa ? "active" : ""}" data-lead-modalita="precisa">Ricerca precisa</button>
        </div>

        <form id="lead-form">
          ${precisa ? `
            <div class="grid-2" style="gap:.6rem">
              <div class="field"><label for="ld-via">Via e civico</label>
                <input id="ld-via" value="${esc(R.campi.via)}" placeholder="Corso Lodi 10"></div>
              <div class="field"><label for="ld-cap">CAP</label>
                <input id="ld-cap" value="${esc(R.campi.cap)}" placeholder="20139"></div>
            </div>
            <div class="grid-2" style="gap:.6rem;margin-top:.6rem">
              <div class="field"><label for="ld-citta">Città *</label>
                <input id="ld-citta" required value="${esc(R.campi.citta)}" placeholder="Milano"></div>
              <div class="field"><label for="ld-prov">Provincia</label>
                <input id="ld-prov" maxlength="2" value="${esc(R.campi.provincia)}" placeholder="MI"
                       style="text-transform:uppercase"></div>
            </div>`
          : `
            <div class="field"><label for="ld-zona">Zona *</label>
              <input id="ld-zona" required value="${esc(R.campi.zona)}" placeholder="Opera, Milano — oppure un CAP, un quartiere, una via">
              <p class="privacy-hint">Più è precisa la zona, più i risultati sono nel posto giusto: «Milano» centra il cerchio in Duomo.</p>
            </div>`}

          <div class="field" style="margin-top:.8rem">
            <label>Categorie <span class="muted">(fino a 4)</span></label>
            <div class="lead-categorie">
              ${Object.entries(CATEGORIE_LEAD).map(([k, v]) => `
                <button type="button" class="chip ${R.categorie.includes(k) ? "active" : ""}" data-lead-cat="${k}">${v}</button>`).join("")}
            </div>
          </div>

          <div class="grid-2" style="gap:.6rem;margin-top:.8rem">
            <div class="field"><label for="ld-raggio">Raggio</label>
              <select id="ld-raggio">
                ${[[500, "500 m"], [1000, "1 km"], [2000, "2 km"], [5000, "5 km"], [10000, "10 km"]].map(([v, t]) =>
                  `<option value="${v}" ${R.raggio === v ? "selected" : ""}>${t}</option>`).join("")}
              </select></div>
            <div class="field" style="justify-content:flex-end">
              <label class="checkline" style="margin-top:1.6rem">
                <input type="checkbox" id="ld-qualita" ${R.soloQualita ? "checked" : ""}>
                <span>Solo attività con valutazione ≥ 3,5 e almeno 5 recensioni</span>
              </label>
            </div>
          </div>

          <button class="btn btn-primary" style="margin-top:.9rem" type="submit" ${R.inCorso ? "disabled" : ""}>
            ${R.inCorso ? "Ricerca in corso…" : "Cerca"}
          </button>
        </form>
      </div>`;

    const risultati = () => {
      if (R.errore) {
        return `<div class="legal-warning" role="alert" style="margin-top:1.2rem"><strong>Ricerca non riuscita.</strong> ${esc(R.errore)}</div>`;
      }
      if (!R.esito) return "";
      const r = R.esito.risultati;
      const nuovi = r.filter(x => !x.gia);
      return `
      <div class="card" style="margin-top:1.2rem">
        <h3>Trovate ${r.length} attività <span class="pill">${nuovi.length} non ancora in archivio</span></h3>
        <p class="muted" style="font-size:.82rem">Centro della ricerca: ${esc(R.esito.centro.indirizzo)}</p>
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

    const archivio = `
      <div class="card" style="margin-top:1.2rem">
        <h3>📇 Lead in archivio (${salvati.length})</h3>
        ${salvati.length ? `
          <div class="filterbar" style="margin:.6rem 0">
            <button class="chip ${R.filtroStato === "tutti" ? "active" : ""}" data-lead-filtro="tutti">Tutti</button>
            ${Object.entries(STATI_LEAD).map(([k, v]) => `
              <button class="chip ${R.filtroStato === k ? "active" : ""}" data-lead-filtro="${k}">${v}${perStato[k] ? ` (${perStato[k]})` : ""}</button>`).join("")}
          </div>
          ${elenco.map(l => `
            <div class="lead-scheda">
              <div class="lead-corpo">
                <strong>${esc(l.nome)}</strong>
                <span>${esc(l.indirizzo || "—")}</span>
                <span class="lead-meta">
                  ${l.telefono ? `<a href="tel:${esc(String(l.telefono).replace(/\s/g, ""))}">📞 ${esc(l.telefono)}</a>` : `<span class="muted">senza telefono</span>`}
                  ${l.sito ? ` · <a href="${esc(l.sito)}" target="_blank" rel="noopener">🌐 sito</a>` : ""}
                  ${l.valutazione ? ` · ⭐ ${l.valutazione}` : ""}
                  · <span class="muted">${esc(CATEGORIE_LEAD[l.categoria] || l.categoria || "—")}</span>
                </span>
                <span class="lead-meta muted">Trovato il ${dataBreve(l.raccolto_il)} cercando «${esc(l.query_origine || "—")}» su Google Places</span>
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
                <button class="btn btn-ghost btn-sm danger" data-lead-elimina="${esc(l.id)}">🗑</button>
              </div>
            </div>`).join("") || `<p class="muted">Nessun lead con questo filtro.</p>`}`
        : `<p class="muted">Nessun lead in archivio. Fai una ricerca qui sopra e salva quelli che ti interessano.</p>`}
      </div>`;

    return modulo + risultati() + archivio;
  }

  /* ---------------- SEZIONE · PIPELINE ----------------
     Lo stesso archivio dei lead, guardato per fase invece che in
     elenco: si vede subito dove si accumula il lavoro.

     Due cose che qui diventano possibili e prima no:
     - le ETICHETTE, che dicono quello che lo stato non può dire.
       Lo stato è uno solo per volta; "priorità alta" e "da
       richiamare" convivono, e costringerle in un campo unico
       significherebbe scegliere fra informazioni che non si
       escludono.
     - le ATTIVITÀ, cioè chi ha chiamato, quando e com'è andata.
       Senza, "contattato" è un'affermazione che nessuno può
       verificare, e la produzione di ciascuno resta un'opinione. */

  const TIPI_ATTIVITA = {
    chiamata: "📞 Chiamata", email: "✉️ Email", incontro: "🤝 Incontro",
    preventivo: "📄 Preventivo", nota: "📝 Nota"
  };
  const ESITI = {
    positivo: "Positivo", da_richiamare: "Da richiamare",
    negativo: "Negativo", nessuna_risposta: "Nessuna risposta"
  };

  const pipeline = { aperto: null, filtroChi: "tutti", filtroEtichetta: "tutte" };

  const etichetteDi = leadId => (D().applicate || [])
    .filter(a => a.lead_id === leadId)
    .map(a => (D().etichette || []).find(e => e.id === a.etichetta_id))
    .filter(Boolean);

  const attivitaDi = leadId => (D().attivita || [])
    .filter(a => a.lead_id === leadId);

  function pipelineView() {
    const tutti = D().lead || [];
    const etichette = D().etichette || [];

    let lista = tutti;
    if (pipeline.filtroChi === "nessuno") lista = lista.filter(l => !l.assegnato_a);
    else if (pipeline.filtroChi !== "tutti") lista = lista.filter(l => l.assegnato_a === pipeline.filtroChi);
    if (pipeline.filtroEtichetta !== "tutte") {
      lista = lista.filter(l => etichetteDi(l.id).some(e => e.id === pipeline.filtroEtichetta));
    }

    const colonne = Object.keys(STATI_LEAD);
    const aperto = pipeline.aperto ? tutti.find(l => l.id === pipeline.aperto) : null;

    const cartellino = l => `
      <button class="pl-card ${pipeline.aperto === l.id ? "aperta" : ""}" data-pl-apri="${esc(l.id)}">
        <strong>${esc(l.nome)}</strong>
        <span>${esc(l.citta || l.indirizzo || "—")}</span>
        ${etichetteDi(l.id).length ? `<span class="pl-etichette">${etichetteDi(l.id)
          .map(e => `<span class="tag tag-${esc(e.colore)}">${esc(e.nome)}</span>`).join("")}</span>` : ""}
        <span class="pl-piede">
          ${l.assegnato_a
            ? esc((D().collaboratori.find(c => c.id === l.assegnato_a) || {}).nome || "—")
            : `<em>non assegnato</em>`}
          ${attivitaDi(l.id).length ? ` · ${attivitaDi(l.id).length} attività` : ""}
        </span>
      </button>`;

    return `
    <p class="admin-hint">Lo stesso archivio dei lead, guardato per fase: si vede subito dove si accumula il lavoro. Apri un lead per registrare cosa hai fatto e mettergli le etichette — lo stato dice a che punto è la trattativa, le etichette tutto il resto.</p>

    <div class="filterbar">
      <button class="chip ${pipeline.filtroChi === "tutti" ? "active" : ""}" data-pl-chi="tutti">Tutti</button>
      <button class="chip ${pipeline.filtroChi === "nessuno" ? "active" : ""}" data-pl-chi="nessuno">Non assegnati</button>
      ${attivi().map(c => `<button class="chip ${pipeline.filtroChi === c.id ? "active" : ""}" data-pl-chi="${esc(c.id)}">${esc(c.nome)}</button>`).join("")}
    </div>
    ${etichette.length ? `
    <div class="filterbar" style="margin-top:.4rem">
      <button class="chip ${pipeline.filtroEtichetta === "tutte" ? "active" : ""}" data-pl-etichetta="tutte">Tutte le etichette</button>
      ${etichette.map(e => `<button class="chip ${pipeline.filtroEtichetta === e.id ? "active" : ""}" data-pl-etichetta="${esc(e.id)}">${esc(e.nome)}</button>`).join("")}
    </div>` : ""}

    ${tutti.length ? `
    <div class="pl-colonne">
      ${colonne.map(s => {
        const dentro = lista.filter(l => l.stato === s);
        return `
        <div class="pl-colonna">
          <h4>${STATI_LEAD[s]} <span class="pill">${dentro.length}</span></h4>
          ${dentro.map(cartellino).join("") || `<p class="muted" style="font-size:.8rem;font-style:italic">vuota</p>`}
        </div>`;
      }).join("")}
    </div>`
    : `<p class="muted">Nessun lead ancora. Trovane dalla scheda <strong>Lead locali</strong>.</p>`}

    ${aperto ? dettaglioLead(aperto) : ""}

    <div class="card" style="margin-top:1.2rem">
      <h3>🏷️ Etichette</h3>
      <p class="muted" style="font-size:.85rem">Eliminare un'etichetta la toglie da tutti i lead che la portano: è una scelta, non un effetto collaterale.</p>
      <div class="lead-categorie" style="margin:.7rem 0">
        ${etichette.map(e => `
          <span class="tag tag-${esc(e.colore)}">${esc(e.nome)}
            <button class="tag-x" data-pl-etichetta-elimina="${esc(e.id)}" title="Elimina">✕</button>
          </span>`).join("") || `<span class="muted" style="font-size:.85rem">Nessuna etichetta.</span>`}
      </div>
      <form id="pl-etichetta-form" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:flex-end">
        <div class="field" style="flex:1;min-width:180px"><label for="et-nome">Nuova etichetta</label>
          <input id="et-nome" required maxlength="60" placeholder="es. Rinnovo a gennaio"></div>
        <div class="field"><label for="et-colore">Colore</label>
          <select id="et-colore">${["verde", "oro", "rosso", "blu", "grigio"].map(c =>
            `<option value="${c}">${c}</option>`).join("")}</select></div>
        <button class="btn btn-outline" type="submit">Aggiungi</button>
      </form>
    </div>`;
  }

  function dettaglioLead(l) {
    const mie = etichetteDi(l.id);
    const storia = attivitaDi(l.id);
    const chi = id => (D().collaboratori.find(c => c.id === id) || {}).nome || "—";

    return `
    <div class="card pl-dettaglio">
      <div class="admin-top" style="margin-bottom:.8rem">
        <div>
          <span class="eyebrow">${esc(STATI_LEAD[l.stato] || l.stato)}</span>
          <h3 style="margin:.1rem 0">${esc(l.nome)}</h3>
          <p class="muted" style="margin:0;font-size:.85rem">${esc(l.indirizzo || "—")}</p>
        </div>
        <button class="btn btn-ghost btn-sm" data-pl-chiudi>Chiudi ✕</button>
      </div>

      <div class="grid-2" style="align-items:start;gap:1.2rem">
        <div>
          <table class="admin-kv">
            ${l.telefono ? `<tr><th>Telefono</th><td><a href="tel:${esc(String(l.telefono).replace(/\s/g, ""))}">${esc(l.telefono)}</a></td></tr>` : ""}
            ${l.sito ? `<tr><th>Sito</th><td><a href="${esc(l.sito)}" target="_blank" rel="noopener">${esc(l.sito)}</a></td></tr>` : ""}
            <tr><th>Assegnato a</th><td>${l.assegnato_a ? esc(chi(l.assegnato_a)) : "<em>nessuno</em>"}</td></tr>
            ${l.email ? `<tr><th>Email</th><td><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></td></tr>` : ""}
            <tr><th>Provenienza</th><td>Google Places, ${dataBreve(l.raccolto_il)} — «${esc(l.query_origine || "—")}»</td></tr>
            ${l.note ? `<tr><th>Note</th><td>${esc(l.note)}</td></tr>` : ""}
          </table>

          ${l.no_contatto ? `
            <div class="legal-warning" style="margin-top:.8rem">
              <strong>Si è opposto al contatto.</strong> ${esc(l.no_contatto_motivo || "")}
              ${l.no_contatto_il ? `<br><span class="muted">Registrato il ${dataOra(l.no_contatto_il)}</span>` : ""}
              <br><button class="btn btn-ghost btn-sm" style="margin-top:.5rem" data-pl-riapri="${esc(l.id)}">Ha cambiato idea: riapri il contatto</button>
            </div>`
          : `<button class="btn btn-ghost btn-sm danger" style="margin-top:.6rem" data-pl-nocontatto="${esc(l.id)}">🚫 Si è opposto al contatto</button>`}

          <h4 style="margin:1rem 0 .4rem;font-size:.95rem">Etichette</h4>
          <div class="lead-categorie">
            ${(D().etichette || []).map(e => {
              const attiva = mie.some(m => m.id === e.id);
              return `<button class="chip ${attiva ? "active" : ""}" data-pl-tag="${esc(l.id)}:${esc(e.id)}:${attiva ? "togli" : "metti"}">${esc(e.nome)}</button>`;
            }).join("") || `<span class="muted" style="font-size:.85rem">Nessuna etichetta ancora creata.</span>`}
          </div>
        </div>

        <div>
          <h4 style="margin:0 0 .4rem;font-size:.95rem">Registra cosa hai fatto</h4>
          <form id="pl-attivita-form" data-lead="${esc(l.id)}">
            <div class="grid-2" style="gap:.5rem">
              <div class="field"><label for="at-tipo">Cosa</label>
                <select id="at-tipo">${Object.entries(TIPI_ATTIVITA).map(([k, v]) =>
                  `<option value="${k}">${v}</option>`).join("")}</select></div>
              <div class="field"><label for="at-esito">Com'è andata</label>
                <select id="at-esito"><option value="">—</option>${Object.entries(ESITI).map(([k, v]) =>
                  `<option value="${k}">${v}</option>`).join("")}</select></div>
            </div>
            <div class="field" style="margin-top:.5rem"><label for="at-chi">A nome di</label>
              <select id="at-chi">
                <option value="">Titolare</option>
                ${attivi().map(c => `<option value="${esc(c.id)}" ${l.assegnato_a === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}
              </select></div>
            <div class="field" style="margin-top:.5rem"><label for="at-testo">Dettagli</label>
              <textarea id="at-testo" rows="2" placeholder="Cosa vi siete detti, cosa serve, quando richiamare"></textarea></div>
            <button class="btn btn-primary btn-sm" style="margin-top:.6rem" type="submit">Registra</button>
          </form>

          <h4 style="margin:1.2rem 0 .4rem;font-size:.95rem">Storia (${storia.length})</h4>
          ${storia.length ? storia.map(a => `
            <div class="pl-attivita">
              <span class="pl-attivita-capo">
                <strong>${esc(TIPI_ATTIVITA[a.tipo] || a.tipo)}</strong>
                ${a.esito ? `<span class="pill">${esc(ESITI[a.esito] || a.esito)}</span>` : ""}
                <span class="muted">${dataOra(a.quando)} · ${a.collaboratore_id ? esc(chi(a.collaboratore_id)) : "titolare"}</span>
              </span>
              ${a.testo ? `<p>${esc(a.testo)}</p>` : ""}
              <button class="btn btn-ghost btn-sm danger" data-pl-attivita-elimina="${esc(a.id)}">Elimina</button>
            </div>`).join("")
          : `<p class="muted" style="font-size:.85rem;font-style:italic">Ancora nulla. Quello che registri qui è ciò che poi conterà nella produzione.</p>`}
        </div>
      </div>
    </div>`;
  }

  /* ---------------- SEZIONE · PRODUZIONE ----------------
     Il punteggio non è una colonna: è una somma che il database
     ricalcola a ogni lettura dalle attività registrate e dai
     lead chiusi. Un numero che si può digitare a mano non misura
     niente, e una classifica costruita così non motiva nessuno —
     si scopre subito che dipende da chi tiene la penna. */

  const VALORI = [
    ["📞 Chiamata", 2], ["✉️ Email", 1], ["🤝 Incontro", 5],
    ["📄 Preventivo", 8], ["📝 Nota", 0]
  ];
  const BONUS = [["Esito positivo", 3], ["Da richiamare", 1], ["Cliente chiuso", 20]];

  function produzioneView() {
    const p = [...(D().produzione || [])].sort((a, b) => b.punti - a.punti);
    const attivi = p.filter(x => x.attivo);
    const massimo = Math.max(1, ...attivi.map(x => x.punti));
    const totali = attivi.reduce((n, x) => n + x.punti, 0);

    const tile = (v, l, hint) => `
      <div class="kpi-tile"><strong>${v}</strong><span>${l}</span>${hint ? `<em>${hint}</em>` : ""}</div>`;

    return `
    <p class="admin-hint">Il punteggio lo calcola il database dai fatti registrati: le attività nella pipeline e i lead diventati clienti. Non esiste da nessuna parte un numero da scrivere a mano — per questo si può guardare senza doversi chiedere chi l'ha messo lì.</p>

    <div class="kpi-grid">
      ${tile(totali, "Punti della squadra", "somma di chi è attivo")}
      ${tile(attivi.reduce((n, x) => n + x.attivita, 0), "Attività registrate", "chiamate, email, incontri, preventivi")}
      ${tile(attivi.reduce((n, x) => n + x.clienti, 0), "Lead diventati clienti", "il risultato, non il tentativo")}
      ${tile(attivi.reduce((n, x) => n + x.lead_assegnati, 0), "Lead assegnati", "quanto lavoro c'è in mano")}
    </div>

    <div class="card" style="margin-top:1.2rem">
      <h3>🏆 Classifica</h3>
      ${attivi.length ? attivi.map((x, i) => `
        <div class="prod-riga">
          <span class="leader-rank ${i === 0 && x.punti > 0 ? "gold" : ""}">${i + 1}</span>
          <span class="mini-avatar">${esc(QF().initials(x.nome))}</span>
          <span class="prod-info">
            <strong>${esc(x.nome)}</strong>
            <span>${esc(RUOLI[x.ruolo] || x.ruolo)}${x.ultima_attivita ? ` · ultima attività ${dataBreve(x.ultima_attivita)}` : " · nessuna attività registrata"}</span>
            <span class="prod-barra"><i style="width:${Math.round(x.punti / massimo * 100)}%"></i></span>
            <span class="prod-dettaglio">
              ${plurale(x.chiamate, "chiamata", "chiamate")} · ${plurale(x.incontri, "incontro", "incontri")} · ${plurale(x.preventivi, "preventivo", "preventivi")}
              · ${plurale(x.clienti, "cliente", "clienti")} su ${plurale(x.lead_assegnati, "lead", "lead")}
            </span>
          </span>
          <span class="leader-pts">${x.punti} pt</span>
        </div>`).join("")
      : `<p class="muted">Nessun collaboratore attivo. La classifica compare quando c'è qualcuno in squadra e qualcosa di registrato.</p>`}

      ${p.length > attivi.length ? `
        <p class="privacy-hint">${p.length - attivi.length === 1
          ? "Un collaboratore disattivato non compare in classifica, ma la sua storia resta nel database."
          : `${p.length - attivi.length} collaboratori disattivati non compaiono in classifica, ma la loro storia resta nel database.`}</p>` : ""}
    </div>

    <div class="card" style="margin-top:1.2rem">
      <h3>⚖️ Come si contano i punti</h3>
      <p class="muted" style="font-size:.85rem">I numeri sono discutibili — e vanno discussi — ma il principio no: vale di più ciò che porta avanti il lavoro, non ciò che lo fa sembrare avanti.</p>
      <div class="grid-2" style="gap:1.2rem;margin-top:.8rem">
        <div>
          <h4 style="font-size:.9rem;margin:0 0 .4rem">Per attività</h4>
          ${VALORI.map(([n, v]) => `
            <div class="bar-row"><span class="bar-label" style="width:auto">${n}</span>
              <span class="bar-track"><i style="width:${v / 8 * 100}%"></i></span>
              <span class="bar-val">${v}</span></div>`).join("")}
          <p class="privacy-hint">Una nota vale zero: serve a ricordare, non a produrre. Darle punti insegnerebbe solo a scrivere note.</p>
        </div>
        <div>
          <h4 style="font-size:.9rem;margin:0 0 .4rem">In più</h4>
          ${BONUS.map(([n, v]) => `
            <div class="bar-row"><span class="bar-label" style="width:auto">${n}</span>
              <span class="bar-track"><i style="width:${v / 20 * 100}%"></i></span>
              <span class="bar-val">+${v}</span></div>`).join("")}
          <p class="privacy-hint">Un cliente chiuso pesa quanto una giornata di telefonate. Per cambiare questi pesi si modifica <code>crm_interno.valore_attivita</code> nel database: la classifica si riallinea da sola, perché non c'è nulla di salvato da ricalcolare.</p>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- SEZIONE · MAIL ----------------
     Invio dalla casella della società, con modelli e registro.

     La lettura della posta in arrivo non c'è, e non è una
     dimenticanza: richiederebbe IMAP, cioè una connessione lunga
     a un server di posta, mentre le funzioni su cui gira questo
     CRM sono fatte per rispondere in fretta e spegnersi. Ne
     sarebbe uscita una schermata che a volte mostra la posta e a
     volte no — peggio di una che manca. */

  const SCOPI = {
    contatto: "Primo contatto", preventivo: "Preventivo",
    sollecito: "Sollecito", informativa: "Informativa"
  };

  const posta = {
    modello: "", lead: "", chi: "", destinatario: "",
    oggetto: "", corpo: "",
    anteprima: null, errore: null, inCorso: false,
    modificaModello: null
  };

  function mailView() {
    const modelli = D().modelli || [];
    const inviate = D().inviate || [];
    const configurata = D().postaConfigurata;
    const lead = (D().lead || []).filter(l => !l.no_contatto);
    const m = posta.modificaModello && posta.modificaModello !== "nuovo"
      ? modelli.find(x => x.id === posta.modificaModello) : null;

    return `
    <p class="admin-hint">Invio dalla casella di Bizpower, con modelli riutilizzabili e registro di ciò che è partito. Un'email inviata è un fatto che riguarda una persona: va saputo che è stata mandata, a chi e con quale testo — serve a non scrivere due volte alla stessa azienda e a rispondere se qualcuno chiede conto di un messaggio.</p>

    ${configurata === false ? `
      <div class="legal-warning">
        <strong>La casella non è ancora collegata.</strong> Servono quattro segreti fra le impostazioni del progetto Supabase:
        <code>QF_SMTP_HOST</code> (su Aruba <code>smtps.aruba.it</code>), <code>QF_SMTP_PORT</code> (<code>465</code>),
        <code>QF_SMTP_USER</code> (l'indirizzo completo) e <code>QF_SMTP_PASS</code>.
        Fino ad allora modelli e registro funzionano, l'invio no.
      </div>` : ""}

    <div class="grid-2" style="align-items:start">
      <div class="card">
        <h3>✍️ Scrivi</h3>
        <form id="mail-form">
          <div class="field"><label for="ml-lead">A chi <span class="muted">(un lead in archivio, o lascia vuoto e scrivi l'indirizzo)</span></label>
            <select id="ml-lead">
              <option value="">— destinatario libero —</option>
              ${lead.map(l => `<option value="${esc(l.id)}" ${posta.lead === l.id ? "selected" : ""}>${esc(l.nome)}${l.email ? " · " + esc(l.email) : " · senza email"}</option>`).join("")}
            </select>
            ${(D().lead || []).some(l => l.no_contatto)
              ? `<p class="privacy-hint">${(D().lead || []).filter(l => l.no_contatto).length} lead non compaiono qui perché si sono opposti al contatto.</p>` : ""}
          </div>

          <div class="field" style="margin-top:.6rem"><label for="ml-dest">Indirizzo</label>
            <input id="ml-dest" type="email" value="${esc(posta.destinatario)}" placeholder="Se il lead non ce l'ha, cercalo sul loro sito"></div>

          <div class="grid-2" style="gap:.6rem;margin-top:.6rem">
            <div class="field"><label for="ml-modello">Modello</label>
              <select id="ml-modello">
                <option value="">— scrivo io —</option>
                ${modelli.map(x => `<option value="${esc(x.id)}" ${posta.modello === x.id ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}
              </select></div>
            <div class="field"><label for="ml-chi">A nome di</label>
              <select id="ml-chi">
                <option value="">— scegli chi firma —</option>
                ${attivi().map(c => `<option value="${esc(c.id)}" ${posta.chi === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}
              </select></div>
          </div>

          <div class="field" style="margin-top:.6rem"><label for="ml-oggetto">Oggetto <span class="muted">(vuoto = quello del modello)</span></label>
            <input id="ml-oggetto" value="${esc(posta.oggetto)}"></div>
          <div class="field" style="margin-top:.6rem"><label for="ml-corpo">Testo <span class="muted">(vuoto = quello del modello)</span></label>
            <textarea id="ml-corpo" rows="6" placeholder="Variabili disponibili: {azienda} {citta} {telefono} {mittente}">${esc(posta.corpo)}</textarea></div>

          <div style="display:flex;gap:.5rem;margin-top:.9rem;flex-wrap:wrap">
            <button class="btn btn-outline" type="button" id="ml-anteprima">👁 Anteprima</button>
            <button class="btn btn-primary" style="flex:1" type="submit" ${posta.inCorso || configurata === false ? "disabled" : ""}>
              ${posta.inCorso ? "Invio in corso…" : "Invia"}
            </button>
          </div>
          <p class="privacy-hint">Ogni messaggio esce con in fondo come farsi togliere dagli invii. I contatti sono raccolti in legittimo interesse, e l'art. 21 del GDPR dà a chiunque il diritto di opporsi: un diritto che per essere esercitato richiede di indovinare a chi scrivere non è un diritto esercitabile.</p>
        </form>
      </div>

      <div>
        ${posta.errore ? `<div class="legal-warning" role="alert" style="margin-bottom:1rem"><strong>Non inviata.</strong> ${esc(posta.errore)}</div>` : ""}
        ${posta.anteprima ? `
          <div class="card" style="margin-bottom:1rem">
            <h3>Anteprima</h3>
            ${(posta.anteprima.avvisi || []).map(a => `<p class="privacy-hint">⚠️ ${esc(a)}</p>`).join("")}
            <table class="admin-kv">
              <tr><th>A</th><td>${esc(posta.anteprima.destinatario)}</td></tr>
              <tr><th>Oggetto</th><td>${esc(posta.anteprima.oggetto)}</td></tr>
            </table>
            <pre class="mail-corpo">${esc(posta.anteprima.corpo)}</pre>
          </div>` : ""}

        <div class="card">
          <h3>📋 Modelli (${modelli.length})</h3>
          ${posta.modificaModello ? `
            <form id="mail-modello-form" data-id="${m ? esc(m.id) : ""}">
              <div class="field"><label for="mm-nome">Nome *</label>
                <input id="mm-nome" required value="${m ? esc(m.nome) : ""}" placeholder="Primo contatto"></div>
              <div class="field" style="margin-top:.5rem"><label for="mm-scopo">Scopo</label>
                <select id="mm-scopo">${Object.entries(SCOPI).map(([k, v]) =>
                  `<option value="${k}" ${m && m.scopo === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
              <div class="field" style="margin-top:.5rem"><label for="mm-oggetto">Oggetto *</label>
                <input id="mm-oggetto" required value="${m ? esc(m.oggetto) : ""}"></div>
              <div class="field" style="margin-top:.5rem"><label for="mm-corpo">Testo *</label>
                <textarea id="mm-corpo" required rows="8">${m ? esc(m.corpo) : ""}</textarea>
                <p class="privacy-hint">Variabili: <code>{azienda}</code> <code>{citta}</code> <code>{telefono}</code> <code>{mittente}</code></p></div>
              <div style="display:flex;gap:.5rem;margin-top:.7rem">
                <button class="btn btn-primary btn-sm" type="submit">Salva</button>
                <button class="btn btn-ghost btn-sm" type="button" data-mail-annulla>Annulla</button>
              </div>
            </form>`
          : `<button class="btn btn-outline btn-sm" data-mail-nuovo>➕ Nuovo modello</button>
             ${modelli.map(x => `
              <div class="lead-row">
                <span class="lead-icon">✉️</span>
                <span class="leader-info"><strong>${esc(x.nome)}</strong>
                  <span>${esc(SCOPI[x.scopo] || x.scopo)} · ${esc(x.oggetto)}</span></span>
                <span style="display:flex;gap:.3rem">
                  <button class="btn btn-ghost btn-sm" data-mail-modifica="${esc(x.id)}">✏️</button>
                  <button class="btn btn-ghost btn-sm danger" data-mail-elimina="${esc(x.id)}">🗑</button>
                </span>
              </div>`).join("")}`}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:1.2rem">
      <h3>📨 Registro degli invii (${inviate.length})</h3>
      ${inviate.length ? inviate.map(x => `
        <div class="lead-row">
          <span class="lead-icon">${x.esito === "inviata" ? "✅" : "⚠️"}</span>
          <span class="leader-info">
            <strong>${esc(x.oggetto)}</strong>
            <span>a ${esc(x.destinatario)} · ${dataOra(x.inviata_il)}${x.collaboratore_id ? " · " + esc((D().collaboratori.find(c => c.id === x.collaboratore_id) || {}).nome || "—") : ""}</span>
            ${x.errore ? `<span class="doc-scadenza scaduto">${esc(x.errore)}</span>` : ""}
          </span>
        </div>`).join("")
      : `<p class="muted">Nessun invio ancora. Il registro si riempie da solo, riuscito o fallito.</p>`}
    </div>

    <div class="card crm-inarrivo" style="margin-top:1.2rem">
      <span class="pill">Non costruito, e spiego perché</span>
      <h3 style="margin:.6rem 0">📥 La posta in arrivo</h3>
      <p class="muted" style="font-size:.88rem">Leggere la casella richiede IMAP: una connessione lunga a un server di posta, tenuta aperta. Le funzioni su cui gira questo CRM sono fatte per rispondere in fretta a una richiesta e poi spegnersi, e per Deno non esiste un client IMAP che me la senta di mettere in mezzo fra te e la tua casella. Costruirlo lo stesso avrebbe prodotto una schermata che a volte mostra la posta e a volte no — e una schermata inaffidabile è peggio di una che manca.</p>
      <p class="privacy-hint">Se la lettura della posta ti serve davvero, la strada seria è un servizio dedicato che riceve la posta e la consegna qui: si può fare, ma è un lavoro a sé e va deciso con calma.</p>
    </div>`;
  }

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
    pipeline: ["📇 Pipeline", pipelineView],
    documenti: ["📁 Documenti", documentiView],
    posta: ["✉️ Posta", mailView],
    mail: ["📮 Mail Marketing", null],
    produzione: ["🏆 Produzione", produzioneView]
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

    const sezione = SEZIONI[sub] ? sub : "panoramica";

    const testa = `
      <div class="admin-top">
        <div>
          <a class="crm-indietro" href="#/admin">← Area riservata</a>
          <span class="eyebrow">Amministrazione società</span>
          <h1 style="font-size:clamp(1.6rem,3.5vw,2.2rem);margin:0">CRM Bizpower</h1>
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

    if (fase === "vuoto") { carica(); return; }

    $("#crm-ricarica")?.addEventListener("click", carica);
    $("#crm-riprova")?.addEventListener("click", carica);

    $("[data-crm-nuovo]")?.addEventListener("click", () => { modifica = "nuovo"; QF().render(); });
    $("[data-crm-annulla]")?.addEventListener("click", () => { modifica = null; QF().render(); });
    document.querySelectorAll("[data-crm-modifica]").forEach(b =>
      b.addEventListener("click", () => { modifica = b.dataset.crmModifica; QF().render(); }));

    /* ---- lead locali ---- */
    const R = ricerca;

    document.querySelectorAll("[data-lead-modalita]").forEach(b =>
      b.addEventListener("click", () => {
        leggiCampiRicerca();
        R.modalita = b.dataset.leadModalita;
        QF().render();
      }));

    document.querySelectorAll("[data-lead-cat]").forEach(b =>
      b.addEventListener("click", () => {
        leggiCampiRicerca();
        const k = b.dataset.leadCat;
        if (R.categorie.includes(k)) R.categorie = R.categorie.filter(x => x !== k);
        else if (R.categorie.length >= 4) { QF().toast("Massimo 4 categorie per ricerca."); return; }
        else R.categorie.push(k);
        QF().render();
      }));

    /* I campi si rileggono prima di ogni ridisegno: il render
       ricostruisce il modulo da capo, e quello che l'utente ha
       già scritto non deve sparire perché ha toccato una
       categoria. */
    function leggiCampiRicerca() {
      const g = id => document.querySelector(id)?.value;
      if (R.modalita === "precisa") {
        R.campi.via = g("#ld-via") ?? R.campi.via;
        R.campi.cap = g("#ld-cap") ?? R.campi.cap;
        R.campi.citta = g("#ld-citta") ?? R.campi.citta;
        R.campi.provincia = (g("#ld-prov") ?? R.campi.provincia).toUpperCase();
      } else {
        R.campi.zona = g("#ld-zona") ?? R.campi.zona;
      }
      const raggio = g("#ld-raggio");
      if (raggio) R.raggio = Number(raggio);
      const q = document.querySelector("#ld-qualita");
      if (q) R.soloQualita = q.checked;
    }

    $("#lead-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      leggiCampiRicerca();
      if (!R.categorie.length) { QF().toast("Scegli almeno una categoria."); return; }
      R.inCorso = true; R.errore = null; R.scelti = new Set();
      QF().render();
      const esito = await chiamaLead("cerca", {
        modalita: R.modalita,
        zona: R.campi.zona, via: R.campi.via, citta: R.campi.citta,
        provincia: R.campi.provincia, cap: R.campi.cap,
        categorie: R.categorie, raggio: R.raggio, soloQualita: R.soloQualita
      });
      R.inCorso = false;
      if (esito.ok) { R.esito = esito; R.errore = null; }
      else { R.esito = null; R.errore = esito.errore || "Ricerca non riuscita."; }
      QF().render();
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

    /* ---- pipeline ---- */
    document.querySelectorAll("[data-pl-apri]").forEach(b =>
      b.addEventListener("click", () => {
        /* Ricliccare la stessa scheda la chiude: è il gesto che
           ci si aspetta, e evita di dover cercare la ✕. */
        pipeline.aperto = pipeline.aperto === b.dataset.plApri ? null : b.dataset.plApri;
        QF().render();
      }));
    $("[data-pl-chiudi]")?.addEventListener("click", () => { pipeline.aperto = null; QF().render(); });

    document.querySelectorAll("[data-pl-chi]").forEach(b =>
      b.addEventListener("click", () => { pipeline.filtroChi = b.dataset.plChi; QF().render(); }));
    document.querySelectorAll("[data-pl-etichetta]").forEach(b =>
      b.addEventListener("click", () => { pipeline.filtroEtichetta = b.dataset.plEtichetta; QF().render(); }));

    document.querySelectorAll("[data-pl-tag]").forEach(b =>
      b.addEventListener("click", async () => {
        const [leadId, etichettaId, verso] = b.dataset.plTag.split(":");
        const e = await chiamaLead("etichetta-applica", { leadId, etichettaId, applica: verso === "metti" });
        if (!e.ok) { QF().toast(e.errore || "Operazione non riuscita."); return; }
        await carica();
      }));

    $("#pl-etichetta-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const esito = await chiamaLead("etichetta-crea", {
        nome: $("#et-nome").value.trim(), colore: $("#et-colore").value
      });
      if (!esito.ok) { QF().toast(esito.errore || "Creazione non riuscita."); return; }
      QF().toast("Etichetta creata.");
      await carica();
    });

    document.querySelectorAll("[data-pl-etichetta-elimina]").forEach(b =>
      b.addEventListener("click", async () => {
        if (!confirm("Eliminare questa etichetta?\n\nVerrà tolta da tutti i lead che la portano.")) return;
        const e = await chiamaLead("etichetta-elimina", { id: b.dataset.plEtichettaElimina });
        if (!e.ok) { QF().toast(e.errore || "Eliminazione non riuscita."); return; }
        QF().toast("Etichetta eliminata.");
        await carica();
      }));

    $("#pl-attivita-form")?.addEventListener("submit", async ev => {
      ev.preventDefault();
      /* Come per gli altri moduli: i campi si leggono prima del
         ridisegno, non dopo. */
      const dati = {
        leadId: ev.target.dataset.lead,
        tipo: $("#at-tipo").value,
        esito: $("#at-esito").value || null,
        collaboratoreId: $("#at-chi").value || null,
        testo: $("#at-testo").value.trim() || null
      };
      const btn = ev.target.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = "Registro…"; }
      const e = await chiamaLead("attivita-registra", dati);
      if (!e.ok) {
        QF().toast(e.errore || "Registrazione non riuscita.");
        if (btn) { btn.disabled = false; btn.textContent = "Registra"; }
        return;
      }
      QF().toast("Attività registrata.");
      await carica();
    });

    document.querySelectorAll("[data-pl-attivita-elimina]").forEach(b =>
      b.addEventListener("click", async () => {
        if (!confirm("Eliminare questa attività dalla storia del lead?")) return;
        const e = await chiamaLead("attivita-elimina", { id: b.dataset.plAttivitaElimina });
        if (!e.ok) { QF().toast(e.errore || "Eliminazione non riuscita."); return; }
        QF().toast("Attività eliminata.");
        await carica();
      }));

    /* L'opposizione al contatto si registra dalla scheda del
       lead, perché è lì che arriva la notizia. Da quel momento
       l'invio è bloccato dal server, non solo nascosto qui. */
    document.querySelectorAll("[data-pl-nocontatto]").forEach(b =>
      b.addEventListener("click", async () => {
        const motivo = prompt("Come ha comunicato di non voler essere contattato?\n(es. «ha risposto NO all'email», «l'ha detto al telefono»)");
        if (motivo === null) return;
        const e = await chiamaMail("no-contatto", { id: b.dataset.plNocontatto, attivo: true, motivo: motivo.trim() || null });
        if (!e.ok) { QF().toast(e.errore || "Registrazione non riuscita."); return; }
        QF().toast("Opposizione registrata: a questo contatto non partirà più nulla.");
        await carica();
      }));

    document.querySelectorAll("[data-pl-riapri]").forEach(b =>
      b.addEventListener("click", async () => {
        if (!confirm("Riaprire il contatto?\n\nFallo solo se è stato lui a chiedertelo: l'opposizione la revoca chi l'ha espressa, non chi la subisce.")) return;
        const e = await chiamaMail("no-contatto", { id: b.dataset.plRiapri, attivo: false });
        if (!e.ok) { QF().toast(e.errore || "Operazione non riuscita."); return; }
        QF().toast("Contatto riaperto.");
        await carica();
      }));

    /* ---- posta ---- */
    /* Come negli altri moduli: i campi si leggono prima di ogni
       ridisegno, perché il render ricostruisce il modulo da capo. */
    function leggiPosta() {
      const g = id => document.querySelector(id)?.value;
      posta.lead = g("#ml-lead") ?? posta.lead;
      posta.destinatario = g("#ml-dest") ?? posta.destinatario;
      posta.modello = g("#ml-modello") ?? posta.modello;
      posta.chi = g("#ml-chi") ?? posta.chi;
      posta.oggetto = g("#ml-oggetto") ?? posta.oggetto;
      posta.corpo = g("#ml-corpo") ?? posta.corpo;
    }
    const datiPosta = () => ({
      leadId: posta.lead || null,
      modelloId: posta.modello || null,
      collaboratoreId: posta.chi || null,
      destinatario: posta.destinatario || null,
      oggetto: posta.oggetto || null,
      corpo: posta.corpo || null
    });

    /* Scegliendo un lead il suo indirizzo si porta dietro, se ce
       l'ha. E se NON ce l'ha il campo si svuota: lasciarci
       l'indirizzo del lead precedente significherebbe scrivere a
       una ditta il messaggio destinato a un'altra, ed è il tipo
       di errore che ci si accorge solo dalla risposta. */
    $("#ml-lead")?.addEventListener("change", () => {
      leggiPosta();
      const l = (D().lead || []).find(x => x.id === posta.lead);
      if (posta.lead) posta.destinatario = l?.email || "";
      posta.anteprima = null; posta.errore = null;
      QF().render();
    });

    $("#ml-anteprima")?.addEventListener("click", async () => {
      leggiPosta();
      const e = await chiamaMail("anteprima", datiPosta());
      if (e.ok) { posta.anteprima = e; posta.errore = null; }
      else { posta.anteprima = null; posta.errore = e.errore || "Anteprima non riuscita."; }
      QF().render();
    });

    $("#mail-form")?.addEventListener("submit", async ev => {
      ev.preventDefault();
      leggiPosta();
      if (!confirm("Inviare davvero questo messaggio?\n\nUn'email parte una volta sola: l'anteprima serve a evitare di accorgersene dopo.")) return;
      posta.inCorso = true; posta.errore = null;
      QF().render();
      const e = await chiamaMail("invia", datiPosta());
      posta.inCorso = false;
      if (!e.ok) { posta.errore = e.errore || "Invio non riuscito."; QF().render(); return; }
      QF().toast("Email inviata a " + e.destinatario);
      posta.anteprima = null; posta.oggetto = ""; posta.corpo = ""; posta.destinatario = ""; posta.lead = "";
      await carica();
    });

    $("[data-mail-nuovo]")?.addEventListener("click", () => { posta.modificaModello = "nuovo"; QF().render(); });
    $("[data-mail-annulla]")?.addEventListener("click", () => { posta.modificaModello = null; QF().render(); });
    document.querySelectorAll("[data-mail-modifica]").forEach(b =>
      b.addEventListener("click", () => { posta.modificaModello = b.dataset.mailModifica; QF().render(); }));

    $("#mail-modello-form")?.addEventListener("submit", async ev => {
      ev.preventDefault();
      const e = await chiamaMail("salva-modello", {
        id: ev.target.dataset.id || null,
        nome: $("#mm-nome").value.trim(),
        scopo: $("#mm-scopo").value,
        oggetto: $("#mm-oggetto").value.trim(),
        corpo: $("#mm-corpo").value
      });
      if (!e.ok) { QF().toast(e.errore || "Salvataggio non riuscito."); return; }
      QF().toast("Modello salvato.");
      posta.modificaModello = null;
      await carica();
    });

    document.querySelectorAll("[data-mail-elimina]").forEach(b =>
      b.addEventListener("click", async () => {
        if (!confirm("Eliminare questo modello?\n\nLe email già inviate restano nel registro con il testo che avevano.")) return;
        const e = await chiamaMail("elimina-modello", { id: b.dataset.mailElimina });
        if (!e.ok) { QF().toast(e.errore || "Eliminazione non riuscita."); return; }
        QF().toast("Modello eliminato.");
        await carica();
      }));

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
    dati = null; fase = "vuoto"; avviso = null; modifica = null; dentroMail = false;
    window.QF_MM?.dimentica();
  }

  window.QF_CRM = { view, bind, dimentica };
})();
