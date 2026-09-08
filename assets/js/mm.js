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

  function dimentica() { dati = null; fase = "vuoto"; avviso = null; dettaglio = null; }

  /* ---------------- DATI ---------------- */
  const D = () => dati || {
    mittenti: [], smtp: [], liste: [], campagne: [],
    ultimeInviate: [], ultimiErrori: [], giorni: [],
    invio: { configurato: false, mancanti: [] },
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

  const INARRIVO = {
    "lead-finder": {
      titolo: "Lead Finder",
      cosa: "Cercare attività per categoria e zona e salvarle come lead, con la ricerca che le ha prodotte scritta accanto.",
      come: "Le stesse API ufficiali di Google che alimentano già «Lead locali» nel CRM, così un'attività trovata resta una riga sola.",
      serve: "Il segreto QF_GOOGLE_KEY, già necessario per la sezione «Lead locali»."
    },
    liste: {
      titolo: "Lead Lists",
      cosa: "Raggruppare i lead in liste da usare come destinatari di una campagna, con conteggi e sovrapposizioni fra liste.",
      come: "Le liste puntano ai lead del CRM invece di copiarli: un'azienda che si oppone sparisce da tutte le liste insieme.",
      serve: "Niente: le tabelle ci sono già."
    },
    campagne: {
      titolo: "Campaigns",
      cosa: "Preparare un invio a una lista partendo da un modello, rivederlo riga per riga e programmarlo.",
      come: "Ogni campagna genera le sue email in stato «bozza»: si guardano tutte prima che parta qualcosa.",
      serve: "Una casella di invio configurata."
    },
    pronte: {
      titolo: "Email Ready",
      cosa: "La coda di ciò che è scritto e approvato ma non ancora partito: si corregge, si programma, si annulla.",
      come: "Ogni messaggio è una riga con il suo testo definitivo, non un modello da riempire al momento dell'invio.",
      serve: "Una casella di invio configurata."
    },
    "ai-writer": {
      titolo: "Email AI Writer",
      cosa: "Scrivere il testo di un messaggio a partire da ciò che si sa dell'azienda destinataria.",
      come: "Un modello linguistico chiamato dal server. Il testo prodotto è una bozza da leggere, mai qualcosa che parte da solo.",
      serve: "Una chiave API di un fornitore di modelli. Ogni email scritta ha un costo: va deciso quale usare."
    },
    modelli: {
      titolo: "Templates",
      cosa: "I modelli riutilizzabili con i segnaposto, e l'anteprima su un destinatario vero.",
      come: "Assorbe i modelli che il CRM ha già nella sezione Mail: non si riparte da zero, si spostano qui.",
      serve: "Niente."
    },
    smtp: {
      titolo: "SMTP & Sending",
      cosa: "Le caselle da cui si spedisce: prova di connessione, limite giornaliero, quante ne sono partite oggi, e il controllo di SPF, DKIM e DMARC sul dominio.",
      come: "La password resta nei segreti del progetto. Qui si vede se la casella funziona, non che cosa la apre.",
      serve: "I segreti QF_SMTP_HOST, QF_SMTP_USER, QF_SMTP_PASS."
    },
    registro: {
      titolo: "Send Log",
      cosa: "Tutto ciò che è partito e tutto ciò che è fallito, con l'errore esatto e la possibilità di cercare per indirizzo.",
      come: "Assorbe il registro che il CRM ha già nella sezione Mail.",
      serve: "Niente."
    },
    automazioni: {
      titolo: "Automazioni",
      cosa: "Sequenze: un secondo messaggio dopo N giorni a chi non ha risposto, e lo stop automatico appena risponde.",
      come: "Una coda letta a intervalli regolari dal database. Su Lovable questa voce era un segnaposto vuoto: qui viene costruita davvero.",
      serve: "La coda di invio del passo precedente."
    },
    blacklist: {
      titolo: "Blacklist & Compliance",
      cosa: "Gli indirizzi da non contattare mai, da qualunque parte arrivi l'opposizione, e la prova di quando è arrivata.",
      come: "Un divieto controllato prima di ogni invio, non un promemoria. Anche questa su Lovable era un segnaposto.",
      serve: "Niente."
    }
  };

  /* ---------------- DASHBOARD ---------------- */

  function avvisoInvio() {
    const inv = D().invio;
    if (inv.configurato) return "";
    /* Qui il numero non serve: gli indirizzi mancanti sono
       elencati subito dopo. Serve solo che verbo e articolo
       vadano d'accordo con quanti sono. */
    const uno = inv.mancanti.length === 1;
    return `
      <div class="legal-warning mm-avviso" role="status">
        <strong>Non si può ancora spedire.</strong>
        ${uno ? "Manca il segreto" : "Mancano i segreti"}
        <code>${inv.mancanti.map(esc).join("</code>, <code>")}</code>
        nel progetto Supabase. Su Aruba l'host è <code>smtps.aruba.it</code> sulla porta 465,
        e l'utente è l'indirizzo completo della casella.
        <br>Tutto il resto del modulo funziona lo stesso: si preparano liste, modelli e campagne,
        e restano ferme finché non c'è una casella da cui farle partire.
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
          ${attiva === "dashboard" ? dashboardView() : inArrivoView(attiva)}
        </div>
      </div>`;
  }

  /* ---------------- EVENTI ---------------- */
  function bind() {
    const $ = s => document.querySelector(s);

    if (fase === "vuoto") { carica(); return; }

    $("#mm-ricarica")?.addEventListener("click", carica);
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

    if (dettaglio) {
      const esci = e => {
        if (e.key !== "Escape") return;
        document.removeEventListener("keydown", esci);
        dettaglio = null; QF().render();
      };
      document.addEventListener("keydown", esci);
    }
  }

  window.QF_MM = { view, bind, dimentica };
})();
