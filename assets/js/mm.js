/* ============================================================
   QuotaFacile — Mail Marketing
   ------------------------------------------------------------
   Rotta: #/admin/crm/mail/<voce>

   È il modulo che stava nel progetto Bizpower su Lovable,
   riscritto qui dentro: stesse undici voci, stesso ordine,
   stesse schermate, colori di QuotaFacile. Lì era React con
   shadcn e Tailwind; qui è lo stesso HTML che scrive il resto
   del sito, perché QuotaFacile non ha un passo di build e
   introdurlo per una sezione sola vorrebbe dire cambiare come
   si pubblica tutto il resto.

   La sidebar si riduce a icone e si nasconde, e si ricorda come
   l'hai lasciata — come prima. La differenza è che lo stato sta
   nell'indirizzo: da qui il tasto «indietro» del browser
   funziona, e un link a una voce si può mandare a qualcuno.

   Le voci arrivano una alla volta. Quelle non ancora costruite
   dicono cosa faranno: una scheda vuota che sembra funzionante
   è peggio di una che dichiara di non esserlo.
   ============================================================ */
"use strict";

(function () {

  const API = "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-mm";

  const QF = () => window.QF;
  const esc = s => window.QF.esc(s);
  const chiave = () => window.QF_ADMIN?.chiave() || "";

  let dati = null;
  let fase = "vuoto";     // vuoto | caricamento | pronto | errore
  let avviso = null;
  let dettaglio = null;   // chiave del riquadro numerico aperto

  /* Come sta la sidebar: aperta, ridotta a icone, o via del
     tutto. È una preferenza di chi guarda, non un dato: resta
     su questo dispositivo. */
  const CHIAVE_MENU = "mm_menu";
  const leggiMenu = () => {
    try { return localStorage.getItem(CHIAVE_MENU) || "aperta"; } catch (e) { return "aperta"; }
  };
  let menu = leggiMenu();
  const scriviMenu = v => {
    menu = v;
    try { localStorage.setItem(CHIAVE_MENU, v); } catch (e) { /* no-op */ }
  };

  /* Il mittente attivo. Su Lovable era una costante nel codice e
     cambiarlo voleva dire un rilascio; qui i mittenti sono righe
     del database e questa è solo la scelta corrente. */
  const CHIAVE_MITTENTE = "mm_mittente";
  let mittenteScelto = (() => {
    try { return localStorage.getItem(CHIAVE_MITTENTE) || null; } catch (e) { return null; }
  })();

  function mittente() {
    const m = D().mittenti;
    return m.find(x => x.id === mittenteScelto) || m[0] || null;
  }

  function scegliMittente(id) {
    mittenteScelto = id;
    try { localStorage.setItem(CHIAVE_MITTENTE, id); } catch (e) { /* no-op */ }
  }

  /* ---------------- DIALOGO CON IL SERVER ---------------- */
  async function chiama(azione, d = {}, timeout = 25000) {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), timeout);
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
    else { fase = "errore"; avviso = e.errore || "Modulo non raggiungibile."; }
    QF().render();
  }

  function dimentica() {
    dati = null; fase = "vuoto"; avviso = null; dettaglio = null;
    posta = null; bozza = null; contenuto = null; listaAperta = null;
    postaDati = null; scelte = new Set(); postaAperta = null;
    registroDati = null; regAperta = null; esitoReg = "tutti";
    nereDati = null; aggiuntaNera = false;
    seqDati = null; seqAperta = null; seqIscritti = null; seqIscrivi = null;
  }

  /* ---------------- DATI ---------------- */
  const D = () => dati || {
    mittenti: [], smtp: [], liste: [], campagne: [],
    ultimeInviate: [], ultimiErrori: [], giorni: [],
    invio: { configurato: false, provato: false, caselle: 0, attive: 0 },
    numeri: {}
  };
  const N = () => D().numeri || {};
  const dataOra = s => s ? new Date(s).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—";
  const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

  /* Le caselle di questo mittente: su Lovable il filtro era sul
     dominio dell'indirizzo, qui è un legame vero fra le righe. */
  const smtpDelMittente = () => {
    const m = mittente();
    return m ? D().smtp.filter(s => s.mittente_id === m.id) : [];
  };

  /* ---------------- LE UNDICI VOCI ---------------- */
  /* Ordine e nomi sono quelli del progetto su Lovable: sono i
     nomi con cui questo lavoro è già stato fatto per mesi, e
     rinominarli qui vorrebbe dire imparare due volte la stessa
     cosa. */
  const VOCI = [
    ["dashboard",   "📊", "Dashboard"],
    ["lead-finder", "🔎", "Lead Finder"],
    ["liste",       "🗂", "Lead Lists"],
    ["campagne",    "📣", "Campaigns"],
    ["pronte",      "✉️", "Email Ready"],
    ["ai-writer",   "✨", "Email AI Writer"],
    ["modelli",     "📄", "Templates"],
    ["smtp",        "⚙️", "SMTP & Sending"],
    ["registro",    "📈", "Send Log"],
    ["automazioni", "🔁", "Automazioni"],
    ["blacklist",   "🛡", "Blacklist & Compliance"]
  ];

  /* Le undici voci sono tutte costruite: non resta niente da
     annunciare. La scheda «in arrivo» resta perché è il posto
     giusto in cui dichiarare una voce futura prima di farla,
     invece di mostrare una schermata vuota che sembra rotta. */
  const INARRIVO = {};

  /* ---------------- DASHBOARD ---------------- */

  function avvisoInvio() {
    const inv = D().invio;
    if (inv.configurato && inv.provato) return "";
    return `
      <div class="legal-warning mm-avviso" role="status">
        ${!inv.configurato ? `
          <strong>Non si può ancora spedire.</strong>
          ${inv.caselle
            ? "Ci sono caselle configurate ma nessuna è attiva."
            : "Nessuna casella di invio configurata."}
          Tutto il resto del modulo funziona lo stesso: si preparano liste, modelli e campagne,
          e restano ferme finché non c'è una casella da cui farle partire.`
        : `
          <strong>La casella non è mai stata provata.</strong>
          Configurata non vuol dire funzionante: bastano un utente scritto a metà o la porta
          sbagliata perché il primo invio vero fallisca in silenzio.`}
        <br><a class="btn btn-outline btn-sm" style="margin-top:.6rem" href="#/admin/crm/mail/smtp">
          Apri SMTP &amp; Sending</a>
      </div>`;
  }

  const RIQUADRI = () => {
    const n = N();
    const inv = D().invio;
    const casella = smtpDelMittente().find(s => s.stato === "attivo");
    return [
      ["inviateOggi", "✉️", "Inviate oggi", n.inviateOggi ?? 0, `${n.inviateTotali ?? 0} in tutto`],
      ["inCoda", "🕒", "In coda", n.inCoda ?? 0, "programmate o in attesa"],
      ["pronte", "✅", "Pronte da inviare", n.pronte ?? 0, `${n.bozze ?? 0} ancora in bozza`],
      ["fallite", "⚠️", "Fallite", n.fallite ?? 0, n.fallite ? "da rivedere" : "nessun errore"],
      ["ultimi7", "📈", "Email ultimi 7 giorni", n.ultimi7 ?? 0, "create, in qualunque stato"],
      ["lead", "👥", "Lead in archivio", n.lead ?? 0, `${plurale(n.liste ?? 0, "lista", "liste")}`],
      ["smtp", "⚙️", "Casella di invio",
        casella ? "Attiva" : inv.configurato ? "Da collegare" : "Da configurare",
        casella ? casella.from_email : (mittente()?.from_email || "—")],
      ["consegna", "🎯", "Consegna",
        n.consegna == null ? "—" : `${n.consegna}%`,
        n.consegna == null ? "nessun invio ancora" : `${n.inviateTotali} riuscite · ${n.fallite} no`]
    ];
  };

  /* Un riquadro che non porta da nessuna parte è un numero che
     non si può verificare: ognuno apre l'elenco che lo motiva. */
  const APRONO = {
    lead: "#/admin/crm/mail/liste",
    smtp: "#/admin/crm/mail/smtp"
  };

  function dashboardView() {
    const m = mittente();
    const n = N();
    const g = D().giorni;
    const massimo = Math.max(1, ...g.map(x => x.quante));
    const totale = g.reduce((a, x) => a + x.quante, 0);
    const caselle = smtpDelMittente();

    return `
    ${avvisoInvio()}

    <div class="mm-riquadri">
      ${RIQUADRI().map(([k, ico, etichetta, valore, sotto]) => {
        /* «Da configurare» al corpo di una cifra occupa due righe
           e sfonda la griglia. Le parole lunghe vanno più piccole;
           i numeri e le percentuali restano grandi, perché sono
           quelli che si devono leggere da lontano. */
        const testo = String(valore);
        const dentro = `
          <span class="mm-riq-ico">${ico}</span>
          <span class="mm-riq-num ${testo.length > 5 ? "parola" : ""}">${esc(testo)}</span>
          <span class="mm-riq-eti">${esc(etichetta)}</span>
          <span class="mm-riq-sub">${esc(sotto)}</span>`;
        return APRONO[k]
          ? `<a class="mm-riq" href="${APRONO[k]}">${dentro}</a>`
          : `<button class="mm-riq" data-riq="${k}">${dentro}</button>`;
      }).join("")}
    </div>

    <div class="mm-griglia">
      <div class="card">
        <div class="mm-testata">
          <h3>Email inviate · ultimi 14 giorni</h3>
          <span class="pill">${plurale(totale, "email", "email")}</span>
        </div>
        ${totale === 0 ? `
          <p class="muted mm-vuoto">Nessuna email inviata${m ? ` per ${esc(m.etichetta)}` : ""}.
             Il grafico si riempie dal primo invio.</p>`
        : `
          <div class="mm-barre" role="img" aria-label="Email inviate negli ultimi quattordici giorni">
            ${g.map(x => {
              const gg = new Date(x.giorno + "T00:00:00");
              const et = gg.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
              return `
              <div class="mm-barra" title="${et}: ${plurale(x.quante, "email", "email")}">
                <div class="mm-barra-riemp" style="height:${(x.quante / massimo) * 100}%"></div>
                <span class="mm-barra-eti">${et}</span>
              </div>`;
            }).join("")}
          </div>`}
      </div>

      <div class="card">
        <div class="mm-testata"><h3>Caselle di ${esc(m?.etichetta || "invio")}</h3></div>
        ${caselle.length === 0 ? `
          <p class="muted mm-vuoto">Nessuna casella per il dominio <code>${esc(m?.dominio || "—")}</code>.</p>
          <a class="btn btn-outline btn-sm" href="#/admin/crm/mail/smtp">Configura l'invio</a>`
        : caselle.map(s => {
            const usate = s.inviate_oggi || 0;
            const limite = s.limite_giornaliero || 0;
            const quota = limite > 0 ? Math.min(100, (usate / limite) * 100) : 0;
            return `
            <div class="mm-casella">
              <div class="mm-testata">
                <strong>${esc(s.nome)}</strong>
                <span class="pill ${s.stato === "attivo" ? "" : "pill-on"}">${esc(s.stato)}</span>
              </div>
              <p class="muted" style="margin:.2rem 0 .5rem;font-size:.82rem">${esc(s.from_email)}</p>
              ${s.ultimo_test_errore ? `<p class="mm-errore">${esc(s.ultimo_test_errore)}</p>` : ""}
              ${limite > 0 ? `
                <div class="mm-quota"><div class="mm-quota-riemp" style="width:${quota}%"></div></div>
                <p class="mm-quota-eti">${usate} di ${limite} oggi · ultimo invio ${dataOra(s.ultimo_uso)}</p>` : ""}
            </div>`;
          }).join("")}
      </div>
    </div>

    <div class="mm-griglia">
      <div class="card">
        <div class="mm-testata">
          <h3>Ultime inviate</h3>
          <a class="mm-link" href="#/admin/crm/mail/registro">Registro completo →</a>
        </div>
        ${D().ultimeInviate.length === 0
          ? `<p class="muted mm-vuoto">Nessuna email inviata.</p>`
          : `<ul class="mm-elenco">${D().ultimeInviate.map(e => `
              <li>
                <div class="mm-elenco-testo">
                  <strong>${esc(e.oggetto || "(senza oggetto)")}</strong>
                  <span class="muted">${esc(e.destinatario)}</span>
                </div>
                <span class="mm-elenco-data">${dataOra(e.inviata_il)}</span>
              </li>`).join("")}</ul>`}
      </div>

      <div class="card">
        <div class="mm-testata">
          <h3>Liste recenti</h3>
          <a class="mm-link" href="#/admin/crm/mail/liste">Tutte →</a>
        </div>
        ${D().liste.length === 0
          ? `<p class="muted mm-vuoto">Nessuna lista ancora.</p>`
          : `<ul class="mm-elenco">${D().liste.slice(0, 6).map(l => `
              <li>
                <div class="mm-elenco-testo"><strong>${esc(l.nome)}</strong>
                ${l.descrizione ? `<span class="muted">${esc(l.descrizione)}</span>` : ""}</div>
              </li>`).join("")}</ul>`}
      </div>
    </div>

    ${D().ultimiErrori.length ? `
      <div class="card mm-card-errore">
        <div class="mm-testata"><h3>Errori recenti</h3></div>
        <ul class="mm-elenco">${D().ultimiErrori.map(e => `
          <li>
            <div class="mm-elenco-testo">
              <strong>${esc(e.destinatario)}</strong>
              <span class="mm-errore">${esc(e.errore || "Errore non registrato")}</span>
            </div>
            <span class="mm-elenco-data">${dataOra(e.creata_il)}</span>
          </li>`).join("")}</ul>
      </div>` : ""}

    ${(n.leadNoContatto || n.blacklist) ? `
      <p class="privacy-hint">
        ${plurale(n.leadNoContatto || 0, "azienda si è opposta", "aziende si sono opposte")}
        a ricevere comunicazioni${n.blacklist ? `, e ${plurale(n.blacklist, "indirizzo è", "indirizzi sono")} in blacklist` : ""}.
        L'invio verso di loro è rifiutato dal server, non nascosto dall'interfaccia.
      </p>` : ""}

    ${dettaglio ? dettaglioView() : ""}`;
  }

  /* Il dettaglio di un riquadro. Su Lovable era un dialog con
     l'elenco delle email dietro: quell'elenco arriverà con le
     sezioni che lo producono. Per ora dice da dove viene il
     numero, che è la domanda a cui un cruscotto deve rispondere
     prima di ogni altra. */
  const SPIEGA = {
    inviateOggi: ["Inviate oggi", "Messaggi partiti nelle ultime 24 ore, contati sullo stato «inviata» e sull'ora di partenza registrata dal server."],
    inCoda: ["In coda", "Messaggi approvati e affidati alla coda: partono all'orario previsto, o al primo passaggio utile se non ne hanno uno."],
    pronte: ["Pronte da inviare", "Messaggi scritti e approvati, non ancora messi in coda. Restano fermi finché qualcuno decide di mandarli."],
    fallite: ["Fallite", "Messaggi che il server di posta ha rifiutato. L'errore esatto è nel registro: quasi sempre è un indirizzo inesistente o un limite giornaliero superato."],
    ultimi7: ["Email ultimi 7 giorni", "Tutte le email create negli ultimi sette giorni, in qualunque stato: comprese quelle mai partite."],
    consegna: ["Consegna", "Quota di messaggi accettati dal server di posta sul totale dei tentativi. Non dice se sono stati letti: dice che sono stati consegnati."]
  };

  function dettaglioView() {
    const s = SPIEGA[dettaglio];
    if (!s) return "";
    return `
    <div class="mm-velo" data-chiudi-dettaglio>
      <div class="card mm-dialogo" role="dialog" aria-modal="true" aria-label="${esc(s[0])}">
        <div class="mm-testata">
          <h3>${esc(s[0])}</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-dettaglio>Chiudi</button>
        </div>
        <p>${esc(s[1])}</p>
        <p class="privacy-hint">L'elenco riga per riga arriva con la sezione che produce questi messaggi.</p>
      </div>
    </div>`;
  }

  /* ---------------- SEZIONI · LEAD FINDER e LEAD LISTS ----------------
     La ricerca non è riscritta: è la stessa funzione qf-lead che
     alimenta «Lead locali» nel CRM. Due copie dello stesso codice
     Google vorrebbero dire due comportamenti che con il tempo
     divergono, e un'attività trovata due volte con due schede
     diverse.

     Su Lovable ogni lista aveva le proprie righe di lead: la
     stessa azienda in tre liste erano tre record, e l'opposizione
     registrata su uno non fermava gli altri due. Qui il lead è
     uno e le liste ci puntano, quindi togliere un'azienda la
     toglie da tutte insieme. */

  const API_LEAD = "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-lead";

  const CATEGORIE = {
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

  /* Lo stato della ricerca vive finché la scheda è aperta: dei
     risultati non salvati non si fa un archivio. */
  const ricerca = {
    zona: "", citta: "Milano", provincia: "MI",
    categorie: ["ristorazione"], raggio: 2000, soloQualita: true
  };
  let risultati = null;      // null = mai cercato
  let scelti = new Set();
  let cercando = false;
  let avvisiRicerca = [];
  let salvaAperto = false;
  let listaScelta = "";
  let nuovaLista = "";

  /* Quale voce è a schermo: bind() non riceve l'indirizzo. */
  let rottaCorrente = "dashboard";

  let listaAperta = null;
  let contenuto = null;      // { lead, altreListe }
  let listaModulo = null;    // lista in creazione/modifica
  let leadModulo = null;     // lead a mano

  const RAGGI = [
    [500, "500 m"], [1000, "1 km"], [2000, "2 km"], [5000, "5 km"], [10000, "10 km"]
  ];

  async function chiamaLead(azione, d = {}, timeout = 90000) {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), timeout);
    try {
      const r = await fetch(API_LEAD, {
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

  /* --- Lead Finder --- */

  function finderView() {
    return `
    <div class="card">
      <p class="muted" style="margin:0 0 .8rem;font-size:.85rem">
        Cerca attività su Google e salvale in una lista. È la stessa ricerca di «Lead locali»
        nel CRM: un'attività trovata qui e lì resta una riga sola, con la ricerca che l'ha
        prodotta scritta accanto.
      </p>
      <form id="mm-cerca-form">
        <div class="lead-categorie">
          ${Object.entries(CATEGORIE).map(([k, v]) => `
            <button type="button" class="chip ${ricerca.categorie.includes(k) ? "active" : ""}" data-cat="${k}">${v}</button>`).join("")}
        </div>
        <div class="mm-campi" style="margin-top:.8rem">
          <label class="field"><span>Città</span>
            <input id="c-citta" value="${esc(ricerca.citta)}" placeholder="Milano"></label>
          <label class="field"><span>Provincia</span>
            <input id="c-prov" maxlength="2" value="${esc(ricerca.provincia)}" placeholder="MI"></label>
          <label class="field mm-campo-largo"><span>Via o zona (per centrare meglio)</span>
            <input id="c-zona" value="${esc(ricerca.zona)}" placeholder="Via Dante 10 — lascia vuoto per cercare in tutta la città"></label>
          <label class="field"><span>Raggio</span>
            <select id="c-raggio">
              ${RAGGI.map(([v, et]) => `<option value="${v}" ${ricerca.raggio === v ? "selected" : ""}>${et}</option>`).join("")}
            </select></label>
          <label class="field mm-interruttore" style="align-self:end">
            <input id="c-qualita" type="checkbox" ${ricerca.soloQualita ? "checked" : ""}>
            <span>Solo attività con buone recensioni
              <em>Almeno 3,5 stelle e 5 recensioni.</em></span>
          </label>
        </div>
        <div class="mm-azioni" style="margin-top:.8rem">
          <button type="submit" class="btn btn-primary btn-sm" ${cercando ? "disabled" : ""}>
            ${cercando ? "Cerco…" : "🔎 Cerca"}</button>
          <span class="muted" style="font-size:.78rem">
            ${plurale(ricerca.categorie.length, "categoria scelta", "categorie scelte")} · massimo 4</span>
        </div>
      </form>
    </div>

    ${avvisiRicerca.length ? `
      <div class="legal-warning" role="status">${avvisiRicerca.map(esc).join("<br>")}</div>` : ""}

    ${risultati === null ? "" : risultati.length === 0 ? `
      <div class="card"><p class="muted mm-vuoto" style="border:0">
        Nessun risultato. Prova un raggio più ampio o un'altra categoria.</p></div>`
    : `
      <div class="card">
        <div class="mm-testata">
          <h3>${plurale(risultati.length, "attività trovata", "attività trovate")}</h3>
          <span class="muted" style="font-size:.78rem">
            ${risultati.filter(r => r.gia).length
              ? `${plurale(risultati.filter(r => r.gia).length, "è già in archivio", "sono già in archivio")}`
              : "nessuna già in archivio"}</span>
        </div>
        <div class="mm-tabella">
          <table>
            <thead><tr>
              <th style="width:2.2rem"><input type="checkbox" id="mm-tutti"
                ${risultati.filter(r => !r.gia).length && risultati.filter(r => !r.gia).every(r => scelti.has(r.place_id)) ? "checked" : ""}></th>
              <th>Attività</th><th>Città</th><th>Contatti</th><th>Recensioni</th>
            </tr></thead>
            <tbody>
              ${risultati.map(r => `
                <tr class="${r.gia ? "gia-presente" : ""}">
                  <td><input type="checkbox" data-scegli="${esc(r.place_id)}" ${scelti.has(r.place_id) ? "checked" : ""}></td>
                  <td>
                    <strong>${esc(r.nome)}</strong>
                    ${r.gia ? `<span class="pill pill-on">già in archivio</span>` : ""}
                    <span class="muted" style="display:block;font-size:.74rem">${esc(r.indirizzo || "")}</span>
                  </td>
                  <td>${esc(r.citta || "—")}</td>
                  <td class="mm-contatti">
                    ${r.telefono ? `<a href="tel:${esc(r.telefono)}">${esc(r.telefono)}</a>` : ""}
                    ${r.sito ? `<a href="${esc(r.sito)}" target="_blank" rel="noopener">${esc(r.sito.replace(/^https?:\/\//, "").slice(0, 32))}</a>` : ""}
                    ${!r.telefono && !r.sito ? "—" : ""}
                  </td>
                  <td>${r.valutazione ? `★ ${r.valutazione} <span class="muted">(${r.recensioni ?? 0})</span>` : "—"}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        ${scelti.size ? `
          <div class="mm-barra-scelta">
            <span>${plurale(scelti.size, "selezionata", "selezionate")}</span>
            <div class="mm-azioni">
              <button class="btn btn-outline btn-sm" id="mm-csv-risultati">Scarica CSV</button>
              <button class="btn btn-primary btn-sm" id="mm-salva-lista">Salva in una lista</button>
            </div>
          </div>` : ""}
      </div>`}

    ${salvaAperto ? salvaView() : ""}`;
  }

  function salvaView() {
    return `
    <div class="mm-velo" data-chiudi-salva>
      <div class="card mm-dialogo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>Salva ${plurale(scelti.size, "attività", "attività")}</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-salva>Chiudi</button>
        </div>
        <form id="mm-salva-form">
          <label class="field"><span>In quale lista</span>
            <select id="s-lista">
              <option value="">— scegli —</option>
              ${D().liste.map(l => `<option value="${esc(l.id)}" ${listaScelta === l.id ? "selected" : ""}>${esc(l.nome)} (${l.quanti ?? 0})</option>`).join("")}
              <option value="__nuova__" ${listaScelta === "__nuova__" ? "selected" : ""}>＋ Crea una lista nuova</option>
            </select></label>
          ${listaScelta === "__nuova__" ? `
            <label class="field" style="margin-top:.6rem"><span>Nome della lista</span>
              <input id="s-nome" required value="${esc(nuovaLista)}" placeholder="Ristoranti Milano · settembre"></label>` : ""}
          <p class="privacy-hint">
            Le attività già in archivio non vengono duplicate: se erano già state trovate,
            vengono solo aggiunte a questa lista con la lavorazione che hanno già.
          </p>
          <div class="mm-azioni" style="justify-content:flex-end">
            <button type="button" class="btn btn-ghost btn-sm" data-chiudi-salva>Annulla</button>
            <button type="submit" class="btn btn-primary btn-sm">Salva</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  /* --- Lead Lists --- */

  function listeView() {
    const ll = D().liste;
    return `
    <div class="mm-testata mm-testata-sezione">
      <p class="muted" style="margin:0;max-width:44rem">
        Le liste sono punti di vista sull'archivio dei lead, non copie: la stessa azienda può
        stare in più liste, ma resta una riga sola. Se si oppone, sparisce da tutte insieme.
      </p>
      <div class="mm-azioni">
        <button class="btn btn-primary btn-sm" id="mm-lista-nuova">＋ Nuova lista</button>
      </div>
    </div>

    ${ll.length === 0 ? `
      <div class="card"><p class="muted mm-vuoto" style="border:0;padding:2.4rem 1rem">
        Nessuna lista. Creane una, oppure vai nel <a href="#/admin/crm/mail/lead-finder">Lead Finder</a>
        e salva lì i risultati di una ricerca.</p></div>`
    : `
      <div class="mm-liste-shell">
        <nav class="mm-liste-elenco">
          ${ll.map(l => `
            <a class="mm-lista-voce ${listaAperta === l.id ? "attiva" : ""}" href="#/admin/crm/mail/liste?l=${esc(l.id)}">
              <span class="mm-lista-nome">${esc(l.nome)}</span>
              <span class="pill">${l.quanti ?? 0}</span>
            </a>`).join("")}
        </nav>
        <div class="card mm-lista-contenuto">
          ${!listaAperta ? `<p class="muted mm-vuoto" style="border:0">Scegli una lista per vederne i lead.</p>`
          : contenutoView()}
        </div>
      </div>`}

    ${listaModulo ? listaModuloView() : ""}
    ${leadModulo ? leadModuloView() : ""}`;
  }

  function contenutoView() {
    const l = D().liste.find(x => x.id === listaAperta);
    if (!l) return `<p class="muted mm-vuoto" style="border:0">Questa lista non esiste più.</p>`;
    if (!contenuto) return `<p class="muted">Carico la lista…</p>`;

    const lead = contenuto.lead;
    const conEmail = lead.filter(x => x.email).length;
    const opposti = lead.filter(x => x.no_contatto).length;

    return `
    <div class="mm-testata">
      <div style="min-width:0">
        <h3 style="margin:0">${esc(l.nome)}</h3>
        <p class="muted" style="margin:.15rem 0 0;font-size:.78rem">
          ${plurale(lead.length, "lead", "lead")} ·
          ${conEmail} con indirizzo email${opposti ? ` · <strong>${plurale(opposti, "opposto", "opposti")}</strong>` : ""}
        </p>
      </div>
      <div class="mm-azioni">
        <button class="btn btn-outline btn-sm" id="mm-lead-mano">＋ A mano</button>
        <button class="btn btn-outline btn-sm" id="mm-importa">⬆ Importa CSV</button>
        <button class="btn btn-outline btn-sm" id="mm-esporta" ${lead.length ? "" : "disabled"}>⬇ Esporta CSV</button>
        <button class="btn btn-ghost btn-sm" id="mm-lista-modifica">Rinomina</button>
        <button class="btn btn-ghost btn-sm danger" id="mm-lista-elimina">🗑</button>
      </div>
    </div>
    <input type="file" id="mm-file" accept=".csv,text/csv" hidden>

    ${conEmail === 0 && lead.length ? `
      <p class="legal-warning" style="font-size:.82rem">
        Nessuno di questi lead ha un indirizzo email. Google non lo fornisce: va cercato sul
        sito dell'attività e scritto a mano, oppure importato da un file.
      </p>` : ""}

    ${lead.length === 0 ? `
      <p class="muted mm-vuoto" style="border:0">
        Lista vuota. Aggiungi un lead a mano, importa un CSV, oppure salvaci una ricerca dal Lead Finder.</p>`
    : `
      <div class="mm-tabella">
        <table>
          <thead><tr><th>Attività</th><th>Contatti</th><th>Provenienza</th><th></th></tr></thead>
          <tbody>
            ${lead.map(x => {
              const altre = contenuto.altreListe[x.id]?.length || 0;
              return `
              <tr class="${x.no_contatto ? "opposto" : ""}">
                <td>
                  <strong>${esc(x.nome)}</strong>
                  ${x.no_contatto ? `<span class="pill pill-on" title="${esc(x.no_contatto_motivo || "")}">si è opposto</span>` : ""}
                  ${altre ? `<span class="pill">${altre === 1 ? "anche in un'altra lista" : `anche in ${altre} altre liste`}</span>` : ""}
                  <span class="muted" style="display:block;font-size:.74rem">
                    ${esc([CATEGORIE[x.categoria] || x.categoria, x.citta].filter(Boolean).join(" · "))}</span>
                </td>
                <td class="mm-contatti">
                  ${x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : `<span class="muted">senza email</span>`}
                  ${x.telefono ? `<a href="tel:${esc(x.telefono)}">${esc(x.telefono)}</a>` : ""}
                </td>
                <td class="muted" style="font-size:.74rem">
                  ${esc(x.fonte === "google_places" ? "Google" : x.fonte === "file" ? "da file" : "a mano")}
                  ${x.raccolto_il ? `<br>${dataOra(x.raccolto_il)}` : ""}
                </td>
                <td><button class="btn btn-ghost btn-sm danger" data-togli="${esc(x.id)}" title="Togli dalla lista">✕</button></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`}`;
  }

  function listaModuloView() {
    const nuova = !listaModulo.id;
    return `
    <div class="mm-velo" data-chiudi-lista>
      <div class="card mm-dialogo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>${nuova ? "Nuova lista" : "Rinomina la lista"}</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-lista>Chiudi</button>
        </div>
        <form id="mm-lista-form">
          <label class="field"><span>Nome *</span>
            <input id="l-nome" required value="${esc(listaModulo.nome || "")}" placeholder="Ristoranti Milano · settembre"></label>
          <label class="field" style="margin-top:.6rem"><span>A cosa serve</span>
            <input id="l-desc" value="${esc(listaModulo.descrizione || "")}" placeholder="facoltativo"></label>
          <div class="mm-azioni" style="justify-content:flex-end;margin-top:.8rem">
            <button type="button" class="btn btn-ghost btn-sm" data-chiudi-lista>Annulla</button>
            <button type="submit" class="btn btn-primary btn-sm">${nuova ? "Crea" : "Salva"}</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  function leadModuloView() {
    return `
    <div class="mm-velo" data-chiudi-lead>
      <div class="card mm-dialogo mm-dialogo-largo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>Aggiungi un'attività a mano</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-lead>Chiudi</button>
        </div>
        <form id="mm-lead-form">
          <div class="mm-campi">
            <label class="field mm-campo-largo"><span>Nome dell'attività *</span>
              <input id="m-nome" required placeholder="Trattoria del Ponte"></label>
            <label class="field"><span>Email</span><input id="m-email" type="email"></label>
            <label class="field"><span>Telefono</span><input id="m-tel"></label>
            <label class="field"><span>Città</span><input id="m-citta"></label>
            <label class="field"><span>Provincia</span><input id="m-prov" maxlength="2"></label>
            <label class="field mm-campo-largo"><span>Indirizzo</span><input id="m-ind"></label>
            <label class="field mm-campo-largo"><span>Sito</span><input id="m-sito"></label>
            <label class="field mm-campo-largo"><span>Dove l'hai trovata</span>
              <input id="m-origine" placeholder="es. fiera di settembre, segnalazione di un cliente"></label>
          </div>
          <p class="privacy-hint">
            L'ultimo campo non è burocrazia: se un giorno qualcuno chiede da dove avete il suo
            indirizzo, questa è la risposta, e deve stare nel database prima della domanda.
          </p>
          <div class="mm-azioni" style="justify-content:flex-end">
            <button type="button" class="btn btn-ghost btn-sm" data-chiudi-lead>Annulla</button>
            <button type="submit" class="btn btn-primary btn-sm">Aggiungi</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  /* ---------------- SEZIONI · CAMPAIGNS e EMAIL READY ----------------
     La campagna prepara, non spedisce: genera un messaggio per
     ogni destinatario e lo lascia in bozza. Il momento in cui
     qualcosa parte è sempre un clic separato, su email che
     qualcuno ha guardato. */

  let campagnaModulo = null;
  let postaDati = null;       // { posta, conteggi }
  let filtroPosta = { stato: "tutti", cerca: "", campagna_id: "" };
  let scelte = new Set();
  let postaAperta = null;     // messaggio in lettura o modifica
  let invioAperto = null;     // "adesso" | "programma"
  let quandoInvio = "";
  let inInvio = false;

  const STATI_POSTA = {
    bozza: ["✎", "Bozza"], pronta: ["✓", "Pronta"], in_coda: ["🕒", "In coda"],
    inviata: ["📤", "Inviata"], fallita: ["⚠️", "Fallita"], annullata: ["✕", "Annullata"]
  };

  async function caricaPosta2() {
    const e = await chiama("posta-elenco", filtroPosta, 30000);
    postaDati = e.ok ? { posta: e.posta || [], conteggi: e.conteggi || {} } : { posta: [], conteggi: {} };
    if (!e.ok) QF().toast(e.errore || "Posta non leggibile.");
    QF().render();
  }

  /* Fra un'ora, arrotondata ai cinque minuti: è il valore che
     serve nove volte su dieci, e sbagliarlo costa un invio. */
  function fraUnOra() {
    const d = new Date(Date.now() + 3600000);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  /* --- Campaigns --- */

  function campagneView() {
    const cc = D().campagne;
    const caselle = smtpDelMittente().filter(s => s.stato === "attivo");
    return `
    <div class="mm-testata mm-testata-sezione">
      <p class="muted" style="margin:0;max-width:44rem">
        Una campagna prende una lista e un modello e prepara un messaggio per ognuno, lasciandolo
        in bozza. Non parte niente finché non lo si approva in <a href="#/admin/crm/mail/pronte">Email Ready</a>.
      </p>
      <div class="mm-azioni">
        <button class="btn btn-primary btn-sm" id="mm-campagna-nuova">＋ Nuova campagna</button>
      </div>
    </div>

    ${caselle.length === 0 ? `
      <div class="legal-warning" role="status">
        Nessuna casella attiva: le campagne si possono preparare, ma per farle partire serve
        <a href="#/admin/crm/mail/smtp">una casella di invio</a>.
      </div>` : ""}

    ${cc.length === 0 ? `
      <div class="card"><p class="muted mm-vuoto" style="border:0;padding:2.4rem 1rem">
        Nessuna campagna.</p></div>`
    : `<div class="mm-caselle">${cc.map(c => {
        const lista = D().liste.find(l => l.id === c.lista_id);
        return `
        <div class="card mm-modello">
          <div class="mm-testata">
            <div style="min-width:0">
              <h3 style="margin:0">${esc(c.nome)}</h3>
              <p class="muted" style="margin:.15rem 0 0;font-size:.78rem">
                ${plurale(c.quanti ?? 0, "messaggio", "messaggi")}${lista ? ` · lista ${esc(lista.nome)}` : ""} ·
                una ogni ${c.pausa_secondi}s
              </p>
            </div>
            <span class="pill ${c.stato === "completata" ? "" : "pill-on"}">${esc(c.stato.replace("_", " "))}</span>
          </div>
          ${c.note ? `<p class="muted" style="font-size:.8rem;margin:0">${esc(c.note)}</p>` : ""}
          <div class="mm-azioni">
            <a class="btn btn-outline btn-sm" href="#/admin/crm/mail/pronte?c=${esc(c.id)}">Rivedi i messaggi</a>
            <button class="btn btn-ghost btn-sm danger" data-campagna-elimina="${esc(c.id)}">🗑</button>
          </div>
        </div>`;
      }).join("")}</div>`}

    ${campagnaModulo ? campagnaModuloView() : ""}`;
  }

  function campagnaModuloView() {
    const caselle = smtpDelMittente().filter(s => s.stato === "attivo");
    const modelli = (posta?.modelli || []).filter(m => m.attivo);
    return `
    <div class="mm-velo" data-chiudi-campagna>
      <div class="card mm-dialogo mm-dialogo-largo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>Nuova campagna</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-campagna>Chiudi</button>
        </div>
        <form id="mm-campagna-form">
          <div class="mm-campi">
            <label class="field mm-campo-largo"><span>Nome *</span>
              <input id="k-nome" required placeholder="Ristoranti Milano · settembre"></label>
            <label class="field"><span>Lista *</span>
              <select id="k-lista" required>
                <option value="">— scegli —</option>
                ${D().liste.map(l => `<option value="${esc(l.id)}">${esc(l.nome)} (${l.quanti ?? 0})</option>`).join("")}
              </select></label>
            <label class="field"><span>Modello *</span>
              <select id="k-modello" required>
                <option value="">— scegli —</option>
                ${modelli.map(m => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join("")}
              </select></label>
            <label class="field"><span>Casella</span>
              <select id="k-smtp">
                ${caselle.length === 0 ? `<option value="">nessuna attiva</option>`
                  : caselle.map(s => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join("")}
              </select></label>
            <label class="field"><span>Pausa fra un invio e l'altro</span>
              <input id="k-pausa" type="number" min="15" max="3600" value="60"></label>
            <label class="field mm-campo-largo"><span>Note</span>
              <input id="k-note" placeholder="facoltativo"></label>
          </div>
          <p class="privacy-hint">
            Vengono saltati automaticamente chi non ha un indirizzo, chi si è opposto, chi è in
            blacklist e chi abbiamo già contattato: alla fine ti dico quanti e perché.
            Sotto i 15 secondi di pausa una casella condivisa come Aruba rischia la sospensione.
          </p>
          <div class="mm-azioni" style="justify-content:flex-end">
            <button type="button" class="btn btn-ghost btn-sm" data-chiudi-campagna>Annulla</button>
            <button type="submit" class="btn btn-primary btn-sm">Prepara i messaggi</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  /* --- Email Ready --- */

  function pronteView() {
    if (!postaDati) return `<div class="card"><p class="muted">Carico la posta in uscita…</p></div>`;
    const c = postaDati.conteggi;
    const pp = postaDati.posta;
    const caselle = smtpDelMittente().filter(s => s.stato === "attivo");
    const selezionabili = pp.filter(m => m.stato !== "inviata");

    return `
    <div class="mm-riquadri mm-riquadri-cinque">
      ${[["bozza", "✎", "Bozze"], ["pronta", "✓", "Pronte"], ["in_coda", "🕒", "In coda"],
         ["inviata", "📤", "Inviate"], ["fallita", "⚠️", "Fallite"]].map(([k, ico, et]) => `
        <button class="mm-riq ${filtroPosta.stato === k ? "scelto" : ""}" data-filtro="${k}">
          <span class="mm-riq-ico">${ico}</span>
          <span class="mm-riq-num">${c[k] ?? 0}</span>
          <span class="mm-riq-eti">${et}</span>
        </button>`).join("")}
    </div>

    <div class="card">
      <div class="mm-testata mm-testata-sezione">
        <div class="mm-azioni">
          <input id="mm-cerca-posta" class="mm-cerca" value="${esc(filtroPosta.cerca)}" placeholder="Cerca destinatario o oggetto">
          ${filtroPosta.stato !== "tutti" || filtroPosta.campagna_id ? `
            <button class="btn btn-ghost btn-sm" id="mm-filtro-via">✕ Togli i filtri</button>` : ""}
        </div>
        <div class="mm-azioni">
          <button class="btn btn-outline btn-sm" id="mm-posta-csv" ${pp.length ? "" : "disabled"}>⬇ CSV</button>
        </div>
      </div>

      ${scelte.size ? `
        <div class="mm-barra-scelta">
          <span>${plurale(scelte.size, "selezionato", "selezionati")}</span>
          <div class="mm-azioni">
            <button class="btn btn-outline btn-sm" data-massa="pronta">✓ Approva</button>
            <button class="btn btn-outline btn-sm" data-massa="bozza">↩ Rimetti in bozza</button>
            <button class="btn btn-outline btn-sm" data-massa="annullata">✕ Annulla</button>
            <button class="btn btn-ghost btn-sm danger" id="mm-posta-elimina">🗑 Elimina</button>
            <button class="btn btn-outline btn-sm" id="mm-programma" ${caselle.length ? "" : "disabled"}>🕒 Programma</button>
            <button class="btn btn-primary btn-sm" id="mm-invia-ora" ${caselle.length ? "" : "disabled"}>📤 Invia ora</button>
          </div>
        </div>` : ""}

      ${pp.length === 0 ? `
        <p class="muted mm-vuoto" style="border:0">
          ${filtroPosta.stato === "tutti" && !filtroPosta.cerca
            ? `Nessun messaggio. Preparane con una <a href="#/admin/crm/mail/campagne">campagna</a>.`
            : "Nessun messaggio con questi filtri."}</p>`
      : `
        <div class="mm-tabella">
          <table>
            <thead><tr>
              <th style="width:2.2rem"><input type="checkbox" id="mm-posta-tutti"
                ${selezionabili.length && selezionabili.every(m => scelte.has(m.id)) ? "checked" : ""}></th>
              <th>Destinatario</th><th>Oggetto</th><th>Stato</th><th></th>
            </tr></thead>
            <tbody>
              ${pp.map(m => `
                <tr class="${m.stato === "inviata" ? "gia-presente" : ""}">
                  <td>${m.stato === "inviata" ? "" : `
                    <input type="checkbox" data-posta="${esc(m.id)}" ${scelte.has(m.id) ? "checked" : ""}>`}</td>
                  <td><strong>${esc(m.destinatario)}</strong></td>
                  <td>
                    <a href="#" data-apri="${esc(m.id)}">${esc(m.oggetto || "(senza oggetto)")}</a>
                    <span class="muted" style="display:block;font-size:.74rem">${esc(m.corpo.replace(/\s+/g, " ").slice(0, 90))}…</span>
                  </td>
                  <td>
                    ${STATI_POSTA[m.stato]?.[0] ?? ""} ${esc(STATI_POSTA[m.stato]?.[1] ?? m.stato)}
                    ${m.programmata_per ? `<span class="muted" style="display:block;font-size:.7rem">${dataOra(m.programmata_per)}</span>` : ""}
                    ${m.inviata_il ? `<span class="muted" style="display:block;font-size:.7rem">${dataOra(m.inviata_il)}</span>` : ""}
                    ${m.modificata ? `<span class="muted" style="display:block;font-size:.7rem">corretta a mano</span>` : ""}
                    ${m.errore ? `<span class="mm-errore" style="display:block;font-size:.7rem">${esc(m.errore.slice(0, 70))}</span>` : ""}
                  </td>
                  <td><button class="btn btn-ghost btn-sm" data-apri="${esc(m.id)}">Apri</button></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`}
    </div>

    ${postaAperta ? postaApertaView() : ""}
    ${invioAperto ? invioView() : ""}`;
  }

  function postaApertaView() {
    const m = postaAperta;
    const partita = m.stato === "inviata";
    return `
    <div class="mm-velo" data-chiudi-posta>
      <div class="card mm-dialogo mm-dialogo-largo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>${esc(m.destinatario)}</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-posta>Chiudi</button>
        </div>
        ${partita ? `
          <p class="privacy-hint">
            Questo messaggio è partito il ${dataOra(m.inviata_il)}. Il testo che è uscito non si
            riscrive: resta com'era, perché è quello che una persona ha ricevuto.
          </p>` : ""}
        <form id="mm-posta-form">
          <label class="field"><span>Oggetto</span>
            <input id="p-oggetto" value="${esc(m.oggetto)}" ${partita ? "readonly" : ""}></label>
          <label class="field" style="margin-top:.6rem"><span>Testo</span>
            <textarea id="p-corpo" rows="14" class="mail-corpo" ${partita ? "readonly" : ""}>${esc(m.corpo)}</textarea></label>
          ${partita ? "" : `
            <div class="mm-azioni" style="justify-content:flex-end;margin-top:.8rem">
              <button type="button" class="btn btn-ghost btn-sm" data-chiudi-posta>Annulla</button>
              <button type="submit" class="btn btn-primary btn-sm">Salva e approva</button>
            </div>`}
        </form>
      </div>
    </div>`;
  }

  function invioView() {
    const caselle = smtpDelMittente().filter(s => s.stato === "attivo");
    const adesso = invioAperto === "adesso";
    return `
    <div class="mm-velo" data-chiudi-invio>
      <div class="card mm-dialogo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>${adesso ? `Invia ${plurale(scelte.size, "messaggio", "messaggi")}` : `Programma ${plurale(scelte.size, "messaggio", "messaggi")}`}</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-invio>Chiudi</button>
        </div>
        <form id="mm-invio-form">
          <label class="field"><span>Da quale casella</span>
            <select id="i-smtp" required>
              ${caselle.map(s => `<option value="${esc(s.id)}">${esc(s.nome)} · ${esc(s.from_email)} (${s.inviate_oggi}/${s.limite_giornaliero} oggi)</option>`).join("")}
            </select></label>
          ${adesso ? `
            <label class="field" style="margin-top:.6rem"><span>Pausa fra un invio e l'altro (secondi)</span>
              <input id="i-pausa" type="number" min="0" max="300" value="15"></label>
            <p class="privacy-hint">
              Parte un blocco alla volta, al massimo venti messaggi: una richiesta al server ha un
              tempo massimo, e una casella condivisa ha una soglia oltre la quale viene sospesa.
              Quanti ne restano te lo dico alla fine.
            </p>`
          : `
            <label class="field" style="margin-top:.6rem"><span>Quando</span>
              <input id="i-quando" type="datetime-local" required value="${esc(quandoInvio)}"></label>
            <p class="privacy-hint">
              I messaggi restano in coda con questa data e partono da soli: la coda viene
              guardata ogni minuto e ne manda pochi per volta, per non farsi scambiare per
              un invio massivo. Se stanno partendo o no si vede in
              <a href="#/admin/crm/mail/registro">Send Log</a>.
            </p>`}
          <div class="mm-azioni" style="justify-content:flex-end;margin-top:.8rem">
            <button type="button" class="btn btn-ghost btn-sm" data-chiudi-invio>Annulla</button>
            <button type="submit" class="btn btn-primary btn-sm" ${inInvio ? "disabled" : ""}>
              ${inInvio ? "Invio…" : adesso ? "Invia ora" : "Metti in coda"}</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  /* ---------------- SEZIONI · TEMPLATES e AI WRITER ----------------
     I modelli non si riscrivono: sono quelli che il CRM ha già
     nella sezione Posta, letti e salvati dalla stessa funzione.
     Avere due posti che scrivono gli stessi modelli vorrebbe dire
     due elenchi che con il tempo divergono. */

  const API_MAIL = "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-mail";

  let posta = null;          // { modelli, inviate, configurata }
  let modelloAperto = null;  // modello in modifica, o "nuovo"
  let anteprima = null;      // { oggetto, corpo, avvisi }
  let bozza = null;          // quello che ha scritto il modello
  const scrittura = { lead_id: "", scopo: "presentazione", tono: "cordiale", istruzioni: "" };
  let scrivendo = false;

  const SCOPI = {
    presentazione: "Presentare QuotaFacile",
    preventivo: "Proporre un preventivo gratuito",
    sollecito: "Richiamare un contatto senza risposta",
    informativa: "Segnalare una novità normativa"
  };
  const TONI = { diretto: "Diretto", cordiale: "Cordiale", formale: "Formale" };
  const SEGNAPOSTO = {
    "{azienda}": "il nome dell'attività",
    "{citta}": "la sua città",
    "{telefono}": "il suo telefono",
    "{mittente}": "chi firma il messaggio"
  };

  async function chiamaMail(azione, d = {}, timeout = 30000) {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), timeout);
    try {
      const r = await fetch(API_MAIL, {
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

  async function caricaPosta() {
    const e = await chiamaMail("elenco");
    posta = e.ok ? { modelli: e.modelli || [], inviate: e.inviate || [] } : { modelli: [], inviate: [] };
    if (!e.ok) QF().toast(e.errore || "Modelli non leggibili.");
    QF().render();
  }

  /* --- Templates --- */

  function modelliView() {
    if (!posta) return `<div class="card"><p class="muted">Carico i modelli…</p></div>`;
    const mm = posta.modelli;
    return `
    <div class="mm-testata mm-testata-sezione">
      <p class="muted" style="margin:0;max-width:44rem">
        I testi riutilizzabili, con i segnaposto che vengono sostituiti al momento dell'invio.
        Sono gli stessi che il CRM usa nella sezione Posta: uno solo, non due elenchi che divergono.
      </p>
      <div class="mm-azioni">
        <button class="btn btn-primary btn-sm" id="mm-modello-nuovo">＋ Nuovo modello</button>
      </div>
    </div>

    <div class="card mm-segnaposto">
      <strong>Segnaposto disponibili</strong>
      <p>${Object.entries(SEGNAPOSTO).map(([k, v]) => `<code>${k}</code> ${esc(v)}`).join(" · ")}</p>
      <p class="privacy-hint" style="margin:.3rem 0 0">
        Quello che resta non sostituito parte così com'è, graffe comprese: l'anteprima lo segnala prima.
      </p>
    </div>

    ${mm.length === 0 ? `
      <div class="card"><p class="muted mm-vuoto" style="border:0;padding:2.4rem 1rem">
        Nessun modello. Creane uno, oppure fattene scrivere una bozza dall'<a href="#/admin/crm/mail/ai-writer">Email AI Writer</a>.
      </p></div>`
    : `<div class="mm-caselle">${mm.map(m => `
        <div class="card mm-modello ${m.attivo ? "" : "spento"}">
          <div class="mm-testata">
            <div style="min-width:0">
              <h3 style="margin:0">${esc(m.nome)}</h3>
              <p class="muted" style="margin:.15rem 0 0;font-size:.78rem">${esc(m.oggetto)}</p>
            </div>
            <span class="pill ${m.attivo ? "" : "pill-on"}">${esc(m.scopo)}${m.attivo ? "" : " · spento"}</span>
          </div>
          <pre class="mm-modello-corpo">${esc(m.corpo)}</pre>
          <div class="mm-azioni">
            <button class="btn btn-outline btn-sm" data-anteprima="${esc(m.id)}">👁 Anteprima</button>
            <button class="btn btn-ghost btn-sm" data-modello="${esc(m.id)}">Modifica</button>
            <button class="btn btn-ghost btn-sm danger" data-modello-elimina="${esc(m.id)}">🗑</button>
          </div>
        </div>`).join("")}</div>`}

    ${modelloAperto ? modelloModuloView() : ""}
    ${anteprima ? anteprimaView() : ""}`;
  }

  function modelloModuloView() {
    const m = modelloAperto;
    return `
    <div class="mm-velo" data-chiudi-modello>
      <div class="card mm-dialogo mm-dialogo-largo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>${m.id ? `Modifica «${esc(m.nome)}»` : "Nuovo modello"}</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-modello>Chiudi</button>
        </div>
        <form id="mm-modello-form">
          <div class="mm-campi">
            <label class="field"><span>Nome *</span>
              <input id="t-nome" required value="${esc(m.nome || "")}" placeholder="Primo contatto ristoranti"></label>
            <label class="field"><span>Scopo</span>
              <select id="t-scopo">
                ${["contatto", "preventivo", "sollecito", "informativa"].map(s => `
                  <option value="${s}" ${m.scopo === s ? "selected" : ""}>${s}</option>`).join("")}
              </select></label>
            <label class="field mm-campo-largo"><span>Oggetto *</span>
              <input id="t-oggetto" required value="${esc(m.oggetto || "")}" placeholder="Una domanda sulle vostre polizze, {azienda}"></label>
            <label class="field mm-campo-largo"><span>Testo *</span>
              <textarea id="t-corpo" required rows="12" class="mail-corpo">${esc(m.corpo || "")}</textarea></label>
            <label class="field mm-campo-largo mm-interruttore">
              <input id="t-attivo" type="checkbox" ${m.attivo !== false ? "checked" : ""}>
              <span>Modello attivo<em>Se spento resta qui ma non compare fra quelli usabili.</em></span>
            </label>
          </div>
          <div class="mm-azioni" style="justify-content:flex-end">
            <button type="button" class="btn btn-ghost btn-sm" data-chiudi-modello>Annulla</button>
            <button type="submit" class="btn btn-primary btn-sm">Salva</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  function anteprimaView() {
    return `
    <div class="mm-velo" data-chiudi-anteprima>
      <div class="card mm-dialogo mm-dialogo-largo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>Anteprima</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-anteprima>Chiudi</button>
        </div>
        ${anteprima.avvisi?.length ? `
          <div class="legal-warning" role="status">${anteprima.avvisi.map(esc).join("<br>")}</div>` : ""}
        <table class="admin-kv"><tr><th>Oggetto</th><td>${esc(anteprima.oggetto)}</td></tr></table>
        <pre class="mm-modello-corpo" style="max-height:22rem">${esc(anteprima.corpo)}</pre>
      </div>
    </div>`;
  }

  /* --- Email AI Writer --- */

  function scrittoreView() {
    const conEmail = (contenuto?.lead || []);
    return `
    <div class="card">
      <p class="muted" style="margin:0 0 .8rem;font-size:.85rem">
        Il modello scrive una bozza a partire da quello che sappiamo dell'azienda. È una bozza da
        leggere e correggere: da qui non parte niente, e nessun testo scritto così viene spedito
        senza che qualcuno lo abbia riletto.
      </p>
      <form id="mm-ai-form">
        <div class="mm-campi">
          <label class="field"><span>Scopo</span>
            <select id="a-scopo">
              ${Object.entries(SCOPI).map(([k, v]) => `<option value="${k}" ${scrittura.scopo === k ? "selected" : ""}>${esc(v)}</option>`).join("")}
            </select></label>
          <label class="field"><span>Tono</span>
            <select id="a-tono">
              ${Object.entries(TONI).map(([k, v]) => `<option value="${k}" ${scrittura.tono === k ? "selected" : ""}>${esc(v)}</option>`).join("")}
            </select></label>
          <label class="field mm-campo-largo"><span>Per quale azienda</span>
            <select id="a-lead">
              <option value="">Nessuna in particolare — scrivi un testo con i segnaposto</option>
              ${conEmail.filter(l => !l.no_contatto).map(l => `
                <option value="${esc(l.id)}" ${scrittura.lead_id === l.id ? "selected" : ""}>${esc(l.nome)}${l.citta ? ` · ${esc(l.citta)}` : ""}</option>`).join("")}
            </select>
            ${conEmail.length === 0 ? `
              <em class="muted" style="font-size:.76rem">Apri una lista in <a href="#/admin/crm/mail/liste">Lead Lists</a> per scegliere un'azienda: qui compaiono quelle della lista aperta.</em>` : ""}
          </label>
          <label class="field mm-campo-largo"><span>Indicazioni aggiuntive</span>
            <textarea id="a-istruzioni" rows="3" placeholder="Es. cita che siamo di zona, niente riferimenti al prezzo">${esc(scrittura.istruzioni)}</textarea></label>
        </div>
        <div class="mm-azioni" style="margin-top:.8rem">
          <button type="submit" class="btn btn-primary btn-sm" ${scrivendo ? "disabled" : ""}>
            ${scrivendo ? "Scrive…" : "✨ Scrivi la bozza"}</button>
          <span class="muted" style="font-size:.78rem">Ogni bozza costa: il conto esatto compare qui sotto.</span>
        </div>
      </form>
    </div>

    ${bozza ? `
      <div class="card">
        <div class="mm-testata">
          <h3>Bozza</h3>
          <span class="muted" style="font-size:.75rem">
            ${esc(bozza.modello)} · ${bozza.token.ingresso}+${bozza.token.uscita} token ·
            ${bozza.costo < 0.01 ? "meno di un centesimo di dollaro" : `${bozza.costo.toFixed(3)} $`}
          </span>
        </div>
        ${!bozza.oggetto ? `
          <div class="legal-warning" role="status">
            Il modello non ha restituito l'oggetto nel formato atteso: il testo è tutto qui sotto,
            l'oggetto va scritto a mano. Meglio che ve ne accorgiate ora.
          </div>` : ""}
        <label class="field"><span>Oggetto</span>
          <input id="b-oggetto" value="${esc(bozza.oggetto)}"></label>
        <label class="field" style="margin-top:.6rem"><span>Testo</span>
          <textarea id="b-corpo" rows="12" class="mail-corpo">${esc(bozza.corpo)}</textarea></label>
        <div class="mm-azioni" style="margin-top:.7rem">
          <button class="btn btn-primary btn-sm" id="mm-bozza-modello">Salvala come modello</button>
          <button class="btn btn-ghost btn-sm" id="mm-bozza-scarta">Scarta</button>
        </div>
        <p class="privacy-hint">
          Per scrivere questa bozza il nome, il settore, la città e il sito dell'azienda sono usciti dal
          database e sono arrivati ad Anthropic, che elabora il testo. È un trattamento in più rispetto a
          quelli dichiarati nell'informativa: se questa sezione entra nell'uso quotidiano, va aggiunto lì.
        </p>
      </div>` : ""}`;
  }

  /* ---------------- SEZIONE · SMTP & SENDING ----------------
     Le caselle da cui esce la posta. Su Lovable la password
     finiva in una colonna della tabella; qui viene consegnata al
     server e messa nel Vault, e da lì non torna più indietro:
     questa pagina sa se una password c'è, non qual è. */

  /* I preset dei fornitori, con Aruba per primo perché è quello
     che si usa qui. Host e porta si compilano da soli: sono la
     coppia che si sbaglia più spesso. */
  const FORNITORI = {
    aruba:     ["Aruba", "smtps.aruba.it", 465, true],
    gmail:     ["Gmail (password per le app)", "smtp.gmail.com", 465, true],
    outlook:   ["Outlook / Microsoft 365", "smtp.office365.com", 587, false],
    sendgrid:  ["SendGrid", "smtp.sendgrid.net", 587, false],
    brevo:     ["Brevo", "smtp-relay.brevo.com", 587, false],
    mailgun:   ["Mailgun", "smtp.mailgun.org", 587, false],
    ses:       ["Amazon SES (Irlanda)", "email-smtp.eu-west-1.amazonaws.com", 587, false],
    manuale:   ["Altro / a mano", "", 465, true]
  };

  let modulo = null;      // la casella in modifica, o "nuova"
  let dnsAperto = null;   // id della casella di cui si guardano i record
  let rapidoAperto = null;
  let inCorso = null;     // "prova:<id>", "dns:<id>", …
  let rapido = { destinatari: "", oggetto: "", corpo: "" };

  const vuota = () => ({
    id: "", nome: "", fornitore: "aruba",
    host: "smtps.aruba.it", porta: 465, tls: true,
    utente: "", password: "",
    from_email: "", from_nome: "", rispondi_a: "",
    limite_giornaliero: 200, stato: "attivo",
    firma: "", firma_attiva: true, ha_password: false
  });

  const STATI = { nuovo: "da provare", attivo: "attiva", errore: "in errore", sospeso: "in pausa" };
  const SEMAFORO = { ok: "🟢", avviso: "🟡", assente: "🔴", non_verificato: "⚪️" };
  const PAROLA = { ok: "a posto", avviso: "da migliorare", assente: "mancante", non_verificato: "non verificato" };

  function smtpView() {
    const cc = smtpDelMittente();
    const tutte = D().smtp;
    const m = mittente();

    return `
    <div class="mm-testata mm-testata-sezione">
      <p class="muted" style="margin:0;max-width:44rem">
        Le caselle da cui parte la posta. La password viene consegnata al server e chiusa nel
        Vault di Supabase: questa pagina sa che c'è, non sa qual è, e non può mostrartela.
      </p>
      <div class="mm-azioni">
        <button class="btn btn-outline btn-sm" id="mm-smtp-aruba">＋ Casella Aruba</button>
        <button class="btn btn-primary btn-sm" id="mm-smtp-nuova">＋ Nuova casella</button>
      </div>
    </div>

    ${cc.length === 0 ? `
      <div class="card">
        <p class="muted mm-vuoto" style="border:0;padding:2.4rem 1rem">
          ${tutte.length
            ? `Nessuna casella per <strong>${esc(m?.etichetta || "questo mittente")}</strong>, ma ce ${plurale(tutte.length, "n'è una per un altro mittente", "ne sono altre per altri mittenti")}.`
            : "Nessuna casella configurata: finché non ce n'è una, il modulo prepara ma non spedisce."}
        </p>
      </div>`
    : `<div class="mm-caselle">${cc.map(casellaView).join("")}</div>`}

    ${modulo ? moduloView() : ""}
    ${dnsAperto ? dnsView() : ""}
    ${rapidoAperto ? rapidoView() : ""}`;
  }

  function casellaView(s) {
    const limite = s.limite_giornaliero || 0;
    const usate = s.inviate_oggi || 0;
    const quota = limite > 0 ? Math.min(100, (usate / limite) * 100) : 0;
    const carica = quota >= 90 ? "piena" : quota >= 70 ? "quasi" : "";
    const verificato = s.dns_verificato_il;

    return `
    <div class="card mm-casella-grande ${s.stato === "errore" ? "in-errore" : ""}">
      <div class="mm-testata">
        <div style="min-width:0">
          <h3 style="margin:0">${esc(s.nome)}</h3>
          <p class="muted" style="margin:.15rem 0 0;font-size:.82rem">
            ${s.from_nome ? `${esc(s.from_nome)} &lt;${esc(s.from_email)}&gt;` : esc(s.from_email)}
          </p>
          <p class="muted" style="margin:.1rem 0 0;font-size:.75rem">
            ${esc(s.host)}:${s.porta} · ${s.tls ? "TLS dall'inizio" : "STARTTLS"}
            ${s.ha_password ? "" : " · <strong>senza password</strong>"}
          </p>
        </div>
        <span class="pill ${s.stato === "attivo" ? "" : "pill-on"}">${STATI[s.stato] || esc(s.stato)}</span>
      </div>

      ${s.ultimo_test_errore ? `
        <p class="mm-errore mm-errore-box">${esc(s.ultimo_test_errore)}</p>` : ""}
      ${s.ultimo_test_esito === "ok" ? `
        <p class="mm-ok-box">✓ Ultima prova riuscita il ${dataOra(s.ultimo_test_il)}</p>` : ""}

      ${limite > 0 ? `
        <div class="mm-quota-riga">
          <span>Invii di oggi</span><span>${usate} di ${limite}</span>
        </div>
        <div class="mm-quota"><div class="mm-quota-riemp ${carica}" style="width:${quota}%"></div></div>` : ""}

      <div class="mm-dns-sunto">
        <div class="mm-testata" style="margin:0">
          <span class="mm-dns-eti">Credibilità del dominio</span>
          <strong>${verificato ? `${s.punteggio ?? 0}/100` : "—"}</strong>
        </div>
        ${verificato ? `
          <div class="mm-quota"><div class="mm-quota-riemp ${(s.punteggio ?? 0) >= 80 ? "" : (s.punteggio ?? 0) >= 50 ? "quasi" : "piena"}"
               style="width:${s.punteggio ?? 0}%"></div></div>
          <p class="mm-semafori">
            <span>${SEMAFORO[s.spf_stato]} SPF</span>
            <span>${SEMAFORO[s.dkim_stato]} DKIM</span>
            <span>${SEMAFORO[s.dmarc_stato]} DMARC</span>
          </p>`
        : `<p class="muted" style="font-size:.78rem;margin:.3rem 0 0">
             Mai verificata. Senza questi tre record la posta parte ma finisce nello spam.
           </p>`}
      </div>

      <details class="mm-firma">
        <summary>Firma automatica ${s.firma_attiva ? "" : "<span class='pill pill-on'>spenta</span>"}</summary>
        <textarea data-firma="${esc(s.id)}" rows="4" placeholder="—
Riccardo Di Falco
QuotaFacile · info@quotafacile.net">${esc(s.firma || "")}</textarea>
        <div class="mm-firma-piede">
          <label><input type="checkbox" data-firma-attiva="${esc(s.id)}" ${s.firma_attiva ? "checked" : ""}> Aggiungila in fondo a ogni messaggio</label>
          <button class="btn btn-outline btn-sm" data-salva-firma="${esc(s.id)}">Salva firma</button>
        </div>
        <p class="privacy-hint" style="margin:.4rem 0 0">
          Aruba non aggiunge la firma della webmail agli invii che passano da qui: se la vuoi, va scritta in questo riquadro.
        </p>
      </details>

      <div class="mm-azioni">
        <button class="btn btn-outline btn-sm" data-prova="${esc(s.id)}" ${inCorso === `prova:${s.id}` ? "disabled" : ""}>
          ${inCorso === `prova:${s.id}` ? "Provo…" : "⚡ Prova"}</button>
        <button class="btn btn-primary btn-sm" data-rapido="${esc(s.id)}" ${s.stato === "sospeso" ? "disabled" : ""}>✉️ Invio rapido</button>
        <button class="btn btn-outline btn-sm" data-dns="${esc(s.id)}" ${inCorso === `dns:${s.id}` ? "disabled" : ""}>
          ${inCorso === `dns:${s.id}` ? "Controllo…" : "🛡 Verifica DNS"}</button>
        <button class="btn btn-outline btn-sm" data-sospendi="${esc(s.id)}" data-a="${s.stato === "sospeso" ? "attivo" : "sospeso"}">
          ${s.stato === "sospeso" ? "▶ Riattiva" : "⏸ Metti in pausa"}</button>
        <button class="btn btn-ghost btn-sm" data-modifica="${esc(s.id)}">Modifica</button>
        <button class="btn btn-ghost btn-sm danger" data-elimina="${esc(s.id)}">🗑</button>
      </div>
    </div>`;
  }

  function moduloView() {
    const f = modulo;
    const nuova = !f.id;
    return `
    <div class="mm-velo" data-chiudi-modulo>
      <div class="card mm-dialogo mm-dialogo-largo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>${nuova ? "Nuova casella di invio" : `Modifica «${esc(f.nome)}»`}</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-modulo>Chiudi</button>
        </div>
        <form id="mm-smtp-form">
          <div class="mm-campi">
            <label class="field mm-campo-largo"><span>Fornitore</span>
              <select id="f-fornitore">
                ${Object.entries(FORNITORI).map(([k, [et]]) => `
                  <option value="${k}" ${f.fornitore === k ? "selected" : ""}>${esc(et)}</option>`).join("")}
              </select>
            </label>

            <label class="field"><span>Nome interno *</span>
              <input id="f-nome" required value="${esc(f.nome)}" placeholder="Casella commerciale"></label>
            <label class="field"><span>Limite al giorno</span>
              <input id="f-limite" type="number" min="1" value="${f.limite_giornaliero}"></label>

            <label class="field"><span>Indirizzo mittente *</span>
              <input id="f-from" type="email" required value="${esc(f.from_email)}" placeholder="info@quotafacile.net"></label>
            <label class="field"><span>Nome mittente</span>
              <input id="f-fromnome" value="${esc(f.from_nome)}" placeholder="QuotaFacile"></label>

            <label class="field mm-campo-largo"><span>Rispondi a (se diverso)</span>
              <input id="f-rispondi" type="email" value="${esc(f.rispondi_a || "")}" placeholder="lascia vuoto per usare il mittente"></label>

            <label class="field"><span>Server *</span>
              <input id="f-host" required value="${esc(f.host)}" placeholder="smtps.aruba.it"></label>
            <label class="field"><span>Porta *</span>
              <input id="f-porta" type="number" min="1" max="65535" required value="${f.porta}"></label>

            <label class="field mm-campo-largo mm-interruttore">
              <input id="f-tls" type="checkbox" ${f.tls ? "checked" : ""}>
              <span>TLS dall'inizio
                <em>Acceso per la porta 465, spento per la 587 (che usa STARTTLS). È l'errore più comune.</em></span>
            </label>

            <label class="field"><span>Utente *</span>
              <input id="f-utente" required value="${esc(f.utente)}" placeholder="info@quotafacile.net"></label>
            <label class="field"><span>Password ${nuova ? "*" : ""}</span>
              <input id="f-password" type="password" autocomplete="new-password"
                     placeholder="${nuova ? "la password della casella" : f.ha_password ? "lasciala vuota per non cambiarla" : "nessuna password salvata"}">
            </label>
          </div>

          <p class="privacy-hint">
            Su Aruba l'utente è l'indirizzo completo della casella, non solo la parte prima della chiocciola.
            La password viene chiusa nel Vault: da lì non esce più verso questa pagina.
          </p>

          <div class="mm-azioni" style="justify-content:flex-end">
            <button type="button" class="btn btn-ghost btn-sm" data-chiudi-modulo>Annulla</button>
            <button type="submit" class="btn btn-primary btn-sm">${nuova ? "Crea la casella" : "Salva"}</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  function dnsView() {
    const s = D().smtp.find(x => x.id === dnsAperto);
    const r = s?.dns_esito;
    if (!s) return "";
    const blocco = (nome, stato, righe, consiglio, extra = "") => `
      <div class="mm-dns-blocco">
        <div class="mm-testata" style="margin-bottom:.35rem">
          <strong>${SEMAFORO[stato]} ${nome}</strong>
          <span class="pill ${stato === "ok" ? "" : "pill-on"}">${PAROLA[stato]}</span>
        </div>
        ${righe.length
          ? righe.map(x => `<code class="mm-record">${esc(x)}</code>`).join("")
          : `<p class="muted" style="font-size:.78rem;margin:0">Nessun record trovato.</p>`}
        ${extra}
        ${stato !== "ok" && consiglio ? `
          <div class="mm-consiglio">
            <code class="mm-record">${esc(consiglio)}</code>
            <button class="btn btn-outline btn-sm" data-copia="${esc(consiglio)}">Copia</button>
          </div>` : ""}
      </div>`;

    return `
    <div class="mm-velo" data-chiudi-dns>
      <div class="card mm-dialogo mm-dialogo-largo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>Record del dominio ${r ? `· ${esc(r.dominio)}` : ""}</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-dns>Chiudi</button>
        </div>

        ${!r ? `<p class="muted">Questa casella non è ancora stata verificata.</p>` : `
          <div class="mm-punteggio">
            <div class="mm-testata" style="margin:0">
              <span>Credibilità del dominio</span>
              <strong style="font-size:1.4rem">${r.punteggio}<span class="muted" style="font-size:.9rem">/100</span></strong>
            </div>
            <div class="mm-quota"><div class="mm-quota-riemp ${r.punteggio >= 80 ? "" : r.punteggio >= 50 ? "quasi" : "piena"}"
                 style="width:${r.punteggio}%"></div></div>
          </div>

          ${blocco("SPF", r.spf.stato, r.spf.record || [], r.consigli.spf,
            r.spf.atteso && r.spf.stato === "avviso"
              ? `<p class="muted" style="font-size:.76rem;margin:.3rem 0 0">Il record c'è ma non cita <code>${esc(r.spf.atteso)}</code>: chi spedisce davvero non è coperto.</p>`
              : "")}

          ${blocco("DKIM", r.dkim.stato, r.dkim.record ? [r.dkim.record] : [], null,
            r.dkim.stato === "ok"
              ? `<p class="muted" style="font-size:.76rem;margin:.3rem 0 0">Selettore: <code>${esc(r.dkim.selettore)}</code></p>`
              : `<p class="muted" style="font-size:.76rem;margin:.3rem 0 0">
                   Selettori provati: ${r.dkim.provati.map(p => `<code>${esc(p.selettore)}</code>`).join(", ")}.
                 </p>
                 <p class="mm-consiglio-testo">${esc(r.consigli.dkim)}</p>`)}

          ${blocco("DMARC", r.dmarc.stato, r.dmarc.record ? [r.dmarc.record] : [], r.consigli.dmarc,
            r.dmarc.stato === "avviso"
              ? `<p class="muted" style="font-size:.76rem;margin:.3rem 0 0">Il record c'è ma è in sola osservazione (<code>p=none</code>): non protegge ancora nessuno.</p>`
              : "")}

          <p class="privacy-hint">
            I record si pubblicano nel pannello del dominio e impiegano qualche minuto a propagarsi.
            Verificata il ${dataOra(r.verificato_il)}.
          </p>`}

        <div class="mm-azioni" style="justify-content:flex-end">
          <button class="btn btn-outline btn-sm" data-dns="${esc(s.id)}" ${inCorso === `dns:${s.id}` ? "disabled" : ""}>
            ${inCorso === `dns:${s.id}` ? "Controllo…" : "↻ Riverifica"}</button>
        </div>
      </div>
    </div>`;
  }

  function rapidoView() {
    const s = D().smtp.find(x => x.id === rapidoAperto);
    if (!s) return "";
    return `
    <div class="mm-velo" data-chiudi-rapido>
      <div class="card mm-dialogo mm-dialogo-largo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>Invio rapido</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-rapido>Chiudi</button>
        </div>
        <p class="muted" style="margin:0 0 .8rem;font-size:.85rem">
          Parte subito da <strong>${esc(s.from_email)}</strong>. Gli indirizzi in blacklist e le
          aziende che si sono opposte vengono rifiutati dal server, non nascosti qui.
        </p>
        <form id="mm-rapido-form">
          <label class="field"><span>Destinatari *</span>
            <textarea id="r-dest" rows="2" required placeholder="mario@esempio.it, anna@esempio.it">${esc(rapido.destinatari)}</textarea>
          </label>
          <label class="field" style="margin-top:.6rem"><span>Oggetto *</span>
            <input id="r-oggetto" required value="${esc(rapido.oggetto)}"></label>
          <label class="field" style="margin-top:.6rem"><span>Messaggio *</span>
            <textarea id="r-corpo" rows="9" required class="mail-corpo">${esc(rapido.corpo)}</textarea></label>
          ${s.firma_attiva && s.firma ? `
            <p class="privacy-hint">La firma della casella viene aggiunta in fondo.</p>` : ""}
          <div class="mm-azioni" style="justify-content:flex-end;margin-top:.8rem">
            <button type="button" class="btn btn-ghost btn-sm" data-chiudi-rapido>Annulla</button>
            <button type="submit" class="btn btn-primary btn-sm" ${inCorso === "rapido" ? "disabled" : ""}>
              ${inCorso === "rapido" ? "Invio…" : "Invia ora"}</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  /* ---------------- SEZIONE · SEND LOG ----------------

     Cosa è partito, cosa no, e se la coda automatica sta
     girando davvero.

     Su Lovable questa schermata leggeva una tabella sola. Qui ne
     legge due, perché prima che questo modulo esistesse il CRM
     mandava posta per conto suo, e quelle righe raccontano invii
     davvero avvenuti: nasconderle vorrebbe dire che «abbiamo
     scritto a tutti» smette di essere una frase verificabile.
     Ognuna dice da dove viene.

     In cima non c'è un numero ma una riga di stato. Davanti a una
     coda che non si svuota l'unica domanda che conta è «l'ultimo
     giro è partito?», e finora la risposta era una supposizione:
     adesso ogni giro lascia una riga nel database e questa la
     legge. */

  let registroDati = null;    // { righe, numeri, giri, coda }
  let filtroReg = { cerca: "", giorni: 30 };
  let esitoReg = "tutti";     // tutti | inviata | fallita
  let regAperta = null;       // riga in lettura

  const PERIODI = [[7, "7 giorni"], [30, "30 giorni"], [90, "3 mesi"], [365, "1 anno"]];

  async function caricaRegistro() {
    const e = await chiama("registro", filtroReg, 30000);
    registroDati = e.ok
      ? { righe: e.righe || [], numeri: e.numeri || {}, giri: e.giri || [], coda: e.coda || null }
      : { righe: [], numeri: {}, giri: [], coda: null };
    if (!e.ok) QF().toast(e.errore || "Registro non leggibile.");
    QF().render();
  }

  /* «Due minuti fa» si legge; una data e un'ora vanno sottratte a
     mente. Sopra il giorno torna la data, che a quel punto è
     l'informazione vera. */
  function quantoFa(iso) {
    if (!iso) return "—";
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return "adesso";
    if (min === 1) return "un minuto fa";
    if (min < 60) return `${min} minuti fa`;
    const ore = Math.round(min / 60);
    if (ore < 24) return ore === 1 ? "un'ora fa" : `${ore} ore fa`;
    return dataOra(iso);
  }

  /* Dieci minuti: il cron gira ogni minuto, quindi un silenzio
     più lungo non è un ritardo, è qualcosa che si è fermato. */
  const CODA_FERMA_DA = 10;

  function statoCodaView() {
    const c = registroDati.coda;
    if (!c) {
      return `
      <div class="legal-warning mm-avviso" role="status">
        <strong>La coda automatica non ha ancora fatto nessun giro.</strong>
        Finché non parte, i messaggi programmati restano fermi dove sono: si mandano
        a mano da <a href="#/admin/crm/mail/pronte">Email Ready</a> col tasto «Invia ora».
      </div>`;
    }
    const min = Math.round((Date.now() - new Date(c.ultimoGiro).getTime()) / 60000);
    const ferma = min > CODA_FERMA_DA;
    return `
    <div class="card mm-coda-stato ${ferma ? "ferma" : ""}">
      <div class="mm-coda-riga">
        <span class="mm-coda-spia" aria-hidden="true"></span>
        <div>
          <strong>${ferma ? "La coda sembra ferma" : "La coda gira"}</strong>
          <span class="muted">· ultimo giro ${esc(quantoFa(c.ultimoGiro))}</span>
        </div>
        <div class="mm-coda-attesa">
          <span class="mm-coda-num">${c.inAttesa ?? 0}</span>
          <span class="muted">in attesa</span>
        </div>
      </div>
      ${c.nota ? `<p class="mm-errore" style="margin:.5rem 0 0">${esc(c.nota)}</p>` : ""}
      ${ferma ? `
        <p class="privacy-hint" style="margin:.5rem 0 0">
          Il giro parte da solo ogni minuto. Se l'ultimo risale a più di
          ${CODA_FERMA_DA} minuti fa, i messaggi programmati non stanno partendo:
          nel frattempo si mandano a mano da <a href="#/admin/crm/mail/pronte">Email Ready</a>.
        </p>` : ""}
    </div>`;
  }

  function registroView() {
    if (!registroDati) return `<div class="card"><p class="muted">Lettura del registro…</p></div>`;

    const n = registroDati.numeri;
    /* Il filtro per esito si applica qui e non sul server: le
       righe sono già scaricate, e rifare il giro per nascondere
       metà tabella sarebbe una richiesta in più per niente. */
    const righe = esitoReg === "tutti"
      ? registroDati.righe
      : registroDati.righe.filter(r => r.esito === esitoReg);

    return `
    ${statoCodaView()}

    <div class="mm-riquadri">
      ${[
        ["inviata", "📬", "Partite", n.inviate ?? 0, "consegnate al server di posta"],
        ["fallita", "⚠️", "Fallite", n.fallite ?? 0, (n.fallite ?? 0) ? "l'errore è nella riga" : "nessun errore"],
        ["tutti", "📈", "In tutto", n.totale ?? 0, `negli ultimi ${filtroReg.giorni} giorni`]
      ].map(([k, ico, eti, val, sotto]) => `
        <button class="mm-riq ${esitoReg === k ? "scelto" : ""}" data-esito="${k}">
          <span class="mm-riq-ico">${ico}</span>
          <span class="mm-riq-num">${val}</span>
          <span class="mm-riq-eti">${esc(eti)}</span>
          <span class="mm-riq-sub">${esc(sotto)}</span>
        </button>`).join("")}
    </div>

    <div class="card">
      <div class="mm-testata mm-testata-sezione">
        <div class="mm-azioni mm-filtri">
          <input id="mm-cerca-reg" class="mm-cerca" value="${esc(filtroReg.cerca)}"
                 placeholder="Cerca destinatario o oggetto">
          <select id="mm-giorni-reg" class="mm-cerca" aria-label="Periodo">
            ${PERIODI.map(([g, et]) => `
              <option value="${g}" ${filtroReg.giorni === g ? "selected" : ""}>${esc(et)}</option>`).join("")}
          </select>
          ${esitoReg !== "tutti" ? `
            <button class="btn btn-ghost btn-sm" id="mm-reg-tutte">✕ Mostra tutte</button>` : ""}
        </div>
        <div class="mm-azioni">
          <button class="btn btn-outline btn-sm" id="mm-reg-csv" ${righe.length ? "" : "disabled"}>⬇ CSV</button>
        </div>
      </div>

      ${righe.length === 0 ? `
        <p class="muted mm-vuoto" style="border:0">
          ${filtroReg.cerca || esitoReg !== "tutti"
            ? "Nessun invio con questi filtri."
            : `Nessun invio negli ultimi ${filtroReg.giorni} giorni. Qui compare quello che è
               partito davvero, non quello che è stato preparato.`}</p>`
      : `
        <div class="mm-tabella">
          <table>
            <thead><tr>
              <th>Quando</th><th>Destinatario</th><th>Oggetto</th><th>Esito</th><th></th>
            </tr></thead>
            <tbody>
              ${righe.map(r => `
                <tr>
                  <td>
                    ${esc(dataOra(r.quando))}
                    <span class="muted" style="display:block;font-size:.7rem">
                      ${r.origine === "crm" ? "dal CRM" : "mail marketing"}</span>
                  </td>
                  <td><strong>${esc(r.destinatario)}</strong></td>
                  <td>
                    <a href="#" data-reg="${esc(r.id)}">${esc(r.oggetto || "(senza oggetto)")}</a>
                    ${r.errore ? `
                      <span class="mm-errore" style="display:block;font-size:.72rem">${esc(String(r.errore).slice(0, 90))}</span>` : ""}
                  </td>
                  <td class="mm-esito">${r.esito === "inviata" ? "✅ Partita" : "⚠️ Fallita"}</td>
                  <td><button class="btn btn-ghost btn-sm" data-reg="${esc(r.id)}">Apri</button></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`}
    </div>

    ${giriView()}
    ${regAperta ? regApertaView() : ""}`;
  }

  /* Gli ultimi venti giri della coda. Non è un dettaglio tecnico
     da nascondere: è la differenza fra «non è partito niente
     perché non c'era niente» e «non è partito niente perché
     qualcosa non va», e sono due situazioni che si rimediano in
     modi opposti. */
  function giriView() {
    const g = registroDati.giri;
    if (!g.length) return "";
    return `
    <details class="card mm-giri">
      <summary>Ultimi giri della coda automatica <span class="muted">(${g.length})</span></summary>
      <div class="mm-tabella" style="margin-top:.6rem">
        <table>
          <thead><tr><th>Quando</th><th>Trovate</th><th>Partite</th><th>Fallite</th><th>In attesa</th><th>Nota</th></tr></thead>
          <tbody>
            ${g.map(r => `
              <tr>
                <td>${esc(dataOra(r.quando))}</td>
                <td>${r.trovati ?? 0}</td>
                <td>${r.partite ?? 0}</td>
                <td>${r.fallite ?? 0}</td>
                <td>${r.in_attesa ?? 0}</td>
                <td>${r.note ? `<span class="mm-errore">${esc(r.note)}</span>` : "—"}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p class="privacy-hint" style="margin:.6rem 0 0">
        I giri più vecchi di trenta giorni vengono cancellati da soli: servono a capire
        se la coda gira adesso, non a conservare uno storico.
      </p>
    </details>`;
  }

  function regApertaView() {
    const r = regAperta;
    return `
    <div class="mm-velo" data-chiudi-reg>
      <div class="card mm-dialogo mm-dialogo-largo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>${esc(r.destinatario)}</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-reg>Chiudi</button>
        </div>
        <table class="admin-kv">
          <tr><th>Quando</th><td>${esc(dataOra(r.quando))}</td></tr>
          <tr><th>Esito</th><td>${r.esito === "inviata" ? "✅ Partita" : "⚠️ Fallita"}</td></tr>
          <tr><th>Da dove</th><td>${r.origine === "crm" ? "Sezione Posta del CRM" : "Mail Marketing"}</td></tr>
          ${r.errore ? `<tr><th>Errore</th><td><span class="mm-errore">${esc(r.errore)}</span></td></tr>` : ""}
        </table>
        <label class="field" style="margin-top:.6rem"><span>Oggetto</span>
          <input value="${esc(r.oggetto || "")}" readonly></label>
        <label class="field" style="margin-top:.6rem"><span>Testo uscito</span>
          <textarea rows="14" class="mail-corpo" readonly>${esc(r.corpo || "")}</textarea></label>
        <p class="privacy-hint">
          Questo è il testo che una persona ha ricevuto: resta com'era, e da qui non si riscrive.
        </p>
      </div>
    </div>`;
  }

  /* ---------------- SEZIONE · BLACKLIST & COMPLIANCE ----------------

     Chi non va contattato, da qualunque parte sia arrivata
     l'opposizione. Le fonti sono due e restano due: la scheda
     del lead per chi è già in archivio, questo elenco per tutti
     gli altri — chi risponde NO da un indirizzo diverso, chi
     scrive per un collega, chi chiede la cancellazione prima
     ancora di essere schedato. Unirle vorrebbe dire inventare
     un lead per ogni opposizione, cioè schedare qualcuno perché
     ha chiesto di non essere schedato.

     Qui si vedono insieme, perché la domanda è una sola. */

  let nereDati = null;        // { blacklist, opposti, numeri }
  let filtroNere = "";
  let aggiuntaNera = false;
  const nuoveNere = { indirizzi: "", motivo: "", origine: "manuale" };

  const ORIGINI = {
    manuale: "aggiunto a mano",
    risposta: "ha risposto di no",
    bounce: "indirizzo inesistente",
    reclamo: "reclamo"
  };

  async function caricaNere() {
    const e = await chiama("blacklist-elenco", { cerca: filtroNere }, 30000);
    nereDati = e.ok
      ? { blacklist: e.blacklist || [], opposti: e.opposti || [], numeri: e.numeri || {} }
      : { blacklist: [], opposti: [], numeri: {} };
    if (!e.ok) QF().toast(e.errore || "Elenco non leggibile.");
    QF().render();
  }

  function blacklistView() {
    if (!nereDati) return `<div class="card"><p class="muted">Lettura dell'elenco…</p></div>`;
    const n = nereDati.numeri;
    const bl = nereDati.blacklist;
    const op = nereDati.opposti;

    return `
    <div class="card mm-compliance">
      <h3 style="margin:0 0 .4rem">Il divieto è un controllo, non un promemoria</h3>
      <p class="muted" style="font-size:.86rem;margin:0">
        Ogni indirizzo che sta qui viene confrontato <strong>prima di ogni invio</strong>, e il
        confronto lo fa il server: non c'è un percorso dentro questo modulo che spedisca saltandolo —
        non la campagna, non l'invio rapido, non la coda automatica, non le sequenze. Chi si è
        opposto viene ricontrollato anche al momento della partenza, perché un'opposizione arrivata
        stanotte deve fermare un messaggio programmato ieri.
      </p>
      <p class="privacy-hint" style="margin:.6rem 0 0">
        È l'art. 21 del GDPR: l'opposizione si esercita in qualunque momento e senza motivarla.
        Da qui non si revoca l'opposizione di nessuno — la revoca la fa chi l'ha espressa,
        e si registra sulla sua scheda nel CRM.
      </p>
    </div>

    <div class="mm-riquadri">
      ${[
        ["🛡", "Indirizzi bloccati", n.indirizzi ?? 0, "in tutto, senza doppioni"],
        ["📝", "In questo elenco", n.blacklist ?? 0, "opposizioni senza una scheda"],
        ["👤", "Opposizioni sui lead", n.opposti ?? 0, "registrate sulla scheda"],
        ["⛔", "Messaggi fermati", n.fermati ?? 0,
          (n.fermati ?? 0) ? "mai partiti, in attesa o in bozza" : "niente diretto a chi si è opposto"]
      ].map(([ico, eti, val, sotto]) => `
        <div class="mm-riq mm-riq-fermo">
          <span class="mm-riq-ico">${ico}</span>
          <span class="mm-riq-num">${val}</span>
          <span class="mm-riq-eti">${esc(eti)}</span>
          <span class="mm-riq-sub">${esc(sotto)}</span>
        </div>`).join("")}
    </div>

    <div class="card">
      <div class="mm-testata mm-testata-sezione">
        <div class="mm-azioni mm-filtri">
          <input id="mm-cerca-nere" class="mm-cerca" value="${esc(filtroNere)}"
                 placeholder="Cerca un indirizzo o un nome">
        </div>
        <div class="mm-azioni">
          <button class="btn btn-outline btn-sm" id="mm-nere-csv" ${bl.length || op.length ? "" : "disabled"}>⬇ CSV</button>
          <button class="btn btn-primary btn-sm" id="mm-nere-aggiungi">+ Aggiungi indirizzi</button>
        </div>
      </div>

      <h4 style="margin:.2rem 0 .6rem">Blacklist <span class="pill">${bl.length}</span></h4>
      ${bl.length === 0 ? `
        <p class="muted mm-vuoto" style="border:0">
          ${filtroNere ? "Nessun indirizzo con questa ricerca."
            : `Nessun indirizzo in blacklist. Ci finisce chi chiede di non essere più contattato
               da un indirizzo che non corrisponde a un lead in archivio.`}</p>`
      : `
        <div class="mm-tabella">
          <table>
            <thead><tr><th>Indirizzo</th><th>Da quando</th><th>Perché</th><th></th></tr></thead>
            <tbody>
              ${bl.map(r => `
                <tr>
                  <td><strong>${esc(r.email)}</strong></td>
                  <td>${esc(dataOra(r.aggiunta_il))}</td>
                  <td>
                    ${esc(ORIGINI[r.origine] || r.origine)}
                    ${r.motivo ? `<span class="muted" style="display:block;font-size:.72rem">${esc(r.motivo)}</span>` : ""}
                  </td>
                  <td><button class="btn btn-ghost btn-sm danger" data-nera-togli="${esc(r.id)}">Togli</button></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`}
    </div>

    <div class="card">
      <h4 style="margin:.2rem 0 .6rem">Opposizioni registrate sui lead <span class="pill">${op.length}</span></h4>
      <p class="muted" style="font-size:.84rem;margin:0 0 .6rem">
        Queste stanno sulla scheda del lead e si gestiscono da lì, nel
        <a href="#/admin/crm/lead">CRM</a>: qui si vedono perché valgono esattamente
        quanto la blacklist, e chi guarda «a chi non posso scrivere» deve vederle nella stessa pagina.
      </p>
      ${op.length === 0 ? `
        <p class="muted mm-vuoto" style="border:0">
          ${filtroNere ? "Nessun lead opposto con questa ricerca." : "Nessun lead si è opposto."}</p>`
      : `
        <div class="mm-tabella">
          <table>
            <thead><tr><th>Chi</th><th>Indirizzo</th><th>Da quando</th><th>Perché</th></tr></thead>
            <tbody>
              ${op.map(l => `
                <tr>
                  <td>
                    <strong>${esc(l.nome || "—")}</strong>
                    ${l.citta ? `<span class="muted" style="display:block;font-size:.72rem">${esc(l.citta)}</span>` : ""}
                  </td>
                  <td>${esc(l.email || "—")}</td>
                  <td>${esc(dataOra(l.no_contatto_il))}</td>
                  <td>${esc(l.no_contatto_motivo || "non indicato")}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`}
    </div>

    ${aggiuntaNera ? aggiuntaNeraView() : ""}`;
  }

  function aggiuntaNeraView() {
    return `
    <div class="mm-velo" data-chiudi-nera>
      <div class="card mm-dialogo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>Aggiungi indirizzi alla blacklist</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-nera>Chiudi</button>
        </div>
        <form id="mm-nera-form">
          <label class="field"><span>Indirizzi *</span>
            <textarea id="n-indirizzi" rows="6" required class="mail-corpo"
              placeholder="uno per riga, oppure separati da virgola">${esc(nuoveNere.indirizzi)}</textarea></label>
          <label class="field" style="margin-top:.6rem"><span>Da dove arriva l'opposizione</span>
            <select id="n-origine">
              ${Object.entries(ORIGINI).map(([k, v]) =>
                `<option value="${k}" ${nuoveNere.origine === k ? "selected" : ""}>${esc(v)}</option>`).join("")}
            </select></label>
          <label class="field" style="margin-top:.6rem"><span>Nota (facoltativa)</span>
            <input id="n-motivo" value="${esc(nuoveNere.motivo)}"
                   placeholder="es. ha risposto il 3 marzo chiedendo la cancellazione"></label>
          <p class="privacy-hint">
            Quello che era già pronto o in coda per questi indirizzi viene annullato subito, non al
            prossimo giro. E se l'indirizzo corrisponde a un lead, l'opposizione viene scritta anche
            sulla sua scheda: le due fonti devono raccontare la stessa cosa.
          </p>
          <div class="mm-azioni" style="justify-content:flex-end;margin-top:.8rem">
            <button type="button" class="btn btn-ghost btn-sm" data-chiudi-nera>Annulla</button>
            <button type="submit" class="btn btn-primary btn-sm">Aggiungi</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  /* ---------------- SEZIONE · AUTOMAZIONI ----------------

     Una sequenza è un seguito programmato: il primo messaggio,
     poi un secondo dopo N giorni a chi non ha dato segno, poi
     basta. La parte che conta non è mandare il secondo: è non
     mandarlo.

     Come si capisce che hanno risposto: non leggendo la posta in
     arrivo. Servirebbe una connessione aperta sulla casella e
     l'interpretazione di quello che arriva, e un errore lì
     vorrebbe dire o seguiti mandati a chi aveva già risposto, o
     seguiti mai mandati. Il segnale che questo modulo usa è
     quello che una persona registra davvero: lo stato del lead
     nel CRM. Appena esce da «contattato», la sequenza si ferma. */

  let seqDati = null;        // { sequenze, iscritti }
  let seqAperta = null;      // sequenza in modifica, o "nuova"
  let seqPassi = [];         // i passi mentre si modificano
  let seqIscritti = null;    // id della sequenza di cui si guardano gli iscritti
  let seqIscrivi = null;     // id della sequenza a cui si sta iscrivendo una lista

  const STATI_ISCRITTO = {
    attivo: ["🟢", "in corso"],
    fermato: ["⏹", "fermato"],
    finito: ["🏁", "arrivato in fondo"]
  };

  async function caricaSeq() {
    const e = await chiama("sequenza-elenco", {}, 30000);
    seqDati = e.ok ? { sequenze: e.sequenze || [], iscritti: e.iscritti || [] } : { sequenze: [], iscritti: [] };
    if (!e.ok) QF().toast(e.errore || "Sequenze non leggibili.");
    QF().render();
  }

  function automazioniView() {
    if (!seqDati) return `<div class="card"><p class="muted">Lettura delle sequenze…</p></div>`;
    const ss = seqDati.sequenze;
    const caselle = smtpDelMittente().filter(s => s.stato === "attivo");

    return `
    <div class="card mm-compliance">
      <h3 style="margin:0 0 .4rem">Quello che conta è quando si ferma</h3>
      <p class="muted" style="font-size:.86rem;margin:0">
        Una sequenza smette da sola quando il lead <strong>esce da «contattato»</strong> nella
        pipeline del CRM — trattativa, cliente o scartato: è il segnale che una persona registra
        davvero. Si ferma anche se il lead si oppone, se l'indirizzo finisce in blacklist, o se
        l'indirizzo non è più valido.
      </p>
      <p class="privacy-hint" style="margin:.6rem 0 0">
        Quello che <em>non</em> fa è leggere la posta in arrivo per accorgersi di una risposta:
        servirebbe tenere una connessione aperta sulla casella e interpretare i messaggi, e
        sbagliare lì vorrebbe dire scrivere di nuovo a chi ti aveva già risposto. Finché sposti
        il lead di stato quando ti rispondono, il seguito non parte.
      </p>
    </div>

    <div class="mm-testata mm-testata-sezione">
      <p class="muted" style="font-size:.86rem;margin:0">
        I messaggi di una sequenza non partono per una strada loro: finiscono nella stessa coda
        di tutto il resto, con gli stessi controlli e lo stesso ritmo. In
        <a href="#/admin/crm/mail/registro">Send Log</a> si vede quando è toccato a chi.
      </p>
      <div class="mm-azioni">
        <button class="btn btn-primary btn-sm" id="mm-seq-nuova">+ Nuova sequenza</button>
      </div>
    </div>

    ${!caselle.length ? `
      <div class="legal-warning mm-avviso" role="status">
        <strong>Nessuna casella attiva.</strong> Una sequenza accesa senza casella accumulerebbe
        messaggi che non hanno da dove uscire.
        <br><a class="btn btn-outline btn-sm" style="margin-top:.6rem" href="#/admin/crm/mail/smtp">Apri SMTP &amp; Sending</a>
      </div>` : ""}

    ${ss.length === 0 ? `
      <div class="card"><p class="muted mm-vuoto" style="border:0">
        Nessuna sequenza. La prima è quasi sempre la stessa: un messaggio, poi un secondo dopo
        cinque giorni a chi non ha risposto, e basta lì.</p></div>`
    : ss.map(s => {
        const c = s.conteggi;
        const casella = D().smtp.find(x => x.id === s.smtp_id);
        return `
        <div class="card mm-sequenza ${s.attiva ? "accesa" : ""}">
          <div class="mm-testata">
            <div style="min-width:0">
              <h3 style="margin:0">${esc(s.nome)}</h3>
              <span class="muted" style="font-size:.78rem">
                ${plurale(s.passi.length, "passo", "passi")} ·
                ${casella ? esc(casella.from_email) : "nessuna casella scelta"}
              </span>
            </div>
            <span class="pill ${s.attiva ? "pill-ok" : ""}">${s.attiva ? "accesa" : "spenta"}</span>
          </div>

          ${s.note ? `<p class="muted" style="font-size:.84rem">${esc(s.note)}</p>` : ""}

          <ol class="mm-passi">
            ${s.passi.map(p => `
              <li>
                <span class="mm-passo-quando">${p.ordine === 1 ? "subito" : `dopo ${plurale(p.dopo_giorni, "giorno", "giorni")}`}</span>
                <span>${esc(p.oggetto || nomeModello(p.modello_id) || "(dal modello)")}</span>
              </li>`).join("")}
          </ol>

          <div class="mm-azioni" style="margin-top:.7rem">
            <span class="muted" style="font-size:.8rem">
              🟢 ${c.attivi} in corso · ⏹ ${c.fermati} fermati · 🏁 ${c.finiti} in fondo
            </span>
          </div>

          <div class="mm-azioni" style="margin-top:.7rem">
            <button class="btn ${s.attiva ? "btn-outline" : "btn-primary"} btn-sm"
                    data-seq-attiva="${esc(s.id)}" data-verso="${s.attiva ? "0" : "1"}">
              ${s.attiva ? "⏸ Spegni" : "▶ Accendi"}</button>
            <button class="btn btn-outline btn-sm" data-seq-iscrivi="${esc(s.id)}">＋ Iscrivi una lista</button>
            <button class="btn btn-outline btn-sm" data-seq-iscritti="${esc(s.id)}">
              Chi è dentro (${c.attivi + c.fermati + c.finiti})</button>
            <button class="btn btn-ghost btn-sm" data-seq-modifica="${esc(s.id)}">Modifica</button>
            <button class="btn btn-ghost btn-sm danger" data-seq-elimina="${esc(s.id)}">🗑</button>
          </div>
        </div>`;
      }).join("")}

    ${seqAperta ? seqEditorView() : ""}
    ${seqIscritti ? seqIscrittiView() : ""}
    ${seqIscrivi ? seqIscriviView() : ""}`;
  }

  const nomeModello = id => (posta?.modelli || []).find(m => m.id === id)?.nome || "";

  function seqEditorView() {
    const nuova = seqAperta === "nuova";
    const s = nuova ? {} : seqAperta;
    const modelli = (posta?.modelli || []).filter(m => m.attivo);
    const caselle = smtpDelMittente();

    return `
    <div class="mm-velo" data-chiudi-seq>
      <div class="card mm-dialogo mm-dialogo-largo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>${nuova ? "Nuova sequenza" : esc(s.nome)}</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-seq>Chiudi</button>
        </div>
        <form id="mm-seq-form">
          <label class="field"><span>Nome *</span>
            <input id="s-nome" value="${esc(s.nome || "")}" required
                   placeholder="es. Primo contatto agenzie Lombardia"></label>

          <div class="mm-griglia-due" style="margin-top:.6rem">
            <label class="field"><span>Casella da cui parte</span>
              <select id="s-smtp">
                <option value="">— scegli —</option>
                ${caselle.map(c => `
                  <option value="${esc(c.id)}" ${s.smtp_id === c.id ? "selected" : ""}>
                    ${esc(c.nome)} · ${esc(c.from_email)}</option>`).join("")}
              </select></label>
            <label class="field"><span>Firma come</span>
              <select id="s-mittente">
                <option value="">— nessuno —</option>
                ${D().mittenti.map(m => `
                  <option value="${esc(m.id)}" ${s.mittente_id === m.id ? "selected" : ""}>${esc(m.etichetta)}</option>`).join("")}
              </select></label>
          </div>

          <label class="field" style="margin-top:.6rem"><span>Nota per te (facoltativa)</span>
            <input id="s-note" value="${esc(s.note || "")}"
                   placeholder="a chi serve, e perché"></label>

          <h4 style="margin:1rem 0 .4rem">I passi</h4>
          <p class="privacy-hint" style="margin:0 0 .6rem">
            Il primo parte appena qualcuno entra. Gli altri contano i giorni
            <strong>dal passo precedente</strong>, non dall'iscrizione.
          </p>

          <div id="mm-seq-passi">
            ${seqPassi.map((p, i) => `
              <div class="mm-passo-mod" data-passo="${i}">
                <div class="mm-testata">
                  <strong>Passo ${i + 1}</strong>
                  ${seqPassi.length > 1 ? `
                    <button type="button" class="btn btn-ghost btn-sm danger" data-passo-togli="${i}">Togli</button>` : ""}
                </div>
                ${i === 0 ? `
                  <p class="muted" style="font-size:.8rem;margin:0 0 .4rem">Parte subito.</p>`
                : `
                  <label class="field"><span>Dopo quanti giorni dal passo ${i}</span>
                    <input type="number" min="1" max="365" data-passo-giorni="${i}" value="${p.dopo_giorni}"></label>`}
                <label class="field" style="margin-top:.4rem"><span>Modello</span>
                  <select data-passo-modello="${i}">
                    <option value="">— scrivo il testo qui sotto —</option>
                    ${modelli.map(m => `
                      <option value="${esc(m.id)}" ${p.modello_id === m.id ? "selected" : ""}>${esc(m.nome)}</option>`).join("")}
                  </select></label>
                ${p.modello_id ? "" : `
                  <label class="field" style="margin-top:.4rem"><span>Oggetto</span>
                    <input data-passo-oggetto="${i}" value="${esc(p.oggetto || "")}"></label>
                  <label class="field" style="margin-top:.4rem"><span>Testo</span>
                    <textarea rows="6" class="mail-corpo" data-passo-corpo="${i}">${esc(p.corpo || "")}</textarea></label>`}
              </div>`).join("")}
          </div>

          ${seqPassi.length < 10 ? `
            <button type="button" class="btn btn-outline btn-sm" id="mm-passo-aggiungi">+ Aggiungi un passo</button>` : `
            <p class="privacy-hint">Dieci passi sono il massimo. Oltre, non è un seguito: è insistenza.</p>`}

          <div class="mm-azioni" style="justify-content:flex-end;margin-top:.9rem">
            <button type="button" class="btn btn-ghost btn-sm" data-chiudi-seq>Annulla</button>
            <button type="submit" class="btn btn-primary btn-sm">Salva</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  function seqIscrittiView() {
    const s = seqDati.sequenze.find(x => x.id === seqIscritti);
    const dentro = seqDati.iscritti.filter(i => i.sequenza_id === seqIscritti);
    return `
    <div class="mm-velo" data-chiudi-dentro>
      <div class="card mm-dialogo mm-dialogo-largo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>Chi è dentro «${esc(s?.nome || "")}»</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-dentro>Chiudi</button>
        </div>
        ${dentro.length === 0 ? `
          <p class="muted mm-vuoto" style="border:0">Nessuno, per ora. Iscrivi una lista.</p>`
        : `
          <div class="mm-tabella">
            <table>
              <thead><tr><th>Chi</th><th>A che punto</th><th>Prossimo</th><th>Stato</th><th></th></tr></thead>
              <tbody>
                ${dentro.map(i => `
                  <tr>
                    <td>
                      <strong>${esc(i.lead?.nome || "—")}</strong>
                      <span class="muted" style="display:block;font-size:.72rem">${esc(i.lead?.email || "")}</span>
                    </td>
                    <td>${i.passo_fatto === 0 ? "non ancora partito" : `passo ${i.passo_fatto} di ${s?.passi.length ?? "?"}`}</td>
                    <td>${i.stato === "attivo" ? esc(dataOra(i.prossimo_il)) : "—"}</td>
                    <td>
                      ${STATI_ISCRITTO[i.stato]?.[0] ?? ""} ${esc(STATI_ISCRITTO[i.stato]?.[1] ?? i.stato)}
                      ${i.fermato_motivo ? `<span class="muted" style="display:block;font-size:.7rem">${esc(i.fermato_motivo)}</span>` : ""}
                    </td>
                    <td>${i.stato === "attivo" ? `
                      <button class="btn btn-ghost btn-sm" data-seq-ferma="${esc(i.id)}">Ferma</button>` : ""}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>`}
      </div>
    </div>`;
  }

  function seqIscriviView() {
    const s = seqDati.sequenze.find(x => x.id === seqIscrivi);
    const liste = D().liste;
    return `
    <div class="mm-velo" data-chiudi-iscrivi>
      <div class="card mm-dialogo" role="dialog" aria-modal="true">
        <div class="mm-testata">
          <h3>Iscrivi una lista a «${esc(s?.nome || "")}»</h3>
          <button class="btn btn-ghost btn-sm" data-chiudi-iscrivi>Chiudi</button>
        </div>
        ${liste.length === 0 ? `
          <p class="muted">Nessuna lista. Creane una in <a href="#/admin/crm/mail/liste">Lead Lists</a>.</p>`
        : `
          <form id="mm-iscrivi-form">
            <label class="field"><span>Quale lista</span>
              <select id="i-lista" required>
                ${liste.map(l => `<option value="${esc(l.id)}">${esc(l.nome)} (${l.quanti})</option>`).join("")}
              </select></label>
            <p class="privacy-hint">
              Chi è già dentro resta al suo passo: reiscriverlo gli riscriverebbe il primo messaggio
              una seconda volta. Vengono saltati chi non ha indirizzo, chi si è opposto, chi è in
              blacklist e chi è già oltre il primo contatto — e ti dico quanti e perché.
            </p>
            <div class="mm-azioni" style="justify-content:flex-end;margin-top:.8rem">
              <button type="button" class="btn btn-ghost btn-sm" data-chiudi-iscrivi>Annulla</button>
              <button type="submit" class="btn btn-primary btn-sm">Iscrivi</button>
            </div>
          </form>`}
      </div>
    </div>`;
  }

  /* ---------------- IN ARRIVO ---------------- */
  function inArrivoView(k) {
    const s = INARRIVO[k];
    if (!s) return "";
    return `
    <div class="card crm-inarrivo">
      <span class="pill">In arrivo</span>
      <h3 style="margin:.6rem 0">${esc(s.titolo)}</h3>
      <table class="admin-kv">
        <tr><th>Cosa farà</th><td>${esc(s.cosa)}</td></tr>
        <tr><th>Come</th><td>${esc(s.come)}</td></tr>
        <tr><th>Cosa serve</th><td>${esc(s.serve)}</td></tr>
      </table>
      <p class="privacy-hint">Questa scheda non è un segnaposto grafico: è quello che verrà costruito, scritto prima di costruirlo così puoi correggermi finché costa poco.</p>
    </div>`;
  }

  /* ---------------- SHELL ---------------- */
  function view(voce) {
    const attiva = VOCI.some(v => v[0] === voce) ? voce : "dashboard";
    rottaCorrente = attiva;
    const m = mittente();

    if (fase !== "pronto") {
      return `
        <div class="admin-top">
          <div>
            <a class="crm-indietro" href="#/admin/crm">← CRM</a>
            <h2 style="margin:.2rem 0 0">Mail Marketing</h2>
          </div>
        </div>
        ${fase === "errore" ? `
          <div class="legal-warning" role="alert">
            <strong>Modulo non disponibile.</strong> ${esc(avviso || "")}
            <br><button class="btn btn-outline btn-sm" style="margin-top:.6rem" id="mm-riprova">Riprova</button>
          </div>`
        : `<div class="card"><p class="muted">Caricamento del modulo…</p></div>`}`;
    }

    const ridotta = menu === "ridotta";
    const nascosta = menu === "nascosta";

    const barra = nascosta ? `
      <button class="mm-riapri" id="mm-menu-apri" aria-label="Mostra il menu">☰</button>`
    : `
      <aside class="mm-menu ${ridotta ? "ridotta" : ""}">
        <div class="mm-menu-testa">
          ${ridotta ? "" : `<span class="eyebrow">Mail Marketing</span>`}
          <div class="mm-menu-bottoni">
            <button class="mm-menu-btn" data-menu="${ridotta ? "aperta" : "ridotta"}"
                    title="${ridotta ? "Espandi il menu" : "Riduci a icone"}"
                    aria-label="${ridotta ? "Espandi il menu" : "Riduci a icone"}">${ridotta ? "»" : "«"}</button>
            ${ridotta ? "" : `
            <button class="mm-menu-btn" data-menu="nascosta" title="Nascondi il menu"
                    aria-label="Nascondi il menu">×</button>`}
          </div>
        </div>

        ${ridotta || D().mittenti.length <= 1 ? "" : `
        <label class="mm-mittente">
          <span class="mm-mittente-eti">Mittente</span>
          <select id="mm-mittente">
            ${D().mittenti.map(x => `
              <option value="${esc(x.id)}" ${m && x.id === m.id ? "selected" : ""}>${esc(x.etichetta)}</option>`).join("")}
          </select>
        </label>`}

        <nav class="mm-voci">
          ${VOCI.map(([k, ico, etichetta]) => `
            <a class="mm-voce ${attiva === k ? "attiva" : ""}" href="#/admin/crm/mail/${k}"
               title="${esc(etichetta)}" ${ridotta ? `aria-label="${esc(etichetta)}"` : ""}>
              <span class="mm-voce-ico">${ico}</span>
              ${ridotta ? "" : `<span>${esc(etichetta)}</span>`}
            </a>`).join("")}
        </nav>
      </aside>`;

    const titolo = VOCI.find(v => v[0] === attiva)[2];

    return `
      <div class="mm-shell ${nascosta ? "senza-menu" : ""}">
        ${barra}
        <div class="mm-corpo">
          <div class="admin-top">
            <div>
              <a class="crm-indietro" href="#/admin/crm">← CRM</a>
              <span class="eyebrow">Mail Marketing${m ? ` · ${esc(m.etichetta)}` : ""}</span>
              <h2 style="margin:.1rem 0 0">${esc(titolo)}</h2>
            </div>
            <button class="btn btn-ghost btn-sm" id="mm-ricarica">↻ Aggiorna</button>
          </div>
          ${attiva === "dashboard" ? dashboardView()
            : attiva === "smtp" ? smtpView()
            : attiva === "lead-finder" ? finderView()
            : attiva === "liste" ? listeView()
            : attiva === "campagne" ? campagneView()
            : attiva === "pronte" ? pronteView()
            : attiva === "modelli" ? modelliView()
            : attiva === "ai-writer" ? scrittoreView()
            : attiva === "registro" ? registroView()
            : attiva === "automazioni" ? automazioniView()
            : attiva === "blacklist" ? blacklistView()
            : inArrivoView(attiva)}
        </div>
      </div>`;
  }

  /* ---------------- EVENTI ---------------- */
  function bind() {
    const $ = s => document.querySelector(s);

    if (fase === "vuoto") { carica(); return; }

    /* Nel Send Log «aggiorna» deve rileggere anche il registro:
       è la sezione in cui un dato vecchio racconta una bugia —
       una coda ferma da un'ora che continua a sembrare in moto. */
    $("#mm-ricarica")?.addEventListener("click", () => {
      if (rottaCorrente === "registro") registroDati = null;
      if (rottaCorrente === "blacklist") nereDati = null;
      if (rottaCorrente === "automazioni") seqDati = null;
      carica();
    });
    $("#mm-riprova")?.addEventListener("click", carica);
    $("#mm-menu-apri")?.addEventListener("click", () => { scriviMenu("aperta"); QF().render(); });

    document.querySelectorAll("[data-menu]").forEach(b =>
      b.addEventListener("click", () => { scriviMenu(b.dataset.menu); QF().render(); }));

    $("#mm-mittente")?.addEventListener("change", e => { scegliMittente(e.target.value); QF().render(); });

    document.querySelectorAll("[data-riq]").forEach(b =>
      b.addEventListener("click", () => { dettaglio = b.dataset.riq; QF().render(); }));

    /* Il velo chiude solo se il clic è sul velo: dentro la scheda
       si può selezionare il testo senza farla sparire. */
    document.querySelectorAll("[data-chiudi-dettaglio]").forEach(el =>
      el.addEventListener("click", e => {
        if (e.target !== el) return;
        dettaglio = null; QF().render();
      }));

    if (dettaglio) chiudiConEsc(() => { dettaglio = null; });

    bindSmtp();
    bindFinder();
    bindListe();
    bindModelli();
    bindScrittore();
    bindCampagne();
    bindPronte();
    bindRegistro();
    bindNere();
    bindSequenze();
  }

  /* ---------------- EVENTI · BLACKLIST ---------------- */
  function bindNere() {
    const $ = s => document.querySelector(s);
    if (rottaCorrente !== "blacklist") return;
    if (!nereDati) { caricaNere(); return; }

    const campo = $("#mm-cerca-nere");
    if (campo) {
      let attesa;
      campo.addEventListener("input", () => {
        clearTimeout(attesa);
        attesa = setTimeout(() => { filtroNere = campo.value.trim(); caricaNere(); }, 400);
      });
    }

    $("#mm-nere-aggiungi")?.addEventListener("click", () => { aggiuntaNera = true; QF().render(); });

    document.querySelectorAll("[data-chiudi-nera]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        aggiuntaNera = false; QF().render();
      }));
    if (aggiuntaNera) chiudiConEsc(() => { aggiuntaNera = false; });

    $("#mm-nera-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      nuoveNere.indirizzi = $("#n-indirizzi").value;
      nuoveNere.origine = $("#n-origine").value;
      nuoveNere.motivo = $("#n-motivo").value.trim();
      const esito = await chiama("blacklist-aggiungi", { ...nuoveNere });
      if (!esito.ok) { QF().toast(esito.errore || "Non riuscito."); return; }

      const note = [
        esito.gia ? `${esito.gia} c'${esito.gia === 1 ? "era" : "erano"} già` : null,
        esito.nonValidi?.length
          ? `${plurale(esito.nonValidi.length, "scartato", "scartati")} perché non ${esito.nonValidi.length === 1 ? "valido" : "validi"}`
          : null,
        esito.annullate ? `${plurale(esito.annullate, "messaggio annullato", "messaggi annullati")}` : null,
        esito.leadSegnati ? `${plurale(esito.leadSegnati, "lead segnato", "lead segnati")} come opposto` : null
      ].filter(Boolean);
      aggiuntaNera = false;
      nuoveNere.indirizzi = ""; nuoveNere.motivo = "";
      QF().toast(`${plurale(esito.aggiunti, "indirizzo bloccato", "indirizzi bloccati")}${note.length ? `; ${note.join("; ")}` : ""}.`);
      nereDati = null;
      await caricaNere();
    });

    document.querySelectorAll("[data-nera-togli]").forEach(b =>
      b.addEventListener("click", async () => {
        const r = nereDati.blacklist.find(x => x.id === b.dataset.neraTogli);
        if (!confirm(
          `Togliere ${r?.email} dalla blacklist?\n\n` +
          `Vuol dire che da questo momento può tornare a ricevere messaggi. ` +
          `Fallo solo se te l'ha chiesto lui: l'opposizione la revoca chi l'ha espressa.`)) return;
        const esito = await chiama("blacklist-togli", { id: b.dataset.neraTogli });
        if (!esito.ok) { QF().toast(esito.errore || "Non riuscito."); return; }
        QF().toast(`${esito.tolto} non è più in blacklist.`);
        nereDati = null;
        await caricaNere();
      }));

    $("#mm-nere-csv")?.addEventListener("click", () => {
      scaricaCsv([
        ...nereDati.blacklist.map(r => ({
          indirizzo: r.email, chi: "", da: r.aggiunta_il, origine: r.origine,
          motivo: r.motivo || "", fonte: "blacklist"
        })),
        ...nereDati.opposti.map(l => ({
          indirizzo: l.email || "", chi: l.nome || "", da: l.no_contatto_il || "", origine: "opposizione",
          motivo: l.no_contatto_motivo || "", fonte: "scheda del lead"
        }))
      ], "chi-non-contattare");
    });
  }

  /* ---------------- EVENTI · AUTOMAZIONI ---------------- */

  /* Un passo vuoto è quello che si vuole quasi sempre: cinque
     giorni dopo il precedente, testo da scrivere. */
  const passoVuoto = primo => ({ dopo_giorni: primo ? 0 : 5, modello_id: "", oggetto: "", corpo: "" });

  function bindSequenze() {
    const $ = s => document.querySelector(s);
    if (rottaCorrente !== "automazioni") return;
    /* L'editor ha bisogno dei modelli, che stanno nell'altra
       funzione: si chiedono una volta e restano. */
    if (!posta) { caricaPosta(); return; }
    if (!seqDati) { caricaSeq(); return; }

    $("#mm-seq-nuova")?.addEventListener("click", () => {
      seqAperta = "nuova"; seqPassi = [passoVuoto(true)]; QF().render();
    });

    document.querySelectorAll("[data-seq-modifica]").forEach(b =>
      b.addEventListener("click", () => {
        const s = seqDati.sequenze.find(x => x.id === b.dataset.seqModifica);
        if (!s) return;
        seqAperta = s;
        seqPassi = s.passi.map(p => ({
          dopo_giorni: p.dopo_giorni, modello_id: p.modello_id || "",
          oggetto: p.oggetto || "", corpo: p.corpo || ""
        }));
        if (!seqPassi.length) seqPassi = [passoVuoto(true)];
        QF().render();
      }));

    document.querySelectorAll("[data-seq-attiva]").forEach(b =>
      b.addEventListener("click", async () => {
        const attiva = b.dataset.verso === "1";
        const esito = await chiama("sequenza-attiva", { id: b.dataset.seqAttiva, attiva });
        if (!esito.ok) { QF().toast(esito.errore || "Non riuscito."); return; }
        QF().toast(attiva
          ? "Sequenza accesa: il primo messaggio parte al prossimo giro della coda."
          : "Sequenza spenta. Chi è dentro resta dov'è: riaccendendola riprende da lì.");
        seqDati = null;
        await caricaSeq();
      }));

    document.querySelectorAll("[data-seq-elimina]").forEach(b =>
      b.addEventListener("click", async () => {
        const s = seqDati.sequenze.find(x => x.id === b.dataset.seqElimina);
        if (!confirm(
          `Eliminare «${s?.nome}»?\n\n` +
          `Spariscono i passi e chi è dentro. Le email già partite restano nel registro.`)) return;
        const esito = await chiama("sequenza-elimina", { id: b.dataset.seqElimina });
        if (!esito.ok) { QF().toast(esito.errore || "Non riuscito."); return; }
        QF().toast("Sequenza eliminata.");
        seqDati = null;
        await caricaSeq();
      }));

    document.querySelectorAll("[data-seq-iscritti]").forEach(b =>
      b.addEventListener("click", () => { seqIscritti = b.dataset.seqIscritti; QF().render(); }));
    document.querySelectorAll("[data-seq-iscrivi]").forEach(b =>
      b.addEventListener("click", () => { seqIscrivi = b.dataset.seqIscrivi; QF().render(); }));

    document.querySelectorAll("[data-chiudi-dentro]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        seqIscritti = null; QF().render();
      }));
    document.querySelectorAll("[data-chiudi-iscrivi]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        seqIscrivi = null; QF().render();
      }));
    document.querySelectorAll("[data-chiudi-seq]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        seqAperta = null; QF().render();
      }));
    if (seqIscritti) chiudiConEsc(() => { seqIscritti = null; });
    if (seqIscrivi) chiudiConEsc(() => { seqIscrivi = null; });
    if (seqAperta) chiudiConEsc(() => { seqAperta = null; });

    document.querySelectorAll("[data-seq-ferma]").forEach(b =>
      b.addEventListener("click", async () => {
        const esito = await chiama("sequenza-ferma", { id: b.dataset.seqFerma });
        if (!esito.ok) { QF().toast(esito.errore || "Non riuscito."); return; }
        QF().toast("Fermato: non riceverà i passi successivi.");
        seqDati = null;
        await caricaSeq();
      }));

    /* --- l'editor dei passi --- */
    /* Ogni modifica finisce subito in seqPassi e la pagina si
       ridisegna: scegliere un modello deve far sparire i campi
       del testo scritto a mano, altrimenti restano lì a far
       credere che valgano tutti e due. */
    const leggiCampi = () => {
      seqPassi.forEach((p, i) => {
        const g = document.querySelector(`[data-passo-giorni="${i}"]`);
        const o = document.querySelector(`[data-passo-oggetto="${i}"]`);
        const c = document.querySelector(`[data-passo-corpo="${i}"]`);
        if (g) p.dopo_giorni = Math.max(1, Number(g.value) || 1);
        if (o) p.oggetto = o.value;
        if (c) p.corpo = c.value;
      });
    };

    document.querySelectorAll("[data-passo-modello]").forEach(s =>
      s.addEventListener("change", () => {
        leggiCampi();
        seqPassi[Number(s.dataset.passoModello)].modello_id = s.value;
        QF().render();
      }));

    $("#mm-passo-aggiungi")?.addEventListener("click", () => {
      leggiCampi();
      seqPassi.push(passoVuoto(false));
      QF().render();
    });

    document.querySelectorAll("[data-passo-togli]").forEach(b =>
      b.addEventListener("click", () => {
        leggiCampi();
        seqPassi.splice(Number(b.dataset.passoTogli), 1);
        if (!seqPassi.length) seqPassi = [passoVuoto(true)];
        /* Il primo passo parte sempre subito, anche se prima era
           il secondo: l'attesa che aveva non ha più un prima. */
        seqPassi[0].dopo_giorni = 0;
        QF().render();
      }));

    $("#mm-seq-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      leggiCampi();
      const esito = await chiama("sequenza-salva", {
        id: seqAperta === "nuova" ? "" : seqAperta.id,
        nome: $("#s-nome").value.trim(),
        smtp_id: $("#s-smtp").value,
        mittente_id: $("#s-mittente").value,
        note: $("#s-note").value.trim(),
        passi: seqPassi
      });
      if (!esito.ok) { QF().toast(esito.errore || "Non riuscito."); return; }
      seqAperta = null;
      QF().toast(`Salvata, ${plurale(esito.passi, "passo", "passi")}.`);
      seqDati = null;
      await caricaSeq();
    });

    $("#mm-iscrivi-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const esito = await chiama("sequenza-iscrivi", { id: seqIscrivi, lista_id: $("#i-lista").value });
      if (!esito.ok) { QF().toast(esito.errore || "Non riuscito."); return; }
      const s = esito.saltati || {};
      const note = [
        s.senzaEmail ? `${s.senzaEmail} senza indirizzo` : null,
        s.opposti ? `${plurale(s.opposti, "opposto", "opposti")}` : null,
        s.inBlacklist ? `${s.inBlacklist} in blacklist` : null,
        s.giaRisposto ? `${s.giaRisposto} già oltre il primo contatto` : null
      ].filter(Boolean);
      seqIscrivi = null;
      QF().toast(`${plurale(esito.iscritti, "lead iscritto", "lead iscritti")}${note.length ? `; saltati: ${note.join(", ")}` : ""}.`);
      seqDati = null;
      await caricaSeq();
    });
  }

  /* ---------------- EVENTI · SEND LOG ---------------- */
  function bindRegistro() {
    const $ = s => document.querySelector(s);
    if (rottaCorrente !== "registro") return;
    if (!registroDati) { caricaRegistro(); return; }

    document.querySelectorAll("[data-esito]").forEach(b =>
      b.addEventListener("click", () => {
        /* Ripremere il riquadro già scelto toglie il filtro:
           è il gesto che si fa senza pensarci. */
        esitoReg = esitoReg === b.dataset.esito ? "tutti" : b.dataset.esito;
        QF().render();
      }));

    $("#mm-reg-tutte")?.addEventListener("click", () => { esitoReg = "tutti"; QF().render(); });

    $("#mm-giorni-reg")?.addEventListener("change", e => {
      filtroReg.giorni = Number(e.target.value) || 30;
      registroDati = null;
      caricaRegistro();
    });

    /* Come altrove: la ricerca parte quando si smette di
       scrivere, non a ogni lettera. */
    const campo = $("#mm-cerca-reg");
    if (campo) {
      let attesa;
      campo.addEventListener("input", () => {
        clearTimeout(attesa);
        attesa = setTimeout(() => {
          filtroReg.cerca = campo.value.trim();
          caricaRegistro();
        }, 400);
      });
    }

    document.querySelectorAll("[data-reg]").forEach(el =>
      el.addEventListener("click", e => {
        e.preventDefault();
        regAperta = registroDati.righe.find(r => r.id === el.dataset.reg) || null;
        QF().render();
      }));

    document.querySelectorAll("[data-chiudi-reg]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        regAperta = null; QF().render();
      }));

    if (regAperta) chiudiConEsc(() => { regAperta = null; });

    $("#mm-reg-csv")?.addEventListener("click", () => {
      const righe = esitoReg === "tutti"
        ? registroDati.righe
        : registroDati.righe.filter(r => r.esito === esitoReg);
      scaricaCsv(righe.map(r => ({
        quando: r.quando || "", destinatario: r.destinatario, oggetto: r.oggetto || "",
        esito: r.esito, origine: r.origine, errore: r.errore || "", corpo: r.corpo || ""
      })), "registro-invii");
    });
  }

  /* Quale lista è aperta lo dice l'indirizzo, non una variabile:
     così il link a una lista si può mandare a qualcuno e il tasto
     indietro torna dove promette. */
  function listaDallUrl() {
    const q = (location.hash || "").split("?")[1];
    return q ? new URLSearchParams(q).get("l") : null;
  }

  async function apriLista(id) {
    listaAperta = id;
    contenuto = null;
    QF().render();
    if (!id) return;
    const e = await chiama("lista-contenuto", { id });
    /* Se nel frattempo si è cambiata lista, questa risposta è
       vecchia: scriverla mostrerebbe i lead di un'altra. */
    if (listaAperta !== id) return;
    contenuto = e.ok ? { lead: e.lead || [], altreListe: e.altreListe || {} } : { lead: [], altreListe: {} };
    if (!e.ok) QF().toast(e.errore || "Lista non leggibile.");
    QF().render();
  }

  /* Un solo posto in cui Escape chiude quello che è aperto. */
  function chiudiConEsc(chiudi) {
    const esci = e => {
      if (e.key !== "Escape") return;
      document.removeEventListener("keydown", esci);
      chiudi(); QF().render();
    };
    document.addEventListener("keydown", esci);
  }

  /* ---------------- EVENTI · LEAD FINDER ---------------- */
  function bindFinder() {
    const $ = s => document.querySelector(s);

    /* I campi si leggono prima di ogni ridisegno: toccare una
       categoria dopo aver scritto la città non deve cancellarla. */
    const leggiRicerca = () => {
      if (!$("#c-citta")) return;
      ricerca.citta = $("#c-citta").value;
      ricerca.provincia = $("#c-prov").value;
      ricerca.zona = $("#c-zona").value;
      ricerca.raggio = Number($("#c-raggio").value);
      ricerca.soloQualita = $("#c-qualita").checked;
    };

    document.querySelectorAll("[data-cat]").forEach(b =>
      b.addEventListener("click", () => {
        leggiRicerca();
        const k = b.dataset.cat;
        if (ricerca.categorie.includes(k)) ricerca.categorie = ricerca.categorie.filter(x => x !== k);
        else if (ricerca.categorie.length >= 4) { QF().toast("Massimo quattro categorie per ricerca."); return; }
        else ricerca.categorie.push(k);
        QF().render();
      }));

    $("#mm-cerca-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      leggiRicerca();
      if (!ricerca.categorie.length) { QF().toast("Scegli almeno una categoria."); return; }
      if (!ricerca.citta.trim() && !ricerca.zona.trim()) { QF().toast("Indica almeno la città."); return; }
      cercando = true; QF().render();
      const esito = await chiamaLead("cerca", {
        modalita: "precisa",
        via: ricerca.zona, citta: ricerca.citta, provincia: ricerca.provincia,
        categorie: ricerca.categorie, raggio: ricerca.raggio,
        soloQualita: ricerca.soloQualita, massimo: 50
      });
      cercando = false;
      if (!esito.ok) { risultati = null; avvisiRicerca = []; QF().toast(esito.errore || "Ricerca non riuscita."); QF().render(); return; }
      risultati = esito.risultati || [];
      avvisiRicerca = esito.avvisi || [];
      /* Preselezionate solo quelle nuove: chi è già in archivio
         sta magari lavorando qualcuno, e riproporlo come nuovo
         è il modo per scrivergli due volte. */
      scelti = new Set(risultati.filter(r => !r.gia).map(r => r.place_id));
      QF().render();
    });

    $("#mm-tutti")?.addEventListener("change", e => {
      const nuovi = risultati.filter(r => !r.gia);
      scelti = e.target.checked ? new Set(nuovi.map(r => r.place_id)) : new Set();
      QF().render();
    });

    document.querySelectorAll("[data-scegli]").forEach(c =>
      c.addEventListener("change", () => {
        const id = c.dataset.scegli;
        if (c.checked) scelti.add(id); else scelti.delete(id);
        QF().render();
      }));

    $("#mm-csv-risultati")?.addEventListener("click", () => {
      const righe = risultati.filter(r => scelti.has(r.place_id));
      scaricaCsv(righe.map(r => ({
        nome: r.nome, categoria: CATEGORIE[r.categoria] || r.categoria, citta: r.citta,
        provincia: r.provincia, indirizzo: r.indirizzo, telefono: r.telefono,
        sito: r.sito, email: "", valutazione: r.valutazione, recensioni: r.recensioni
      })), "ricerca");
    });

    $("#mm-salva-lista")?.addEventListener("click", () => {
      salvaAperto = true;
      listaScelta = D().liste[0]?.id || "__nuova__";
      QF().render();
    });

    $("#s-lista")?.addEventListener("change", e => {
      if (document.getElementById("s-nome")) nuovaLista = document.getElementById("s-nome").value;
      listaScelta = e.target.value;
      QF().render();
    });

    document.querySelectorAll("[data-chiudi-salva]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        salvaAperto = false; QF().render();
      }));
    if (salvaAperto) chiudiConEsc(() => { salvaAperto = false; });

    $("#mm-salva-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      let lista = listaScelta;
      if (!lista) { QF().toast("Scegli una lista."); return; }
      if (lista === "__nuova__") {
        nuovaLista = document.getElementById("s-nome").value.trim();
        const c = await chiama("lista-salva", { nome: nuovaLista, mittente_id: mittente()?.id });
        if (!c.ok) { QF().toast(c.errore || "Lista non creata."); return; }
        lista = c.id;
      }

      const selezionate = risultati.filter(r => scelti.has(r.place_id));
      /* Prima in archivio (chi c'è già resta com'è), poi nella
         lista: sono due cose diverse e vanno in quest'ordine. */
      const nuove = selezionate.filter(r => !r.gia);
      if (nuove.length) {
        const s = await chiamaLead("salva", { lead: nuove, query: `${ricerca.citta} · ${ricerca.categorie.join(", ")}` });
        if (!s.ok) { QF().toast(s.errore || "Salvataggio non riuscito."); return; }
      }
      const a = await chiama("lista-aggiungi", { lista_id: lista, place_ids: selezionate.map(r => r.place_id) });
      if (!a.ok) { QF().toast(a.errore || "Non riuscito ad aggiungerle alla lista."); return; }

      salvaAperto = false; nuovaLista = "";
      scelti = new Set();
      risultati = risultati.map(r => ({ ...r, gia: true }));
      QF().toast(`${plurale(a.aggiunti, "attività aggiunta", "attività aggiunte")} alla lista.`);
      await carica();
    });
  }

  /* ---------------- EVENTI · LEAD LISTS ---------------- */
  function bindListe() {
    const $ = s => document.querySelector(s);

    /* La lista aperta la decide l'indirizzo: se è cambiato, si
       carica il contenuto nuovo. */
    if (rottaCorrente === "liste") {
      const voluta = listaDallUrl();
      if (voluta !== listaAperta) { apriLista(voluta); return; }
    }

    $("#mm-lista-nuova")?.addEventListener("click", () => { listaModulo = { nome: "" }; QF().render(); });
    $("#mm-lista-modifica")?.addEventListener("click", () => {
      listaModulo = D().liste.find(x => x.id === listaAperta) || null;
      QF().render();
    });

    document.querySelectorAll("[data-chiudi-lista]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        listaModulo = null; QF().render();
      }));
    if (listaModulo) chiudiConEsc(() => { listaModulo = null; });

    $("#mm-lista-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const esito = await chiama("lista-salva", {
        id: listaModulo.id || undefined,
        nome: $("#l-nome").value,
        descrizione: $("#l-desc").value,
        mittente_id: mittente()?.id
      });
      if (!esito.ok) { QF().toast(esito.errore || "Non riuscito."); return; }
      const era = listaModulo.id;
      listaModulo = null;
      QF().toast(era ? "Lista rinominata." : "Lista creata.");
      await carica();
      if (!era) location.hash = `#/admin/crm/mail/liste?l=${esito.id}`;
    });

    $("#mm-lista-elimina")?.addEventListener("click", async () => {
      const l = D().liste.find(x => x.id === listaAperta);
      if (!confirm(`Eliminare la lista «${l?.nome}»? I lead restano in archivio: sparisce solo il raggruppamento.`)) return;
      const e = await chiama("lista-elimina", { id: listaAperta });
      if (!e.ok) { QF().toast(e.errore || "Non riuscito."); return; }
      QF().toast("Lista eliminata. I lead sono rimasti in archivio.");
      listaAperta = null; contenuto = null;
      location.hash = "#/admin/crm/mail/liste";
      await carica();
    });

    document.querySelectorAll("[data-togli]").forEach(b =>
      b.addEventListener("click", async () => {
        const e = await chiama("lista-togli", { lista_id: listaAperta, lead_id: b.dataset.togli });
        if (!e.ok) { QF().toast(e.errore || "Non riuscito."); return; }
        QF().toast("Tolto dalla lista. Resta in archivio.");
        const id = listaAperta;
        await carica();
        listaAperta = null;
        await apriLista(id);
      }));

    /* Lead a mano */
    $("#mm-lead-mano")?.addEventListener("click", () => { leadModulo = {}; QF().render(); });
    document.querySelectorAll("[data-chiudi-lead]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        leadModulo = null; QF().render();
      }));
    if (leadModulo) chiudiConEsc(() => { leadModulo = null; });

    $("#mm-lead-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const esito = await chiama("lead-aggiungi", {
        lista_id: listaAperta,
        nome: $("#m-nome").value, email: $("#m-email").value, telefono: $("#m-tel").value,
        citta: $("#m-citta").value, provincia: $("#m-prov").value,
        indirizzo: $("#m-ind").value, sito: $("#m-sito").value,
        origine: $("#m-origine").value
      });
      if (!esito.ok) { QF().toast(esito.errore || "Non riuscito."); return; }
      leadModulo = null;
      QF().toast("Aggiunto alla lista.");
      const id = listaAperta;
      await carica();
      listaAperta = null;
      await apriLista(id);
    });

    /* Import ed export */
    $("#mm-importa")?.addEventListener("click", () => $("#mm-file")?.click());
    $("#mm-file")?.addEventListener("change", async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const righe = leggiCsv(await file.text());
      if (!righe.length) { QF().toast("Il file non contiene righe leggibili."); return; }
      if (!confirm(`Importare ${plurale(righe.length, "riga", "righe")} in questa lista?`)) return;
      const esito = await chiama("lead-aggiungi", { lista_id: listaAperta, lead: righe, fonte: "file" }, 60000);
      if (!esito.ok) { QF().toast(esito.errore || "Import non riuscito."); return; }
      const note = [
        esito.gia ? `${plurale(esito.gia, "era già in archivio", "erano già in archivio")} e ${esito.gia === 1 ? "è stata aggiunta" : "sono state aggiunte"} solo alla lista` : null,
        esito.scartate ? `${esito.scartate} scartate perché senza nome o con email non valida` : null
      ].filter(Boolean);
      QF().toast(`${plurale(esito.inseriti, "nuova attività importata", "nuove attività importate")}${note.length ? `; ${note.join("; ")}` : ""}.`);
      const id = listaAperta;
      await carica();
      listaAperta = null;
      await apriLista(id);
    });

    $("#mm-esporta")?.addEventListener("click", () => {
      const l = D().liste.find(x => x.id === listaAperta);
      scaricaCsv((contenuto?.lead || []).map(x => ({
        nome: x.nome, email: x.email, telefono: x.telefono, sito: x.sito,
        citta: x.citta, provincia: x.provincia, indirizzo: x.indirizzo,
        categoria: CATEGORIE[x.categoria] || x.categoria,
        fonte: x.fonte, origine: x.query_origine,
        no_contatto: x.no_contatto ? "si" : ""
      })), l?.nome || "lista");
    });
  }

  /* ---------------- CSV ----------------
     Un formato che Excel apre senza chiedere niente: separatore
     punto e virgola, e il BOM davanti perché le lettere accentate
     non diventino geroglifici. */

  const INTESTAZIONI = {
    nome: ["nome", "azienda", "attività", "attivita", "ragione sociale", "business_name", "name", "company"],
    email: ["email", "mail", "e-mail", "posta"],
    telefono: ["telefono", "tel", "phone", "cellulare"],
    sito: ["sito", "sito web", "website", "url", "web"],
    citta: ["città", "citta", "comune", "city"],
    provincia: ["provincia", "prov", "pr"],
    indirizzo: ["indirizzo", "via", "address"],
    categoria: ["categoria", "settore", "category"],
    origine: ["origine", "fonte", "provenienza", "source"]
  };

  function leggiCsv(testo) {
    const righe = [];
    let riga = [], campo = "", virgolette = false;
    for (let i = 0; i < testo.length; i++) {
      const c = testo[i];
      if (virgolette) {
        if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') virgolette = false;
        else campo += c;
      } else if (c === '"') virgolette = true;
      else if (c === "," || c === ";" || c === "\t") { riga.push(campo); campo = ""; }
      else if (c === "\n") { riga.push(campo); righe.push(riga); riga = []; campo = ""; }
      else if (c !== "\r") campo += c;
    }
    if (campo || riga.length) { riga.push(campo); righe.push(riga); }

    const testa = (righe.shift() || []).map(h => h.trim().toLowerCase().replace(/^﻿/, ""));
    /* Le intestazioni si riconoscono in italiano e in inglese:
       un file esportato da un gestionale italiano non deve essere
       rinominato a mano prima di poter entrare. */
    const dove = {};
    for (const [campo2, nomi] of Object.entries(INTESTAZIONI)) {
      const i = testa.findIndex(h => nomi.includes(h));
      if (i >= 0) dove[campo2] = i;
    }
    return righe
      .filter(r => r.some(v => v.trim()))
      .map(r => Object.fromEntries(Object.entries(dove).map(([k, i]) => [k, (r[i] || "").trim()])))
      .filter(r => r.nome || r.email);
  }

  function scaricaCsv(righe, nome) {
    if (!righe.length) { QF().toast("Non c'è niente da esportare."); return; }
    const colonne = Object.keys(righe[0]);
    const cella = v => {
      const s = v == null ? "" : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const testo = "﻿" + [colonne.join(";"), ...righe.map(r => colonne.map(c => cella(r[c])).join(";"))].join("\n");
    const url = URL.createObjectURL(new Blob([testo], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nome.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    QF().toast(`${plurale(righe.length, "riga esportata", "righe esportate")}.`);
  }

  /* ---------------- EVENTI · TEMPLATES ---------------- */
  /* ---------------- EVENTI · CAMPAIGNS ---------------- */
  function bindCampagne() {
    const $ = s => document.querySelector(s);
    if (rottaCorrente !== "campagne") return;
    /* Il modulo ha bisogno dei modelli, che stanno nell'altra
       funzione: senza, la tendina sarebbe vuota senza spiegazione. */
    if (!posta) { caricaPosta(); return; }

    $("#mm-campagna-nuova")?.addEventListener("click", () => { campagnaModulo = {}; QF().render(); });
    document.querySelectorAll("[data-chiudi-campagna]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        campagnaModulo = null; QF().render();
      }));
    if (campagnaModulo) chiudiConEsc(() => { campagnaModulo = null; });

    $("#mm-campagna-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const esito = await chiama("campagna-salva", {
        nome: $("#k-nome").value, lista_id: $("#k-lista").value,
        modello_id: $("#k-modello").value, smtp_id: $("#k-smtp").value || undefined,
        pausa_secondi: Number($("#k-pausa").value), note: $("#k-note").value,
        mittente_id: mittente()?.id
      }, 60000);
      if (!esito.ok) { QF().toast(esito.errore || "Campagna non creata."); return; }
      const s = esito.saltati;
      const note = [
        s.senzaEmail ? `${s.senzaEmail} senza indirizzo` : null,
        s.opposti ? plurale(s.opposti, "opposto", "opposti") : null,
        s.inBlacklist ? `${s.inBlacklist} in blacklist` : null,
        s.giaContattati ? plurale(s.giaContattati, "già contattato", "già contattati") : null
      ].filter(Boolean);
      campagnaModulo = null;
      QF().toast(`${plurale(esito.creati, "messaggio preparato", "messaggi preparati")}${note.length ? `; saltati ${note.join(", ")}` : ""}.`);
      await carica();
      location.hash = `#/admin/crm/mail/pronte?c=${esito.id}`;
    });

    document.querySelectorAll("[data-campagna-elimina]").forEach(b =>
      b.addEventListener("click", async () => {
        const c = D().campagne.find(x => x.id === b.dataset.campagnaElimina);
        if (!confirm(`Eliminare «${c?.nome}»? I messaggi mai partiti spariscono; quelli già inviati restano nel registro.`)) return;
        const e = await chiama("campagna-elimina", { id: b.dataset.campagnaElimina });
        if (!e.ok) { QF().toast(e.errore || "Non riuscito."); return; }
        QF().toast("Campagna eliminata. Gli invii già fatti restano.");
        await carica();
      }));
  }

  /* ---------------- EVENTI · EMAIL READY ---------------- */
  function bindPronte() {
    const $ = s => document.querySelector(s);
    if (rottaCorrente !== "pronte") return;

    /* La campagna da guardare la dice l'indirizzo. */
    const q = (location.hash || "").split("?")[1];
    const voluta = q ? new URLSearchParams(q).get("c") || "" : "";
    if (voluta !== filtroPosta.campagna_id) {
      filtroPosta = { ...filtroPosta, campagna_id: voluta };
      postaDati = null; scelte = new Set();
      caricaPosta2();
      return;
    }
    if (!postaDati) { caricaPosta2(); return; }

    document.querySelectorAll("[data-filtro]").forEach(b =>
      b.addEventListener("click", () => {
        filtroPosta.stato = filtroPosta.stato === b.dataset.filtro ? "tutti" : b.dataset.filtro;
        scelte = new Set();
        caricaPosta2();
      }));

    $("#mm-filtro-via")?.addEventListener("click", () => {
      filtroPosta = { stato: "tutti", cerca: "", campagna_id: "" };
      scelte = new Set();
      location.hash = "#/admin/crm/mail/pronte";
    });

    /* La ricerca parte quando si smette di scrivere: una chiamata
       per ogni lettera è una chiamata che non serve a nessuno. */
    const campo = $("#mm-cerca-posta");
    if (campo) {
      let attesa;
      campo.addEventListener("input", () => {
        clearTimeout(attesa);
        attesa = setTimeout(() => {
          filtroPosta.cerca = campo.value.trim();
          scelte = new Set();
          caricaPosta2();
        }, 400);
      });
    }

    $("#mm-posta-tutti")?.addEventListener("change", e => {
      const sel = postaDati.posta.filter(m => m.stato !== "inviata");
      scelte = e.target.checked ? new Set(sel.map(m => m.id)) : new Set();
      QF().render();
    });

    document.querySelectorAll("[data-posta]").forEach(c =>
      c.addEventListener("change", () => {
        if (c.checked) scelte.add(c.dataset.posta); else scelte.delete(c.dataset.posta);
        QF().render();
      }));

    document.querySelectorAll("[data-apri]").forEach(b =>
      b.addEventListener("click", e => {
        e.preventDefault();
        postaAperta = postaDati.posta.find(m => m.id === b.dataset.apri) || null;
        QF().render();
      }));

    document.querySelectorAll("[data-chiudi-posta]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        postaAperta = null; QF().render();
      }));
    if (postaAperta) chiudiConEsc(() => { postaAperta = null; });

    $("#mm-posta-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const id = postaAperta.id;
      const esito = await chiama("posta-salva", {
        id, oggetto: $("#p-oggetto").value, corpo: $("#p-corpo").value
      });
      if (!esito.ok) { QF().toast(esito.errore || "Non salvato."); return; }
      await chiama("posta-stato", { ids: [id], stato: "pronta" });
      postaAperta = null;
      QF().toast("Salvato e approvato.");
      await caricaPosta2();
    });

    document.querySelectorAll("[data-massa]").forEach(b =>
      b.addEventListener("click", async () => {
        const e = await chiama("posta-stato", { ids: [...scelte], stato: b.dataset.massa });
        if (!e.ok) { QF().toast(e.errore || "Non riuscito."); return; }
        const persi = e.richiesti - e.aggiornati;
        QF().toast(`${plurale(e.aggiornati, "messaggio aggiornato", "messaggi aggiornati")}${persi ? `; ${persi} già partiti, lasciati com'erano` : ""}.`);
        scelte = new Set();
        await caricaPosta2();
      }));

    $("#mm-posta-elimina")?.addEventListener("click", async () => {
      if (!confirm(`Eliminare ${plurale(scelte.size, "messaggio", "messaggi")}? Quelli già partiti restano.`)) return;
      const e = await chiama("posta-elimina", { ids: [...scelte] });
      if (!e.ok) { QF().toast(e.errore || "Non riuscito."); return; }
      QF().toast(`${plurale(e.eliminati, "messaggio eliminato", "messaggi eliminati")}.`);
      scelte = new Set();
      await caricaPosta2();
    });

    $("#mm-invia-ora")?.addEventListener("click", () => { invioAperto = "adesso"; QF().render(); });
    $("#mm-programma")?.addEventListener("click", () => {
      invioAperto = "programma"; quandoInvio = fraUnOra(); QF().render();
    });

    document.querySelectorAll("[data-chiudi-invio]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        invioAperto = null; QF().render();
      }));
    if (invioAperto) chiudiConEsc(() => { invioAperto = null; });

    $("#mm-invio-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const smtp = $("#i-smtp").value;
      if (invioAperto === "programma") {
        quandoInvio = $("#i-quando").value;
        const esito = await chiama("posta-programma", { ids: [...scelte], smtp_id: smtp, quando: quandoInvio });
        if (!esito.ok) { QF().toast(esito.errore || "Non riuscito."); return; }
        invioAperto = null; scelte = new Set();
        QF().toast(`${plurale(esito.programmati, "messaggio in coda", "messaggi in coda")} per il ${dataOra(esito.quando)}.`);
        await caricaPosta2();
        return;
      }

      const pausa = Number($("#i-pausa").value);
      if (!confirm(`Mandare ${plurale(scelte.size, "messaggio", "messaggi")} adesso? Una volta partiti non si richiamano.`)) return;
      inInvio = true; QF().render();
      const esito = await chiama("posta-invia", { ids: [...scelte], smtp_id: smtp, pausa_secondi: pausa }, 150000);
      inInvio = false;
      if (!esito.ok) { QF().toast(esito.errore || "Invio non riuscito."); QF().render(); return; }

      const note = [
        esito.fallite ? `${esito.fallite} fallite` : null,
        esito.bloccati ? `${esito.bloccati} rifiutate perché opposte o in blacklist` : null,
        esito.rimasti ? `${esito.rimasti} ancora da mandare: premi di nuovo` : null,
        esito.limite ? `limite giornaliero della casella: ne restavano ${esito.limite}` : null
      ].filter(Boolean);
      invioAperto = null;
      if (!esito.rimasti) scelte = new Set();
      QF().toast(`${plurale(esito.partite, "messaggio partito", "messaggi partiti")}${note.length ? `; ${note.join("; ")}` : ""}.`);
      await carica();
      await caricaPosta2();
    });

    $("#mm-posta-csv")?.addEventListener("click", () => {
      scaricaCsv(postaDati.posta.map(m => ({
        destinatario: m.destinatario, oggetto: m.oggetto, stato: m.stato,
        programmata_per: m.programmata_per || "", inviata_il: m.inviata_il || "",
        errore: m.errore || "", corpo: m.corpo
      })), "posta-in-uscita");
    });
  }

  function bindModelli() {
    const $ = s => document.querySelector(s);
    if (rottaCorrente !== "modelli" && rottaCorrente !== "ai-writer") return;
    if (!posta) { caricaPosta(); return; }

    $("#mm-modello-nuovo")?.addEventListener("click", () => {
      modelloAperto = { nome: "", oggetto: "", corpo: "", scopo: "contatto", attivo: true };
      QF().render();
    });

    document.querySelectorAll("[data-modello]").forEach(b =>
      b.addEventListener("click", () => {
        modelloAperto = posta.modelli.find(m => m.id === b.dataset.modello) || null;
        QF().render();
      }));

    document.querySelectorAll("[data-chiudi-modello]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        modelloAperto = null; QF().render();
      }));
    if (modelloAperto) chiudiConEsc(() => { modelloAperto = null; });

    $("#mm-modello-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const esito = await chiamaMail("salva-modello", {
        id: modelloAperto.id || undefined,
        nome: $("#t-nome").value, oggetto: $("#t-oggetto").value,
        corpo: $("#t-corpo").value, scopo: $("#t-scopo").value,
        attivo: $("#t-attivo").checked
      });
      if (!esito.ok) { QF().toast(esito.errore || "Salvataggio non riuscito."); return; }
      modelloAperto = null;
      QF().toast("Modello salvato.");
      await caricaPosta();
    });

    document.querySelectorAll("[data-modello-elimina]").forEach(b =>
      b.addEventListener("click", async () => {
        const m = posta.modelli.find(x => x.id === b.dataset.modelloElimina);
        if (!confirm(`Eliminare «${m?.nome}»? Le email già partite restano nel registro con il testo che avevano.`)) return;
        const e = await chiamaMail("elimina-modello", { id: b.dataset.modelloElimina });
        if (!e.ok) { QF().toast(e.errore || "Non riuscito."); return; }
        QF().toast("Modello eliminato.");
        await caricaPosta();
      }));

    document.querySelectorAll("[data-anteprima]").forEach(b =>
      b.addEventListener("click", async () => {
        /* L'anteprima si fa su un lead vero quando ce n'è uno
           sotto mano: un modello che sembra a posto con dei
           segnaposto vuoti è il modo per accorgersene dopo. */
        const lead = (contenuto?.lead || []).find(l => !l.no_contatto);
        const e = await chiamaMail("anteprima", { modelloId: b.dataset.anteprima, leadId: lead?.id });
        if (!e.ok) { QF().toast(e.errore || "Anteprima non riuscita."); return; }
        anteprima = { oggetto: e.oggetto, corpo: e.corpo, avvisi: e.avvisi };
        QF().render();
      }));

    document.querySelectorAll("[data-chiudi-anteprima]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        anteprima = null; QF().render();
      }));
    if (anteprima) chiudiConEsc(() => { anteprima = null; });
  }

  /* ---------------- EVENTI · AI WRITER ---------------- */
  function bindScrittore() {
    const $ = s => document.querySelector(s);

    $("#mm-ai-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      scrittura.scopo = $("#a-scopo").value;
      scrittura.tono = $("#a-tono").value;
      scrittura.lead_id = $("#a-lead").value;
      scrittura.istruzioni = $("#a-istruzioni").value;
      scrivendo = true; QF().render();
      const esito = await chiama("ai-scrivi", { ...scrittura, mittente_id: mittente()?.id }, 120000);
      scrivendo = false;
      if (!esito.ok) { QF().toast(esito.errore || "Scrittura non riuscita."); QF().render(); return; }
      bozza = esito;
      QF().render();
    });

    /* Il testo modificato a mano si legge prima del render: dopo,
       la casella è già stata ricostruita con quello di partenza. */
    const leggiBozza = () => {
      if (!$("#b-oggetto")) return;
      bozza = { ...bozza, oggetto: $("#b-oggetto").value, corpo: $("#b-corpo").value };
    };

    $("#mm-bozza-scarta")?.addEventListener("click", () => { bozza = null; QF().render(); });

    $("#mm-bozza-modello")?.addEventListener("click", async () => {
      leggiBozza();
      if (!bozza.oggetto.trim() || !bozza.corpo.trim()) {
        QF().toast("Servono oggetto e testo per salvarlo come modello.");
        return;
      }
      const nome = prompt("Con che nome salvarlo?", `Bozza ${new Date().toLocaleDateString("it-IT")}`);
      if (!nome) return;
      const esito = await chiamaMail("salva-modello", {
        nome, oggetto: bozza.oggetto, corpo: bozza.corpo,
        scopo: scrittura.scopo === "presentazione" ? "contatto" : scrittura.scopo,
        attivo: true
      });
      if (!esito.ok) { QF().toast(esito.errore || "Salvataggio non riuscito."); return; }
      bozza = null;
      QF().toast("Salvata fra i modelli.");
      await caricaPosta();
      location.hash = "#/admin/crm/mail/modelli";
    });
  }

  function bindSmtp() {
    const $ = s => document.querySelector(s);

    $("#mm-smtp-nuova")?.addEventListener("click", () => {
      modulo = vuota(); QF().render();
    });
    $("#mm-smtp-aruba")?.addEventListener("click", () => {
      /* Il "setup rapido" del progetto su Lovable, con i valori di
         questo dominio invece che di quello di allora. */
      const m = mittente();
      modulo = {
        ...vuota(),
        nome: `Casella ${m?.etichetta || "principale"}`,
        from_email: m?.from_email || "",
        from_nome: m?.from_nome || m?.etichetta || "",
        utente: m?.from_email || ""
      };
      QF().render();
    });

    document.querySelectorAll("[data-modifica]").forEach(b =>
      b.addEventListener("click", () => {
        const s = D().smtp.find(x => x.id === b.dataset.modifica);
        if (!s) return;
        /* Il fornitore non è salvato: si riconosce dall'host, che
           è il dato vero. Se non corrisponde a nessuno è "a mano". */
        const fornitore = Object.entries(FORNITORI)
          .find(([, [, h]]) => h && h === s.host)?.[0] || "manuale";
        modulo = { ...vuota(), ...s, fornitore, password: "" };
        QF().render();
      }));

    /* Cambiare fornitore compila host, porta e TLS, ma non deve
       cancellare quello che è già stato scritto negli altri campi. */
    const leggiModulo = () => {
      if (!modulo) return;
      const v = id => document.getElementById(id);
      if (!v("f-nome")) return;
      modulo = {
        ...modulo,
        nome: v("f-nome").value,
        limite_giornaliero: v("f-limite").value,
        from_email: v("f-from").value,
        from_nome: v("f-fromnome").value,
        rispondi_a: v("f-rispondi").value,
        host: v("f-host").value,
        porta: v("f-porta").value,
        tls: v("f-tls").checked,
        utente: v("f-utente").value,
        password: v("f-password").value
      };
    };

    $("#f-fornitore")?.addEventListener("change", e => {
      leggiModulo();
      const [, host, porta, tls] = FORNITORI[e.target.value] || FORNITORI.manuale;
      modulo = { ...modulo, fornitore: e.target.value, host, porta, tls };
      QF().render();
    });

    $("#mm-smtp-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      leggiModulo();
      const f = modulo;
      const esito = await chiama("smtp-salva", {
        id: f.id || undefined,
        mittente_id: mittente()?.id,
        nome: f.nome, host: f.host, porta: Number(f.porta), tls: f.tls,
        utente: f.utente, password: f.password || undefined,
        from_email: f.from_email, from_nome: f.from_nome, rispondi_a: f.rispondi_a,
        limite_giornaliero: Number(f.limite_giornaliero),
        firma: f.firma, firma_attiva: f.firma_attiva,
        stato: f.id ? undefined : "attivo"
      });
      if (!esito.ok) { QF().toast(esito.errore || "Salvataggio non riuscito."); return; }
      modulo = null;
      QF().toast("Casella salvata. Ora provala: è l'unico modo per sapere se funziona.");
      await carica();
    });

    document.querySelectorAll("[data-chiudi-modulo]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        modulo = null; QF().render();
      }));
    if (modulo) chiudiConEsc(() => { modulo = null; });

    document.querySelectorAll("[data-prova]").forEach(b =>
      b.addEventListener("click", async () => {
        const id = b.dataset.prova;
        inCorso = `prova:${id}`; QF().render();
        const e = await chiama("smtp-prova", { id }, 60000);
        inCorso = null;
        QF().toast(e.ok
          ? `Funziona: messaggio di prova mandato a ${e.destinatario}.`
          : (e.errore || "Prova non riuscita."));
        await carica();
      }));

    document.querySelectorAll("[data-dns]").forEach(b =>
      b.addEventListener("click", async () => {
        const id = b.dataset.dns;
        inCorso = `dns:${id}`; QF().render();
        const e = await chiama("smtp-dns", { id }, 60000);
        inCorso = null;
        if (!e.ok) { QF().toast(e.errore || "Verifica non riuscita."); QF().render(); return; }
        dnsAperto = id;
        await carica();
      }));

    document.querySelectorAll("[data-chiudi-dns]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        dnsAperto = null; QF().render();
      }));
    if (dnsAperto) chiudiConEsc(() => { dnsAperto = null; });

    document.querySelectorAll("[data-copia]").forEach(b =>
      b.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(b.dataset.copia);
          QF().toast("Copiato: incollalo nel pannello del dominio.");
        } catch (_) {
          QF().toast("Il browser non ha concesso gli appunti: seleziona il testo e copialo a mano.");
        }
      }));

    document.querySelectorAll("[data-sospendi]").forEach(b =>
      b.addEventListener("click", async () => {
        const e = await chiama("smtp-stato", { id: b.dataset.sospendi, stato: b.dataset.a });
        if (!e.ok) { QF().toast(e.errore || "Non riuscito."); return; }
        QF().toast(b.dataset.a === "sospeso" ? "Casella in pausa: non spedirà più." : "Casella riattivata.");
        await carica();
      }));

    document.querySelectorAll("[data-elimina]").forEach(b =>
      b.addEventListener("click", async () => {
        const s = D().smtp.find(x => x.id === b.dataset.elimina);
        if (!confirm(`Eliminare «${s?.nome}»? Sparisce anche la password conservata nel Vault, e non è recuperabile.`)) return;
        const e = await chiama("smtp-elimina", { id: b.dataset.elimina });
        if (!e.ok) { QF().toast(e.errore || "Eliminazione non riuscita."); return; }
        QF().toast("Casella eliminata.");
        await carica();
      }));

    document.querySelectorAll("[data-salva-firma]").forEach(b =>
      b.addEventListener("click", async () => {
        const id = b.dataset.salvaFirma;
        const s = D().smtp.find(x => x.id === id);
        if (!s) return;
        /* I campi si leggono prima del render, non dopo: dopo il
           modulo è già stato ricostruito vuoto. */
        const firma = document.querySelector(`[data-firma="${id}"]`)?.value ?? "";
        const attiva = document.querySelector(`[data-firma-attiva="${id}"]`)?.checked ?? true;
        const e = await chiama("smtp-salva", {
          id, nome: s.nome, host: s.host, porta: s.porta, tls: s.tls,
          utente: s.utente, from_email: s.from_email, from_nome: s.from_nome,
          rispondi_a: s.rispondi_a, limite_giornaliero: s.limite_giornaliero,
          firma, firma_attiva: attiva
        });
        if (!e.ok) { QF().toast(e.errore || "Salvataggio non riuscito."); return; }
        QF().toast(attiva ? "Firma salvata." : "Firma salvata, ma spenta: non verrà aggiunta.");
        await carica();
      }));

    document.querySelectorAll("[data-rapido]").forEach(b =>
      b.addEventListener("click", () => {
        rapidoAperto = b.dataset.rapido;
        rapido = { destinatari: "", oggetto: "", corpo: "" };
        QF().render();
      }));

    document.querySelectorAll("[data-chiudi-rapido]").forEach(el =>
      el.addEventListener("click", e => {
        if (el.classList.contains("mm-velo") && e.target !== el) return;
        rapidoAperto = null; QF().render();
      }));
    if (rapidoAperto) chiudiConEsc(() => { rapidoAperto = null; });

    $("#mm-rapido-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      rapido = {
        destinatari: $("#r-dest").value,
        oggetto: $("#r-oggetto").value,
        corpo: $("#r-corpo").value
      };
      const quanti = rapido.destinatari.split(/[,;\n]/).filter(x => x.trim()).length;
      if (!confirm(`Mandare questo messaggio a ${plurale(quanti, "indirizzo", "indirizzi")}? Una volta partito non si richiama.`)) return;
      inCorso = "rapido"; QF().render();
      const esito = await chiama("smtp-invio-rapido", { id: rapidoAperto, ...rapido }, 90000);
      inCorso = null;
      if (!esito.ok) { QF().toast(esito.errore || "Invio non riuscito."); QF().render(); return; }
      rapidoAperto = null;
      QF().toast(esito.falliti?.length
        ? `${plurale(esito.riusciti.length, "messaggio partito", "messaggi partiti")}, ${esito.falliti.length} no. Il dettaglio è nel registro.`
        : `${plurale(esito.riusciti.length, "messaggio partito", "messaggi partiti")}.`);
      await carica();
    });
  }

  window.QF_MM = { view, bind, dimentica };
})();
