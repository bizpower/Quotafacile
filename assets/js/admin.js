/* ============================================================
   QuotaFacile — Area Admin (riservata)
   ------------------------------------------------------------
   Rotta: #/admin — non è linkata da nessuna parte nel sito.

   Fino a ieri questa console leggeva il localStorage: mostrava
   ciò che era stato creato in *questo* browser, e la passphrase
   era un deterrente scritto nel sorgente. Entrambe le cose sono
   cambiate.

   ACCESSO — la chiave di amministrazione non è confrontata qui:
   viaggia nell'intestazione x-qf-admin verso la funzione
   qf-admin, che la confronta con il segreto QF_ADMIN_TOKEN del
   progetto Supabase. Quel segreto non compare nel sito né nel
   repository, e senza di esso nessuna azione va a buon fine —
   nemmeno leggendo questo file. È un controllo vero.

   DATI — tutto ciò che vedi arriva dal database: richieste,
   iscrizioni, bacheca, segnalazioni. Ciò che invece vive nel
   repository (le guide k1–k9, le tessere della vetrina) è
   marcato come tale e non si modifica da qui: si modifica nel
   codice, dove c'è la cronologia delle revisioni.
   ============================================================ */
"use strict";

(function () {

  const API = "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-admin";
  const SESSION_KEY = "qf_admin_chiave";

  const QF = () => window.QF;
  const esc = s => window.QF.esc(s);

  let tab = "kpi";
  let modFiltro = "tutte";
  let filtroRichieste = "nuova";

  /* Panoramica caricata dal server. Nulla di tutto questo vive
     nel localStorage: alla chiusura della scheda sparisce. */
  let dati = null;
  let fase = "vuoto";   // vuoto | caricamento | pronto | errore
  let avviso = null;

  const chiave = () => { try { return sessionStorage.getItem(SESSION_KEY) || ""; } catch (e) { return ""; } };
  const isAuth = () => !!chiave();

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
    if (e.ok) {
      dati = e; fase = "pronto"; avviso = null;
    } else if (e.status === 401) {
      /* chiave non più valida: si torna alla schermata di accesso */
      try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* no-op */ }
      dati = null; fase = "vuoto"; avviso = e.errore || "Chiave non valida.";
    } else {
      fase = "errore"; avviso = e.errore || "Panoramica non disponibile.";
    }
    QF().render();
  }

  /* Ogni azione di moderazione ricarica la panoramica: quello
     che vedi dopo il clic è lo stato del database, non una
     previsione dell'interfaccia. */
  async function agisci(azione, d, messaggio) {
    const e = await chiama(azione, d);
    if (!e.ok) { QF().toast(e.errore || "Operazione non riuscita."); return false; }
    QF().toast(messaggio);
    await carica();
    return true;
  }

  /* ---------------- ACCESSO ---------------- */
  function loginView() {
    return `
    <section class="section">
      <div class="container" style="max-width:460px">
        <div class="card admin-login">
          <div class="admin-lock">🔐</div>
          <h1 style="font-size:1.5rem;text-align:center">Area riservata</h1>
          <p class="muted" style="text-align:center;font-size:.9rem">Console di gestione QuotaFacile.</p>
          ${avviso ? `<div class="legal-warning" role="alert">${esc(avviso)}</div>` : ""}
          <form id="admin-login-form">
            <div class="field"><label for="adm-pass">Chiave di amministrazione</label>
              <input id="adm-pass" type="password" required autocomplete="current-password" placeholder="••••••••••••••••">
            </div>
            <button class="btn btn-primary btn-block" style="margin-top:1rem" type="submit">Entra</button>
          </form>
          <p class="privacy-hint" style="margin-top:1.2rem">
            La chiave viene verificata dal server, non da questa pagina: è il segreto
            <code>QF_ADMIN_TOKEN</code> del progetto Supabase. Resta in memoria fino alla
            chiusura della scheda e non viene mai salvata sul dispositivo in modo permanente.
          </p>
        </div>
      </div>
    </section>`;
  }

  /* ---------------- LETTURA DEI DATI ---------------- */
  const D = () => dati || { richieste: [], iscrizioni: [], segnalazioni: [], domande: [], risposte: [], waitlist: [] };
  const giorniFa = n => new Date(Date.now() - n * 86400000);
  const dataOra = s => s ? new Date(s).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—";
  const dataBreve = s => s ? new Date(s).toLocaleDateString("it-IT") : "—";

  /* Una risposta può essere attaccata a una domanda del database
     (domanda_id) oppure a una guida che vive nel repository
     (domanda_chiave, per esempio "k3"). */
  const rispostePer = k => D().risposte.filter(r => (r.domanda_id || r.domanda_chiave) === k);
  const pubblicate = rr => rr.filter(r => r.stato === "pubblicata");
  const inAttesa = rr => rr.filter(r => r.stato === "in_attesa");

  function tutteLeDomande() {
    const remote = D().domande.map(d => ({
      chiave: d.id,
      tipo: d.tipo === "guida" ? "guida" : "utente",
      cat: d.categoria,
      data: (d.creato_il || "").slice(0, 10),
      domanda: d.domanda,
      keyword: d.keyword,
      rimossa: d.stato === "rimossa",
      motivoRimozione: d.motivo_rimozione,
      nelDatabase: true,
      risposte: rispostePer(d.id)
    }));
    /* Le guide del repository non sono righe di database, ma
       possono raccogliere integrazioni dei professionisti: qui
       compaiono per poterle moderare. */
    const repo = (window.STAFF_FAQS || []).map(s => ({
      chiave: s.id, tipo: "repo", cat: s.cat, data: s.data,
      domanda: s.domanda, keyword: s.keyword,
      rimossa: false, nelDatabase: false,
      risposte: rispostePer(s.id)
    }));
    return [...remote, ...repo];
  }

  const codaModerazione = () => D().risposte.filter(r => r.stato === "in_attesa").length;
  const segnalazioniAperte = () => D().segnalazioni.filter(s => s.stato === "aperta").length;
  const richiesteNuove = () => D().richieste.filter(r => r.stato === "nuova").length;

  /* ---------------- TAB 1 · KPI ---------------- */
  function kpiView() {
    const d = D();
    const domande = tutteLeDomande();
    const rispPubbl = d.risposte.filter(r => r.stato === "pubblicata");
    const votiTot = rispPubbl.reduce((n, r) => n + (r.voti || 0), 0);
    const verificati = d.iscrizioni.filter(i => i.stato_verifica === "verificato").length;
    const daVerificare = d.iscrizioni.filter(i => i.stato_verifica === "in_attesa").length;
    const recenti = d.richieste.filter(r => new Date(r.creato_il) > giorniFa(30)).length;
    const nonNotificate = d.richieste.filter(r => !r.notifica_inviata).length;
    const senzaRisposta = domande.filter(f => f.tipo === "utente" && !f.rimossa && !pubblicate(f.risposte).length).length;
    const domandeUtente = domande.filter(f => f.tipo === "utente" && !f.rimossa).length;

    const perRamo = {};
    d.richieste.forEach(r => { perRamo[r.ramo || "—"] = (perRamo[r.ramo || "—"] || 0) + 1; });
    const maxRamo = Math.max(1, ...Object.values(perRamo));

    const tile = (v, l, hint) => `
      <div class="kpi-tile"><strong>${v}</strong><span>${l}</span>${hint ? `<em>${hint}</em>` : ""}</div>`;

    return `
    <div class="kpi-grid">
      ${tile(d.richieste.length, "Richieste ricevute", `${recenti} negli ultimi 30 giorni · ${richiesteNuove()} da prendere in carico`)}
      ${tile(d.iscrizioni.length, "Iscrizioni professionisti", `${verificati} verificati · ${daVerificare} da verificare`)}
      ${tile(domandeUtente, "Domande degli utenti", senzaRisposta ? `⚠️ ${senzaRisposta} ancora senza risposta` : "tutte con almeno una risposta")}
      ${tile(rispPubbl.length, "Risposte pubblicate", `${codaModerazione()} in attesa di approvazione`)}
      ${tile(votiTot, "Voti “utile”", "segnale di qualità dei contenuti")}
      ${tile(d.domande.filter(x => x.tipo === "guida" && x.stato === "pubblicata").length, "Guide dalla console", `${(window.STAFF_FAQS || []).length} guide dal repository`)}
      ${tile(segnalazioniAperte(), "Segnalazioni aperte", segnalazioniAperte() ? "⚠️ da esaminare" : "nessuna in coda")}
      ${tile(d.waitlist.length, "Iscritti waitlist app", "email raccolte con consenso")}
    </div>

    ${nonNotificate ? `
    <div class="legal-warning" style="margin-top:1.2rem">
      <strong>${nonNotificate} richiest${nonNotificate === 1 ? "a" : "e"} senza avviso inviato.</strong>
      Il contatto è salvato e lo trovi nella scheda Richieste — è l'email o il messaggio Telegram
      a non essere partito. Controlla i segreti di notifica del progetto Supabase.
    </div>` : ""}

    <div class="grid-2" style="align-items:start;margin-top:1.2rem">
      <div class="card">
        <h3>📈 Copertura della bacheca</h3>
        <p class="muted" style="font-size:.85rem">Percentuale di domande degli utenti con almeno una risposta pubblicata. È la metrica che tiene in piedi la promessa del portale.</p>
        ${(() => {
          const tot = domandeUtente || 1;
          const pct = Math.round((domandeUtente - senzaRisposta) / tot * 100);
          return `<div class="progressbar" style="margin-top:.6rem"><i style="width:${domandeUtente ? pct : 0}%"></i></div>
                  <p style="font-size:1.6rem;font-family:var(--font-display);font-weight:800;margin:.5rem 0 0">${domandeUtente ? pct + "%" : "—"}</p>`;
        })()}
      </div>
      <div class="card">
        <h3>🎯 Richieste per ramo</h3>
        ${Object.keys(perRamo).length ? Object.entries(perRamo).sort((a, b) => b[1] - a[1]).map(([r, n]) => `
          <div class="bar-row">
            <span class="bar-label">${esc(r)}</span>
            <span class="bar-track"><i style="width:${Math.round(n / maxRamo * 100)}%"></i></span>
            <span class="bar-val">${n}</span>
          </div>`).join("") : `<p class="muted" style="font-size:.9rem">Nessuna richiesta ancora ricevuta.</p>`}
      </div>
    </div>

    <div class="card" style="margin-top:1.2rem">
      <h3>🏆 Chi risponde di più</h3>
      <p class="muted" style="font-size:.85rem">Classifica costruita sulle risposte pubblicate e sui voti che hanno ricevuto.</p>
      ${(() => {
        const per = {};
        rispPubbl.forEach(r => {
          const k = r.autore_nome || "—";
          per[k] = per[k] || { nome: k, ruolo: r.autore_ruolo, azienda: r.autore_azienda, n: 0, voti: 0, migliori: 0 };
          per[k].n++; per[k].voti += r.voti || 0; if (r.migliore) per[k].migliori++;
        });
        const lista = Object.values(per).sort((a, b) => (b.migliori - a.migliori) || (b.voti - a.voti) || (b.n - a.n));
        return lista.length ? lista.map((b, i) => `
          <div class="leader-row">
            <span class="leader-rank ${i === 0 ? "gold" : ""}">${i + 1}</span>
            <span class="mini-avatar">${esc(QF().initials(b.nome))}</span>
            <span class="leader-info"><strong>${esc(b.nome)}</strong>
              <span>${esc([b.ruolo, b.azienda].filter(Boolean).join(" · ") || "—")} · ${b.n} rispost${b.n === 1 ? "a" : "e"}</span></span>
            <span class="leader-pts">▲ ${b.voti}${b.migliori ? ` · ★ ${b.migliori}` : ""}</span>
          </div>`).join("") : `<p class="muted">Nessuna risposta pubblicata.</p>`;
      })()}
    </div>`;
  }

  /* ---------------- TAB 2 · RICHIESTE ---------------- */
  const STATI_RICHIESTA = { nuova: "🔴 Nuova", presa_in_carico: "🟡 Presa in carico", chiusa: "✅ Chiusa" };

  function richiesteView() {
    const filtri = { nuova: "Da prendere in carico", presa_in_carico: "In lavorazione", chiusa: "Chiuse", tutte: "Tutte" };
    const lista = filtroRichieste === "tutte"
      ? D().richieste
      : D().richieste.filter(r => r.stato === filtroRichieste);

    return `
    <p class="admin-hint">Queste sono le richieste arrivate dal sito. Sono salvate nel database <em>prima</em> che si provi a inviare qualunque avviso: se una notifica non parte il contatto resta comunque qui, e non si perde.</p>

    <div class="filterbar">
      ${Object.entries(filtri).map(([k, v]) => `<button class="chip ${filtroRichieste === k ? "active" : ""}" data-filtrorich="${k}">${v}${k !== "tutte" ? ` (${D().richieste.filter(r => r.stato === k).length})` : ""}</button>`).join("")}
    </div>

    ${lista.length ? lista.map(r => `
      <div class="card admin-q">
        <div class="qa-meta">
          <span class="badge-cat">${STATI_RICHIESTA[r.stato] || r.stato}</span>
          <span class="badge-cat">${esc(r.tipo)}</span>
          ${r.ramo ? `<span class="badge-cat">${esc(r.ramo)}</span>` : ""}
          <span>${dataOra(r.creato_il)}</span>
          ${!r.notifica_inviata ? `<span class="pill">avviso non inviato</span>` : ""}
        </div>
        <h3 style="font-size:1.05rem;margin:.4rem 0">${esc(r.nome)}${r.citta ? ` · ${esc(r.citta)}` : ""}</h3>
        <table class="admin-kv">
          <tr><th>Email</th><td><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></td></tr>
          ${r.telefono ? `<tr><th>Telefono</th><td><a href="tel:${esc(String(r.telefono).replace(/\s/g, ""))}">${esc(r.telefono)}</a></td></tr>` : ""}
          ${r.destinatario_nome ? `<tr><th>Diretta a</th><td>${esc(r.destinatario_nome)}${r.destinatario_email ? ` · ${esc(r.destinatario_email)}` : ""}</td></tr>` : ""}
          ${r.note ? `<tr><th>Note</th><td>${esc(r.note)}</td></tr>` : ""}
          <tr><th>Consenso privacy</th><td>${r.consenso_privacy ? "✓ prestato" : "✕ assente"}${r.consenso_testo ? ` — <span class="muted">${esc(String(r.consenso_testo).slice(0, 180))}</span>` : ""}</td></tr>
          ${r.notifica_errore ? `<tr><th>Errore avviso</th><td><code>${esc(r.notifica_errore)}</code></td></tr>` : ""}
        </table>
        <div class="admin-actions">
          ${Object.entries(STATI_RICHIESTA).map(([k, v]) => `
            <button class="chip ${r.stato === k ? "active" : ""}" data-statorich="${r.id}:${k}">${v}</button>`).join("")}
        </div>
      </div>`).join("") : `<p class="muted">Nessuna richiesta con questo filtro.</p>`}`;
  }

  /* ---------------- TAB 3 · PROFESSIONISTI ---------------- */
  const STATI = { verificato: "✓ Verificato", in_attesa: "⏳ In attesa", respinto: "✕ Respinto" };

  function proView() {
    const iscrizioni = D().iscrizioni;
    const vetrina = QF().DB.brokers || [];

    return `
    <p class="admin-hint">Il badge “Verificato RUI” si concede solo dopo aver letto il nominativo sul
    <a href="https://servizi.ivass.it/RuirPubblica/" target="_blank" rel="noopener">registro pubblico IVASS</a>.
    Approvare senza aver controllato significa attestare pubblicamente un'iscrizione che non si è verificata.</p>

    ${iscrizioni.length ? iscrizioni.map(p => `
      <div class="card admin-q">
        <div class="qa-meta">
          <span class="badge-cat">${STATI[p.stato_verifica] || p.stato_verifica}</span>
          <span>iscritto il ${dataOra(p.creato_il)}</span>
          ${p.verificato_il ? `<span>· verificato il ${dataBreve(p.verificato_il)}</span>` : ""}
        </div>
        <h3 style="margin:.4rem 0 .2rem">${esc(p.nome)}</h3>
        <p class="muted" style="font-size:.88rem;margin:0 0 .6rem">${esc(p.ruolo || "—")} · ${esc(p.azienda || "—")} · ${esc(p.citta || "—")}</p>
        <table class="admin-kv">
          <tr><th>Numero RUI</th><td>${p.rui_numero ? `<code>${esc(p.rui_numero)}</code>` : `<span class="rui-pending">non dichiarato</span>`}</td></tr>
          <tr><th>Sezione</th><td>${esc(p.rui_sezione || "—")}</td></tr>
          <tr><th>Iscritto dal</th><td>${dataBreve(p.rui_dal)}</td></tr>
          <tr><th>Opera per conto di</th><td>${esc(p.opera_per_conto || "—")}</td></tr>
          <tr><th>Contatti</th><td>${esc(p.telefono || "—")} · <a href="mailto:${esc(p.email)}">${esc(p.email)}</a></td></tr>
          ${p.specializzazioni && p.specializzazioni.length ? `<tr><th>Specializzazioni</th><td>${esc(p.specializzazioni.join(", "))}</td></tr>` : ""}
          ${p.bio ? `<tr><th>Presentazione</th><td>${esc(p.bio)}</td></tr>` : ""}
          <tr><th>Dichiarazioni</th><td>${p.consenso_rui ? "✓ iscrizione RUI" : "✕ iscrizione RUI"} · ${p.consenso_termini ? "✓ termini" : "✕ termini"}</td></tr>
          ${p.note_admin ? `<tr><th>Nota interna</th><td>${esc(p.note_admin)}</td></tr>` : ""}
        </table>
        <div class="admin-actions">
          ${Object.entries(STATI).map(([k, v]) => `
            <button class="chip ${p.stato_verifica === k ? "active" : ""}" data-verifica="${p.id}:${k}">${v}</button>`).join("")}
        </div>
        ${!p.rui_numero ? `<p class="privacy-hint">Senza numero RUI non c'è nulla da confrontare sul registro: qui si può solo respingere o chiedere il dato all'interessato.</p>` : ""}
      </div>`).join("") : `<p class="muted">Nessuna iscrizione ricevuta dal sito.</p>`}

    <div class="card" style="margin-top:1.4rem">
      <h3>🪪 Tessere in vetrina (${vetrina.length})</h3>
      <p class="muted" style="font-size:.85rem">Queste schede vivono nel repository, in <code>assets/js/intermediari.js</code>: si modificano nel codice, dove ogni cambiamento resta tracciato. Da qui sono in sola lettura.</p>
      ${vetrina.map(b => `
        <div class="lead-row">
          <span class="mini-avatar">${esc(QF().initials(b.nome))}</span>
          <span class="leader-info">
            <strong>${esc(b.nome)}</strong>
            <span>${esc(b.ruolo || "—")} · ${QF().ruiLabel ? QF().ruiLabel(b) : esc(b.rui || "RUI non inserito")}</span>
          </span>
          <span class="pill">${STATI[b.statoVerifica] || "⏳ In attesa"}</span>
        </div>`).join("") || `<p class="muted">Nessuna tessera.</p>`}
    </div>`;
  }

  /* ---------------- TAB 4 · MODERAZIONE BACHECA ---------------- */
  function bachecaView() {
    const filtri = {
      attesa: "Da approvare",
      utente: "Domande utenti",
      guida: "Guide della console",
      repo: "Guide del repository",
      aperte: "Senza risposta",
      tutte: "Tutte"
    };
    let domande = tutteLeDomande();
    if (modFiltro === "attesa") domande = domande.filter(f => inAttesa(f.risposte).length);
    else if (modFiltro === "aperte") domande = domande.filter(f => f.tipo === "utente" && !f.rimossa && !pubblicate(f.risposte).length);
    else if (modFiltro !== "tutte") domande = domande.filter(f => f.tipo === modFiltro);

    const badge = t => ({
      guida: `<span class="badge-cat badge-staff">📌 Guida</span>`,
      repo: `<span class="badge-cat badge-staff">📦 Repository</span>`,
      utente: `<span class="badge-cat">🙋 Utente</span>`
    }[t] || "");

    const STATI_R = {
      in_attesa: `<span class="pill">⏳ in attesa</span>`,
      pubblicata: "",
      rimossa: `<span class="pill">🚫 rimossa</span>`
    };

    return `
    <p class="admin-hint">Le risposte degli intermediari nascono <strong>in attesa di approvazione</strong>: finché non le pubblichi non le vede nessuno. Senza autenticazione chiunque potrebbe firmarsi con il nome di un professionista reale, e su un sito che vive di identità verificabile sarebbe il danno peggiore. Ogni rimozione chiede una motivazione, come prevede l'art. 17 del Digital Services Act.</p>

    <div class="filterbar">
      ${Object.entries(filtri).map(([k, v]) => `<button class="chip ${modFiltro === k ? "active" : ""}" data-modfiltro="${k}">${v}${k === "attesa" && codaModerazione() ? ` <span class="notif">${codaModerazione()}</span>` : ""}</button>`).join("")}
    </div>

    ${domande.map(f => `
      <div class="card admin-q ${f.rimossa ? "admin-rimossa" : ""}">
        <div class="qa-meta">${badge(f.tipo)}<span class="badge-cat">${esc(f.cat)}</span><span>${esc(f.data)}</span>
          <!-- il conteggio riguarda gli intermediari: la risposta
               redazionale di una guida non è una riga di database -->
          <span>· ${pubblicate(f.risposte).length} rispost${pubblicate(f.risposte).length === 1 ? "a" : "e"} di intermediari</span>
          ${inAttesa(f.risposte).length ? `<span class="pill">⏳ ${inAttesa(f.risposte).length} da approvare</span>` : ""}
          ${f.keyword ? `<span class="pill">kw: ${esc(f.keyword)}</span>` : ""}
          ${f.rimossa ? `<span class="pill">🚫 rimossa</span>` : ""}
        </div>
        <h3 style="font-size:1.02rem;margin:.4rem 0">${esc(f.domanda)}</h3>
        ${f.rimossa && f.motivoRimozione ? `<p class="privacy-hint">Motivazione registrata: ${esc(f.motivoRimozione)}</p>` : ""}
        <div class="admin-q-actions">
          ${f.tipo === "repo" ? `<span class="muted" style="font-size:.78rem">Contenuto del repository: si modifica in <code>assets/js/staff-questions.js</code>.</span>`
            : !f.rimossa ? `<button class="btn btn-ghost btn-sm danger" data-del-domanda="${f.chiave}">🗑 Rimuovi la domanda</button>` : ""}
        </div>

        ${f.risposte.length ? f.risposte.map(r => `
          <div class="admin-a ${r.migliore ? "best" : ""}">
            <div class="admin-a-head">
              <span class="qa-author">
                <span class="mini-avatar">${esc(QF().initials(r.autore_nome || "?"))}</span>
                ${esc(r.autore_nome || "Autore non indicato")}
                ${r.autore_ruolo || r.autore_azienda ? `<span class="level-badge badge-qualifica">${esc([r.autore_ruolo, r.autore_azienda].filter(Boolean).join(" · "))}</span>` : ""}
                ${r.autore_rui ? `<span class="pill">RUI ${esc(r.autore_rui)}</span>` : `<span class="pill">RUI non dichiarato</span>`}
                ${r.migliore ? `<span class="badge-cat" style="background:var(--gold-100);color:#9A6B14">★ Migliore risposta</span>` : ""}
                ${STATI_R[r.stato] || ""}
              </span>
              <span class="muted" style="font-size:.75rem">▲ ${r.voti || 0} · ${dataBreve(r.creato_il)}</span>
            </div>
            <p class="admin-a-text">${esc(r.testo || "")}</p>
            ${r.autore_email ? `<p class="muted" style="font-size:.75rem">Contatto dichiarato: ${esc(r.autore_email)}</p>` : ""}
            ${r.stato === "rimossa" ? `<p class="privacy-hint">Rimossa il ${dataOra(r.moderata_il)} — motivazione: ${esc(r.motivo_rimozione || "—")}</p>` : ""}
            <div class="admin-a-actions">
              ${r.stato === "in_attesa" ? `<button class="btn btn-primary btn-sm" data-pubblica="${r.id}">✓ Pubblica</button>` : ""}
              ${r.stato === "rimossa" ? `<button class="btn btn-outline btn-sm" data-pubblica="${r.id}">↩︎ Ripristina</button>` : ""}
              ${r.stato === "pubblicata" ? `<button class="btn btn-outline btn-sm" data-best="${r.id}" ${r.migliore ? "disabled" : ""}>★ ${r.migliore ? "Già premiata" : "Migliore risposta"}</button>` : ""}
              ${r.stato !== "rimossa" ? `<button class="btn btn-ghost btn-sm danger" data-del-risposta="${r.id}">🗑 Rimuovi</button>` : ""}
            </div>
          </div>`).join("") : `<p class="muted" style="font-size:.88rem;font-style:italic">Nessuna risposta dagli intermediari.</p>`}
      </div>`).join("") || `<p class="muted">Nessuna domanda per questo filtro.</p>`}`;
  }

  /* ---------------- TAB 5 · KEYWORD → GUIDA ---------------- */
  /* Mini formattatore: evita di scrivere HTML a mano nel form.
     ## titolo · - elenco · 1. elenco numerato · **grassetto** */
  function mdToHtml(txt) {
    const righe = String(txt).replace(/\r/g, "").split("\n");
    let out = "", lista = null;
    const inline = s => esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
    const chiudi = () => { if (lista) { out += `</${lista}>`; lista = null; } };
    for (const r of righe) {
      const t = r.trim();
      if (!t) { chiudi(); continue; }
      if (t.startsWith("## ")) { chiudi(); out += `<h4>${inline(t.slice(3))}</h4>`; }
      else if (/^[-*]\s+/.test(t)) { if (lista !== "ul") { chiudi(); out += "<ul>"; lista = "ul"; } out += `<li>${inline(t.replace(/^[-*]\s+/, ""))}</li>`; }
      else if (/^\d+[.)]\s+/.test(t)) { if (lista !== "ol") { chiudi(); out += "<ol>"; lista = "ol"; } out += `<li>${inline(t.replace(/^\d+[.)]\s+/, ""))}</li>`; }
      else { chiudi(); out += `<p>${inline(t)}</p>`; }
    }
    chiudi();
    return out;
  }

  function keywordView() {
    const guide = D().domande.filter(d => d.tipo === "guida" && d.stato === "pubblicata");
    return `
    <p class="admin-hint">Pubblica una keyword come <strong>guida QuotaFacile</strong>: esce in cima alla bacheca, a firma della redazione, ed è integrabile dagli intermediari. Regola d'oro: la prima riga della risposta deve contenere la risposta secca e il numero chiave — è quella che Google prende per lo snippet.</p>

    <div class="grid-2" style="align-items:start">
      <div class="card">
        <h3>🎯 Nuova guida</h3>
        <form id="kw-form">
          <div class="field"><label for="kw-keyword">Keyword target *</label>
            <input id="kw-keyword" required placeholder="es. assicurazione drone obbligatoria"></div>
          <div class="grid-2" style="gap:.6rem;margin-top:.6rem">
            <div class="field"><label for="kw-vol">Volume stimato</label><input id="kw-vol" placeholder="≈ 500–1.200/mese"></div>
            <div class="field"><label for="kw-diff">Difficoltà</label>
              <select id="kw-diff">${["Molto bassa", "Bassa", "Medio-bassa", "Media", "Alta"].map(o => `<option>${o}</option>`).join("")}</select></div>
          </div>
          <div class="field" style="margin-top:.6rem"><label for="kw-cat">Categoria</label>
            <select id="kw-cat">${["Auto", "Casa", "Vita", "Impresa", "Salute", "Viaggi"].map(c => `<option>${c}</option>`).join("")}</select></div>
          <div class="field" style="margin-top:.6rem"><label for="kw-domanda">Domanda (H1) *</label>
            <textarea id="kw-domanda" required rows="2" placeholder="Scrivila come la scriverebbe l'utente, includendo la keyword"></textarea></div>
          <div class="field" style="margin-top:.6rem"><label for="kw-titolo">Titolo SEO <span class="muted" id="kw-len-t">(0/60)</span></label>
            <input id="kw-titolo" maxlength="70" placeholder="Max ~60 caratteri, keyword all'inizio"></div>
          <div class="field" style="margin-top:.6rem"><label for="kw-meta">Meta description <span class="muted" id="kw-len-m">(0/155)</span></label>
            <textarea id="kw-meta" rows="2" maxlength="170" placeholder="La risposta secca in una frase + il beneficio"></textarea></div>
          <div class="field" style="margin-top:.6rem"><label for="kw-risposta">Risposta *</label>
            <textarea id="kw-risposta" required rows="12" placeholder="Prima riga: la risposta secca con il numero chiave.

## Un sottotitolo
- un punto
- un altro punto

Usa **grassetto** per i numeri che contano."></textarea>
            <p class="privacy-hint"><code>## titolo</code> · <code>- elenco</code> · <code>1. elenco numerato</code> · <code>**grassetto**</code></p>
          </div>
          <div style="display:flex;gap:.5rem;margin-top:.9rem;flex-wrap:wrap">
            <button class="btn btn-outline" type="button" id="kw-preview">👁 Anteprima</button>
            <button class="btn btn-primary" style="flex:1" type="submit">Pubblica in bacheca</button>
          </div>
        </form>
      </div>

      <div>
        <!-- riempito da bind() senza ri-renderizzare la pagina:
             un render completo azzererebbe i campi del form -->
        <div id="kw-preview-box"></div>

        <div class="card">
          <h3>📋 Guide pubblicate dalla console (${guide.length})</h3>
          ${guide.map(g => `
            <div class="lead-row">
              <span class="lead-icon">📌</span>
              <span class="leader-info">
                <strong>${esc(g.domanda)}</strong>
                <span>kw: ${esc(g.keyword || "—")}${g.volume ? " · " + esc(g.volume) : ""}${g.difficolta ? " · difficoltà " + esc(g.difficolta) : ""} · ${dataBreve(g.creato_il)}</span>
              </span>
              <button class="btn btn-ghost btn-sm danger" data-del-domanda="${g.id}">Ritira</button>
            </div>`).join("") || `<p class="muted" style="font-size:.9rem">Nessuna guida pubblicata da qui.</p>`}
          <p class="privacy-hint">Le nove guide iniziali vivono nel repository e non compaiono in questo elenco: si modificano in <code>assets/js/staff-questions.js</code>.</p>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- TAB 6 · SEGNALAZIONI (DSA) ---------------- */
  function segnalazioniView() {
    const lista = D().segnalazioni;
    /* Il bersaglio è "risposta:<id>" quando la segnalazione
       riguarda un contenuto del database: in quel caso si può
       rimuovere davvero, non solo chiudere la pratica. */
    const rispostaBersaglio = t => String(t || "").startsWith("risposta:") ? String(t).slice(9) : null;

    return `
    <p class="admin-hint">Coda alimentata dal pulsante 🚩 <em>Segnala</em> presente su ogni risposta. Il DSA richiede esame tempestivo e non arbitrario, e una motivazione all'autore in caso di rimozione.</p>
    ${lista.length ? lista.map(s => {
      const rid = rispostaBersaglio(s.target);
      const r = rid ? D().risposte.find(x => x.id === rid) : null;
      return `
      <div class="card admin-seg ${s.stato}">
        <div class="qa-meta">
          <span class="badge-cat">${s.stato === "aperta" ? "🔴 Aperta" : s.stato === "accolta" ? "✅ Accolta" : "⚪ Respinta"}</span>
          <span>${dataOra(s.creato_il)}</span>
          <span>· contenuto <code>${esc(s.target)}</code></span>
        </div>
        <h3 style="font-size:1rem;margin:.4rem 0">${esc(s.motivo)}</h3>
        ${s.dettaglio ? `<p class="muted" style="font-size:.9rem">${esc(s.dettaglio)}</p>` : ""}
        ${s.email_segnalante ? `<p class="muted" style="font-size:.78rem">Segnalante: ${esc(s.email_segnalante)}</p>` : ""}
        ${r ? `
        <div class="admin-a ${r.stato === "rimossa" ? "" : ""}">
          <div class="admin-a-head"><span class="qa-author">${esc(r.autore_nome || "—")}</span>
            <span class="muted" style="font-size:.75rem">${esc(r.stato)}</span></div>
          <p class="admin-a-text">${esc(r.testo || "")}</p>
        </div>` : rid ? `<p class="privacy-hint">La risposta segnalata non è più nell'elenco caricato.</p>`
        : `<p class="privacy-hint">La segnalazione riguarda un contenuto redazionale del repository: qui si può registrare la decisione, la correzione si fa nel codice.</p>`}
        ${s.esito ? `<p class="privacy-hint">Esito registrato: ${esc(s.esito)}</p>` : ""}
        ${s.stato === "aperta" ? `
        <div class="admin-actions">
          ${r && r.stato !== "rimossa" ? `<button class="btn btn-outline btn-sm danger" data-seg-accogli="${s.id}:${r.id}">Accogli e rimuovi il contenuto</button>` : ""}
          <button class="btn btn-ghost btn-sm" data-seg-respingi="${s.id}">Respingi</button>
        </div>` : ""}
      </div>`;
    }).join("") : `<p class="muted">Nessuna segnalazione ricevuta.</p>`}`;
  }

  /* ---------------- SHELL ---------------- */
  const TABS = {
    kpi: ["📊 KPI", kpiView],
    richieste: ["📥 Richieste", richiesteView],
    professionisti: ["🪪 Professionisti", proView],
    bacheca: ["💬 Bacheca", bachecaView],
    keyword: ["🎯 Keyword → Guida", keywordView],
    segnalazioni: ["🚩 Segnalazioni", segnalazioniView]
  };

  const NOTIFICHE = {
    richieste: richiesteNuove,
    bacheca: codaModerazione,
    segnalazioni: segnalazioniAperte
  };

  function view(sub) {
    if (!isAuth()) return loginView();
    if (sub && TABS[sub]) tab = sub;

    const testa = `
      <div class="admin-top">
        <div>
          <span class="eyebrow">Console riservata</span>
          <h1 style="font-size:clamp(1.6rem,3.5vw,2.2rem);margin:0">Amministrazione QuotaFacile</h1>
        </div>
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-ghost btn-sm" id="admin-ricarica">↻ Aggiorna</button>
          <button class="btn btn-ghost btn-sm" id="admin-logout">Esci</button>
        </div>
      </div>`;

    if (fase !== "pronto") {
      return `
      <section class="section admin-shell"><div class="container">
        ${testa}
        ${fase === "errore" ? `
          <div class="legal-warning" role="alert">
            <strong>Dati non disponibili.</strong> ${esc(avviso || "")}
            <br><button class="btn btn-outline btn-sm" style="margin-top:.6rem" id="admin-riprova">Riprova</button>
          </div>`
        : `<div class="card"><p class="muted">Caricamento della panoramica dal database…</p></div>`}
      </div></section>`;
    }

    return `
    <section class="section admin-shell">
      <div class="container">
        ${testa}

        <div class="legal-warning" style="background:var(--green-50);border-color:var(--green-100)">
          <strong>Dati in tempo reale.</strong> Richieste, iscrizioni, bacheca e segnalazioni arrivano
          dal database Supabase e sono le stesse per chiunque apra questa console.
          Aggiornati alle ${dataOra(dati.letteIl)}.
        </div>

        <div class="filterbar" role="tablist">
          ${Object.entries(TABS).map(([k, [label]]) => {
            const n = NOTIFICHE[k] ? NOTIFICHE[k]() : 0;
            return `<button class="chip ${tab === k ? "active" : ""}" data-admintab="${k}" role="tab">
              ${label}${n ? ` <span class="notif">${n}</span>` : ""}</button>`;
          }).join("")}
        </div>

        ${TABS[tab][1]()}
      </div>
    </section>`;
  }

  /* ---------------- EVENTI ---------------- */
  function bind() {
    const $ = s => document.querySelector(s);

    $("#admin-login-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const val = $("#adm-pass").value.trim();
      if (!val) return;
      try { sessionStorage.setItem(SESSION_KEY, val); } catch (_) { /* no-op */ }
      avviso = null;
      await carica();
      /* se la chiave era sbagliata carica() l'ha già rimossa e
         ha impostato l'avviso: non serve dire altro */
    });

    $("#admin-logout")?.addEventListener("click", () => {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* no-op */ }
      dati = null; fase = "vuoto"; avviso = null;
      QF().render();
    });

    $("#admin-ricarica")?.addEventListener("click", carica);
    $("#admin-riprova")?.addEventListener("click", carica);

    /* Se si entra in #/admin con la chiave già in sessione, la
       panoramica si carica da sola. */
    if (isAuth() && fase === "vuoto") carica();

    document.querySelectorAll("[data-admintab]").forEach(b =>
      b.addEventListener("click", () => { tab = b.dataset.admintab; QF().render(); }));
    document.querySelectorAll("[data-modfiltro]").forEach(b =>
      b.addEventListener("click", () => { modFiltro = b.dataset.modfiltro; QF().render(); }));
    document.querySelectorAll("[data-filtrorich]").forEach(b =>
      b.addEventListener("click", () => { filtroRichieste = b.dataset.filtrorich; QF().render(); }));

    /* stato di una richiesta */
    document.querySelectorAll("[data-statorich]").forEach(b =>
      b.addEventListener("click", () => {
        const i = b.dataset.statorich.lastIndexOf(":");
        const id = b.dataset.statorich.slice(0, i), stato = b.dataset.statorich.slice(i + 1);
        agisci("aggiorna-richiesta", { id, stato }, `Richiesta: ${STATI_RICHIESTA[stato]}`);
      }));

    /* verifica RUI di un professionista iscritto */
    document.querySelectorAll("[data-verifica]").forEach(b =>
      b.addEventListener("click", () => {
        const i = b.dataset.verifica.lastIndexOf(":");
        const id = b.dataset.verifica.slice(0, i), stato = b.dataset.verifica.slice(i + 1);
        if (stato === "verificato" &&
            !confirm("Confermi di aver trovato questo nominativo sul registro pubblico IVASS?\n\nIl badge “Verificato RUI” è un'attestazione pubblica.")) return;
        const note = stato === "respinto" ? (prompt("Nota interna sul motivo del rifiuto (facoltativa):") || "") : "";
        agisci("verifica-pro", { id, stato, note }, `Stato aggiornato: ${STATI[stato]}`);
      }));

    /* approvazione / ripristino di una risposta */
    document.querySelectorAll("[data-pubblica]").forEach(b =>
      b.addEventListener("click", () =>
        agisci("modera-risposta", { id: b.dataset.pubblica, decisione: "pubblica" }, "Risposta pubblicata.")));

    /* badge migliore risposta */
    document.querySelectorAll("[data-best]").forEach(b =>
      b.addEventListener("click", () =>
        agisci("modera-risposta", { id: b.dataset.best, decisione: "migliore" }, "Badge assegnato 🏆")));

    /* rimozione di una risposta, con motivazione (art. 17 DSA) */
    document.querySelectorAll("[data-del-risposta]").forEach(b =>
      b.addEventListener("click", () => {
        const motivo = prompt("Motivo della rimozione (dovuto all'autore del contenuto):");
        if (motivo === null) return;
        if (!motivo.trim()) { QF().toast("Serve una motivazione per rimuovere un contenuto."); return; }
        agisci("modera-risposta", { id: b.dataset.delRisposta, decisione: "rimuovi", motivo: motivo.trim() }, "Risposta rimossa e motivazione registrata.");
      }));

    /* rimozione di una domanda (utente o guida della console) */
    document.querySelectorAll("[data-del-domanda]").forEach(b =>
      b.addEventListener("click", () => {
        const motivo = prompt("Motivo della rimozione della domanda:");
        if (motivo === null) return;
        if (!motivo.trim()) { QF().toast("Serve una motivazione."); return; }
        agisci("modera-domanda", { id: b.dataset.delDomanda, motivo: motivo.trim() }, "Domanda rimossa dalla bacheca.");
      }));

    /* contatori lunghezza SEO */
    const conta = (input, out, max) => {
      const el = $(input), o = $(out);
      if (!el || !o) return;
      const upd = () => { o.textContent = `(${el.value.length}/${max})`; o.style.color = el.value.length > max ? "var(--danger)" : ""; };
      el.addEventListener("input", upd); upd();
    };
    conta("#kw-titolo", "#kw-len-t", 60);
    conta("#kw-meta", "#kw-len-m", 155);

    const raccogliKw = () => ({
      categoria: $("#kw-cat").value,
      keyword: $("#kw-keyword").value.trim(),
      volume: $("#kw-vol").value.trim(),
      difficolta: $("#kw-diff").value,
      titolo: $("#kw-titolo").value.trim(),
      meta: $("#kw-meta").value.trim(),
      domanda: $("#kw-domanda").value.trim(),
      risposta: mdToHtml($("#kw-risposta").value)
    });

    $("#kw-preview")?.addEventListener("click", () => {
      if (!$("#kw-domanda").value.trim() || !$("#kw-risposta").value.trim()) { QF().toast("Servono almeno domanda e risposta."); return; }
      const a = raccogliKw();
      $("#kw-preview-box").innerHTML = `
        <div class="card" style="margin-bottom:1rem">
          <h3>Anteprima</h3>
          <div class="qa-meta"><span class="badge-cat badge-staff">📌 Guida QuotaFacile</span><span class="badge-cat">${esc(a.categoria)}</span></div>
          <h3 style="font-size:1.15rem;margin:.5rem 0">${esc(a.domanda)}</h3>
          <p class="muted" style="font-size:.8rem">Come apparirà su Google:</p>
          <div class="serp-preview">
            <div class="serp-url">www.quotafacile.it › bacheca</div>
            <div class="serp-title">${esc(a.titolo || a.domanda)}</div>
            <div class="serp-desc">${esc(a.meta || "")}</div>
          </div>
          <div class="answer-rich" style="margin-top:.8rem">${a.risposta}</div>
        </div>`;
      $("#kw-preview-box").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    $("#kw-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = "Pubblicazione…"; }
      const ok = await agisci("pubblica-guida", raccogliKw(), "Guida pubblicata in cima alla bacheca 📌");
      if (!ok && btn) { btn.disabled = false; btn.textContent = "Pubblica in bacheca"; }
      /* la bacheca pubblica va ricaricata: la guida deve
         comparire anche ai visitatori, non solo qui */
      if (ok) window.QFBacheca?.carica();
    });

    /* segnalazioni */
    document.querySelectorAll("[data-seg-respingi]").forEach(b =>
      b.addEventListener("click", () => {
        const nota = prompt("Motivazione della decisione (per il segnalante):");
        if (nota === null) return;
        agisci("chiudi-segnalazione", {
          id: b.dataset.segRespingi, stato: "respinta",
          esito: nota.trim() || "Segnalazione ritenuta infondata: il contenuto non viola i termini della piattaforma."
        }, "Segnalazione respinta.");
      }));

    document.querySelectorAll("[data-seg-accogli]").forEach(b =>
      b.addEventListener("click", async () => {
        const [sid, rid] = b.dataset.segAccogli.split(":");
        const motivo = prompt("Motivazione della rimozione (dovuta all'autore del contenuto):");
        if (motivo === null) return;
        if (!motivo.trim()) { QF().toast("Serve una motivazione."); return; }
        /* prima si rimuove il contenuto, poi si chiude la
           pratica: se la rimozione fallisce la segnalazione
           resta aperta invece di risultare gestita a vuoto */
        const e1 = await chiama("modera-risposta", { id: rid, decisione: "rimuovi", motivo: motivo.trim() });
        if (!e1.ok) { QF().toast(e1.errore || "Rimozione non riuscita."); return; }
        await agisci("chiudi-segnalazione", { id: sid, stato: "accolta", esito: motivo.trim() }, "Contenuto rimosso e segnalazione chiusa.");
        window.QFBacheca?.carica();
      }));
  }

  window.QF_ADMIN = { view, bind, mdToHtml };
})();
