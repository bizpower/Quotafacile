/* ============================================================
   QuotaFacile — CRM Bizpower
   ------------------------------------------------------------
   Rotta: #/admin/crm — dentro l'area riservata, dietro la stessa
   chiave della console di piattaforma.

   Due cose distinte dietro la stessa porta:
   - la console di PIATTAFORMA modera QuotaFacile (bacheca,
     richieste, intermediari): riguarda il marketplace;
   - questo CRM amministra BIZPOWER: collaboratori, lead, posta,
     produzione. Riguarda la società.
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
  let dentroMagazine = false;
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

  /* ---- Regioni, province e comuni ----
     L'elenco sta in assets/data/comuni.json (lo rigenera
     tools/comuni.mjs dai dati ISTAT) ed è 190 KB: troppi per
     farli scaricare a chi apre il CRM per guardare la
     produzione. Si caricano quando servono davvero, cioè la
     prima volta che si apre la ricerca precisa, e una volta
     sola. Se non arrivano, i campi tornano a essere di testo
     libero invece di lasciare tre tendine vuote. */
  const geo = { dati: null, inCorso: false, fallita: false };

  function caricaGeo() {
    if (geo.dati || geo.inCorso || geo.fallita) return;
    geo.inCorso = true;
    fetch((QF().base || "/") + "assets/data/comuni.json")
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(d => { geo.dati = d; })
      .catch(() => { geo.fallita = true; })
      .finally(() => { geo.inCorso = false; QF().render(); });
  }

  /* La provincia è la chiave di tutto: la sigla è quella che il
     server riceve, ed è anche quella con cui si trovano i comuni.
     La regione serve solo ad accorciare la tendina delle
     province, quindi se manca non blocca niente. */
  const provinceDi = regione => {
    if (!geo.dati) return [];
    if (regione && geo.dati.regioni[regione]) return geo.dati.regioni[regione];
    return Object.keys(geo.dati.province)
      .sort((a, b) => geo.dati.province[a].nome.localeCompare(geo.dati.province[b].nome, "it"));
  };
  const comuniDi = sigla => (geo.dati && geo.dati.comuni[sigla]) || [];

  /* Stato della ricerca. Vive solo finché la scheda è aperta: i
     risultati non salvati non sono un archivio, sono una lista
     della spesa. */
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
    filtroStato: "tutti"
  };

  /* I tre menu a tendina della ricerca precisa.

     Prima erano campi di testo, e il testo libero qui è una
     trappola silenziosa: «Reggio Emilia» invece di «Reggio
     nell'Emilia», o una sigla di provincia che non esiste,
     centrano la ricerca da un'altra parte senza dire niente. Si
     scopre dai risultati sbagliati, quando si è già consumata una
     chiamata a Google.

     Regione → Provincia → Comune: ogni tendina restringe la
     successiva, così la terza ha al massimo trecento voci invece
     di ottomila. La regione è facoltativa e serve solo a
     accorciare l'elenco delle province. */
  function zoneHtml(R) {
    if (geo.fallita) {
      return `
        <div class="legal-warning" style="margin-bottom:.7rem">
          L'elenco dei comuni non si è caricato: i campi qui sotto restano liberi.
          Scrivi il nome del comune come lo scrive l'anagrafe.
        </div>
        <div class="grid-2" style="gap:.6rem">
          <div class="field"><label for="ld-citta">Città *</label>
            <input id="ld-citta" required value="${esc(R.campi.citta)}" placeholder="Milano"></div>
          <div class="field"><label for="ld-prov">Provincia</label>
            <input id="ld-prov" maxlength="2" value="${esc(R.campi.provincia)}" placeholder="MI"
                   style="text-transform:uppercase"></div>
        </div>
        <div class="grid-2" style="gap:.6rem;margin-top:.6rem">
          <div class="field"><label for="ld-via">Via e civico</label>
            <input id="ld-via" value="${esc(R.campi.via)}" placeholder="Corso Lodi 10"></div>
          <div class="field"><label for="ld-cap">CAP</label>
            <input id="ld-cap" value="${esc(R.campi.cap)}" placeholder="20139"></div>
        </div>`;
    }

    if (!geo.dati) {
      return `<p class="muted" style="margin:.4rem 0 .8rem">Carico l'elenco dei comuni…</p>`;
    }

    const prov = provinceDi(R.campi.regione);
    const sigla = prov.includes(R.campi.provincia) ? R.campi.provincia : (prov[0] || "");
    const elenco = comuniDi(sigla);
    const citta = elenco.some(c => c[0] === R.campi.citta) ? R.campi.citta : (elenco[0] ? elenco[0][0] : "");
    /* Il CAP mostrato: quello scritto a mano se c'è, altrimenti
       quello del comune selezionato quando ne ha uno solo. Si
       calcola qui e non si scrive nello stato, perché questa
       funzione disegna e basta. */
    const capMostrato = R.campi.cap || (elenco.find(c => c[0] === citta) || [])[1] || "";

    return `
      <div class="grid-3" style="gap:.6rem">
        <div class="field"><label for="ld-regione">Regione</label>
          <select id="ld-regione">
            <option value="">Tutte le regioni</option>
            ${Object.keys(geo.dati.regioni).map(r =>
              `<option value="${esc(r)}" ${R.campi.regione === r ? "selected" : ""}>${esc(r)}</option>`).join("")}
          </select></div>
        <div class="field"><label for="ld-prov">Provincia *</label>
          <select id="ld-prov" required>
            ${prov.map(s =>
              `<option value="${esc(s)}" ${sigla === s ? "selected" : ""}>${esc(geo.dati.province[s].nome)} (${esc(s)})</option>`).join("")}
          </select></div>
        <div class="field"><label for="ld-citta">Comune *</label>
          <select id="ld-citta" required>
            ${elenco.map(([n]) =>
              `<option value="${esc(n)}" ${citta === n ? "selected" : ""}>${esc(n)}</option>`).join("")}
          </select>
          <p class="privacy-hint">${elenco.length} comuni in questa provincia. Scrivi le prime lettere per arrivarci.</p>
        </div>
      </div>
      <div class="grid-2" style="gap:.6rem;margin-top:.6rem">
        <div class="field"><label for="ld-via">Via e civico <span class="muted">(facoltativo)</span></label>
          <input id="ld-via" value="${esc(R.campi.via)}" placeholder="Corso Lodi 10"></div>
        <div class="field"><label for="ld-cap">CAP <span class="muted">(facoltativo)</span></label>
          <input id="ld-cap" inputmode="numeric" maxlength="5" value="${esc(capMostrato)}" placeholder="20139">
          <p class="privacy-hint">Si compila da solo per i comuni che ne hanno uno solo; per le città grandi scegli tu la zona.</p>
        </div>
      </div>`;
  }

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
        <p class="muted" style="font-size:.85rem">Anagrafica d'impresa dalle API ufficiali di Google, non da pagine raschiate. L'email fa eccezione — Google non la fornisce — e quando la chiedi viene letta sul sito che l'attività pubblica da sé: è una delle fonti già dichiarate nell'informativa alle imprese. Di ogni contatto salvato resta scritto da dove viene, email compresa: è la risposta a «dove avete preso il mio recapito», ed è ciò che tiene la raccolta dentro il legittimo interesse.</p>

        <div class="filterbar" style="margin:.9rem 0 .6rem">
          <button class="chip ${!precisa ? "active" : ""}" data-lead-modalita="rapida">Ricerca rapida</button>
          <button class="chip ${precisa ? "active" : ""}" data-lead-modalita="precisa">Ricerca precisa</button>
        </div>

        <form id="lead-form">
          ${precisa ? zoneHtml(R) : `
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
              <label class="checkline" style="margin-top:.5rem">
                <input type="checkbox" id="ld-email" ${R.soloConEmail ? "checked" : ""}>
                <span>Solo con email pubblica <em class="muted" style="font-style:normal">— pronti per il mail marketing</em></span>
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
                <button class="btn btn-ghost btn-sm danger" data-lead-elimina="${esc(l.id)}">🗑</button>
              </div>
            </div>`).join("") || `<p class="muted">Nessun lead con questo filtro.</p>`}`
        : `<p class="muted">Nessun lead in archivio. Fai una ricerca qui sopra e salva quelli che ti interessano.</p>`}
      </div>`;

    return modulo + risultati() + archivio;
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
    <p class="admin-hint">Il punteggio lo calcola il database dai fatti registrati: le attività e i lead diventati clienti. Non esiste da nessuna parte un numero da scrivere a mano — per questo si può guardare senza doversi chiedere chi l'ha messo lì.</p>

    <p class="privacy-hint">Le attività si registravano dalla scheda della pipeline, che non c'è più: quelle già registrate continuano a contare, ma da questa console non se ne aggiungono di nuove. Le email inviate dal Mail Marketing sì, quelle si registrano da sole.</p>

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

  /* ---------------- ASSISTENTE ---------------- */
  /* Salvare un contatto o creare una lista parlando, invece di
     compilare un modulo.

     Due cose da sapere su come è fatto, perché cambiano cosa ci
     si può aspettare:

     1. AL MODELLO ARRIVA SOLO LA TUA FRASE. Non l'archivio, non
        i lead, non le liste. Il suo lavoro è tradurre quella
        frase in un comando; a scrivere sul database è il server,
        che il comando lo ricontrolla da capo. Quindi non puoi
        chiedergli "quanti lead ho a Milano": non lo sa, e non ha
        modo di saperlo.

     2. NON SCRIVE NIENTE SENZA CONFERMA. Fra la frase e la
        scrittura c'è un bottone. Il dettato sbaglia i nomi
        propri più spesso di quanto sembri, e una riga sbagliata
        entrata in silenzio nell'archivio non la ritrova più
        nessuno.

     La voce usa il riconoscimento già dentro al browser: nessuna
     libreria in più, nessun servizio in mezzo oltre a quello che
     Chrome usa comunque. Dove non c'è, il microfono non compare
     e si scrive. */

  const VOCE = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  let chat = [];           // { da: "io" | "qf", testo }
  let proposta = null;     // la proposta in attesa di conferma
  let bozza = "";          // quel che c'è nella casella, fra un disegno e l'altro
  let chatInCorso = false;
  let ultimoLead = null;   // per "aggiungilo alla lista X"
  let ascolto = null;      // il riconoscimento vocale attivo

  const API_CHAT = "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-chat";

  const ESEMPI = [
    "Salva Autofficina Bianchi, info@bianchi.it, telefono 02 1234567, Milano",
    "Crea una lista che si chiama Carrozzerie Lombardia",
    "Aggiungi Autofficina Bianchi alla lista Carrozzerie Lombardia"
  ];

  function dice(da, testo) { chat.push({ da, testo }); }

  async function chiediAssistente(frase) {
    dice("io", frase);
    proposta = null;
    chatInCorso = true;
    bozza = "";
    QF().render();

    const e = await chiama("interpreta", { frase, ultimoLead }, API_CHAT, 30000);
    chatInCorso = false;

    if (!e.ok) {
      dice("qf", e.errore || "Non sono riuscito a interpretare la frase.");
    } else if (e.proposta) {
      proposta = e.proposta;
      dice("qf", e.proposta.titolo);
    } else {
      dice("qf", e.messaggio || "Non ho capito.");
    }
    QF().render();
  }

  async function confermaProposta() {
    if (!proposta) return;
    const $ = s => document.querySelector(s);
    const val = k => {
      const c = $(`[data-chat-campo="${k}"]`);
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

    chatInCorso = true;
    QF().render();
    const e = await chiama("esegui", { azione: proposta.azione, campi, frase: proposta.frase }, API_CHAT, 25000);
    chatInCorso = false;

    if (!e.ok) {
      dice("qf", e.errore || "Non sono riuscito a salvare.");
      QF().render();
      return;
    }
    proposta = null;
    if (e.leadId) ultimoLead = e.leadId;
    dice("qf", e.messaggio || "Fatto.");
    QF().render();
    /* L'archivio a schermo deve corrispondere a quello vero, ma
       senza far sparire la conversazione dietro un "caricamento". */
    carica(true);
  }

  function propostaHtml(p) {
    /* Note e descrizione sono testo libero: una colonna sola le
       taglia a metà parola mentre si rilegge quello che sta per
       essere scritto. */
    const campo = (k, etichetta, v, tipo = "text") => `
      <label class="chat-campo ${k === "note" || k === "descrizione" ? "chat-campo-largo" : ""}">
        <span>${etichetta}</span>
        <input type="${tipo}" data-chat-campo="${k}" value="${esc(v || "")}" placeholder="—">
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
        <label class="chat-campo"><span>Contatto</span>
          <select data-chat-campo="lead_id">
            ${s.lead.map(l => `<option value="${esc(l.id)}">${esc(l.nome)}${l.citta ? " — " + esc(l.citta) : ""}${l.email ? " · " + esc(l.email) : ""}</option>`).join("")}
          </select></label>
        <label class="chat-campo"><span>Lista</span>
          <select data-chat-campo="lista_id">
            ${s.liste.map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join("")}
          </select></label>`;
    }

    return `
    <div class="chat-proposta">
      <strong>${esc(p.titolo)}</strong>
      <p class="muted" style="font-size:.82rem;margin:.2rem 0 .6rem">Controlla i campi: quello che vedi qui è quello che verrà scritto.</p>
      ${(p.avvisi || []).map(a => `<div class="legal-warning" style="margin:.4rem 0;padding:.5rem .7rem;font-size:.85rem">${esc(a)}</div>`).join("")}
      <div class="chat-campi">${corpo}</div>
      <div style="display:flex;gap:.5rem;margin-top:.8rem;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" data-chat-conferma>Conferma e salva</button>
        <button class="btn btn-ghost btn-sm" data-chat-annulla>Annulla</button>
      </div>
    </div>`;
  }

  function assistenteView() {
    return `
    <div class="card">
      <h3>🎙️ Assistente</h3>
      <p class="muted">Dimmi cosa devo registrare e lo preparo. Salvo un contatto,
      creo una lista, metto un contatto dentro una lista. Prima di scrivere ti faccio
      sempre vedere cosa sto per scrivere.</p>

      <div class="chat-storia" id="chat-storia">
        ${chat.length ? chat.map(m => `
          <div class="chat-riga chat-${m.da}"><span>${esc(m.testo)}</span></div>`).join("")
        : `<p class="muted" style="font-size:.88rem">Per cominciare, prova con una di queste:</p>
           ${ESEMPI.map(e => `<button type="button" class="chip chat-esempio" data-chat-esempio="${esc(e)}">${esc(e)}</button>`).join(" ")}`}
        ${chatInCorso ? `<div class="chat-riga chat-qf chat-attesa"><span>Sto leggendo…</span></div>` : ""}
      </div>

      ${proposta ? propostaHtml(proposta) : ""}

      <div class="chat-barra">
        ${VOCE ? `<button type="button" class="btn btn-ghost chat-mic" id="chat-mic" title="Detta" aria-label="Detta con la voce">🎤</button>` : ""}
        <input type="text" id="chat-testo" placeholder="Salva Mario Rossi, mario@rossi.it, Milano"
               value="${esc(bozza)}" autocomplete="off" ${chatInCorso ? "disabled" : ""}>
        <button class="btn btn-primary" id="chat-invia" ${chatInCorso ? "disabled" : ""}>Invia</button>
      </div>

      <p class="privacy-hint" style="margin-top:.9rem">
        <strong>Dove va quello che scrivi.</strong> La frase che digiti o detti viene
        inviata a Google (Gemini) per essere tradotta in un comando: se dentro c'è il
        nome e l'email di una persona, quel nome e quell'email passano da Google. Con il
        microfono, l'audio passa dal riconoscimento vocale di Chrome, che è anch'esso di
        Google. Quello che è già in archivio invece non esce mai da qui: al modello non
        viene mandato nulla del CRM.
      </p>
    </div>`;
  }

  /* ---- il microfono ---- */
  function micAggiorna() {
    const b = document.querySelector("#chat-mic");
    if (b) b.classList.toggle("chat-mic-attivo", !!ascolto);
  }

  const ERRORI_VOCE = {
    "not-allowed": "Il browser non mi dà il microfono: va concesso dal lucchetto accanto all'indirizzo.",
    "service-not-allowed": "Il browser non mi dà il microfono: va concesso dal lucchetto accanto all'indirizzo.",
    "no-speech": "Non ho sentito niente.",
    "audio-capture": "Non trovo un microfono collegato.",
    network: "Il riconoscimento vocale ha bisogno della rete e non è riuscito a raggiungerla."
  };

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
      const c = document.querySelector("#chat-testo");
      if (c) c.value = s;
    };
    r.onerror = ev => {
      ascolto = null; micAggiorna();
      QF().toast(ERRORI_VOCE[ev.error] || "Il riconoscimento vocale non ha funzionato.");
    };
    r.onend = () => { ascolto = null; micAggiorna(); };

    ascolto = r;
    try { r.start(); micAggiorna(); } catch { ascolto = null; micAggiorna(); }
  }

  function bindAssistente() {
    const $ = s => document.querySelector(s);
    const casella = $("#chat-testo");
    if (!casella) return;

    const invia = () => {
      const t = casella.value.trim();
      if (!t || chatInCorso) return;
      if (ascolto) { ascolto.stop(); ascolto = null; }
      chiediAssistente(t);
    };

    casella.addEventListener("input", () => { bozza = casella.value; });
    casella.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); invia(); } });
    $("#chat-invia")?.addEventListener("click", invia);
    $("#chat-mic")?.addEventListener("click", ascolta);

    document.querySelectorAll("[data-chat-esempio]").forEach(b =>
      b.addEventListener("click", () => chiediAssistente(b.dataset.chatEsempio)));

    $("[data-chat-conferma]")?.addEventListener("click", confermaProposta);
    $("[data-chat-annulla]")?.addEventListener("click", () => {
      proposta = null; dice("qf", "Annullato: non ho scritto niente."); QF().render();
    });

    /* La conversazione si legge dal basso, come tutte le
       conversazioni. */
    const storia = $("#chat-storia");
    if (storia) storia.scrollTop = storia.scrollHeight;
    if (!chatInCorso && !proposta && chat.length) casella.focus();
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
    assistente: ["🎙️ Assistente", assistenteView],
    posta: ["✉️ Posta", mailView],
    mail: ["📮 Mail Marketing", null],
    magazine: ["📰 Magazine", null],
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
    if (dentroMagazine) { window.QF_MAGAZINE?.bind(); return; }

    if (fase === "vuoto") { carica(); return; }

    /* Avvolti in una funzione: passare `carica` direttamente
       gli consegnerebbe l'evento del click come primo argomento,
       e un MouseEvent è vero — l'aggiornamento a mano diventerebbe
       silenzioso proprio quando si vuole vederlo. */
    $("#crm-ricarica")?.addEventListener("click", () => carica());
    $("#crm-riprova")?.addEventListener("click", () => carica());

    bindAssistente();

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
        if (R.modalita === "precisa") caricaGeo();
        QF().render();
      }));

    /* La ricerca precisa può essere già aperta quando la sezione
       viene ridisegnata per un altro motivo: l'elenco va chiesto
       anche qui, e caricaGeo() sa già di non ripetersi. */
    if (R.modalita === "precisa") caricaGeo();

    /* Le tre tendine sono a cascata: cambiare regione svuota la
       provincia scelta se non le appartiene piu', e cambiare
       provincia svuota il comune. Il valore vecchio non si
       "ripulisce": si lascia che zoneHtml ricada sul primo
       elemento valido, cosi' il modulo non resta mai in uno stato
       che il server rifiuterebbe.

       Si agganciano solo quando le tendine ci sono davvero: se
       l'elenco dei comuni non si e' caricato gli stessi
       identificativi appartengono a campi di testo, e un gestore
       che azzera il comune a ogni uscita dal campo cancellerebbe
       quello che si sta scrivendo. */
    if (geo.dati && R.modalita === "precisa") {
      $("#ld-regione")?.addEventListener("change", e => {
        leggiCampiRicerca();
        R.campi.regione = e.target.value;
        const prov = provinceDi(R.campi.regione);
        if (!prov.includes(R.campi.provincia)) {
          R.campi.provincia = prov[0] || "";
          R.campi.citta = "";
          R.campi.cap = "";
        }
        QF().render();
      });

      $("#ld-prov")?.addEventListener("change", e => {
        leggiCampiRicerca();
        R.campi.provincia = e.target.value;
        R.campi.citta = "";
        R.campi.cap = "";
        QF().render();
      });

      /* Scegliendo il comune si compila il CAP, ma solo se quel
         comune ne ha uno solo: Milano ne ha decine e sceglierne
         uno a caso vorrebbe dire centrare la ricerca su un
         quartiere qualunque senza che nessuno se ne accorga. */
      $("#ld-citta")?.addEventListener("change", e => {
        leggiCampiRicerca();
        R.campi.citta = e.target.value;
        const trovato = comuniDi(R.campi.provincia).find(c => c[0] === R.campi.citta);
        R.campi.cap = trovato && trovato[1] ? trovato[1] : "";
        QF().render();
      });
    }

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
        R.campi.regione = g("#ld-regione") ?? R.campi.regione;
      } else {
        R.campi.zona = g("#ld-zona") ?? R.campi.zona;
      }
      const raggio = g("#ld-raggio");
      if (raggio) R.raggio = Number(raggio);
      const q = document.querySelector("#ld-qualita");
      if (q) R.soloQualita = q.checked;
      const em = document.querySelector("#ld-email");
      if (em) R.soloConEmail = em.checked;
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
        categorie: R.categorie, raggio: R.raggio, soloQualita: R.soloQualita,
        soloConEmail: R.soloConEmail
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
    dati = null; fase = "vuoto"; avviso = null; modifica = null; dentroMail = false; dentroMagazine = false;
    window.QF_MM?.dimentica();
    window.QF_MAGAZINE?.dimentica();
  }

  window.QF_CRM = { view, bind, dimentica };
})();
