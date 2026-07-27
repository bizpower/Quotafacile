/* ============================================================
   QuotaFacile — Area Admin (riservata)
   ------------------------------------------------------------
   Rotta: #/admin — non è linkata da nessuna parte nel sito.

   ⚠️ LEGGI QUESTO PRIMA DI FIDARTI DELL'ACCESSO
   Questa è una pagina statica: non esiste un server che possa
   custodire un segreto. La passphrase è confrontata nel browser
   contro il suo hash SHA-256 scritto qui sotto, quindi:
   - tiene fuori chi arriva per caso o prova a indovinare la rotta;
   - NON ferma chi apre i sorgenti e legge questo file, né chi
     scrive a mano nel localStorage.
   È un deterrente, non un controllo di accesso. Diventa vera
   sicurezza solo con un backend e un login server-side (vedi
   README, sezione Backend).

   Per cambiare la passphrase:
     node -e "console.log(require('crypto').createHash('sha256').update('LA-TUA-PASSPHRASE').digest('hex'))"
   e incolla il risultato in PASS_HASH.
   ============================================================ */
"use strict";

(function () {

  /* passphrase di default: quotafacile-admin-2026 — CAMBIALA */
  const PASS_HASH = "de95e1fa0b6c9831b8ad0aeeac954686ed6067366dbb5fecdb75d4bb91e84b8f";
  const PASS_HASH_DEFAULT = PASS_HASH;
  const SESSION_KEY = "qf_admin_sessione";

  const QF = () => window.QF;
  const esc = s => window.QF.esc(s);

  let tab = "kpi";
  let modFiltro = "tutte";

  /* ---------------- ACCESSO ---------------- */
  async function sha256hex(txt) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  const isAuth = () => sessionStorage.getItem(SESSION_KEY) === "1";

  function loginView() {
    return `
    <section class="section">
      <div class="container" style="max-width:440px">
        <div class="card admin-login">
          <div class="admin-lock">🔐</div>
          <h1 style="font-size:1.5rem;text-align:center">Area riservata</h1>
          <p class="muted" style="text-align:center;font-size:.9rem">Accesso alla console di gestione QuotaFacile.</p>
          <form id="admin-login-form">
            <div class="field"><label for="adm-pass">Passphrase</label>
              <input id="adm-pass" type="password" required autocomplete="current-password" placeholder="••••••••••">
            </div>
            <button class="btn btn-primary btn-block" style="margin-top:1rem" type="submit">Entra</button>
          </form>
          <p class="privacy-hint" style="margin-top:1.2rem">
            La sessione dura fino alla chiusura della scheda. Questo accesso è un deterrente,
            non un controllo di sicurezza: su un sito statico la verifica avviene nel browser.
            Serve un backend per renderlo reale.
          </p>
        </div>
      </div>
    </section>`;
  }

  /* ---------------- UTILITÀ DATI ---------------- */
  const d = DB => DB;
  const giorniFa = n => new Date(Date.now() - n * 86400000);

  /* Accesso unificato alle risposte, qualunque sia il tipo di domanda */
  function contenitoreRisposte(fid) {
    const DB = QF().DB;
    if (/^k/.test(fid)) return { arr: (DB.staffExtra[fid] = DB.staffExtra[fid] || []), offset: 1 };
    if (/^d\d+$/.test(fid)) return { arr: (DB.dailyExtra[fid] = DB.dailyExtra[fid] || []), offset: 1 };
    const f = DB.faqs.find(x => x.id === fid);
    return f ? { arr: f.risposte, offset: 0 } : null;
  }

  function tutteLeDomande() {
    const DB = QF().DB;
    return [
      ...QF().staffFaqs().map(f => ({ ...f, tipo: "staff" })),
      ...QF().publishedDaily().map(f => ({ ...f, tipo: "giorno" })),
      ...DB.faqs.map(f => ({ ...f, tipo: "community" }))
    ];
  }

  /* ---------------- TAB 1 · KPI ---------------- */
  function kpiView() {
    const DB = QF().DB;
    const domande = tutteLeDomande();
    const pro = DB.proProfile ? [DB.proProfile] : [];
    const tuttiPro = [...DB.brokers, ...pro];

    const risposteTot = domande.reduce((n, f) => n + f.risposte.length, 0);
    const rispostePro = domande.reduce((n, f) => n + f.risposte.filter(r => !r.auto).length, 0);
    const senzaRisposta = DB.faqs.filter(f => !f.risposte.length).length;
    const votiTot = domande.reduce((n, f) => n + f.risposte.reduce((m, r) => m + (r.voti || 0), 0), 0);
    const verificati = DB.brokers.filter(b => b.statoVerifica === "verificato").length;
    const inAttesa = tuttiPro.filter(b => b.statoVerifica !== "verificato").length;
    const segnAperte = DB.segnalazioni.filter(s => s.stato === "aperta").length;
    const recenti = DB.richieste.filter(r => new Date(r.data) > giorniFa(30)).length;

    const perRamo = {};
    DB.richieste.forEach(r => { perRamo[r.ramo || "—"] = (perRamo[r.ramo || "—"] || 0) + 1; });
    const maxRamo = Math.max(1, ...Object.values(perRamo));

    const tile = (v, l, hint) => `
      <div class="kpi-tile"><strong>${v}</strong><span>${l}</span>${hint ? `<em>${hint}</em>` : ""}</div>`;

    return `
    <div class="kpi-grid">
      ${tile(tuttiPro.length, "Professionisti iscritti", `${verificati} verificati · ${inAttesa} da verificare`)}
      ${tile(domande.length, "Domande in bacheca", `${QF().staffFaqs().length} guide · ${QF().dailyPublishedCount()} del giorno · ${DB.faqs.length} community`)}
      ${tile(risposteTot, "Risposte pubblicate", `${rispostePro} firmate da intermediari`)}
      ${tile(DB.richieste.length, "Richieste ricevute", `${recenti} negli ultimi 30 giorni`)}
      ${tile(votiTot, "Voti “utile”", "segnale di qualità dei contenuti")}
      ${tile(senzaRisposta, "Domande senza risposta", senzaRisposta ? "⚠️ opportunità per i pro" : "tutte coperte")}
      ${tile(segnAperte, "Segnalazioni aperte", segnAperte ? "⚠️ da esaminare" : "nessuna in coda")}
      ${tile((DB.notifiche || []).length, "Iscritti waitlist app", "email raccolte con consenso")}
    </div>

    <div class="grid-2" style="align-items:start;margin-top:1.2rem">
      <div class="card">
        <h3>📈 Copertura della bacheca</h3>
        <p class="muted" style="font-size:.85rem">Percentuale di domande della community con almeno una risposta di un intermediario. È la metrica che tiene in piedi la promessa del portale.</p>
        ${(() => {
          const tot = DB.faqs.length || 1;
          const pct = Math.round((DB.faqs.length - senzaRisposta) / tot * 100);
          return `<div class="progressbar" style="margin-top:.6rem"><i style="width:${pct}%"></i></div>
                  <p style="font-size:1.6rem;font-family:var(--font-display);font-weight:800;margin:.5rem 0 0">${pct}%</p>`;
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
      <h3>🏆 Classifica professionisti</h3>
      ${tuttiPro.sort((a, b) => b.punti - a.punti).map((b, i) => `
        <div class="leader-row">
          <span class="leader-rank ${i === 0 ? "gold" : ""}">${i + 1}</span>
          <span class="mini-avatar">${esc(QF().initials(b.nome))}</span>
          <span class="leader-info"><strong>${esc(b.nome)}</strong><span>${esc(b.ruolo)} · ${b.risposte || 0} risposte · ${QF().livello(b.punti || 0)}</span></span>
          <span class="leader-pts">${b.punti || 0} pt</span>
        </div>`).join("") || `<p class="muted">Nessun professionista.</p>`}
    </div>`;
  }

  /* ---------------- TAB 2 · PROFESSIONISTI ---------------- */
  const STATI = { verificato: "✓ Verificato", in_attesa: "⏳ In attesa", respinto: "✕ Respinto" };

  function proView() {
    const DB = QF().DB;
    const lista = [...DB.brokers, ...(DB.proProfile ? [DB.proProfile] : [])];
    return `
    <p class="admin-hint">Il badge “Verificato RUI” compare sulla tessera solo se lo stato è <strong>Verificato</strong> <em>e</em> il numero RUI è presente nella scheda. Controlla ogni iscritto sul
    <a href="https://servizi.ivass.it/RuirPubblica/" target="_blank" rel="noopener">registro pubblico IVASS</a> prima di approvare.</p>

    ${lista.map(b => `
      <div class="card admin-pro">
        <div class="admin-pro-card">${QF().qpass(b, true)}</div>
        <div class="admin-pro-body">
          <h3 style="margin-bottom:.2rem">${esc(b.nome)} ${b.id === "me" ? `<span class="pill">registrato dal sito</span>` : ""}</h3>
          <p class="muted" style="font-size:.88rem;margin:0 0 .6rem">${esc(b.ruolo)} · ${QF().campo(b.azienda)} · ${QF().campo(b.citta)}</p>
          <table class="admin-kv">
            <tr><th>Numero RUI</th><td>${b.rui ? `<code>${esc(b.rui)}</code>` : `<span class="rui-pending">non ancora inserito</span>`}</td></tr>
            <tr><th>Sezione</th><td>${esc(b.ruiSezione || "—")}</td></tr>
            <tr><th>Iscritto dal</th><td>${b.ruiDal ? new Date(b.ruiDal).toLocaleDateString("it-IT") : "—"}</td></tr>
            <tr><th>Contatti</th><td>${QF().campo(b.tel)} · ${QF().campo(b.email)}</td></tr>
            <tr><th>Attività</th><td>${b.risposte || 0} risposte · ${b.punti || 0} punti · ${QF().livello(b.punti || 0)}</td></tr>
          </table>
          <div class="admin-actions">
            ${Object.entries(STATI).map(([k, v]) => `
              <button class="chip ${b.statoVerifica === k ? "active" : ""}" data-verifica="${b.id}:${k}">${v}</button>`).join("")}
          </div>
          ${!b.rui ? `<p class="privacy-hint">Senza numero RUI la scheda resta “In verifica” anche se la approvi: è voluto — non si attesta un'iscrizione che non si è potuta leggere.</p>` : ""}
        </div>
      </div>`).join("") || `<p class="muted">Nessun professionista iscritto.</p>`}`;
  }

  /* ---------------- TAB 3 · MODERAZIONE BACHECA ---------------- */
  function bachecaView() {
    const DB = QF().DB;
    const filtri = { tutte: "Tutte", community: "Domande utenti", staff: "Guide QuotaFacile", giorno: "Domanda del giorno", aperte: "Senza risposta" };
    let domande = tutteLeDomande();
    if (modFiltro === "aperte") domande = domande.filter(f => !f.risposte.filter(r => !r.auto).length);
    else if (modFiltro !== "tutte") domande = domande.filter(f => f.tipo === modFiltro);

    const badge = t => ({ staff: `<span class="badge-cat badge-staff">📌 Guida</span>`, giorno: `<span class="badge-cat badge-daily">☀️ Del giorno</span>`, community: `<span class="badge-cat">🙋 Utente</span>` }[t] || "");

    return `
    <p class="admin-hint">Da qui assegni il badge <strong>★ Migliore risposta</strong> (+25 punti all'autore) e rimuovi i contenuti non pertinenti. Ogni rimozione chiede una motivazione: serve a te per rispondere all'autore, come previsto dal Digital Services Act.</p>

    <div class="filterbar">
      ${Object.entries(filtri).map(([k, v]) => `<button class="chip ${modFiltro === k ? "active" : ""}" data-modfiltro="${k}">${v}</button>`).join("")}
    </div>

    ${domande.map(f => `
      <div class="card admin-q">
        <div class="qa-meta">${badge(f.tipo)}<span class="badge-cat">${esc(f.cat)}</span><span>${esc(f.data)}</span>
          <span>· ${f.risposte.length} rispost${f.risposte.length === 1 ? "a" : "e"}</span>
          ${f.keyword ? `<span class="pill">kw: ${esc(f.keyword)}</span>` : ""}
        </div>
        <h3 style="font-size:1.02rem;margin:.4rem 0">${esc(f.domanda)}</h3>
        <div class="admin-q-actions">
          <a class="btn btn-ghost btn-sm" href="#/faq/${f.id}" target="_blank">Apri in bacheca ↗</a>
          ${f.tipo === "community" ? `<button class="btn btn-ghost btn-sm danger" data-del-domanda="${f.id}">🗑 Elimina domanda</button>` : ""}
          ${f.tipo === "staff" ? `<button class="btn btn-ghost btn-sm danger" data-ritira-staff="${f.id}">📥 Ritira dalla bacheca</button>` : ""}
        </div>

        ${f.risposte.length ? f.risposte.map((r, i) => {
          const a = QF().broker(r.autore) || { nome: "Autore sconosciuto" };
          return `
          <div class="admin-a ${r.accettata ? "best" : ""}">
            <div class="admin-a-head">
              <span class="qa-author">
                <span class="mini-avatar ${r.auto ? "mini-qf" : ""}">${r.auto ? "QF" : esc(QF().initials(a.nome))}</span>
                ${esc(a.nome)}
                ${r.accettata ? `<span class="badge-cat" style="background:var(--gold-100);color:#9A6B14">★ Migliore risposta</span>` : ""}
                ${r.auto ? `<span class="level-badge badge-auto">redazionale</span>` : ""}
              </span>
              <span class="muted" style="font-size:.75rem">▲ ${r.voti || 0}</span>
            </div>
            <p class="admin-a-text">${esc((r.testo || "").slice(0, 320))}${(r.testo || "").length > 320 ? "…" : ""}</p>
            <div class="admin-a-actions">
              ${r.auto ? `<span class="muted" style="font-size:.75rem">Contenuto redazionale: si modifica nel repository.</span>` : `
                <button class="btn btn-outline btn-sm" data-best="${f.id}:${i}" ${r.accettata ? "disabled" : ""}>★ ${r.accettata ? "Già premiata" : "Migliore risposta (+25 pt)"}</button>
                <button class="btn btn-ghost btn-sm danger" data-del-risposta="${f.id}:${i}">🗑 Elimina</button>`}
            </div>
          </div>`;
        }).join("") : `<p class="muted" style="font-size:.88rem;font-style:italic">Nessuna risposta.</p>`}
      </div>`).join("") || `<p class="muted">Nessuna domanda per questo filtro.</p>`}`;
  }

  /* ---------------- TAB 4 · KEYWORD → DOMANDA STAFF ---------------- */
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
    const DB = QF().DB;
    const pubblicate = QF().staffFaqs();
    return `
    <p class="admin-hint">Pubblica una keyword come <strong>domanda Staff</strong>: esce subito in cima alla bacheca, con la risposta a firma Redazione QuotaFacile, ed è integrabile dagli intermediari. Regola d'oro: la prima riga della risposta deve contenere la risposta secca e il numero chiave — è quella che Google prende per lo snippet.</p>

    <div class="grid-2" style="align-items:start">
      <div class="card">
        <h3>🎯 Nuova domanda Staff</h3>
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
          <h3>📋 Guide pubblicate (${pubblicate.length})</h3>
          ${pubblicate.map(f => `
            <div class="lead-row">
              <span class="lead-icon">📌</span>
              <span class="leader-info">
                <strong>${esc(f.domanda)}</strong>
                <span>kw: ${esc(f.keyword || "—")}${f.volume ? " · " + esc(f.volume) : ""}${f.difficolta ? " · difficoltà " + esc(f.difficolta) : ""}</span>
              </span>
              <button class="btn btn-ghost btn-sm danger" data-ritira-staff="${f.id}">Ritira</button>
            </div>`).join("") || `<p class="muted" style="font-size:.9rem">Nessuna guida pubblicata.</p>`}
        </div>
      </div>
    </div>`;
  }

  /* ---------------- TAB 5 · SEGNALAZIONI (DSA) ---------------- */
  function segnalazioniView() {
    const DB = QF().DB;
    return `
    <p class="admin-hint">Coda di moderazione alimentata dal pulsante 🚩 <em>Segnala</em> presente su ogni risposta. Il DSA richiede esame tempestivo, non arbitrario, e una motivazione all'autore in caso di rimozione.</p>
    ${DB.segnalazioni.length ? DB.segnalazioni.map(s => `
      <div class="card admin-seg ${s.stato}">
        <div class="qa-meta">
          <span class="badge-cat">${s.stato === "aperta" ? "🔴 Aperta" : s.stato === "accolta" ? "✅ Accolta" : "⚪ Respinta"}</span>
          <span>${new Date(s.data).toLocaleString("it-IT")}</span>
          <span>· contenuto <code>${esc(s.target)}</code></span>
        </div>
        <h3 style="font-size:1rem;margin:.4rem 0">${esc(s.motivo)}</h3>
        <p class="muted" style="font-size:.9rem">${esc(s.dettaglio)}</p>
        ${s.email ? `<p class="muted" style="font-size:.78rem">Segnalante: ${esc(s.email)}</p>` : ""}
        ${s.esito ? `<p class="privacy-hint">Esito registrato: ${esc(s.esito)}</p>` : ""}
        ${s.stato === "aperta" ? `
        <div class="admin-actions">
          <button class="btn btn-outline btn-sm danger" data-seg-accogli="${s.id}">Accogli e rimuovi il contenuto</button>
          <button class="btn btn-ghost btn-sm" data-seg-respingi="${s.id}">Respingi</button>
          <a class="btn btn-ghost btn-sm" href="#/faq/${esc(s.target.split(":")[0])}" target="_blank">Vedi contenuto ↗</a>
        </div>` : ""}
      </div>`).join("") : `<p class="muted">Nessuna segnalazione ricevuta.</p>`}`;
  }

  /* ---------------- SHELL ---------------- */
  const TABS = {
    kpi: ["📊 KPI", kpiView],
    professionisti: ["🪪 Professionisti", proView],
    bacheca: ["💬 Bacheca", bachecaView],
    keyword: ["🎯 Keyword → Staff", keywordView],
    segnalazioni: ["🚩 Segnalazioni", segnalazioniView]
  };

  function view(sub) {
    if (!isAuth()) return loginView();
    if (sub && TABS[sub]) tab = sub;
    const DB = QF().DB;
    const aperte = DB.segnalazioni.filter(s => s.stato === "aperta").length;
    return `
    <section class="section admin-shell">
      <div class="container">
        <div class="admin-top">
          <div>
            <span class="eyebrow">Console riservata</span>
            <h1 style="font-size:clamp(1.6rem,3.5vw,2.2rem);margin:0">Amministrazione QuotaFacile</h1>
          </div>
          <button class="btn btn-ghost btn-sm" id="admin-logout">Esci</button>
        </div>

        ${PASS_HASH === PASS_HASH_DEFAULT ? `
        <div class="legal-warning" role="alert">
          <strong>⚠️ Passphrase ancora quella di default.</strong> Cambiala in
          <code>assets/js/admin.js</code> → <code>PASS_HASH</code> prima di mettere online il sito.
        </div>` : ""}

        <div class="legal-warning" style="background:var(--green-50);border-color:var(--green-100)">
          <strong>Nota sui dati.</strong> Senza backend questa console legge il <code>localStorage</code>
          di <em>questo</em> browser: vedi le iscrizioni e le domande create qui, non quelle degli altri
          visitatori. I numeri diventano reali con il database (vedi README, sezione Backend).
        </div>

        <div class="filterbar" role="tablist">
          ${Object.entries(TABS).map(([k, [label]]) => `
            <button class="chip ${tab === k ? "active" : ""}" data-admintab="${k}" role="tab">
              ${label}${k === "segnalazioni" && aperte ? ` <span class="notif">${aperte}</span>` : ""}
            </button>`).join("")}
        </div>

        ${TABS[tab][1]()}
      </div>
    </section>`;
  }

  /* ---------------- EVENTI ---------------- */
  function bind() {
    const DB = QF().DB;
    const save = () => { QF().saveDB(); QF().render(); };
    const $ = s => document.querySelector(s);

    $("#admin-login-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const h = await sha256hex($("#adm-pass").value);
      if (h === PASS_HASH) { sessionStorage.setItem(SESSION_KEY, "1"); QF().render(); }
      else QF().toast("Passphrase errata.");
    });
    $("#admin-logout")?.addEventListener("click", () => { sessionStorage.removeItem(SESSION_KEY); QF().render(); });

    document.querySelectorAll("[data-admintab]").forEach(b =>
      b.addEventListener("click", () => { tab = b.dataset.admintab; QF().render(); }));
    document.querySelectorAll("[data-modfiltro]").forEach(b =>
      b.addEventListener("click", () => { modFiltro = b.dataset.modfiltro; QF().render(); }));

    /* verifica RUI */
    document.querySelectorAll("[data-verifica]").forEach(b =>
      b.addEventListener("click", () => {
        const [id, stato] = b.dataset.verifica.split(":");
        if (id === "me" && DB.proProfile) {
          DB.proProfile.statoVerifica = stato;
          DB.proProfile.verificato = stato === "verificato" && !!DB.proProfile.rui;
        } else {
          DB.verifiche[id] = stato;
          QF().sincronizzaBrokers();
        }
        save();
        QF().toast(`Stato aggiornato: ${STATI[stato]}`);
      }));

    /* badge migliore risposta */
    document.querySelectorAll("[data-best]").forEach(b =>
      b.addEventListener("click", () => {
        const [fid, idx] = b.dataset.best.split(":");
        const c = contenitoreRisposte(fid); if (!c) return;
        const i = +idx - c.offset; const r = c.arr[i]; if (!r) return;
        c.arr.forEach(x => { x.accettata = false; });
        r.accettata = true;
        const a = QF().broker(r.autore); if (a) a.punti = (a.punti || 0) + 25;
        save();
        QF().toast("Badge assegnato · +25 punti all'autore 🏆");
      }));

    /* rimozione risposta con motivazione (DSA) */
    document.querySelectorAll("[data-del-risposta]").forEach(b =>
      b.addEventListener("click", () => {
        const [fid, idx] = b.dataset.delRisposta.split(":");
        const motivo = prompt("Motivo della rimozione (verrà conservato per rispondere all'autore):");
        if (motivo === null) return;
        if (!motivo.trim()) { QF().toast("Serve una motivazione per rimuovere un contenuto."); return; }
        const c = contenitoreRisposte(fid); if (!c) return;
        const i = +idx - c.offset;
        const [rimossa] = c.arr.splice(i, 1);
        if (!rimossa) return;
        DB.moderazioni = DB.moderazioni || [];
        DB.moderazioni.unshift({ tipo: "risposta", target: fid + ":" + idx, autore: rimossa.autore, testo: rimossa.testo, motivo: motivo.trim(), data: new Date().toISOString() });
        save();
        QF().toast("Risposta rimossa e motivazione registrata.");
      }));

    /* eliminazione domanda della community */
    document.querySelectorAll("[data-del-domanda]").forEach(b =>
      b.addEventListener("click", () => {
        const id = b.dataset.delDomanda;
        const motivo = prompt("Motivo dell'eliminazione della domanda:");
        if (motivo === null) return;
        if (!motivo.trim()) { QF().toast("Serve una motivazione."); return; }
        const i = DB.faqs.findIndex(f => f.id === id); if (i < 0) return;
        const [rimossa] = DB.faqs.splice(i, 1);
        DB.moderazioni = DB.moderazioni || [];
        DB.moderazioni.unshift({ tipo: "domanda", target: id, testo: rimossa.domanda, motivo: motivo.trim(), data: new Date().toISOString() });
        save();
        QF().toast("Domanda eliminata.");
      }));

    /* ritiro di una guida Staff */
    document.querySelectorAll("[data-ritira-staff]").forEach(b =>
      b.addEventListener("click", () => {
        const id = b.dataset.ritiraStaff;
        const i = DB.staffCustom.findIndex(s => s.id === id);
        if (i >= 0) DB.staffCustom.splice(i, 1);
        else if (!DB.staffHidden.includes(id)) DB.staffHidden.push(id);
        save();
        QF().toast("Guida ritirata dalla bacheca.");
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
      id: "kc" + Date.now(),
      cat: $("#kw-cat").value,
      keyword: $("#kw-keyword").value.trim(),
      volume: $("#kw-vol").value.trim(),
      difficolta: $("#kw-diff").value,
      titolo: $("#kw-titolo").value.trim(),
      meta: $("#kw-meta").value.trim(),
      domanda: $("#kw-domanda").value.trim(),
      data: new Date().toISOString().slice(0, 10),
      risposta: mdToHtml($("#kw-risposta").value)
    });

    $("#kw-preview")?.addEventListener("click", () => {
      if (!$("#kw-domanda").value.trim() || !$("#kw-risposta").value.trim()) { QF().toast("Servono almeno domanda e risposta."); return; }
      const a = raccogliKw();
      $("#kw-preview-box").innerHTML = `
        <div class="card" style="margin-bottom:1rem">
          <h3>Anteprima</h3>
          <div class="qa-meta"><span class="badge-cat badge-staff">📌 Guida QuotaFacile</span><span class="badge-cat">${esc(a.cat)}</span></div>
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

    $("#kw-form")?.addEventListener("submit", e => {
      e.preventDefault();
      DB.staffCustom.unshift(raccogliKw());
      save();
      QF().toast("Guida pubblicata in cima alla bacheca 📌");
    });

    /* segnalazioni */
    document.querySelectorAll("[data-seg-respingi]").forEach(b =>
      b.addEventListener("click", () => {
        const s = DB.segnalazioni.find(x => x.id === b.dataset.segRespingi); if (!s) return;
        const nota = prompt("Motivazione della decisione (per il segnalante):") || "";
        s.stato = "respinta"; s.esito = nota.trim() || "Segnalazione ritenuta infondata.";
        s.chiusaIl = new Date().toISOString();
        save(); QF().toast("Segnalazione respinta.");
      }));

    document.querySelectorAll("[data-seg-accogli]").forEach(b =>
      b.addEventListener("click", () => {
        const s = DB.segnalazioni.find(x => x.id === b.dataset.segAccogli); if (!s) return;
        const motivo = prompt("Motivazione della rimozione (dovuta all'autore del contenuto):");
        if (motivo === null) return;
        if (!motivo.trim()) { QF().toast("Serve una motivazione."); return; }
        const [fid, idx] = s.target.split(":");
        const c = contenitoreRisposte(fid);
        if (c) {
          const i = +idx - c.offset;
          const [rimossa] = c.arr.splice(i, 1);
          if (rimossa) {
            DB.moderazioni = DB.moderazioni || [];
            DB.moderazioni.unshift({ tipo: "risposta", target: s.target, autore: rimossa.autore, testo: rimossa.testo, motivo: motivo.trim(), data: new Date().toISOString(), daSegnalazione: s.id });
          }
        }
        s.stato = "accolta"; s.esito = motivo.trim(); s.chiusaIl = new Date().toISOString();
        save(); QF().toast("Contenuto rimosso e segnalazione chiusa.");
      }));
  }

  window.QF_ADMIN = { view, bind, mdToHtml };
})();
