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
          ${attiva === "dashboard" ? dashboardView()
            : attiva === "smtp" ? smtpView()
            : inArrivoView(attiva)}
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

    if (dettaglio) chiudiConEsc(() => { dettaglio = null; });

    bindSmtp();
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
