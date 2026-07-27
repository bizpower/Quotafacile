/* ============================================================
   QuotaFacile — Documenti legali & informative GDPR
   ------------------------------------------------------------
   Contiene: Privacy Policy, Cookie Policy, Termini e Condizioni,
   Note legali (disclaimer IVASS), Chi siamo / Contatti.

   ⚠️ PRIMA DELLA PUBBLICAZIONE
   Compilare tutti i campi di LEGAL_CONFIG marcati con «...».
   Finché restano da compilare, le pagine mostrano un avviso
   giallo ben visibile: nessun dato societario inventato viene
   pubblicato al posto di quelli reali.
   ============================================================ */
"use strict";

(function () {

  /* ---------------- 1. DATI DEL TITOLARE (DA COMPILARE) ---------------- */
  const LEGAL_CONFIG = {
    brand: "QuotaFacile",
    dominio: "www.quotafacile.it",

    /* Identità del titolare del trattamento / gestore del sito */
    ragioneSociale: "«Ragione sociale»",
    sedeLegale: "«Via, CAP, Città (Provincia), Italia»",
    /* Comunicata dal titolare. Attenzione: una partita IVA italiana ha
       11 cifre — questa ne ha 9, quindi il controllo qui sotto la segnala
       ancora come da completare. Non ho integrato le cifre mancanti:
       indovinarle produrrebbe la partita IVA di un'altra impresa. */
    piva: "138078966",
    cf: "«Codice fiscale»",
    rea: "«Numero REA / Registro Imprese»",
    pec: "«indirizzo PEC»",
    foro: "«città del foro competente»",

    /* Contatti operativi (devono essere caselle realmente attive) */
    emailInfo: "info@quotafacile.it",
    emailPrivacy: "privacy@quotafacile.it",
    emailSegnalazioni: "segnalazioni@quotafacile.it",

    /* Responsabile Protezione Dati: null se non nominato (non obbligatorio
       per questa tipologia di trattamento, art. 37 GDPR) */
    dpo: null,

    /* Infrastruttura */
    hosting: "GitHub Pages — GitHub Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA (USA), gruppo Microsoft",
    hostingNota: "Fornitore aderente al EU-U.S. Data Privacy Framework",

    ultimoAggiornamento: "27 luglio 2026",
    versione: "1.0"
  };

  const DA_COMPILARE = /^«.*»$/;

  /* Un dato formalmente invalido in un'informativa vale quanto un dato
     assente: va segnalato allo stesso modo, non stampato come se fosse
     corretto. Le regole di formato dei campi che sappiamo verificare: */
  const FORMATO = {
    piva: v => /^\d{11}$/.test(v),
    cf: v => /^[0-9]{11}$/.test(v) || /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i.test(v),
    pec: v => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)
  };
  const nonValido = (k, v) => typeof v === "string" && !DA_COMPILARE.test(v)
    && FORMATO[k] && !FORMATO[k](v);

  const invalidi = () => new Set(Object.entries(LEGAL_CONFIG)
    .filter(([k, v]) => nonValido(k, v)).map(([, v]) => v));
  const todo = v => (DA_COMPILARE.test(v) || invalidi().has(v))
    ? `<mark class="legal-todo">${v}</mark>`
    : v;
  const mancanti = () => Object.entries(LEGAL_CONFIG)
    .filter(([k, v]) => typeof v === "string" && (DA_COMPILARE.test(v) || nonValido(k, v)))
    .map(([k]) => k);

  const C = LEGAL_CONFIG;

  /* ---------------- 2. LAYOUT ---------------- */
  function page(titolo, occhiello, corpo, { indice = true } = {}) {
    const warn = mancanti().length ? `
      <div class="legal-warning" role="alert">
        <strong>⚠️ Documento non ancora pubblicabile.</strong>
        Dati identificativi del titolare mancanti o in formato non valido:
        <code>${mancanti().join("</code>, <code>")}</code>.
        Compilali in <code>assets/js/legal.js</code> → <code>LEGAL_CONFIG</code>:
        senza di essi l'informativa non soddisfa l'art. 13 GDPR né l'art. 7 del d.lgs. 70/2003.
      </div>` : "";
    return `
    <section class="section legal-page">
      <div class="container" style="max-width:820px">
        <div class="section-head" style="margin-bottom:1.2rem">
          <span class="eyebrow">${occhiello}</span>
          <h1 style="font-size:clamp(1.8rem,4.5vw,2.6rem)">${titolo}</h1>
          <p class="muted" style="font-size:.85rem">
            Ultimo aggiornamento: ${C.ultimoAggiornamento} · versione ${C.versione}
          </p>
        </div>
        ${warn}
        <article class="legal-body">${corpo}</article>
        ${indice ? `
        <div class="legal-nav">
          <a href="#/privacy">Privacy Policy</a>
          <a href="#/cookie-policy">Cookie Policy</a>
          <a href="#/termini">Termini e Condizioni</a>
          <a href="#/note-legali">Note legali</a>
          <a href="#/contatti">Contatti</a>
          <button class="linklike" data-open-consent>Gestisci i cookie</button>
        </div>` : ""}
      </div>
    </section>`;
  }

  /* ---------------- 3. PRIVACY POLICY ---------------- */
  const privacy = () => page("Informativa sul trattamento dei dati personali", "Privacy Policy", `
    <p>La presente informativa è resa ai sensi degli articoli 13 e 14 del Regolamento (UE) 2016/679
    (“GDPR”) e del d.lgs. 196/2003 come modificato dal d.lgs. 101/2018, a chi consulta il sito
    <strong>${C.dominio}</strong> e utilizza i servizi della piattaforma ${C.brand}.</p>

    <h2>1. Titolare del trattamento</h2>
    <p>Titolare del trattamento è ${todo(C.ragioneSociale)}, con sede legale in ${todo(C.sedeLegale)},
    P. IVA ${todo(C.piva)}, iscritta al Registro delle Imprese al n. ${todo(C.rea)},
    PEC ${todo(C.pec)}.</p>
    <p>Per ogni richiesta in materia di protezione dei dati puoi scrivere a
    <a href="mailto:${C.emailPrivacy}">${C.emailPrivacy}</a>.</p>
    <p>${C.dpo
      ? `Il Responsabile della Protezione dei Dati (DPO) è contattabile a ${C.dpo}.`
      : `Il Titolare non è tenuto alla nomina di un Responsabile della Protezione dei Dati ai sensi dell'art. 37 GDPR, non ricorrendone i presupposti. Le richieste degli interessati sono gestite direttamente dal Titolare all'indirizzo indicato sopra.`}</p>

    <h2>2. Quali dati trattiamo</h2>
    <h3>a) Dati di navigazione</h3>
    <p>I sistemi informatici e le procedure software preposte al funzionamento del sito acquisiscono,
    nel normale esercizio, alcuni dati la cui trasmissione è implicita nell'uso dei protocolli di
    comunicazione di Internet (indirizzo IP, tipo di browser e sistema operativo, data e ora della
    richiesta, pagine visitate). Questi dati sono trattati dal fornitore di hosting per finalità di
    sicurezza e diagnostica e non sono utilizzati dal Titolare per identificare gli utenti.</p>

    <h3>b) Dati forniti volontariamente</h3>
    <ul>
      <li><strong>Richiesta di preventivo o consulenza:</strong> nome e cognome, città, email, telefono,
      ramo assicurativo di interesse ed eventuali note libere che decidi di inserire.</li>
      <li><strong>Domande pubblicate in bacheca:</strong> il testo della domanda e la categoria. La domanda
      è pubblica: non inserirvi dati personali, sanitari o riferimenti identificativi.</li>
      <li><strong>Registrazione come professionista (Area Pro):</strong> nome e cognome, ruolo, ragione
      sociale, numero di iscrizione al RUI, città, telefono ed email professionali, biografia,
      specializzazioni. Questi dati compongono la “QuotaPass” e sono <strong>pubblici per scelta
      dell'interessato</strong>, in quanto finalizzati alla promozione dell'attività professionale.</li>
      <li><strong>Iscrizione alla lista di attesa dell'app:</strong> il solo indirizzo email.</li>
      <li><strong>Segnalazioni di contenuti:</strong> il contenuto segnalato, la motivazione e, se fornito,
      il tuo recapito.</li>
    </ul>

    <h3>c) Categorie particolari di dati</h3>
    <p>La piattaforma <strong>non richiede e non intende raccogliere</strong> dati relativi alla salute o
    altre categorie particolari (art. 9 GDPR). Se li inserisci spontaneamente in un campo libero, il
    trattamento avviene sulla base del tuo consenso esplicito manifestato con l'invio; ti invitiamo
    comunque a non inserirli e a discuterne direttamente con l'intermediario.</p>

    <h2>3. Finalità, basi giuridiche e conservazione</h2>
    <div class="table-scroll">
    <table class="legal-table">
      <thead><tr><th>Finalità</th><th>Base giuridica</th><th>Conservazione</th></tr></thead>
      <tbody>
        <tr>
          <td>Erogare il servizio, inoltrare la tua richiesta agli intermediari pertinenti e permettere loro di ricontattarti</td>
          <td>Art. 6.1.b — misure precontrattuali richieste dall'interessato</td>
          <td>24 mesi dall'ultimo contatto</td>
        </tr>
        <tr>
          <td>Pubblicazione di domande e risposte nella bacheca Q&amp;A</td>
          <td>Art. 6.1.b (per i professionisti) e art. 6.1.a — consenso (per gli utenti)</td>
          <td>Fino a richiesta di rimozione; i contenuti anonimizzati possono restare online</td>
        </tr>
        <tr>
          <td>Pubblicazione del profilo professionale (QuotaPass)</td>
          <td>Art. 6.1.b — esecuzione del contratto di servizio con il professionista</td>
          <td>Fino alla cancellazione dell'account, poi 30 giorni di backup</td>
        </tr>
        <tr>
          <td>Verifica dell'iscrizione al RUI dichiarata dal professionista</td>
          <td>Art. 6.1.f — legittimo interesse ad assicurare l'attendibilità della vetrina</td>
          <td>Durata dell'account</td>
        </tr>
        <tr>
          <td>Invio della notifica di lancio dell'app</td>
          <td>Art. 6.1.a — consenso, revocabile in ogni momento</td>
          <td>Fino a revoca o al lancio dell'app</td>
        </tr>
        <tr>
          <td>Cookie e strumenti di misurazione non tecnici</td>
          <td>Art. 6.1.a — consenso (art. 122 d.lgs. 196/2003)</td>
          <td>Vedi <a href="#/cookie-policy">Cookie Policy</a></td>
        </tr>
        <tr>
          <td>Sicurezza della piattaforma, prevenzione abusi e difesa in giudizio</td>
          <td>Art. 6.1.f — legittimo interesse</td>
          <td>12 mesi, salvo contenzioso in corso</td>
        </tr>
        <tr>
          <td>Adempimenti fiscali e contabili</td>
          <td>Art. 6.1.c — obbligo di legge</td>
          <td>10 anni (art. 2220 c.c.)</td>
        </tr>
      </tbody>
    </table>
    </div>

    <h2>4. Natura del conferimento</h2>
    <p>Il conferimento dei dati contrassegnati come obbligatori nei moduli è necessario per dare
    seguito alla richiesta: senza di essi non è materialmente possibile inoltrare il preventivo o
    creare il profilo professionale. Il conferimento degli altri dati è facoltativo.</p>

    <h2>5. A chi comunichiamo i dati</h2>
    <ul>
      <li><strong>Agli intermediari assicurativi destinatari della tua richiesta.</strong> Questo è il punto
      centrale: ${C.brand} trasmette la tua richiesta all'intermediario che hai scelto o agli
      intermediari specializzati nel ramo indicato. <strong>Da quel momento l'intermediario tratta i tuoi
      dati come autonomo titolare</strong>, per finalità proprie e sotto la propria responsabilità, con
      una propria informativa che sei invitato a richiedergli. ${C.brand} non risponde dei
      trattamenti da lui effettuati.</li>
      <li><strong>A fornitori tecnici</strong> (hosting, posta elettronica, eventuale invio email), nominati
      responsabili del trattamento ai sensi dell'art. 28 GDPR.</li>
      <li><strong>All'Autorità giudiziaria o alle autorità di vigilanza</strong>, quando previsto per legge.</li>
    </ul>
    <p>I dati <strong>non sono diffusi</strong> — salvo i contenuti che scegli tu stesso di pubblicare in
    bacheca o nel profilo professionale — e <strong>non sono venduti né ceduti a terzi</strong> per finalità
    di marketing.</p>

    <h2>6. Trasferimento fuori dall'Unione Europea</h2>
    <p>Il sito è ospitato su ${C.hosting}. ${C.hostingNota}. Eventuali trasferimenti verso paesi terzi
    avvengono sulla base di una decisione di adeguatezza della Commissione europea o delle Clausole
    Contrattuali Standard (art. 46 GDPR). L'elenco aggiornato dei fornitori è disponibile su richiesta
    a <a href="mailto:${C.emailPrivacy}">${C.emailPrivacy}</a>.</p>

    <h2>7. I tuoi diritti</h2>
    <p>In qualità di interessato puoi esercitare in ogni momento i diritti previsti dagli artt. 15-22 GDPR:</p>
    <ul>
      <li><strong>Accesso</strong> — sapere quali dati trattiamo e ottenerne copia;</li>
      <li><strong>Rettifica</strong> — correggere dati inesatti o incompleti;</li>
      <li><strong>Cancellazione</strong> (“diritto all'oblio”) — nei casi previsti dall'art. 17;</li>
      <li><strong>Limitazione</strong> del trattamento;</li>
      <li><strong>Portabilità</strong> — ricevere i dati in formato strutturato e leggibile da dispositivo automatico;</li>
      <li><strong>Opposizione</strong> al trattamento fondato sul legittimo interesse;</li>
      <li><strong>Revoca del consenso</strong> in qualsiasi momento, senza pregiudicare la liceità del
      trattamento effettuato prima della revoca.</li>
    </ul>
    <p>Le richieste vanno inviate a <a href="mailto:${C.emailPrivacy}">${C.emailPrivacy}</a>; riceverai
    riscontro entro 30 giorni (prorogabili di 60 in casi complessi, con avviso motivato).
    Hai inoltre diritto di proporre <strong>reclamo al Garante per la protezione dei dati personali</strong>
    (Piazza Venezia 11, 00187 Roma — <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener">garanteprivacy.it</a>)
    o di ricorrere all'Autorità giudiziaria.</p>

    <h2>8. Processi decisionali automatizzati</h2>
    <p>${C.brand} non adotta processi decisionali interamente automatizzati né attività di
    profilazione che producano effetti giuridici sull'interessato ai sensi dell'art. 22 GDPR.
    L'ordinamento dei profili in bacheca si basa esclusivamente su parametri pubblici e verificabili
    (numero di risposte pubblicate, voti ricevuti dagli utenti).</p>

    <h2>9. Sicurezza</h2>
    <p>Adottiamo misure tecniche e organizzative adeguate al rischio (art. 32 GDPR): trasmissione
    cifrata via HTTPS, accesso limitato al personale autorizzato, minimizzazione dei dati raccolti.
    Nessun sistema è però sicuro al 100%: in caso di violazione dei dati con rischio elevato per i
    diritti degli interessati, procederemo alla notifica ai sensi degli artt. 33 e 34 GDPR.</p>

    <h2>10. Minori</h2>
    <p>I servizi non sono destinati a persone di età inferiore a 18 anni. Non raccogliamo
    consapevolmente dati di minori; se ne venissimo a conoscenza, provvederemo alla cancellazione
    su segnalazione a <a href="mailto:${C.emailPrivacy}">${C.emailPrivacy}</a>.</p>

    <h2>11. Modifiche</h2>
    <p>Questa informativa può essere aggiornata per adeguamenti normativi o evoluzioni del servizio.
    La versione vigente è sempre pubblicata a questo indirizzo con l'indicazione della data di
    ultimo aggiornamento; le modifiche sostanziali saranno segnalate in home page.</p>
  `);

  /* ---------------- 4. COOKIE POLICY ---------------- */
  const cookie = () => page("Cookie Policy", "Cookie e strumenti di tracciamento", `
    <p>Questo documento descrive i cookie e le tecnologie analoghe (localStorage, sessionStorage,
    identificatori) utilizzati su <strong>${C.dominio}</strong>, in attuazione dell'art. 122 del
    d.lgs. 196/2003 e delle <em>Linee guida cookie e altri strumenti di tracciamento</em> del Garante
    Privacy (provv. n. 231 del 10 giugno 2021).</p>

    <h2>1. Cosa sono</h2>
    <p>I cookie sono piccoli file di testo che i siti inviano al browser, dove vengono memorizzati e
    poi ritrasmessi al successivo accesso. Tecnologie equivalenti come il <strong>localStorage</strong>
    salvano informazioni nel browser senza trasmetterle al server: ai fini normativi ricevono lo
    stesso trattamento dei cookie, ed è per questo che le troverai elencate qui sotto.</p>

    <h2>2. Il principio che seguiamo</h2>
    <p>${C.brand} installa <strong>solo strumenti tecnici necessari</strong> finché non presti un consenso
    diverso. Nessuno strumento di misurazione o di marketing viene attivato prima della tua scelta,
    e chiudere il banner con la “X” <strong>non</strong> equivale ad accettare. Rifiutare è tanto
    semplice quanto accettare: i due pulsanti hanno pari evidenza.</p>

    <h2>3. Categorie utilizzate</h2>

    <h3>a) Strumenti tecnici necessari <span class="pill pill-on">sempre attivi</span></h3>
    <p>Indispensabili per il funzionamento del sito e per ricordare le tue scelte. Non richiedono
    consenso (art. 122, comma 1, d.lgs. 196/2003).</p>

    <h3>b) Preferenze <span class="pill">consenso</span></h3>
    <p>Memorizzano impostazioni non essenziali per migliorare l'esperienza (es. filtri della bacheca,
    bozze di risposta).</p>

    <h3>c) Statistici / analytics <span class="pill">consenso</span></h3>
    <p>Misurano in forma aggregata l'utilizzo del sito (pagine viste, provenienza del traffico) per
    capire quali contenuti sono utili. <strong>Alla data di questo documento nessuno strumento
    analytics è attivo sulla piattaforma:</strong> la categoria è predisposta e verrà popolata, con
    aggiornamento di questa pagina, al momento dell'eventuale attivazione.</p>

    <h3>d) Marketing / profilazione <span class="pill">consenso</span></h3>
    <p>Consentono di mostrare annunci in linea con gli interessi e di misurarne il rendimento.
    <strong>Nessuno strumento di questa categoria è attualmente installato.</strong></p>

    <h2>4. Elenco degli strumenti installati</h2>
    <div class="table-scroll">
    <table class="legal-table">
      <thead><tr><th>Nome</th><th>Tipo</th><th>Categoria</th><th>Finalità</th><th>Durata</th></tr></thead>
      <tbody>
        <tr>
          <td><code>qf_consent_v1</code></td><td>localStorage</td><td>Tecnico necessario</td>
          <td>Conserva la prova e il contenuto delle tue scelte sui cookie</td><td>12 mesi</td>
        </tr>
        <tr>
          <td><code>quotafacile_db_v1</code></td><td>localStorage</td><td>Tecnico necessario</td>
          <td>Contiene i dati dell'applicazione sul tuo dispositivo (profilo professionale, bozze,
          voti già espressi). Resta nel tuo browser e non viene trasmesso a ${C.brand}</td><td>Persistente fino a cancellazione</td>
        </tr>
        <tr>
          <td><code>fonts.googleapis.com</code> / <code>fonts.gstatic.com</code></td><td>Terza parte</td><td>Tecnico</td>
          <td>Erogazione dei caratteri tipografici del sito. Non installa cookie, ma comporta la
          comunicazione dell'indirizzo IP a Google Ireland Ltd.</td><td>Nessuna memorizzazione locale</td>
        </tr>
      </tbody>
    </table>
    </div>
    <p class="muted" style="font-size:.85rem">Ogni nuovo strumento verrà aggiunto a questa tabella
    prima della sua attivazione.</p>

    <h2>5. Come gestire il consenso</h2>
    <p>Puoi modificare o revocare le tue scelte in qualsiasi momento:</p>
    <p><button class="btn btn-primary btn-sm" data-open-consent>⚙️ Gestisci le preferenze cookie</button></p>
    <p>Il pulsante è sempre raggiungibile dal footer di ogni pagina. In alternativa puoi agire dalle
    impostazioni del browser:
    <a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener">Chrome</a> ·
    <a href="https://support.mozilla.org/it/kb/protezione-antitracciamento-avanzata-firefox-desktop" target="_blank" rel="noopener">Firefox</a> ·
    <a href="https://support.apple.com/it-it/guide/safari/sfri11471/mac" target="_blank" rel="noopener">Safari</a> ·
    <a href="https://support.microsoft.com/it-it/microsoft-edge" target="_blank" rel="noopener">Edge</a>.
    La cancellazione dei dati del browser rimuove anche la memoria del consenso: al successivo
    accesso il banner ricomparirà.</p>

    <h2>6. Cosa succede se rifiuto</h2>
    <p>Il sito continua a funzionare integralmente. Rifiutando le categorie non necessarie perdi solo
    la memorizzazione di alcune preferenze di comodità; nessuna funzionalità della bacheca, della
    directory o dei preventivi viene limitata.</p>

    <h2>7. Titolare e contatti</h2>
    <p>Titolare del trattamento: ${todo(C.ragioneSociale)} — <a href="mailto:${C.emailPrivacy}">${C.emailPrivacy}</a>.
    Per le altre informazioni sul trattamento consulta la <a href="#/privacy">Privacy Policy</a>.</p>
  `);

  /* ---------------- 5. TERMINI E CONDIZIONI ---------------- */
  const termini = () => page("Termini e Condizioni d'uso", "Condizioni generali di servizio", `
    <p>Le presenti condizioni disciplinano l'accesso e l'utilizzo della piattaforma ${C.brand},
    raggiungibile all'indirizzo ${C.dominio}, gestita da ${todo(C.ragioneSociale)} (di seguito il
    “Gestore”). L'utilizzo del sito comporta l'accettazione integrale di queste condizioni.</p>

    <h2>1. Che cosa è (e che cosa non è) ${C.brand}</h2>
    <p>${C.brand} è una <strong>piattaforma tecnologica di visibilità e messa in contatto</strong> tra
    utenti che cercano informazioni o preventivi assicurativi e intermediari iscritti al Registro
    Unico degli Intermediari assicurativi e riassicurativi (RUI) tenuto dall'IVASS.</p>
    <p class="legal-callout"><strong>${C.brand} non è un intermediario assicurativo.</strong> Non svolge
    attività di distribuzione assicurativa ai sensi dell'art. 106 del d.lgs. 209/2005 (Codice delle
    Assicurazioni Private) e del Regolamento IVASS n. 40/2018, non è iscritta al RUI, non colloca
    polizze, non presta consulenza assicurativa, non percepisce provvigioni sui contratti conclusi e
    non partecipa in alcun modo al rapporto contrattuale che si instaura tra utente e intermediario.</p>

    <h2>2. Definizioni</h2>
    <ul>
      <li><strong>Utente</strong>: chiunque consulti il sito o invii una richiesta di preventivo o consulenza.</li>
      <li><strong>Professionista</strong>: intermediario assicurativo iscritto al RUI che crea un profilo
      pubblico (“QuotaPass”) e pubblica risposte nella bacheca.</li>
      <li><strong>Contenuti</strong>: domande, risposte, testi di profilo e ogni altro materiale caricato
      dagli utenti o dai professionisti.</li>
    </ul>

    <h2>3. Servizi per gli utenti</h2>
    <p>L'accesso, la consultazione della bacheca e l'invio di richieste di preventivo o consulenza sono
    <strong>gratuiti</strong> per gli utenti. Nessun costo, commissione o rincaro sul premio deriva
    dall'aver utilizzato ${C.brand}.</p>
    <p>Inviando una richiesta, l'utente autorizza la trasmissione dei propri recapiti all'intermediario
    prescelto o agli intermediari specializzati nel ramo indicato, affinché possano ricontattarlo. La
    richiesta non costituisce proposta contrattuale, non vincola alcuna delle parti e non garantisce
    l'ottenimento di un preventivo o l'assunzione del rischio da parte di alcuna impresa.</p>

    <h2>4. Servizi per i professionisti</h2>
    <p>La creazione del profilo è riservata a soggetti che dichiarano, sotto la propria responsabilità:</p>
    <ul>
      <li>di essere <strong>regolarmente iscritti al RUI</strong> nella sezione dichiarata e di trovarsi
      in posizione attiva alla data di pubblicazione;</li>
      <li>che i dati inseriti (numero RUI, ragione sociale, ruolo, recapiti) sono <strong>veritieri,
      completi e aggiornati</strong>, impegnandosi a comunicare tempestivamente ogni variazione,
      cancellazione o sospensione dell'iscrizione;</li>
      <li>di rispettare, nei contenuti pubblicati, le regole di comportamento e le norme in materia di
      informativa e pubblicità dei prodotti assicurativi (Regolamento IVASS n. 40/2018 e n. 41/2018),
      restando l'unico responsabile della conformità delle proprie comunicazioni.</li>
    </ul>
    <p>Il Gestore si riserva di verificare l'iscrizione sul registro pubblico IVASS e di sospendere o
    rimuovere senza preavviso i profili che risultino non iscritti, cancellati o che riportino dati
    non veritieri. Il badge “Verificato RUI” attesta esclusivamente l'esito positivo di un controllo
    formale sul registro pubblico alla data indicata e <strong>non costituisce garanzia, avallo o
    raccomandazione</strong> del Gestore sulla qualità dei servizi del professionista.</p>

    <h2>5. Contenuti pubblicati</h2>
    <p>Ogni professionista è l'<strong>unico autore e responsabile</strong> delle risposte che pubblica;
    ogni utente è responsabile delle domande che invia. Pubblicando un contenuto l'autore dichiara di
    averne la titolarità e concede al Gestore una licenza gratuita, non esclusiva e trasferibile a
    riprodurlo, pubblicarlo, tradurlo e indicizzarlo sulla piattaforma e sui canali di promozione
    della stessa, per la durata della pubblicazione.</p>
    <p>È vietato pubblicare contenuti illeciti, diffamatori, discriminatori, ingannevoli, in violazione
    di diritti altrui, dati personali di terzi, comunicazioni pubblicitarie non conformi alla
    normativa assicurativa o messaggi che promettano risultati economici non dimostrabili.</p>
    <p class="legal-callout">Le risposte pubblicate hanno <strong>valore informativo generale</strong> e non
    costituiscono consulenza personalizzata né proposta contrattuale: non tengono conto della
    situazione specifica del lettore e non sostituiscono l'esame delle condizioni di polizza e del
    set informativo (DIP e DIP aggiuntivo) del singolo prodotto.</p>

    <h2>6. Segnalazione di contenuti e moderazione</h2>
    <p>In attuazione del Regolamento (UE) 2022/2065 (“Digital Services Act”), chiunque può segnalare un
    contenuto ritenuto illecito o non conforme tramite il pulsante <strong>“Segnala”</strong> presente su
    ogni risposta o scrivendo a
    <a href="mailto:${C.emailSegnalazioni}">${C.emailSegnalazioni}</a>, che è anche il punto di
    contatto unico per utenti e autorità.</p>
    <p>Ogni segnalazione riceve conferma di ricezione ed è esaminata in modo tempestivo, diligente e
    non arbitrario. In caso di rimozione o di limitazione della visibilità, l'autore del contenuto
    riceve una motivazione e può contestare la decisione entro 30 giorni scrivendo allo stesso
    indirizzo. Il Gestore agisce come prestatore di servizi di memorizzazione (“hosting”) e non è
    tenuto a un obbligo generale di sorveglianza sui contenuti pubblicati dagli utenti.</p>

    <h2>7. Punti, livelli e badge</h2>
    <p>Il sistema di punti, livelli e badge misura esclusivamente l'attività di risposta sulla
    piattaforma e l'apprezzamento espresso dagli utenti. <strong>Non ha alcun valore economico, non è
    convertibile in denaro, non è cedibile e non costituisce classifica comparativa della qualità
    professionale</strong> degli iscritti. Il Gestore può modificarne i criteri dandone informazione
    nell'Area Pro.</p>

    <h2>8. Limitazione di responsabilità</h2>
    <p>Il Gestore mette a disposizione l'infrastruttura tecnica e risponde nei limiti di legge del suo
    corretto funzionamento. Non risponde:</p>
    <ul>
      <li>della veridicità, completezza e correttezza dei contenuti pubblicati dai professionisti e dagli utenti;</li>
      <li>dell'esito, del contenuto e dell'esecuzione dei rapporti contrattuali tra utente e
      intermediario o impresa di assicurazione, ai quali resta del tutto estraneo;</li>
      <li>di eventuali interruzioni del servizio dovute a manutenzioni, cause di forza maggiore o
      malfunzionamenti dei fornitori di connettività e hosting.</li>
    </ul>
    <p>Nessuna disposizione delle presenti condizioni limita i diritti inderogabili riconosciuti al
    consumatore dal d.lgs. 206/2005 (Codice del Consumo).</p>

    <h2>9. Sospensione e cancellazione</h2>
    <p>Il professionista può cancellare il proprio profilo in ogni momento scrivendo a
    <a href="mailto:${C.emailInfo}">${C.emailInfo}</a>. Il Gestore può sospendere o chiudere un account
    in caso di violazione delle presenti condizioni, previa comunicazione, salvi i casi di illecito
    manifesto o di ordine dell'autorità in cui l'intervento è immediato.</p>

    <h2>10. Modifiche alle condizioni</h2>
    <p>Le presenti condizioni possono essere modificate; le modifiche sostanziali sono comunicate ai
    professionisti registrati con almeno 15 giorni di preavviso e diventano efficaci decorso tale
    termine, salvo recesso senza oneri.</p>

    <h2>11. Legge applicabile e foro competente</h2>
    <p>Le presenti condizioni sono regolate dalla legge italiana. Per le controversie con utenti
    qualificabili come consumatori è competente il foro di residenza o domicilio elettivo del
    consumatore, se ubicato in Italia; per le controversie con professionisti è competente in via
    esclusiva il foro di ${todo(C.foro)}.</p>
    <p>Il consumatore può inoltre ricorrere alla piattaforma europea di risoluzione online delle
    controversie (ODR) della Commissione europea. Per i reclami relativi a prodotti o comportamenti
    di intermediari e imprese di assicurazione resta ferma la competenza dell'IVASS e dell'Arbitro
    Assicurativo secondo le rispettive procedure, da attivare nei confronti dell'intermediario o
    dell'impresa, non del Gestore.</p>
  `);

  /* ---------------- 6. NOTE LEGALI / DISCLAIMER ---------------- */
  const noteLegali = () => page("Note legali e informazioni sull'attività", "Trasparenza", `
    <h2>1. Informazioni sul gestore del sito</h2>
    <p>Ai sensi dell'art. 7 del d.lgs. 70/2003 (commercio elettronico):</p>
    <ul>
      <li>Denominazione: ${todo(C.ragioneSociale)}</li>
      <li>Sede legale: ${todo(C.sedeLegale)}</li>
      <li>Partita IVA / Codice fiscale: ${todo(C.piva)} — ${todo(C.cf)}</li>
      <li>Iscrizione Registro Imprese / REA: ${todo(C.rea)}</li>
      <li>PEC: ${todo(C.pec)}</li>
      <li>Email: <a href="mailto:${C.emailInfo}">${C.emailInfo}</a></li>
    </ul>

    <h2>2. Natura dell'attività — avvertenza fondamentale</h2>
    <p class="legal-callout"><strong>${C.brand} non è un intermediario assicurativo e non è iscritta al
    RUI.</strong> La piattaforma non svolge attività di distribuzione assicurativa ai sensi dell'art. 106
    del Codice delle Assicurazioni Private (d.lgs. 209/2005), non propone né conclude contratti di
    assicurazione, non presta assistenza o consulenza finalizzata alla loro conclusione, non incassa
    premi e non percepisce provvigioni.</p>
    <p>L'attività si esaurisce nella <strong>pubblicazione di contenuti informativi</strong> e nella
    <strong>messa in contatto</strong> tra utente e intermediario, il quale opera in piena autonomia,
    sotto la propria responsabilità e nel rispetto degli obblighi che la normativa di settore pone a
    suo carico.</p>

    <h2>3. Valore dei contenuti della bacheca</h2>
    <p>Le domande e le risposte pubblicate, comprese quelle a firma “Redazione ${C.brand}”, hanno
    finalità <strong>divulgativa e informativa generale</strong>. Non costituiscono consulenza
    assicurativa, finanziaria, fiscale o legale, non sono personalizzate sulla situazione del lettore
    e non possono sostituire la lettura del set informativo del prodotto (DIP, DIP aggiuntivo e
    condizioni di assicurazione) né il confronto con un intermediario iscritto al RUI.</p>
    <p>I prezzi, le percentuali e gli importi eventualmente indicati sono <strong>stime indicative di
    mercato</strong> alla data di pubblicazione, variabili in funzione del profilo di rischio, della
    provincia, del veicolo o del bene assicurato e delle politiche assuntive di ciascuna impresa.</p>

    <h2>4. Come verificare un intermediario</h2>
    <p>L'iscrizione al RUI di qualunque intermediario è pubblica e verificabile gratuitamente da
    chiunque sul sito dell'IVASS:
    <a href="https://servizi.ivass.it/RuirPubblica/" target="_blank" rel="noopener">servizi.ivass.it/RuirPubblica</a>.
    Ti invitiamo a farlo sempre prima di conferire dati o sottoscrivere un contratto. Le sezioni del
    registro sono: A (agenti), B (broker), C (produttori diretti), D (banche, intermediari finanziari,
    Poste, SIM), E (collaboratori degli iscritti alle sezioni A, B e D), F (intermediari a titolo
    accessorio).</p>

    <h2>5. Reclami</h2>
    <p>I reclami relativi al <strong>funzionamento del sito</strong> vanno indirizzati a
    <a href="mailto:${C.emailInfo}">${C.emailInfo}</a>.</p>
    <p>I reclami relativi al <strong>comportamento di un intermediario o di un'impresa di
    assicurazione</strong> vanno presentati direttamente all'intermediario o all'impresa e, in caso di
    riscontro insoddisfacente o decorsi 45 giorni, all'IVASS — Servizio Tutela del Consumatore,
    Via del Quirinale 21, 00187 Roma (<a href="https://www.ivass.it" target="_blank" rel="noopener">ivass.it</a>).</p>

    <h2>6. Proprietà intellettuale</h2>
    <p>Il marchio “${C.brand}”, il logo, la grafica della tessera “QuotaPass”, i testi redazionali, il
    codice sorgente e la struttura del sito sono di titolarità del Gestore o dei rispettivi autori e
    sono protetti dalla legge 633/1941. È vietata la riproduzione sistematica, anche parziale, dei
    contenuti senza autorizzazione scritta. Sono ammessi la citazione con collegamento alla fonte e
    l'uso personale non commerciale.</p>

    <h2>7. Collegamenti a siti terzi</h2>
    <p>Il sito può contenere collegamenti a siti gestiti da terzi (IVASS, compagnie, siti degli
    intermediari). Il Gestore non esercita alcun controllo su tali siti e non risponde dei loro
    contenuti né delle loro politiche di trattamento dei dati.</p>
  `);

  /* ---------------- 7. CHI SIAMO / CONTATTI ---------------- */
  const contatti = () => page("Chi siamo e contatti", "Parliamone", `
    <h2>Chi siamo</h2>
    <p>${C.brand} nasce da un'idea semplice: nel mercato assicurativo italiano il problema non è la
    mancanza di offerte, è la mancanza di <strong>trasparenza</strong>. Chi cerca una polizza non sa a chi
    rivolgersi; chi la sa spiegare — agenti, broker e collaboratori iscritti al RUI — spesso non ha
    una vetrina digitale all'altezza del proprio lavoro.</p>
    <p>Abbiamo costruito un marketplace in cui la visibilità <strong>si guadagna rispondendo</strong>. Ogni
    professionista ha una tessera pubblica con il proprio numero RUI; ogni risposta è firmata,
    pubblica e verificabile. Per chi cerca è gratuito, per sempre. Per chi risponde è la prova
    pubblica della propria competenza.</p>

    <h2>Contatti</h2>
    <div class="grid-2" style="gap:1rem">
      <div class="card">
        <h3>📩 Informazioni generali</h3>
        <p class="muted" style="font-size:.9rem">Domande sul servizio, collaborazioni, stampa.</p>
        <p><a class="btn btn-outline btn-sm" href="mailto:${C.emailInfo}">${C.emailInfo}</a></p>
      </div>
      <div class="card">
        <h3>🔐 Privacy e dati personali</h3>
        <p class="muted" style="font-size:.9rem">Esercizio dei diritti artt. 15-22 GDPR, cancellazioni.</p>
        <p><a class="btn btn-outline btn-sm" href="mailto:${C.emailPrivacy}">${C.emailPrivacy}</a></p>
      </div>
      <div class="card">
        <h3>🚩 Segnalazioni di contenuti</h3>
        <p class="muted" style="font-size:.9rem">Punto di contatto unico ai sensi del Digital Services Act.</p>
        <p><a class="btn btn-outline btn-sm" href="mailto:${C.emailSegnalazioni}">${C.emailSegnalazioni}</a></p>
      </div>
      <div class="card">
        <h3>🪪 Sei un intermediario?</h3>
        <p class="muted" style="font-size:.9rem">Crea la tua QuotaPass in tre minuti, gratis.</p>
        <p><a class="btn btn-primary btn-sm" href="#/area-pro">Vai all'Area Pro</a></p>
      </div>
    </div>

    <h2>Dati societari</h2>
    <ul>
      <li>${todo(C.ragioneSociale)}</li>
      <li>${todo(C.sedeLegale)}</li>
      <li>P. IVA ${todo(C.piva)} — REA ${todo(C.rea)}</li>
      <li>PEC ${todo(C.pec)}</li>
    </ul>
    <p class="muted" style="font-size:.85rem">${C.brand} non è un intermediario assicurativo e non è
    iscritta al RUI: leggi le <a href="#/note-legali">note legali</a>.</p>
  `);

  window.QF_LEGAL = {
    CONFIG: LEGAL_CONFIG,
    mancanti,
    views: { privacy, cookie, termini, noteLegali, contatti }
  };
})();
