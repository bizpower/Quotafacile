/* ============================================================
   QuotaFacile — Area del collaboratore
   ------------------------------------------------------------
   Quello che vede chi entra con la propria utenza, non con la
   chiave del titolare. È volutamente piccola: la scrivania di una
   persona, non un pannello di controllo.

   Cosa NON c'è, e non per dimenticanza: nessuna vista sugli altri
   collaboratori, nessun accesso ai dati del marketplace, nessun
   modo di cambiare il proprio ruolo. Non è una questione di
   schermate mancanti — è il database a negarlo, con le sue
   policy, anche se qualcuno provasse a chiedere direttamente.
   ============================================================ */
"use strict";

(function () {

  const QF = () => window.QF;
  const esc = s => window.QF.esc(s);
  const A = () => window.QF_ACCESSO;

  let sezione = "documenti";
  let documenti = [];
  let miaProduzione = null;
  let fase = "vuoto";     // vuoto | caricamento | pronto | errore
  let avviso = null;
  let caricamento = false;

  const RUOLI = {
    titolare: "Titolare", direttore: "Direttore", account: "Account",
    commerciale: "Commerciale", consulente: "Consulente"
  };

  const dataOra = s => s ? new Date(s).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—";
  const dataBreve = s => s ? new Date(s).toLocaleDateString("it-IT") : "—";
  const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;
  const peso = n => !n ? "—" : n < 1024 * 1024
    ? Math.round(n / 1024) + " KB"
    : (n / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";

  /* Una scadenza serve a essere vista prima, non dopo: il
     conteggio dei giorni è più utile della data da sola. */
  function statoScadenza(d) {
    if (!d) return null;
    const giorni = Math.ceil((new Date(d + "T00:00:00") - new Date()) / 86400000);
    if (giorni < 0) return { classe: "scaduto", testo: `scaduto da ${-giorni} giorn${-giorni === 1 ? "o" : "i"}` };
    if (giorni <= 30) return { classe: "in-scadenza", testo: `scade fra ${giorni} giorn${giorni === 1 ? "o" : "i"}` };
    return { classe: "", testo: `scade il ${dataBreve(d)}` };
  }

  async function carica() {
    fase = "caricamento";
    QF().render();
    const [e, prod] = await Promise.all([A().documenti(), A().produzione()]);
    miaProduzione = prod;
    if (e.ok) { documenti = e.documenti; fase = "pronto"; avviso = null; }
    else { fase = "errore"; avviso = e.errore; }
    QF().render();
  }

  /* ---------------- DOCUMENTI ---------------- */
  function documentiView() {
    const io = A().io;
    const miei = documenti.filter(d => d.collaboratore_id === io.id);
    const altrui = documenti.filter(d => d.collaboratore_id !== io.id);

    const riga = d => {
      const sc = statoScadenza(d.scadenza);
      return `
      <div class="doc-riga">
        <span class="doc-icona">${/pdf/i.test(d.tipo_mime || "") ? "📕" : /image/i.test(d.tipo_mime || "") ? "🖼️" : "📄"}</span>
        <span class="doc-info">
          <strong>${esc(d.nome_file)}</strong>
          <span>${esc(A().CATEGORIE[d.categoria] || d.categoria)} · ${peso(d.dimensione)} · caricato il ${dataOra(d.creato_il)}</span>
          ${d.note ? `<span class="doc-note">${esc(d.note)}</span>` : ""}
          ${sc ? `<span class="doc-scadenza ${sc.classe}">⏳ ${esc(sc.testo)}</span>` : ""}
        </span>
        <span class="doc-azioni">
          <button class="btn btn-outline btn-sm" data-doc-scarica="${esc(d.id)}">⬇ Scarica</button>
          <button class="btn btn-ghost btn-sm danger" data-doc-elimina="${esc(d.id)}">🗑</button>
        </span>
      </div>`;
    };

    return `
    <div class="card">
      <h3>⬆️ Carica un documento</h3>
      <p class="muted" style="font-size:.85rem">PDF, immagini, Word o Excel, fino a 15 MB. I file finiscono in un archivio privato: nessuno può raggiungerli da un indirizzo pubblico, nemmeno conoscendolo.</p>
      <form id="doc-form">
        <div class="field" style="margin-top:.6rem">
          <label for="doc-file">File *</label>
          <input id="doc-file" type="file" required
                 accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.xls,.xlsx">
        </div>
        <div class="grid-2" style="gap:.6rem;margin-top:.6rem">
          <div class="field"><label for="doc-cat">Tipo di documento</label>
            <select id="doc-cat">${Object.entries(A().CATEGORIE).map(([k, v]) =>
              `<option value="${k}">${v}</option>`).join("")}</select></div>
          <div class="field"><label for="doc-scad">Scadenza <span class="muted">(se ne ha una)</span></label>
            <input id="doc-scad" type="date"></div>
        </div>
        <div class="field" style="margin-top:.6rem"><label for="doc-note">Note</label>
          <input id="doc-note" placeholder="A cosa si riferisce, con chi, ecc."></div>
        <button class="btn btn-primary" style="margin-top:.9rem" type="submit" ${caricamento ? "disabled" : ""}>
          ${caricamento ? "Caricamento in corso…" : "Carica"}
        </button>
      </form>
    </div>

    <div class="card" style="margin-top:1.2rem">
      <h3>📁 I tuoi documenti (${miei.length})</h3>
      ${miei.length ? miei.map(riga).join("")
        : `<p class="muted" style="font-size:.9rem">Non hai ancora caricato nulla.</p>`}
    </div>

    ${altrui.length ? `
    <div class="card" style="margin-top:1.2rem">
      <h3>👥 Documenti della squadra (${altrui.length})</h3>
      <p class="muted" style="font-size:.85rem">Li vedi perché il tuo ruolo è ${esc(RUOLI[A().io.ruolo] || A().io.ruolo)}. Un commerciale, al suo posto, vedrebbe solo i propri.</p>
      ${altrui.map(riga).join("")}
    </div>` : ""}`;
  }

  /* ---------------- PROFILO ---------------- */
  function profiloView() {
    const io = A().io;
    return `
    <div class="grid-2" style="align-items:start">
      <div class="card">
        <h3>🪪 La tua scheda</h3>
        <table class="admin-kv">
          <tr><th>Nome</th><td>${esc(io.nome)}</td></tr>
          <tr><th>Email</th><td>${esc(io.email)}</td></tr>
          <tr><th>Ruolo</th><td>${esc(RUOLI[io.ruolo] || io.ruolo)}</td></tr>
          ${io.telefono ? `<tr><th>Telefono</th><td>${esc(io.telefono)}</td></tr>` : ""}
          <tr><th>In squadra dal</th><td>${dataBreve(io.creato_il)}</td></tr>
        </table>
        <p class="privacy-hint">Nome, ruolo e recapiti li aggiorna il titolare: sono dati che descrivono il rapporto di lavoro, non preferenze personali. La password invece è solo tua.</p>

        ${miaProduzione ? `
        <h4 style="margin:1.2rem 0 .4rem;font-size:.95rem">🏆 La tua produzione</h4>
        <table class="admin-kv">
          <tr><th>Punti</th><td><strong>${miaProduzione.punti}</strong></td></tr>
          <tr><th>Attività</th><td>${plurale(miaProduzione.chiamate, "chiamata", "chiamate")} · ${plurale(miaProduzione.incontri, "incontro", "incontri")} · ${plurale(miaProduzione.preventivi, "preventivo", "preventivi")}</td></tr>
          <tr><th>Lead</th><td>${plurale(miaProduzione.clienti, "cliente", "clienti")} su ${miaProduzione.lead_assegnati} assegnati</td></tr>
        </table>
        <p class="privacy-hint">Questo numero non lo scrive nessuno: lo calcola il database dalle attività che registri sui tuoi lead. Vedi il tuo, non quello degli altri.</p>` : ""}
      </div>

      <div class="card">
        <h3>🔑 Cambia la password</h3>
        <p class="muted" style="font-size:.85rem">Se stai ancora usando quella che ti è stata consegnata, cambiala adesso: è passata da un messaggio, quindi non è più un segreto fra te e il sistema.</p>
        <form id="pwd-form">
          <div class="field" style="margin-top:.6rem"><label for="pwd-1">Nuova password</label>
            <input id="pwd-1" type="password" required minlength="10" autocomplete="new-password" placeholder="almeno 10 caratteri"></div>
          <div class="field" style="margin-top:.6rem"><label for="pwd-2">Ripetila</label>
            <input id="pwd-2" type="password" required minlength="10" autocomplete="new-password"></div>
          <button class="btn btn-primary" style="margin-top:.9rem" type="submit">Cambia password</button>
        </form>
      </div>
    </div>`;
  }

  /* ---------------- SHELL ---------------- */
  const SEZIONI = {
    documenti: ["📁 Documenti", documentiView],
    profilo: ["🪪 Profilo", profiloView]
  };

  function view(sub) {
    const io = A().io;
    if (!io) return `<section class="section"><div class="container"><div class="card"><p class="muted">Caricamento…</p></div></div></section>`;
    const s = SEZIONI[sub] ? sub : sezione;
    sezione = s;

    const testa = `
      <div class="admin-top">
        <div>
          <span class="eyebrow">Area personale</span>
          <h1 style="font-size:clamp(1.5rem,3.5vw,2rem);margin:0">Ciao ${esc(io.nome.split(" ")[0])}</h1>
          <p class="muted" style="margin:.2rem 0 0;font-size:.88rem">${esc(RUOLI[io.ruolo] || io.ruolo)} · Bizpower</p>
        </div>
        <button class="btn btn-ghost btn-sm" id="area-esci">Esci</button>
      </div>`;

    if (fase !== "pronto") {
      return `
      <section class="section admin-shell"><div class="container">
        ${testa}
        ${fase === "errore" ? `
          <div class="legal-warning" role="alert"><strong>Dati non disponibili.</strong> ${esc(avviso || "")}
            <br><button class="btn btn-outline btn-sm" style="margin-top:.6rem" id="area-riprova">Riprova</button></div>`
        : `<div class="card"><p class="muted">Caricamento dei tuoi documenti…</p></div>`}
      </div></section>`;
    }

    return `
    <section class="section admin-shell">
      <div class="container">
        ${testa}
        <div class="filterbar" role="tablist">
          ${Object.entries(SEZIONI).map(([k, [label]]) => `
            <a class="chip ${sezione === k ? "active" : ""}" role="tab" href="#/admin/area/${k}">${label}</a>`).join("")}
        </div>
        ${SEZIONI[sezione][1]()}
      </div>
    </section>`;
  }

  /* ---------------- EVENTI ---------------- */
  function bind() {
    const $ = s => document.querySelector(s);

    if (fase === "vuoto") { carica(); return; }

    $("#area-riprova")?.addEventListener("click", carica);
    $("#area-esci")?.addEventListener("click", async () => {
      await A().esci();
      documenti = []; miaProduzione = null; fase = "vuoto"; sezione = "documenti";
      window.QF_ADMIN?.accesso("collaboratore");
      location.hash = "#/admin";
      QF().render();
    });

    $("#doc-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const file = $("#doc-file").files?.[0];
      if (!file) { QF().toast("Scegli un file."); return; }
      /* I campi si leggono adesso, prima di ridisegnare: il render
         ricostruisce il modulo da capo, e da un modulo nuovo si
         rileggerebbero valori vuoti. */
      const meta = {
        categoria: $("#doc-cat")?.value,
        scadenza: $("#doc-scad")?.value || null,
        note: $("#doc-note")?.value || null
      };
      caricamento = true; QF().render();
      const esito = await A().carica(file, meta);
      caricamento = false;
      if (!esito.ok) { QF().toast(esito.errore || "Caricamento non riuscito."); QF().render(); return; }
      QF().toast("Documento caricato.");
      await carica();
    });

    document.querySelectorAll("[data-doc-scarica]").forEach(b =>
      b.addEventListener("click", async () => {
        const d = documenti.find(x => x.id === b.dataset.docScarica);
        if (!d) return;
        b.disabled = true;
        const e = await A().scarica(d);
        b.disabled = false;
        if (!e.ok) QF().toast(e.errore);
      }));

    document.querySelectorAll("[data-doc-elimina]").forEach(b =>
      b.addEventListener("click", async () => {
        const d = documenti.find(x => x.id === b.dataset.docElimina);
        if (!d) return;
        if (!confirm(`Eliminare definitivamente “${d.nome_file}”?\n\nIl file viene rimosso dall'archivio e non è recuperabile.`)) return;
        const e = await A().elimina(d);
        if (!e.ok) { QF().toast(e.errore); return; }
        QF().toast("Documento eliminato.");
        await carica();
      }));

    $("#pwd-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const a = $("#pwd-1").value, b = $("#pwd-2").value;
      if (a !== b) { QF().toast("Le due password non coincidono."); return; }
      const esito = await A().cambiaPassword(a);
      QF().toast(esito.ok ? "Password cambiata." : (esito.errore || "Cambio non riuscito."));
      if (esito.ok) { $("#pwd-1").value = ""; $("#pwd-2").value = ""; }
    });
  }

  function dimentica() {
    documenti = []; miaProduzione = null; fase = "vuoto"; avviso = null; sezione = "documenti";
  }

  window.QF_AREA = { view, bind, dimentica };
})();
