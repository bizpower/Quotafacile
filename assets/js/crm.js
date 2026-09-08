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
  /* Credenziali appena generate. Restano a schermo finché non le
     si chiude, perché è l'unico momento in cui la password è
     leggibile: dopo, nel database, c'è solo la sua forma cifrata
     e nemmeno il titolare può rileggerla. */
  let credenziali = null;

  /* ---------------- DIALOGO CON IL SERVER ---------------- */
  async function chiama(azione, d = {}) {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), 20000);
    try {
      const r = await fetch(API, {
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
    const e = await chiama("panoramica");
    if (e.ok) { dati = e; fase = "pronto"; avviso = null; }
    else { fase = "errore"; avviso = e.errore || "CRM non raggiungibile."; }
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
  const D = () => dati || { collaboratori: [], documenti: [] };
  const attivi = () => D().collaboratori.filter(c => c.attivo);
  const dataBreve = s => s ? new Date(s).toLocaleDateString("it-IT") : "—";

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
      ${tile("—", "Lead in pipeline", "arriva con la sezione Lead")}
      ${tile(D().documenti.length, "Documenti archiviati", (() => {
        const s = D().documenti.filter(d => d.scadenza && new Date(d.scadenza) < new Date(Date.now() + 60 * 86400000)).length;
        return s ? `⚠️ ${s} in scadenza o scaduti` : "nessuna scadenza vicina";
      })())}
      ${tile("—", "Email inviate questo mese", "arriva con la sezione Mail")}
    </div>

    <div class="grid-2" style="align-items:start;margin-top:1.2rem">
      <div class="card">
        <h3>👥 La squadra</h3>
        ${attivi().length ? attivi().map(x => `
          <div class="leader-row">
            <span class="mini-avatar">${esc(QF().initials(x.nome))}</span>
            <span class="leader-info"><strong>${esc(x.nome)}</strong>
              <span>${esc(RUOLI[x.ruolo] || x.ruolo)}${x.email ? " · " + esc(x.email) : ""}</span></span>
            <span class="leader-pts">${x.punti} pt</span>
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
            ["Lead locali (ricerca per zona e categoria)", false],
            ["Pipeline: contatti, etichette, trattative", false],
            ["Documenti e contratti", true],
            ["Mail: casella, filtri, invii", false],
            ["Produzione e classifica", false]
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
          <tr><th>Produzione</th><td>${c.punti} punti</td></tr>
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

  /* ---------------- SEZIONI IN ARRIVO ---------------- */
  /* Una scheda vuota che sembra funzionante è peggio di una che
     dichiara di non esserlo: qui c'è scritto cosa farà e da dove
     nasce, così sai cosa stai aspettando. */
  const INARRIVO = {
    lead: {
      titolo: "🔎 Lead locali",
      cosa: "Ricerca di attività per via, città, provincia, CAP e raggio, con categorie multiple e filtro qualità. Fino a 50 risultati per ricerca, senza duplicati, salvabili direttamente in pipeline.",
      come: "Google Places e Geocoding, chiamate dal server con la chiave mai esposta nella pagina. Niente scraping: è il vincolo che ti eri già dato nel progetto <em>cercalead</em>, ed è anche quello che tiene la raccolta dentro il perimetro del legittimo interesse.",
      serve: "Una chiave Google Places con Places API e Geocoding API attive, e la fatturazione abilitata sul progetto Google Cloud."
    },
    pipeline: {
      titolo: "📇 Pipeline",
      cosa: "Anagrafica contatti, etichette di stato (Nuovo, Follow up, Trattativa, Preventivo inviato), assegnazione ai collaboratori e viste per fase.",
      come: "Lo stesso impianto di etichette di LORI, dove ogni etichetta può stare su più fogli e lo stato del lead è la sua posizione nel lavoro, non una colonna fissa.",
      serve: "Niente di esterno: si costruisce sulle tabelle del CRM."
    },
    mail: {
      titolo: "✉️ Mail",
      cosa: "Panoramica della casella, filtri per mittente e dominio, allegati a portata di mano, template di richiesta preventivo compilabili e invio.",
      come: "IMAP per leggere, SMTP per inviare, credenziali come segreti del progetto e mai nel codice — l'impostazione del tuo progetto di gestione email.",
      serve: "Host, porte e credenziali della casella, e un dominio con SPF, DKIM e DMARC a posto: senza autenticazione del mittente le email finiscono in spam, e nessun codice può rimediare."
    },
    produzione: {
      titolo: "🏆 Produzione",
      cosa: "Punteggio per collaboratore costruito su lead lavorati, trattative e contratti chiusi, con classifica e andamento nel tempo.",
      come: "Il punteggio lo calcola il database dai fatti registrati, non si scrive a mano: un numero che si può digitare non misura niente.",
      serve: "Prima la pipeline, che è la fonte dei fatti da contare."
    }
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
    lead: ["🔎 Lead locali", () => inArrivoView("lead")],
    pipeline: ["📇 Pipeline", () => inArrivoView("pipeline")],
    documenti: ["📁 Documenti", documentiView],
    mail: ["✉️ Mail", () => inArrivoView("mail")],
    produzione: ["🏆 Produzione", () => inArrivoView("produzione")]
  };

  function view(sub) {
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

    if (fase === "vuoto") { carica(); return; }

    $("#crm-ricarica")?.addEventListener("click", carica);
    $("#crm-riprova")?.addEventListener("click", carica);

    $("[data-crm-nuovo]")?.addEventListener("click", () => { modifica = "nuovo"; QF().render(); });
    $("[data-crm-annulla]")?.addEventListener("click", () => { modifica = null; QF().render(); });
    document.querySelectorAll("[data-crm-modifica]").forEach(b =>
      b.addEventListener("click", () => { modifica = b.dataset.crmModifica; QF().render(); }));

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
  function dimentica() {
    dati = null; fase = "vuoto"; avviso = null; modifica = null;
  }

  window.QF_CRM = { view, bind, dimentica };
})();
