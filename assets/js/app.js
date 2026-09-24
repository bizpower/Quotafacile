/* ============================================================
   QuotaFacile — SPA vanilla JS
   Router hash + store localStorage + gamification + SEO JSON-LD
   ============================================================ */
"use strict";

/* ---------------- STORE ---------------- */
const DB_KEY = "quotafacile_db_v1";

const seed = {
  /* Gli intermediari in vetrina vivono in assets/js/intermediari.js
     e vengono risincronizzati ad ogni avvio (vedi sincronizzaBrokers). */
  brokers: [],
  /* Domande della community, in attesa di risposta. Le risposte di
     esempio sono state rimosse: erano firmate da intermediari
     inventati e, tolte quelle schede, sarebbero finite in bocca a
     professionisti reali. Restano come domande aperte — che è anche
     l'esca giusta per chi si iscrive. */
  faqs: [
    { id: "f1", cat: "Auto", autore: null, data: "2026-07-10", risposte: [],
      domanda: "La classe di merito si trasferisce se compro un'auto nuova?" },
    { id: "f2", cat: "Casa", autore: null, data: "2026-07-08", risposte: [],
      domanda: "La polizza casa copre i danni causati da un tubo che perde nel condominio?" },
    { id: "f3", cat: "Vita", autore: null, data: "2026-07-05", risposte: [],
      domanda: "Che differenza c'è tra polizza vita temporanea (TCM) e polizza vita intera?" },
    { id: "f4", cat: "Impresa", autore: null, data: "2026-07-01", risposte: [],
      domanda: "Una piccola srl ha davvero bisogno di una polizza cyber?" },
    { id: "f5", cat: "Salute", autore: null, data: "2026-06-28", risposte: [],
      domanda: "Le polizze salute rimborsano anche le visite specialistiche private?" }
  ],
  richieste: [],
  proProfile: null,
  votati: [],
  dailyExtra: {},   // risposte dei pro alle domande del giorno: { d3: [{...}] }
  autoVotes: {},    // voti "utile" alla risposta automatica: { d3: 4 }
  leads: [],        // contatti ricevuti dal pro: {tipo, nome, ramo, nota, data}
  segnalazioni: [], // notice & action DSA: {target, motivo, dettaglio, email, data, stato}
  consensi: [],     // registro dei consensi raccolti (accountability art. 7.1 GDPR)
  staffExtra: {},   // risposte dei pro alle domande Staff: { k1: [{...}] }
  staffVotes: {}    // voti "utile" alla risposta della redazione: { k1: 7 }
};

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* storage non disponibile: uso i dati seed in memoria */ }
  return JSON.parse(JSON.stringify(seed));
}
function saveDB() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); } catch (e) { /* no-op */ }
}
let DB = loadDB();
/* migrazione: campi aggiunti nelle versioni successive */
DB.dailyExtra = DB.dailyExtra || {};
DB.autoVotes = DB.autoVotes || {};
DB.leads = DB.leads || [];
DB.segnalazioni = DB.segnalazioni || [];
DB.consensi = DB.consensi || [];
DB.staffExtra = DB.staffExtra || {};
DB.staffVotes = DB.staffVotes || {};

/* Gli intermediari in vetrina sono contenuto editoriale, non dati
   dell'utente: la fonte di verità è assets/js/intermediari.js e va
   riallineata ad ogni avvio, altrimenti chi ha già visitato il sito
   continuerebbe a vedere le schede vecchie salvate nel localStorage.
   Punti e risposte accumulati vengono conservati per id. */
function sincronizzaBrokers() {
  const precedenti = Object.fromEntries((DB.brokers || []).map(b => [b.id, b]));
  const dalRepo = (window.INTERMEDIARI || []).map(i => {
    /* Lo stato di verifica deciso dall'Admin ha la precedenza:
       è il risultato di un controllo umano sul registro IVASS. */
    const stato = (DB.verifiche || {})[i.id] || i.statoVerifica;
    return {
      ...i,
      statoVerifica: stato,
      verificato: stato === "verificato" && !!i.rui,
      punti: precedenti[i.id]?.punti ?? i.punti ?? 0,
      risposte: precedenti[i.id]?.risposte ?? i.risposte ?? 0
    };
  });

  /* In vetrina ci sono due provenienze: le schede editoriali del
     repository e i profili di chi si è registrato da sé. Per chi
     guarda sono la stessa cosa — un intermediario con un numero
     RUI riscontrato — e mescolarle qui evita di avere due elenchi
     in pagina che dicono la stessa cosa in due riquadri diversi.

     L'ordine mette davanti chi è in evidenza. È una collocazione
     a pagamento, e più sotto la pagina lo dichiara: l'art. 22-bis
     del Codice del consumo lo impone, e anche senza sarebbe il
     minimo verso chi legge una lista credendola un ordinamento
     per merito. */
  const registrati = window.QF_PRO?.vetrina() || [];
  DB.brokers = [...dalRepo, ...registrati]
    .sort((a, b) => (b.inEvidenza ? 1 : 0) - (a.inEvidenza ? 1 : 0) || (b.punti ?? 0) - (a.punti ?? 0));
}
DB.staffCustom = DB.staffCustom || [];
DB.staffHidden = DB.staffHidden || [];
DB.verifiche = DB.verifiche || {};
sincronizzaBrokers();

/* ---------------- HELPERS ---------------- */
const $ = (sel, el = document) => el.querySelector(sel);
const app = $("#app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const REDAZIONE = { id: "qf", nome: "Redazione QuotaFacile", ruolo: "Redazione", punti: 0, auto: true };
const broker = id => id === "qf" ? REDAZIONE : (id === "me" && DB.proProfile) ? DB.proProfile : DB.brokers.find(b => b.id === id);
const initials = n => n.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}
window.toast = toast; // usato anche dal modulo consenso cookie

/* Registro dei consensi raccolti: art. 7.1 GDPR — il titolare deve
   essere in grado di dimostrare che l'interessato ha prestato il consenso. */
function registraConsenso(contesto, testo) {
  DB.consensi.push({ contesto, testo, data: new Date().toISOString() });
  if (DB.consensi.length > 500) DB.consensi = DB.consensi.slice(-500);
}

const INFORMATIVA_BREVE = `Ho letto l'<a href="#/privacy">informativa privacy</a> e acconsento al trattamento dei miei dati per dare seguito a questa richiesta.`;

/* Blocco consenso riutilizzabile nei form (art. 7 GDPR: consenso
   espresso con azione positiva inequivocabile, mai precompilato) */
function consentBox(id, testo, obbligatorio = true) {
  return `
  <div class="consent-box">
    <input type="checkbox" id="${id}" ${obbligatorio ? "required" : ""}>
    <label for="${id}">${testo}${obbligatorio ? ` <span class="consent-req">*</span>` : ""}</label>
  </div>`;
}

/* Conteggi reali: i numeri esposti al pubblico devono essere veri
   (art. 21 d.lgs. 206/2005 — pratiche commerciali ingannevoli). */
function contaRisposte() {
  const daCommunity = domandeCommunity().reduce((n, f) => n + f.risposte.length, 0);
  const daGuide = staffFaqs().reduce((n, f) => n + f.risposte.length, 0);
  return daCommunity + daGuide + dailyPublishedCount();
}

function livello(punti) {
  if (punti >= 300) return "Top Advisor";
  if (punti >= 150) return "Esperto";
  if (punti >= 50) return "Consulente";
  return "Novizio";
}

/* ---------------- DOMANDA DEL GIORNO ----------------
   Ogni giorno alle 00:00 viene pubblicata 1 domanda dal pool
   (assets/js/daily-questions.js), per 200 giorni da DAILY_EPOCH.
   Esce con risposta automatica della Redazione; i pro integrano. */
const DAILY_EPOCH = "2026-07-17"; // data di lancio del sistema
const DAILY_TOTAL = 200;

function dayIndex() {
  const ms = Date.now() - new Date(DAILY_EPOCH + "T00:00:00").getTime();
  return Math.max(0, Math.floor(ms / 86400000)); // giorno 0 = lancio
}
function dailyPublishedCount() {
  return Math.min(dayIndex() + 1, Math.min(DAILY_TOTAL, (window.DAILY_POOL || []).length));
}

/* Il denominatore del contatore è quante domande ci sono davvero
   nel serbatoio, non la costante: se le due cose divergessero, la
   pagina prometterebbe un seguito che non esiste.
   Oggi coincidono — DAILY_TOTAL è 200 e in daily-questions.js ce
   ne sono 200 — ma il giorno in cui qualcuno ne toglie una metà
   il contatore continuerebbe a dire "di 200" e a promettere la
   prossima fra qualche ora. Meglio leggerlo dal serbatoio. */
const dailyTotale = () => Math.min(DAILY_TOTAL, (window.DAILY_POOL || []).length);
const dailyEsaurite = () => dailyPublishedCount() >= dailyTotale();
function dailyFaq(i) {
  const src = (window.DAILY_POOL || [])[i];
  if (!src) return null;
  const d = new Date(new Date(DAILY_EPOCH + "T00:00:00").getTime() + i * 86400000);
  const id = "d" + i;
  const risposte = [
    { autore: "qf", testo: src.rispostaAuto, voti: DB.autoVotes[id] || 0, accettata: true, auto: true },
    ...(window.QFBacheca?.risposteDi(id, true) || [])
  ];
  /* Lo slug ce l'hanno solo le domande scritte a mano: le altre
     nascono da quattro modelli e non meritano un indirizzo
     proprio. Restano leggibili qui dentro, fuori dall'indice. */
  return { id, daily: true, num: i + 1, cat: src.cat, keyword: src.keyword, slug: src.slug || null, curata: !!src.curata, autore: "qf", data: d.toISOString().slice(0, 10), domanda: src.domanda, risposte };
}
function publishedDaily() {
  const n = dailyPublishedCount();
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(dailyFaq(i)); // più recenti prima
  return out;
}
/* ---------------- DOMANDE STAFF (keyword SEO) ----------------
   Pubblicate dalla redazione per presidiare keyword ad alto
   intento. Vivono in assets/js/staff-questions.js: sono uguali
   per tutti i visitatori e non dipendono dal localStorage.
   Gli intermediari possono integrarle come tutte le altre. */
const spoglia = html => String(html || "")
  .replace(/<\/(p|li|h4|ol|ul)>/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/* Le domande della community arrivano dal database: sono
   pubbliche, uguali per tutti. DB.faqs resta solo come copia
   locale di ciò che questo browser ha inviato, utile finché la
   bacheca remota non ha risposto. */
function domandeCommunity() {
  const remote = window.QFBacheca?.stato.caricata ? window.QFBacheca.domandeUtente() : [];
  if (remote.length) return remote;
  return window.QFBacheca?.stato.caricata ? [] : DB.faqs.filter(f => !f.staff);
}

/* Autore di una risposta: può arrivare dal database (porta con
   sé nome e qualifica) oppure essere un profilo locale. */
/* Il livello ("Novizio", "Esperto") misura l'attività su questo
   browser: per una risposta arrivata dal database non esiste, e
   mostrarlo accanto a un professionista reale sarebbe fuorviante.
   Al suo posto si mostra la qualifica dichiarata. */
function etichettaAutore(a) {
  if (a.remoto) {
    const q = [a.ruolo, a.azienda].filter(x => x && !DA_COMPILARE(x)).join(" · ");
    return q ? `<span class="level-badge badge-qualifica">${esc(q)}</span>` : "";
  }
  return `<span class="level-badge">${livello(a.punti)}</span>`;
}

function autoreDi(r) {
  if (r.autoreNome) {
    return {
      nome: r.autoreNome, ruolo: r.autoreRuolo || "Intermediario",
      azienda: r.autoreAzienda, rui: r.autoreRui, punti: 0, remoto: true
    };
  }
  return broker(r.autore);
}

function staffFaqs() {
  /* Guide scritte nel repo + guide pubblicate dall'area Admin,
     meno quelle ritirate. */
  const base = (window.STAFF_FAQS || []).filter(s => !(DB.staffHidden || []).includes(s.id));
  const remote = window.QFBacheca?.stato.caricata ? window.QFBacheca.guideRemote() : [];
  return [...remote, ...base.map(s => ({
    id: s.id, staff: true, cat: s.cat, keyword: s.keyword, meta: s.meta, titolo: s.titolo,
    /* Lo slug è l'indirizzo pubblico della guida. Va portato fin
       qui perché canonical, sitemap e pagina pre-renderizzata
       devono dire tutti e tre lo stesso URL: se uno dei tre
       diverge, Google sceglie da solo quale credere. */
    slug: s.slug,
    autore: "qf", data: s.data, domanda: s.domanda,
    risposte: [
      { autore: "qf", testo: s.testo || spoglia(s.risposta), rich: s.risposta, voti: DB.staffVotes[s.id] || 0, accettata: true, auto: true, staff: true },
      /* le integrazioni dei professionisti arrivano dal database,
         una volta approvate: prima non sono pubbliche */
      ...(window.QFBacheca?.risposteDi(s.id, true) || [])
    ]
  }))];
}

function getFaqById(id) {
  if (/^d\d+$/.test(id)) {
    const i = +id.slice(1);
    return i < dailyPublishedCount() ? dailyFaq(i) : null;
  }
  /* "k" guide del repository, "g" guide pubblicate dall'Admin,
     "q" domande degli utenti: le ultime due vengono dal database. */
  if (/^[kg]/.test(id)) return staffFaqs().find(x => x.id === id) || null;
  if (/^q/.test(id)) return domandeCommunity().find(x => x.id === id) || null;
  return DB.faqs.find(x => x.id === id) || null;
}
/* Le domande che hanno un indirizzo pubblico, per il pre-render
   e per la sitemap.

   La regola sta qui e non nello script del deploy: chi ha uno
   slug e chi no è una decisione sola — le domande scritte a mano
   e quelle degli utenti che hanno ricevuto una risposta — e
   duplicarla in due posti vuol dire tenerne allineate due. È la
   stessa scelta già fatta per le guide e per il Magazine. */
function domandeIndicizzabili() {
  const migliore = f => f.risposte.find(r => r.accettata) || f.risposte[0];
  return [...publishedDaily(), ...domandeCommunity()]
    .filter(f => f.slug && f.risposte.length)
    .map(f => ({
      id: f.id,
      slug: f.slug,
      titolo: f.domanda,
      meta: String(migliore(f)?.testo || "").slice(0, 155).replace(/\s+\S*$/, "")
    }));
}

function hoursToNextDaily() {
  const next = new Date(new Date(DAILY_EPOCH + "T00:00:00").getTime() + (dayIndex() + 1) * 86400000);
  return Math.max(1, Math.ceil((next - Date.now()) / 3600000));
}

/* ---------------- SEO on-page ----------------
   Title e meta description cambiano ad ogni rotta: senza, tutte
   le pagine condividono lo stesso snippet in SERP e competono
   fra loro invece che con i concorrenti. */
const SEO_BASE = { title: document.title, desc: document.querySelector('meta[name="description"]')?.content || "" };

/* ---------------- INDIRIZZI PUBBLICI ----------------

   Il sito naviga con il frammento (#/bacheca) perché è un'unica
   pagina senza passo di build. Ma il frammento, per un motore di
   ricerca, non esiste: Google ha smesso di trattarlo come
   indirizzo a sé nel 2018. Due pagine che differiscono solo dopo
   il cancelletto sono, per lui, la stessa pagina.

   Quindi ogni rotta pubblica ha anche un indirizzo vero, fatto
   di percorso, e a quell'indirizzo il deploy scrive una pagina
   HTML completa. Questa tabella è la sola fonte di verità: la
   usano il canonical, la sitemap e il pre-render. Se divergessero
   Google sceglierebbe da sé a quale credere.

   Le rotte che non sono qui dentro non hanno un indirizzo
   pubblico, e non è una dimenticanza: l'area riservata e la
   dashboard degli intermediari non vanno indicizzate. */
const INDIRIZZI = {
  "": "",
  home: "",
  intermediari: "intermediari/",
  bacheca: "bacheca/",
  professionisti: "professionisti/",
  preventivo: "preventivo/",
  privacy: "privacy/",
  "privacy-imprese": "privacy-imprese/",
  "cookie-policy": "cookie-policy/",
  termini: "termini/",
  "note-legali": "note-legali/",
  contatti: "contatti/",
  magazine: "magazine/",
  /* "Chi siamo" e "Contatti" mostrano la stessa pagina. Due
     indirizzi con lo stesso contenuto sono contenuto duplicato:
     entrambi restano raggiungibili — ci sono link e segnalibri
     che ci puntano — ma dichiarano come pagina vera /contatti/,
     e nella sitemap ce n'è uno solo. */
  "chi-siamo": "contatti/"
};

/* La rotta che questa pagina rappresenta, scritta dal
   pre-render. Sulla pagina servita così com'è dal repository non
   c'è, e allora comanda il frammento come sempre. */
const ROTTA_PAGINA = document.querySelector('meta[name="qf-rotta"]')?.content || "";
const PERCORSO_PAGINA = document.querySelector('meta[name="qf-percorso"]')?.content || "";

/* La base del sito: "/" sul dominio, "/Quotafacile/" finché è
   servito dal sotto-percorso di github.io. Si ricava dalla pagina
   stessa togliendo dal percorso la parte che è la rotta: quello
   che resta è la base, qualunque host stia pubblicando. */
const BASE_SITO = (() => {
  let p = location.pathname;
  if (!p.endsWith("/")) p = p.replace(/[^/]*$/, "");
  if (PERCORSO_PAGINA && p.endsWith("/" + PERCORSO_PAGINA)) {
    p = p.slice(0, p.length - PERCORSO_PAGINA.length);
  }
  return p || "/";
})();

/* L'indirizzo pubblico di una rotta. Per le guide non è l'id
   interno ("k5") ma lo slug leggibile: un indirizzo si legge
   anche quando lo si incolla in una chat, e "polizza-vita-
   pignorabile" dice cos'è mentre "k5" no. */
function indirizzoPubblico(page, path) {
  /* Un articolo del Magazine vive a /magazine/<slug>/. Lo slug
     sta nell'indirizzo interno ed è già quello pubblico: non c'è
     niente da cercare, a differenza delle guide dove l'indirizzo
     interno è un id.

     Con un'eccezione: se il servizio ha già risposto che quello
     slug non esiste, l'indirizzo pubblico non c'è. Senza questo
     controllo qualunque slug inventato sotto /magazine/
     dichiarava un canonical e un "index, follow" — cioè chiedeva
     a Google di indicizzare una pagina che dice "questo articolo
     non c'è". */
  if (page === "magazine" && path && path[1]) {
    if (window.QFMagazine?.stato.corpi[path[1]] === null) return null;
    return "magazine/" + path[1] + "/";
  }
  if (page === "faq") {
    const f = getFaqById(path && path[1]);
    if (f && f.slug) return percorsoDomanda(f);
    return null;
  }
  const v = INDIRIZZI[page];
  return v === undefined ? null : v;
}

/* La strada inversa: da un indirizzo pubblico alla rotta interna.
   Serve perché le pagine pre-renderizzate hanno link veri, fatti
   di percorso — un motore di ricerca deve poter seguire il filo
   fra una pagina e l'altra, e un link al frammento per lui non
   porta da nessuna parte. Quando però a cliccare è una persona,
   ricadere sul frammento evita di ricaricare tutto il sito per
   cambiare sezione. */
function rottaDaPercorso(pathname) {
  if (!pathname.startsWith(BASE_SITO)) return null;
  const rel = pathname.slice(BASE_SITO.length);
  if (rel === "") return "";
  for (const [rotta, ind] of Object.entries(INDIRIZZI)) {
    if (ind && ind === rel) return rotta;
  }
  const m = rel.match(/^guide\/([^/]+)\/$/);
  if (m) {
    const f = staffFaqs().find(x => x.slug === m[1]);
    if (f) return "faq/" + f.id;
  }
  /* Il Magazine non ha bisogno di cercare niente: lo slug
     nell'indirizzo pubblico è lo stesso che usa la rotta. */
  const g = rel.match(/^magazine\/([^/]+)\/$/);
  if (g) return "magazine/" + g[1];
  return null;
}

function urlCanonico(page, path) {
  let rel = indirizzoPubblico(page, path);

  /* Le guide dell'area Admin vivono nel database: finché la
     bacheca non ha risposto, indirizzoPubblico non le conosce e
     direbbe "nessun indirizzo", cioè noindex. Ma se questa
     pagina è proprio il file che il deploy ha scritto per quella
     rotta, l'indirizzo lo sappiamo già — sta nella pagina — e
     non c'è motivo di rinnegarlo mentre si aspetta la rete.
     Senza questo, una bacheca lenta o ferma basterebbe a far
     dichiarare noindex a una guida regolarmente pubblicata.

     Vale solo per le guide: la pagina 404 è anch'essa un file
     scritto dal deploy, ma è il solo file che non deve mai
     dichiarare un canonical. */
  if (rel === null && page === "faq" && PERCORSO_PAGINA &&
      ROTTA_PAGINA === (path || []).join("/")) {
    rel = PERCORSO_PAGINA;
  }

  /* Una rotta senza indirizzo pubblico non ha un canonical da
     dichiarare: sarebbe un invito a indicizzare quello che non
     deve esserlo. */
  if (rel === null) return null;
  return location.origin + BASE_SITO + rel;
}

function setSeo(title, desc, immagine) {
  document.title = title || SEO_BASE.title;
  const m = document.querySelector('meta[name="description"]');
  if (m) m.content = desc || SEO_BASE.desc;
  const og = document.querySelector('meta[property="og:title"]');
  if (og) og.content = title || SEO_BASE.title;
  const ogd = document.querySelector('meta[property="og:description"]');
  if (ogd) ogd.content = desc || SEO_BASE.desc;
  /* Canonical e og:url vengono dall'indirizzo pubblico della
     rotta, non da location: se li costruissimo dal frammento,
     Google lo scarterebbe e leggerebbe "questa pagina è la
     homepage" su ogni pagina del sito. Era esattamente quello
     che succedeva prima.

     L'origine resta quella reale, non un dominio fisso: dire che
     la pagina "vera" sta su un host diverso da quello che la sta
     servendo è il modo più rapido per farsi deindicizzare. */
  /* L'immagine di condivisione vuole un indirizzo assoluto:
     LinkedIn, WhatsApp e X un percorso relativo non lo leggono.
     Si costruisce sull'origine reale come il canonical, così
     vale anche mentre il sito è servito da un host diverso.

     Se la pagina ha un'immagine propria — la copertina di un
     articolo del Magazine — si usa quella: condividere cinque
     articoli diversi e vederli uscire tutti con la stessa
     tessera generica vuol dire sprecare l'unica anteprima che
     il lettore vede prima di decidere se cliccare. Vale per le
     condivisioni umane e per i motori generativi, che leggono
     og:image come immagine rappresentativa del documento. */
  const img = immagine || location.origin + BASE_SITO + "assets/img/og-quotafacile.png";
  const ogi = document.querySelector('meta[property="og:image"]');
  if (ogi) ogi.content = img;
  const twi = document.querySelector('meta[name="twitter:image"]');
  if (twi) twi.content = img;

  const url = urlCanonico(paginaCorrente.page, paginaCorrente.path);
  const can = document.querySelector('link[rel="canonical"]');
  const ogu = document.querySelector('meta[property="og:url"]');
  const rob = document.querySelector('meta[name="robots"]');

  if (url) {
    if (can) { can.href = url; can.removeAttribute("data-off"); }
    if (ogu) ogu.content = url;
    if (rob) rob.content = "index, follow";
  } else {
    /* Rotta senza indirizzo pubblico: area riservata, dashboard,
       guide non ancora pubblicate. Niente canonical — non esiste
       una pagina "vera" da dichiarare — e un noindex esplicito.
       Il noindex non è la sicurezza: quella sta nel server. È
       solo il modo di non far comparire in SERP una schermata
       che non ha senso per chi arriva da una ricerca. */
    if (can) { can.removeAttribute("href"); can.setAttribute("data-off", ""); }
    if (ogu) ogu.content = location.origin + BASE_SITO;
    if (rob) rob.content = "noindex, nofollow";
  }
}

/* Quale rotta stiamo mostrando. setSeo ne ha bisogno per sapere
   quale indirizzo pubblico dichiarare, e tenerlo qui evita di
   passarlo attraverso ogni chiamata. */
let paginaCorrente = { page: "home", path: [] };

/* ---------------- L'AREA RISERVATA ARRIVA QUANDO SERVE ----------------

   Console di amministrazione, CRM e mail marketing sono 294 KB:
   metà di tutto il codice del sito. Stavano fra gli script della
   pagina, quindi ogni visitatore anonimo li scaricava e li
   interpretava per leggere una guida sulle polizze — pagando in
   tempo di caricamento una funzione che non userà mai.

   Adesso si caricano alla prima apertura di #/admin, una volta
   sola. La promessa viene tenuta da parte: se si apre due volte
   di fila non si scarica due volte, e se si sta ancora
   scaricando la seconda chiamata aspetta la prima invece di
   avviarne un'altra.

   Una nota sull'ordine: i tre file sono indipendenti. Ognuno
   registra il proprio oggetto su window alla fine di sé stesso e
   cerca gli altri solo al momento in cui servono davvero, non al
   caricamento. Per questo possono arrivare in parallelo. */
/* L'area riservata non si lascia incorniciare.
 *
 * Un sito dentro un <iframe> trasparente, sopra a una pagina
 * qualunque, fa premere all'ignaro i pulsanti dell'altro senza
 * che se ne accorga: è il clickjacking. La difesa vera è
 * l'intestazione X-Frame-Options, che GitHub Pages non permette
 * di impostare e che dentro un <meta> i browser ignorano.
 * Questo controllo non la sostituisce, ma è la protezione che si
 * può avere su questa piattaforma, e vale dove serve di più.
 *
 * Sta qui e non dentro admin.js per due motivi. Il primo: così
 * il codice dell'area riservata, dentro una cornice, non viene
 * nemmeno scaricato. Il secondo l'ho imparato sbagliando —
 * interrompere admin.js a metà con un'eccezione gli impedisce di
 * registrarsi, e il router, non trovandolo, lo ricarica in
 * continuazione. Il controllo va fatto prima di chiedere il
 * caricamento, non durante. */
const dentroCornice = (() => {
  try { return window.top !== window.self; } catch (e) { return true; }
})();

let riservataInCorso = null;

function caricaRiservata() {
  if (window.QF_ADMIN && window.QF_CRM && window.QF_MM && window.QF_MAGAZINE) return Promise.resolve();
  if (riservataInCorso) return riservataInCorso;
  riservataInCorso = Promise.all(["admin", "crm", "mm", "magazine"].map(nome => new Promise((risolvi, rifiuta) => {
    const s = document.createElement("script");
    s.src = BASE_SITO + "assets/js/" + nome + ".js";
    s.onload = risolvi;
    s.onerror = () => rifiuta(new Error(nome + ".js non si è caricato"));
    document.head.appendChild(s);
  }))).catch(e => {
    /* Se il caricamento fallisce la promessa va scartata, non
       tenuta: altrimenti ogni tentativo successivo ricadrebbe
       sullo stesso errore anche quando la rete è tornata. */
    riservataInCorso = null;
    throw e;
  });
  return riservataInCorso;
}

/* JSON-LD dinamico per SEO (FAQPage) */
function setJsonLd(obj) {
  $("#jsonld-dynamic").textContent = obj ? JSON.stringify(obj) : "";
}
/* ---------------- DATI STRUTTURATI ----------------
   Schema.org non serve solo ai risultati arricchiti di Google:
   è il modo in cui i motori generativi capiscono chi ha scritto
   una risposta, quando, e con quale titolo per firmarla. È la
   differenza fra essere citati e restare un risultato anonimo. */
/* La radice del sito. Non location.pathname: su una pagina
   pre-renderizzata quello è il percorso della pagina, e gli @id
   del grafo finirebbero appesi a /guide/qualcosa/ invece che al
   sito. Un identificatore che cambia a seconda della pagina da
   cui lo si legge non identifica niente. */
const SITO = () => location.origin + BASE_SITO;

/* L'indirizzo pubblico di una guida, per i dati strutturati.
   Deve coincidere con il canonical: se il grafo dichiara un URL
   e il canonical un altro, Google ha due risposte alla stessa
   domanda e ne sceglie una da sé. */
/* Le guide della redazione stanno sotto /guide/, le domande
   sotto /bacheca/. Non è cosmesi: sono due cose diverse — una
   guida è un testo che scriviamo noi, una domanda è di chi l'ha
   posta e la risposta di chi l'ha firmata — e tenerle in due
   rami dice a un motore quale dei due sta leggendo prima ancora
   di aprire la pagina.

   Senza slug non c'è indirizzo pubblico: la pagina esiste dentro
   l'applicazione ma dichiara noindex, e qui si ricade
   sull'elenco. */
const percorsoDomanda = f => f && f.slug ? (f.staff ? "guide/" : "bacheca/") + f.slug + "/" : "bacheca/";
const urlGuida = f => SITO() + percorsoDomanda(f);

/* Identità dell'editore: dichiarata una volta e richiamata per
   riferimento da tutti gli altri nodi del grafo. */
function editoreJsonLd() {
  const C = window.QF_LEGAL?.CONFIG;
  const base = SITO();
  const org = {
    "@type": "Organization",
    "@id": base + "#org",
    "name": "QuotaFacile",
    "url": base,
    "description": "Marketplace italiano degli intermediari assicurativi iscritti al RUI: profili verificabili, risposte firmate, preventivi gratuiti.",
    "knowsLanguage": "it-IT",
    "areaServed": { "@type": "Country", "name": "Italia" }
  };
  if (C && !/^«/.test(C.ragioneSociale)) {
    org.legalName = C.ragioneSociale;
    org.vatID = C.piva;
    org.taxID = C.cf;
    org.email = C.emailInfo;
    const m = /^(.+?),\s*(\d{5})\s+(.+?)\s*\((\w{2})\)/.exec(C.sedeLegale);
    if (m) org.address = {
      "@type": "PostalAddress", "streetAddress": m[1], "postalCode": m[2],
      "addressLocality": m[3], "addressRegion": m[4], "addressCountry": "IT"
    };
    const g = C.gestoreIntermediario;
    if (g) org.founder = {
      "@type": "Person", "name": g.nome,
      "jobTitle": "Intermediario assicurativo — sezione " + g.sezioneRui + " del RUI",
      "worksFor": /^«/.test(g.operaPerConto) ? undefined : { "@type": "Organization", "name": g.operaPerConto }
    };
  }
  return org;
}

function faqJsonLd(faqs) {
  const base = SITO();
  /* Sulle pagine di elenco le domande sono molte: se ne dichiarano
     al massimo 25, altrimenti il blocco di dati strutturati pesa più
     della pagina che descrive. Ogni domanda ha comunque la propria
     pagina, dove è descritta per intero. */
  const utili = faqs.filter(f => f.risposte.length).slice(0, 25);
  return {
    "@context": "https://schema.org",
    "@graph": [
      editoreJsonLd(),
      {
        "@type": "FAQPage",
        /* L'identificatore della pagina FAQ e' l'indirizzo
           pubblico su cui quelle domande sono davvero pubblicate,
           non il frammento da cui le stiamo guardando. */
        "@id": (urlCanonico(paginaCorrente.page, paginaCorrente.path) || base) + "#faq",
        "inLanguage": "it-IT",
        "isPartOf": { "@id": base + "#org" },
        "publisher": { "@id": base + "#org" },
        "mainEntity": utili.map(f => {
          const best = f.risposte.find(r => r.accettata) || f.risposte[0];
          const a = autoreDi(best);
          const autore = a && !a.auto
            ? { "@type": "Person", "name": a.nome, "jobTitle": a.ruolo, "worksFor": { "@type": "Organization", "name": a.azienda } }
            : { "@type": "Organization", "name": "Redazione QuotaFacile", "@id": base + "#org" };
          return {
            "@type": "Question",
            "@id": urlGuida(f),
            "name": f.domanda,
            "answerCount": f.risposte.length,
            "datePublished": f.data,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": best.testo,
              "url": urlGuida(f),
              "datePublished": f.data,
              "upvoteCount": best.voti || 0,
              "author": autore
            }
          };
        })
      }
    ]
  };
}

/* Chi firma una risposta, in forma di dato strutturato. */
function autoreJsonLd(best) {
  const base = SITO();
  const a = best ? autoreDi(best) : null;
  if (!a || a.auto) {
    return { "@type": "Organization", "name": "Redazione QuotaFacile", "@id": base + "#org" };
  }
  const p = { "@type": "Person", "name": a.nome, "jobTitle": a.ruolo };
  if (a.azienda && !DA_COMPILARE(a.azienda)) p.worksFor = { "@type": "Organization", "name": a.azienda };
  /* Il numero RUI e' cio' che rende verificabile chi risponde:
     identifier lo dichiara come identificativo rilasciato da un
     registro pubblico, non come una stringa qualunque. */
  if (a.rui && !DA_COMPILARE(a.rui)) {
    p.identifier = {
      "@type": "PropertyValue",
      "propertyID": "Registro Unico degli Intermediari assicurativi (IVASS)",
      "value": a.rui
    };
  }
  return p;
}

/* QAPage, non FAQPage.
   Sono due tipi per due cose diverse, e finora la bacheca usava
   il secondo per entrambe. FAQPage descrive una pagina in cui e'
   il sito a scrivere sia la domanda sia la risposta - una guida,
   appunto. QAPage descrive una domanda posta da qualcuno a cui
   rispondono altri, con una risposta accettata ed eventuali
   altre proposte: e' esattamente la bacheca.
   Non e' pignoleria: da settembre 2023 Google mostra i risultati
   arricchiti di FAQPage quasi solo a siti governativi e sanitari,
   mentre quelli di QAPage restano attivi per i siti di domande e
   risposte. Dichiarare il tipo sbagliato vuol dire rinunciarvi. */
function qaPageJsonLd(f) {
  const base = SITO();
  const url = urlGuida(f);
  const best = f.risposte.find(r => r.accettata) || f.risposte[0];
  const altre = f.risposte.filter(r => r !== best);

  const risposta = r => ({
    "@type": "Answer",
    "text": r.testo,
    "url": url,
    "datePublished": f.data,
    "upvoteCount": r.voti || 0,
    "author": autoreJsonLd(r)
  });

  const domanda = {
    "@type": "Question",
    "@id": url + "#domanda",
    "name": f.domanda,
    "text": f.domanda,
    "answerCount": f.risposte.length,
    "datePublished": f.data,
    "author": f.daily || f.staff
      ? { "@type": "Organization", "name": "Redazione QuotaFacile", "@id": base + "#org" }
      /* Chi scrive in bacheca non lascia un nome, e inventarne uno
         sarebbe una firma falsa su un contenuto pubblico. */
      : { "@type": "Person", "name": "Utente QuotaFacile" }
  };
  if (best) domanda.acceptedAnswer = risposta(best);
  if (altre.length) domanda.suggestedAnswer = altre.map(risposta);

  return {
    "@context": "https://schema.org",
    "@graph": [
      editoreJsonLd(),
      {
        "@type": "QAPage",
        "@id": url + "#pagina",
        "inLanguage": "it-IT",
        "isPartOf": { "@id": base + "#org" },
        "publisher": { "@id": base + "#org" },
        "mainEntity": domanda
      }
    ]
  };
}

/* L'elenco della bacheca non è una FAQPage: è un indice.
   Dichiararlo per quello che è — una raccolta ordinata di pagine
   che stanno altrove — evita di promettere a un motore domande e
   risposte che su questa pagina ci sono solo in anteprima. */
function elencoJsonLd(faqs) {
  const base = SITO();
  const conIndirizzo = faqs.filter(f => f.slug).slice(0, 50);
  return {
    "@context": "https://schema.org",
    "@graph": [
      editoreJsonLd(),
      {
        "@type": "CollectionPage",
        "@id": base + "bacheca/#elenco",
        "name": "Bacheca Q&A — domande e risposte sulle assicurazioni",
        "inLanguage": "it-IT",
        "isPartOf": { "@id": base + "#org" },
        "publisher": { "@id": base + "#org" },
        "mainEntity": {
          "@type": "ItemList",
          "numberOfItems": conIndirizzo.length,
          "itemListElement": conIndirizzo.map((f, i) => ({
            "@type": "ListItem",
            "position": i + 1,
            "url": urlGuida(f),
            "name": f.titolo || f.domanda
          }))
        }
      }
    ]
  };
}

/* Percorso di navigazione: aiuta i motori a capire la gerarchia
   e compare nello snippet al posto dell'URL con il cancelletto. */
/* Le briciole di pane dicono al motore dove sta una pagina
   dentro il sito. Vogliono indirizzi veri: costruite sul
   frammento indicherebbero tutte la stessa pagina, cioe' non
   direbbero niente. Ogni voce porta la propria rotta interna e
   qui diventa l'indirizzo pubblico corrispondente. */
function breadcrumbJsonLd(voci) {
  const base = SITO();
  return {
    "@type": "BreadcrumbList",
    "itemListElement": voci.map((v, i) => ({
      "@type": "ListItem", "position": i + 1, "name": v.nome,
      "item": base + (v.percorso !== undefined ? v.percorso : (indirizzoPubblico(v.rotta, v.path) || ""))
    }))
  };
}

/* Una guida redazionale dichiarata per quello che è: un
   articolo. Serve ai motori generativi più che ai risultati
   arricchiti — è così che sanno chi firma un testo, quando è
   stato scritto e su cosa, e quindi se citarlo e come.

   Niente campi inventati: la data è quella della guida,
   l'editore è quello dichiarato nelle note legali, il testo è
   quello visibile in pagina. Se un dato non c'è, il campo non
   compare invece di essere riempito a caso. */
function articoloJsonLd(f) {
  const base = SITO();
  const testo = (f.risposte[0] && f.risposte[0].testo) || "";
  return {
    "@type": "Article",
    "@id": urlGuida(f) + "#articolo",
    "headline": (f.titolo || f.domanda).slice(0, 110),
    "description": f.meta || testo.slice(0, 200),
    "inLanguage": "it-IT",
    "datePublished": f.data,
    "dateModified": f.data,
    "author": { "@id": base + "#org" },
    "publisher": { "@id": base + "#org" },
    "isPartOf": { "@id": base + "#website" },
    "mainEntityOfPage": { "@type": "WebPage", "@id": urlGuida(f) },
    "articleSection": f.cat,
    "image": base + "assets/img/og-quotafacile.png",
    "wordCount": testo ? testo.trim().split(/\s+/).length : undefined,
    "about": f.keyword ? { "@type": "Thing", "name": f.keyword } : undefined
  };
}

/* Directory: elenco di professionisti con la loro qualifica.
   InsuranceAgency è il tipo che i motori associano al settore. */
function directoryJsonLd(lista) {
  const base = SITO();
  return {
    "@context": "https://schema.org",
    "@graph": [
      editoreJsonLd(),
      breadcrumbJsonLd([{ nome: "Home", rotta: "home" }, { nome: "Intermediari", rotta: "intermediari" }]),
      {
        "@type": "ItemList",
        "name": "Intermediari assicurativi su QuotaFacile",
        "numberOfItems": lista.length,
        "itemListElement": lista.map((b, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "item": {
            "@type": "InsuranceAgency",
            "name": b.nome,
            "description": DA_COMPILARE(b.bio) ? undefined : b.bio,
            "areaServed": DA_COMPILARE(b.citta) ? undefined : b.citta,
            "telephone": DA_COMPILARE(b.tel) ? undefined : b.tel,
            "email": DA_COMPILARE(b.email) ? undefined : b.email,
            "knowsAbout": b.spec,
            "parentOrganization": b.operaPerConto && !DA_COMPILARE(b.operaPerConto)
              ? { "@type": "Organization", "name": b.operaPerConto } : undefined
          }
        }))
      }
    ]
  };
}

/* I campi non ancora compilati sono marcati «così» nei file di
   contenuto: li evidenziamo invece di stamparli come fossero veri. */
const DA_COMPILARE = v => typeof v === "string" && /^«.*»$/.test(v);
const campo = v => DA_COMPILARE(v) ? `<span class="todo-field">${esc(v)}</span>` : esc(v);

/* Etichetta RUI: senza numero verificato non stampiamo un numero.
   Sezione e data di iscrizione restano visibili perché sono i dati
   che l'utente può usare per cercare la persona sul registro IVASS. */
function ruiLabel(b) {
  if (b.rui) return `RUI ${esc(b.rui)}`;
  const dal = b.ruiDal ? ` · dal ${new Date(b.ruiDal).toLocaleDateString("it-IT")}` : "";
  return `RUI sez. ${esc(b.ruiSezione || "—")}${dal} · <span class="rui-pending">n. in verifica</span>`;
}

/* CTA "CHIAMA": presente su ogni scheda. Finché il recapito non è
   stato inserito resta visibile ma inattiva, così la scheda mostra
   comunque l'azione principale senza offrire un link telefonico rotto. */
function ctaChiama(b) {
  return (!b.tel || DA_COMPILARE(b.tel))
    ? `<span class="btn btn-primary btn-sm btn-disabled" aria-disabled="true" title="Recapito telefonico non ancora disponibile">📞 CHIAMA</span>`
    : `<a class="btn btn-primary btn-sm" href="tel:${esc(b.tel)}">📞 CHIAMA</a>`;
}

/* QuotaPass component */
function qpass(b, flat = false) {
  return `
  <div class="qpass ${flat ? "flat" : ""}" role="img" aria-label="Tessera di ${esc(b.nome)}">
    <div class="qpass-top">
      <span class="qpass-logo">Quota<em>Pass</em></span>
      <!-- Due distintivi diversi, e non vanno confusi: "Verificato
           RUI" dice che il numero è stato riscontrato sul registro
           pubblico, "In evidenza" dice che quel profilo ha un
           abbonamento. Il primo è un controllo, il secondo è una
           collocazione pagata: metterli con lo stesso peso
           farebbe sembrare una verifica quello che è un acquisto. -->
      ${b.inEvidenza ? `<span class="qpass-evidenza" title="Profilo con abbonamento: compare più in alto negli elenchi">★ In evidenza</span>` : ""}
      ${b.verificato ? `<span class="qpass-verified">✓ Verificato RUI</span>` : `<span class="qpass-verified" style="opacity:.55">In verifica</span>`}
    </div>
    <div>
      <div class="qpass-chip" aria-hidden="true"></div>
      <div class="qpass-identity">
        <div class="qpass-avatar">${esc(initials(b.nome))}</div>
        <div>
          <div class="qpass-name">${esc(b.nome)}</div>
          <!-- Un campo non ancora compilato semplicemente non
               compare: stampare «Città» accanto al badge
               "Verificato RUI" farebbe sembrare incerto anche ciò
               che incerto non è. Il promemoria di cosa manca sta
               nella console, dove serve a chi deve compilarlo. -->
          <div class="qpass-role">${[b.ruolo, b.azienda, b.citta].filter(v => v && !DA_COMPILARE(v)).map(esc).join(" · ")}</div>
        </div>
      </div>
    </div>
    <div class="qpass-bottom">
      <span class="qpass-rui">${ruiLabel(b)}</span>
      <span class="qpass-tags">${(b.spec || []).slice(0, 3).map(s => `<span>${esc(s)}</span>`).join("")}</span>
    </div>
  </div>`;
}

/* ---------------- VIEWS ---------------- */
const views = {};

/* ----- HOME ----- */
/* ---------------- LE DOMANDE DI IDENTITÀ ----------------

   Chi arriva da una ricerca, o da un motore di risposta, si fa
   sempre le stesse cinque o sei domande: cos'è questo sito, è un
   broker, quanto costa, chi tratta la mia richiesta, che fine
   fanno i miei dati. Le risposte esistevano già — sparse fra
   note legali, termini e privacy — ma sparse vuol dire che chi
   legge la pagina non le trova e chi la riassume nemmeno.

   Sono qui perché sono vere e perché servono a chi legge, non
   per avere un blocco FAQ da dare in pasto a Google: ogni
   risposta dice un fatto verificabile e rimanda al documento in
   cui è scritto per esteso. Gli stessi testi finiscono nei dati
   strutturati, così quello che il motore riassume è esattamente
   quello che l'utente vede. */
/* Le stesse risposte, ripulite dal marcatore, per i dati
   strutturati: un motore che riassume non deve ritrovarsi dentro
   i tag. */
function identitaJsonLd() {
  return DOMANDE_IDENTITA.map(q => ({
    "@type": "Question",
    "name": q.d,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": q.r.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    }
  }));
}

const DOMANDE_IDENTITA = [
  {
    d: "Che cos'è QuotaFacile?",
    r: `Un marketplace italiano di intermediari assicurativi. Agenti, broker e collaboratori
        iscritti al <strong>RUI</strong> — il registro IVASS — pubblicano un profilo verificabile e
        rispondono a domande assicurative reali. Chi cerca una polizza confronta i profili e
        contatta direttamente il professionista che preferisce.`
  },
  {
    d: "QuotaFacile è un broker o un'agenzia assicurativa?",
    r: `No. QuotaFacile <strong>non svolge attività di distribuzione assicurativa</strong> ai sensi
        dell'art. 106 del d.lgs. 209/2005: non colloca polizze e non percepisce provvigioni sui
        contratti. È una piattaforma di informazione e messa in contatto. Il sito è gestito da
        Riccardo Di Falco, intermediario iscritto alla sezione E del RUI, che è anche presente fra
        i professionisti in vetrina: è dichiarato nelle <a href="#/note-legali">note legali</a>.`
  },
  {
    d: "Quanto costa usare QuotaFacile?",
    r: `Per chi cerca una polizza è <strong>gratuito</strong> e non richiede registrazione. Non ci
        sono costi di intermediazione: il rapporto economico, se nasce, è fra te e l'intermediario.`
  },
  {
    d: "Chi gestisce la mia richiesta di preventivo?",
    r: `L'intermediario che scegli tu, oppure gli intermediari specializzati nel ramo che hai
        indicato. Da quel momento tratta i tuoi dati <strong>come titolare autonomo</strong>, con
        una propria informativa che puoi chiedergli. QuotaFacile non risponde dei trattamenti che
        effettua lui: lo spiega la <a href="#/privacy">privacy policy</a>.`
  },
  {
    d: "Come faccio a verificare che un intermediario sia davvero iscritto?",
    r: `Ogni profilo espone il <strong>numero di iscrizione al RUI</strong>. Lo puoi controllare tu
        stesso sul <a href="https://servizi.ivass.it/RuirPubblica/" target="_blank" rel="noopener">registro
        pubblico IVASS</a>, senza passare da noi.`
  },
  {
    d: "Che fine fanno i miei dati?",
    r: `Vengono trasmessi <strong>solo agli intermediari pertinenti</strong> alla richiesta e
        conservati 24 mesi dall'ultimo contatto. Non sono venduti né ceduti per finalità di
        marketing. Puoi chiederne accesso, rettifica o cancellazione in ogni momento scrivendo a
        privacy@quotafacile.net.`
  }
];


/* ---------------- PAGINA NON TROVATA ----------------
   GitHub Pages serve questo file con stato 404 vero quando il
   percorso non esiste. Dentro l'applicazione la stessa vista
   compare per una rotta sconosciuta: lì lo stato HTTP non si può
   cambiare — la risposta è già partita — ma almeno la pagina
   dice la verità invece di far credere di essere arrivati. */
views.nonTrovato = () => `
  <section class="section">
    <div class="container" style="max-width:42rem">
      <span class="eyebrow">Errore 404</span>
      <h1 class="titolo-sezione">Questa pagina non c'è</h1>
      <p class="lead">L'indirizzo è sbagliato, oppure la pagina è stata spostata.
      Non è colpa tua: se ci sei arrivato da un link nostro, segnalacelo.</p>
      <div class="card" style="margin-top:1.4rem">
        <h2 style="font-size:1.05rem;margin:0 0 .8rem">Da dove ripartire</h2>
        <ul class="lista-404">
          <li><a href="#/">Home</a> — cos'è QuotaFacile e come funziona</li>
          <li><a href="#/intermediari">Trova un intermediario</a> — profili verificati sul RUI</li>
          <li><a href="#/bacheca">Bacheca Q&amp;A</a> — domande vere con risposte firmate</li>
          <li><a href="#/preventivo">Richiedi un preventivo</a> — gratuito, senza registrazione</li>
          <li><a href="#/contatti">Contatti</a> — per segnalarci il link rotto</li>
        </ul>
      </div>
    </div>
  </section>`;

views.home = () => {
  /* I tre in vetrina sulla home: prima chi ha il piano Pro, poi i
     punti. È la differenza concreta fra Base e Pro — Base porta
     in alto nella lista degli intermediari, Pro anche qui — e
     senza questa riga sarebbe una differenza scritta solo sulla
     pagina dei prezzi. Anche qui l'ordine è dichiarato: la nota
     sotto le tessere lo dice. */
  const featured = [...DB.brokers]
    .sort((a, b) => (b.piano === "pro" ? 1 : 0) - (a.piano === "pro" ? 1 : 0) || (b.punti ?? 0) - (a.punti ?? 0))
    .slice(0, 3);
  const topFaq = [...staffFaqs().slice(0, 2), publishedDaily()[0], ...domandeCommunity().filter(f => f.risposte.length)].filter(Boolean).slice(0, 3);
  /* Nel grafo finiscono sia le guide in vetrina sia le domande
     di identità: sono tutte visibili in pagina, ed è la
     condizione perché dichiararle sia corretto invece che una
     scorciatoia. */
  const ld = faqJsonLd(topFaq);
  const faqPage = ld["@graph"].find(n => n["@type"] === "FAQPage");
  if (faqPage) faqPage.mainEntity = [...identitaJsonLd(), ...faqPage.mainEntity];
  setJsonLd(ld);
  return `
  <section class="hero">
    <div class="container hero-inner">
      <div class="rise">
        <span class="eyebrow">Marketplace assicurativo italiano</span>
        <h1>QuotaFacile — Assicurazioni al miglior prezzo, in un solo marketplace.</h1>
        <p class="lead">Trova l'intermediario giusto, confronta e risparmia sulle tue polizze. Professionisti verificati RUI, contatto diretto, zero costi per te.</p>
        <div class="hero-actions">
          <a href="#/preventivo" class="btn btn-gold">Richiedi un preventivo gratuito</a>
          <a href="#/professionisti" class="btn btn-light">Sei un intermediario?</a>
        </div>
        <div class="hero-trust">
          <div><strong>${DB.brokers.length + (DB.proProfile ? 1 : 0)}</strong><span>intermediari iscritti</span></div>
          <div><strong>${contaRisposte()}</strong><span>risposte pubblicate</span></div>
          <div><strong>100%</strong><span>gratuito per chi cerca</span></div>
        </div>
      </div>
      <div class="rise-2">${qpass(featured[0])}</div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Come funziona</span>
        <h2>Tre passi, nessuna intermediazione occulta</h2>
      </div>
      <div class="grid-3">
        <div class="card rise"><span class="step-num">1</span><h3>Descrivi cosa ti serve</h3><p class="muted">Auto, casa, vita, impresa: compila la richiesta in due minuti, senza registrarti.</p></div>
        <div class="card rise-2"><span class="step-num">2</span><h3>Confronta i profili</h3><p class="muted">Ogni intermediario ha la sua QuotaPass: chi è, numero RUI, specializzazioni e risposte pubblicate.</p></div>
        <div class="card rise-3"><span class="step-num">3</span><h3>Contatta chi preferisci</h3><p class="muted">Telefono, email o richiesta di consulenza: parli direttamente con il professionista, senza passaggi intermedi.</p></div>
      </div>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Perché QuotaFacile</span>
        <h2>Trasparenza prima di tutto</h2>
      </div>
      <div class="grid-3">
        <div class="card"><span class="icon-dot">💶</span><h3>Risparmia sulle polizze</h3><p class="muted">Più professionisti in concorrenza sulla tua richiesta significa condizioni migliori per te.</p></div>
        <div class="card"><span class="icon-dot">🛡️</span><h3>Professionisti verificati</h3><p class="muted">Ogni profilo espone il numero di iscrizione al RUI, il registro IVASS degli intermediari.</p></div>
        <div class="card"><span class="icon-dot">🔍</span><h3>Nessuna intermediazione occulta</h3><p class="muted">QuotaFacile non vende polizze: mette in contatto. Il rapporto è tuo, diretto, con l'intermediario.</p></div>
      </div>
    </div>
  </section>

  <section class="section section-identita">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">In breve</span>
        <h2>Le domande che ci fanno più spesso</h2>
        <p class="muted">Risposte dirette su cos'è QuotaFacile, cosa non è, e cosa succede ai tuoi dati.</p>
      </div>
      <div class="identita-elenco">
        ${DOMANDE_IDENTITA.map(q => `
          <details class="identita-voce">
            <summary>${esc(q.d)}</summary>
            <p>${q.r}</p>
          </details>`).join("")}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Intermediari in evidenza</span>
        <h2>Le QuotaPass della settimana</h2>
        <p class="muted">In evidenza chi risponde di più in bacheca: la visibilità si guadagna aiutando.</p>
      </div>
      <div class="pass-grid">
        ${featured.map(b => `
          <div class="pass-wrap">
            ${qpass(b, true)}
            <div class="pass-actions">
              ${ctaChiama(b)}
              <a class="btn btn-outline btn-sm" href="#/preventivo?to=${b.id}">Consulenza</a>
            </div>
          </div>`).join("")}
      </div>
      <p style="margin-top:1.6rem"><a href="#/intermediari" class="btn btn-ghost">Vedi tutti gli intermediari →</a></p>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Bacheca Q&amp;A</span>
        <h2>Le risposte degli esperti, aperte a tutti</h2>
        <p class="muted">Dubbi assicurativi reali, risposti da intermediari iscritti al RUI. Ogni risposta è pubblica e verificabile.</p>
      </div>
      ${topFaq.map(f => qaCard(f)).join("")}
      <p style="margin-top:1rem"><a href="#/bacheca" class="btn btn-outline">Esplora tutta la bacheca →</a></p>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container appsoon">
      <div class="rise">
        <span class="eyebrow">📱 Coming soon</span>
        <h2>QuotaFacile arriva su iPhone</h2>
        <p class="muted" style="max-width:30rem">La domanda del giorno con notifica, preventivi in due tocchi e la tua QuotaPass sempre in tasca. Stiamo lavorando all'app: lascia la tua email e ti avvisiamo al lancio.</p>
        <div class="store-badges">
          <span class="store-badge"><span class="store-icon"></span><span><small>Prossimamente su</small><strong>App Store</strong></span></span>
          <span class="soon-tag">In sviluppo · 2026</span>
        </div>
        <form id="notify-form" class="notify-form">
          <input type="email" id="notify-email" required placeholder="La tua email" aria-label="Email per notifica lancio app">
          <button class="btn btn-primary" type="submit">Avvisami</button>
        </form>
        <div style="max-width:30rem">
          ${consentBox("notify-consenso", `Acconsento all'uso della mia email per essere avvisato del lancio dell'app, come descritto nell'<a href="#/privacy">informativa privacy</a>. Nessun altro invio, disiscrizione con un clic.`)}
        </div>
      </div>
      <div class="phone-stage rise-2">
        <div class="phone" role="img" aria-label="Anteprima dell'app QuotaFacile su iPhone">
          <div class="phone-island"></div>
          <div class="phone-screen">
            <div class="m-status"><span>9:41</span><span>𝗹𝗹𝗹 ⏻</span></div>
            <div class="m-topbar"><span class="m-mark">Q</span><span class="m-brand">Quota<em>Facile</em></span></div>
            <div class="m-hero">
              <div class="m-hero-title">Assicurazioni al miglior prezzo</div>
              <div class="m-hero-sub">Confronta e risparmia sulle tue polizze</div>
              <div class="m-hero-btn">Richiedi preventivo</div>
            </div>
            <div class="m-daily">
              <div class="m-daily-tag">☀️ Domanda del giorno</div>
              <div class="m-daily-q">Quanto costa l'assicurazione per un neopatentato?</div>
              <div class="m-daily-a"><span class="m-qf">QF</span> Redazione + 2 intermediari</div>
            </div>
            <div class="m-pass">
              <div class="m-pass-top"><span>Quota<em>Pass</em></span><span class="m-pass-ver">✓ RUI</span></div>
              <div class="m-pass-id"><span class="m-pass-av">LB</span><span><b>Laura Bianchi</b><i>Broker · Milano</i></span></div>
            </div>
            <div class="m-tabbar">
              <span class="on">⌂</span><span>💬</span><span class="m-tab-cta">€</span><span>👤</span><span>🪪</span>
            </div>
          </div>
        </div>
        <div class="phone-glow" aria-hidden="true"></div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="cta-band">
        <div>
          <h2 style="color:#fff">Sei un intermediario? Iscriviti e pubblica le tue offerte.</h2>
          <p>Crea la tua QuotaPass, rispondi in bacheca e conquista posizioni: più aiuti, più clienti ti trovano.</p>
        </div>
        <a href="#/area-pro" class="btn btn-gold">Crea la tua QuotaPass</a>
      </div>
    </div>
  </section>`;
};

/* ----- PAGINA PROFESSIONISTI -----

   I NUMERI DI QUESTA PAGINA NON SONO UNA PROMESSA

   A un intermediario che valuta un abbonamento serve sapere cosa
   può tornargli indietro. La tentazione è scrivere "ricevi fino a
   N contatti al mese": è quello che fanno tutti, ed è una cifra
   che nessuno può sostenere.

   Qui si fa il contrario: si mostra il calcolo. Un volume di
   ricerca misurato, le quote di clic per posizione, un tasso di
   contatto dichiarato. Chi legge vede da dove esce il numero e
   può cambiarne le ipotesi. E si dice, nella stessa pagina, che
   quella posizione oggi non ce l'abbiamo: il numero dice quanto
   vale arrivarci, non quanto stiamo incassando.

   È meno efficace di una promessa e regge alla prima domanda
   difficile, che su un pubblico di professionisti arriva sempre. */

/* Volume misurato su Ubersuggest (Italia, settembre 2026) per
   "assicurazione monopattino elettrico", la chiave del pillar più
   recente. Una sola chiave, non la somma del Magazine: un numero
   verificabile vale più di un totale che nessuno può ricontrollare. */
const SEO_ESEMPIO = { chiave: "assicurazione monopattino elettrico", ricerche: 6600, difficolta: 15 };

/* Quote di clic organico per fascia di posizione. Sono ordini di
   grandezza ricorrenti negli studi pubblici sul CTR, non una
   misura del nostro sito: servono a dare la scala, e la pagina lo
   dichiara. */
const CTR_FASCE = [
  ["1ª posizione", 0.27],
  ["2ª e 3ª", 0.12],
  ["dalla 4ª alla 6ª", 0.06],
  ["dalla 7ª alla 10ª", 0.02]
];

const PIANI = [
  {
    id: "gratis", nome: "QuotaPass", prezzo: null, cadenza: "sempre gratuito",
    sommario: "La vetrina. Serve a esserci e a farsi verificare.",
    voci: [
      "Profilo pubblico con numero RUI, ruolo e città",
      "Risposte in bacheca firmate e indicizzate",
      "Presenza nella lista intermediari"
    ],
    azione: { testo: "Crea la QuotaPass", href: "#/area-pro" }
  },
  /* Le voci elencate qui sono quelle che il codice fa davvero, e
     l'elenco è corto per quello. Prima ne prometteva quattro per
     piano — "richieste della tua provincia", "priorità nello
     smistamento", "statistiche del profilo" — e nessuna esisteva.
     Un listino che promette cose non costruite è il modo più
     rapido di perdere la fiducia del primo che paga e non le
     trova, e la prima cosa che verifica chi paga è proprio la
     riga che l'ha convinto. */
  {
    id: "base", nome: "Base", prezzo: "8,99", cadenza: "al mese, IVA esclusa",
    prova: 30,
    sommario: "Per essere trovato, non solo per esserci.",
    voci: [
      "Tutto quello che c'è nel piano gratuito",
      "Profilo in evidenza nella Lista Intermediari, sopra i profili gratuiti",
      "Il contrassegno ★ In evidenza sulla tua QuotaPass"
    ],
    azione: { testo: "Prova 30 giorni gratis", piano: "base" }
  },
  {
    id: "pro", nome: "Pro", prezzo: "19,99", cadenza: "al mese, IVA esclusa",
    prova: 30,
    sommario: "Per chi sulla bacheca ci lavora.",
    voci: [
      "Tutto quello che c'è in Base",
      "Profilo fra i tre intermediari in vetrina sulla home",
      "Punti doppi in bacheca: ogni risposta pubblicata ne vale 20 invece di 10"
    ],
    azione: { testo: "Prova 30 giorni gratis", piano: "pro" }
  }
];

views.professionisti = () => {
  const visite = q => Math.round(SEO_ESEMPIO.ricerche * q);
  const contatti = q => Math.round(SEO_ESEMPIO.ricerche * q * 0.02);

  /* Il grafo dichiara i due piani a listino come offerte con un
     prezzo vero. L'Enterprise no: un'offerta senza prezzo in
     schema.org si dichiara solo se il prezzo esiste e non lo si
     vuole mostrare — qui non esiste, perché si costruisce caso
     per caso, e inventarne uno sarebbe dichiarare il falso. */
  setJsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": SITO() + "professionisti/#servizio",
        "name": "QuotaFacile per intermediari assicurativi",
        "serviceType": "Piattaforma di visibilità e contatti per intermediari assicurativi",
        "areaServed": { "@type": "Country", "name": "Italia" },
        "provider": { "@id": SITO() + "#org" },
        /* Ora si sottoscrivono davvero, quindi InStock. Finché non
           si potevano attivare erano dichiarati PreOrder: un
           motore di ricerca mostra la disponibilità come la trova
           scritta, e dichiarare disponibile ciò che non lo è
           significa farglielo ripetere. */
        "offers": PIANI.filter(p => p.prezzo).map(p => ({
          "@type": "Offer",
          "name": "Piano " + p.nome,
          "price": p.prezzo.replace(",", "."),
          "priceCurrency": "EUR",
          "valueAddedTaxIncluded": false,
          "availability": "https://schema.org/InStock",
          "description": p.sommario,
          "url": SITO() + "professionisti/"
        }))
      },
      breadcrumbJsonLd([
        { nome: "Home", rotta: "home" },
        { nome: "Per i professionisti", rotta: "professionisti" }
      ])
    ]
  });

  return `
  <section class="hero">
    <div class="container hero-inner">
      <div class="rise">
        <span class="eyebrow">Per agenti, broker e collaboratori</span>
        <h1>La prima piattaforma per intermediari assicurativi</h1>
        <p class="lead">Su QuotaFacile non compri contatti: li conquisti. Crea il tuo profilo, rispondi
        alle domande degli utenti e fatti trovare da chi sta già cercando una polizza.
        Nessuna commissione sui contratti: il cliente è tuo, e il rapporto pure.</p>
        <div class="hero-actions">
          <a href="#/area-pro" class="btn btn-gold">Inizia gratis — crea la QuotaPass</a>
          <a href="#piani" class="btn btn-outline">Vedi i piani</a>
        </div>
      </div>
      <div class="rise-2">${qpass(DB.brokers[1])}</div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-head"><span class="eyebrow">Come funziona per te</span>
      <h2>Tre mosse, e nessuna provvigione</h2></div>
      <div class="grid-3">
        <div class="card"><span class="step-num">1</span><h3>Crea la tua QuotaPass</h3>
          <p class="muted">Nome, ruolo, numero RUI, specializzazioni. Il numero RUI è verificabile sul
          registro pubblico IVASS da chiunque apra il tuo profilo: è quello che ti distingue da un
          annuncio qualsiasi.</p></div>
        <div class="card"><span class="step-num">2</span><h3>Rispondi in bacheca</h3>
          <p class="muted">Gli utenti pubblicano dubbi assicurativi. Ogni tua risposta è pubblica,
          firmata e indicizzata: resta online e continua a lavorare mesi dopo che l'hai scritta.</p></div>
        <div class="card"><span class="step-num">3</span><h3>Le richieste arrivano a te</h3>
          <p class="muted">Chi ti ha letto e vuole parlarne ti scrive direttamente. Non passiamo dal
          mezzo: nessuna commissione sul contratto, nessun contatto rivenduto a tre colleghi.</p></div>
      </div>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">In numeri</span>
        <h2>Quanto vale una posizione, con il calcolo in chiaro</h2>
        <p class="muted">Nessuno può promettere quanti contatti riceverai. Quello che si può fare è
        mostrare l'aritmetica e le sue ipotesi, così puoi rifarla con i tuoi numeri.</p>
      </div>

      <div class="card">
        <h3>Il punto di partenza è una misura, non una stima</h3>
        <p class="muted">La chiave <strong>«${esc(SEO_ESEMPIO.chiave)}»</strong> fa
        <strong>${SEO_ESEMPIO.ricerche.toLocaleString("it-IT")} ricerche al mese</strong> in Italia, con
        una difficoltà SEO di ${SEO_ESEMPIO.difficolta} su 100 (fonte: Ubersuggest, settembre 2026).
        È la chiave su cui è costruita la nostra <a href="#/magazine/assicurazione-monopattino-elettrico">guida
        all'obbligo di assicurazione per i monopattini</a>. Una sola chiave fra le dodici del Magazine:
        un numero che puoi ricontrollare vale più di un totale che nessuno può verificare.</p>

        <div class="calc-riga">
          <label for="calc-ricerche">Ricerche al mese</label>
          <input id="calc-ricerche" type="number" min="0" step="100" value="${SEO_ESEMPIO.ricerche}">
          <label for="calc-tasso">Su 100 che leggono, quanti ti scrivono</label>
          <input id="calc-tasso" type="number" min="0" max="100" step="0.5" value="2">
        </div>

        <table class="calc-tabella">
          <thead><tr><th>Se la pagina si posiziona</th><th class="num">Visite al mese</th><th class="num">Contatti al mese</th></tr></thead>
          <tbody id="calc-corpo">
            ${CTR_FASCE.map(([nome, q]) => `
              <tr data-ctr="${q}">
                <td>${esc(nome)}</td>
                <td class="num">${visite(q).toLocaleString("it-IT")}</td>
                <td class="num"><strong>${contatti(q)}</strong></td>
              </tr>`).join("")}
          </tbody>
        </table>

        <p class="privacy-hint">Le quote di clic sono ordini di grandezza ricorrenti negli studi pubblici
        sul CTR organico, non una misura di questo sito. Il tasso di contatto è l'ipotesi che puoi
        cambiare qui sopra: due su cento è un valore prudente per un contenuto informativo.</p>

        <div class="legal-warning" style="margin-top:1rem">
          <strong>E la cosa che gli altri non scrivono:</strong> oggi QuotaFacile non è in prima pagina
          su questa chiave. La tabella dice <em>quanto vale arrivarci</em>, non quanto stiamo incassando.
          Il Magazine è online da poche settimane e i dodici articoli devono ancora posizionarsi —
          se qualcuno ti promette contatti dal primo mese, chiedigli di mostrarti questo stesso calcolo.
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="piani">
    <div class="container">
      <div class="section-head"><span class="eyebrow">Piani</span>
      <h2>Quanto costa stare qui</h2>
      <p class="muted">Un prezzo mensile, nessuna percentuale sui contratti, nessun vincolo di durata.</p></div>

      <div class="piani-griglia">
        ${PIANI.map(p => `
          <div class="piano">
            ${p.prova ? `<span class="piano-nastro">${p.prova} giorni gratis</span>` : ""}
            <h3 class="piano-nome">${esc(p.nome)}</h3>
            <p class="piano-prezzo">
              ${p.prezzo
                ? `<strong>${esc(p.prezzo)} €</strong><span>${esc(p.cadenza)}</span>`
                : `<strong>Gratis</strong><span>${esc(p.cadenza)}</span>`}
            </p>
            <p class="piano-sommario">${esc(p.sommario)}</p>
            <ul class="piano-voci">
              ${p.voci.map(v => `<li>${esc(v)}</li>`).join("")}
            </ul>
            ${p.azione.piano
              ? `<p class="privacy-hint">Carta richiesta subito, nessun addebito per ${p.prova} giorni.
                 Disdici quando vuoi dalla tua area: se disdici entro la prova non paghi nulla.</p>
                 <button class="btn btn-primary piano-btn" data-abbona="${esc(p.azione.piano)}">${esc(p.azione.testo)}</button>`
              : `<a class="btn btn-outline piano-btn" href="${esc(p.azione.href)}">${esc(p.azione.testo)}</a>`}
          </div>`).join("")}

        <div class="piano piano-enterprise">
          <h3 class="piano-nome">Enterprise</h3>
          <p class="piano-prezzo"><strong>Su misura</strong><span>si parte da una chiamata</span></p>
          <p class="piano-sommario">Quando il problema non è la visibilità ma il lavoro ripetitivo che ti porta via le giornate.</p>
          <ul class="piano-voci">
            <li>Automazioni su misura per l'agenzia o lo studio: rinnovi, scadenzario, solleciti, smistamento delle richieste</li>
            <li>Integrazione con il gestionale che già usi, invece di sostituirlo</li>
            <li>Sviluppo di applicazioni web dedicate — un portale clienti, un preventivatore interno, una dashboard di produzione</li>
            <li>Import e bonifica delle anagrafiche che oggi vivono in fogli di calcolo</li>
          </ul>
          <p class="privacy-hint">Non è un piano a listino perché non esiste un prezzo onesto prima di
          aver capito cosa fai e con quali strumenti. Si parte da una conversazione: se non ha senso,
          te lo diciamo.</p>
          <button type="button" class="btn btn-gold piano-btn" data-apri-enterprise>Raccontaci cosa ti serve</button>
        </div>
      </div>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container">
      <div class="section-head"><span class="eyebrow">Prima che lo chiedi</span><h2>Le domande che ci fanno gli intermediari</h2></div>
      <div class="grid-2" style="gap:1rem;align-items:start">
        <div class="card"><h3>Prendete una percentuale sui contratti?</h3>
          <p class="muted">No, e non è una promozione a tempo: QuotaFacile non svolge attività di
          distribuzione assicurativa e non percepisce provvigioni. Il contratto lo fai tu, con il tuo
          mandato e la tua responsabilità.</p></div>
        <div class="card"><h3>I contatti li vendete anche ad altri?</h3>
          <p class="muted">No. Una richiesta indirizzata a te arriva a te. Non è un mercato di lead
          rivenduti a tre colleghi della stessa città.</p></div>
        <div class="card"><h3>Posso disdire quando voglio?</h3>
          <p class="muted">Sì. L'abbonamento è mensile e si interrompe dalla mensilità successiva.
          Il profilo gratuito resta, con le risposte che hai scritto.</p></div>
        <div class="card"><h3>Il gestore è un concorrente?</h3>
          <p class="muted">QuotaFacile è gestita da un intermediario iscritto alla sezione E del RUI,
          che è anche presente in vetrina. Lo scriviamo in chiaro nelle
          <a href="#/note-legali">note legali</a>, perché è il tipo di cosa che è giusto sapere prima.</p></div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="cta-band">
        <div>
          <h2 style="color:#fff">Iscrizione gratuita. Ti bastano 3 minuti.</h2>
          <p>Si comincia dal profilo gratuito. I piani a pagamento si attivano quando hai visto se il posto ti serve.</p>
        </div>
        <a href="#/area-pro" class="btn btn-gold">Crea il profilo ora</a>
      </div>
    </div>
  </section>`;
};

/* ----- DIRECTORY INTERMEDIARI ----- */
let dirFilter = "Tutti";
views.intermediari = () => {
  const cats = ["Tutti", "Auto", "Casa", "Vita", "Impresa", "Salute", "Cyber"];
  const list = DB.brokers.filter(b => dirFilter === "Tutti" || b.spec.includes(dirFilter));
  setJsonLd(directoryJsonLd(list));
  return `
  <section class="section">
    <div class="container">
      <div class="section-head"><span class="eyebrow">Directory</span><h1 class="titolo-sezione">Trova il tuo intermediario assicurativo</h1>
      <p class="muted">Ogni QuotaPass mostra ruolo, città, numero RUI e specializzazioni. Contatta direttamente chi preferisci.</p></div>
      <!-- L'ordine di un elenco sembra sempre un giudizio, e qui
           non lo è: chi ha un abbonamento sta più in alto. L'art.
           22-bis del Codice del consumo impone di dirlo, e anche
           senza quella norma sarebbe il minimo verso chi legge. Il
           badge "Verificato RUI" invece non si compra: quello
           resta il riscontro sul registro pubblico. -->
      <p class="privacy-hint" style="margin:-.6rem 0 1rem">
        <strong>Come è ordinata questa lista.</strong> I profili contrassegnati
        <em>★ In evidenza</em> hanno un abbonamento a pagamento e compaiono più in alto: è una
        collocazione acquistata, non un giudizio sulla qualità. Il badge <em>✓ Verificato RUI</em>
        non si acquista — dice solo che il numero è stato riscontrato sul
        <a href="https://servizi.ivass.it/RuirPubblica/" target="_blank" rel="noopener">registro pubblico IVASS</a>.
      </p>
      <div class="filterbar">
        ${cats.map(c => `<button class="chip ${c === dirFilter ? "active" : ""}" data-filter="${c}">${c}</button>`).join("")}
      </div>
      <div class="pass-grid">
        ${list.map(b => `
        <div class="pass-wrap">
          ${qpass(b, true)}
          ${b.operaPerConto ? `<p class="opera-per">Opera per conto di <strong>${campo(b.operaPerConto)}</strong></p>` : ""}
          ${b.gestoreDelSito ? `<p class="nota-gestore">ℹ️ Gestisce QuotaFacile ed è presente in vetrina come intermediario: <a href="#/note-legali">leggi cosa comporta</a>.</p>` : ""}
          ${DA_COMPILARE(b.bio) ? "" : `<p class="muted" style="font-size:.88rem;margin:.1rem 0">${esc(b.bio)}</p>`}
          <div class="pass-actions">
            ${ctaChiama(b)}
            ${DA_COMPILARE(b.email) ? "" : `<a class="btn btn-outline btn-sm" href="mailto:${esc(b.email)}">✉️ Email</a>`}
            <a class="btn btn-outline btn-sm" href="#/preventivo?to=${b.id}">Consulenza</a>
          </div>
        </div>`).join("") || `<p class="muted">Nessun intermediario per questa categoria (per ora).</p>`}
      </div>
    </div>
  </section>`;
};

/* ----- BACHECA Q&A ----- */
let boardFilter = "Tutte";
function qaCard(f) {
  const best = f.risposte.find(r => r.accettata) || f.risposte[0];
  const a = best ? autoreDi(best) : null;
  const proCount = f.risposte.filter(r => !r.auto).length;
  return `
  <article class="card qa-card ${f.daily ? "qa-daily" : ""}${f.staff ? " qa-staff" : ""}" data-goto="#/faq/${f.id}">
    <div class="qa-meta">
      ${f.daily ? `<span class="badge-cat badge-daily">☀️ Domanda del giorno #${f.num}</span>` : ""}
      ${f.staff ? `<span class="badge-cat badge-staff">📌 Guida QuotaFacile</span>` : ""}
      <span class="badge-cat">${esc(f.cat)}</span>
      <span>${esc(f.data)}</span>
      <span>· ${f.risposte.length} rispost${f.risposte.length === 1 ? "a" : "e"}${f.daily && proCount ? ` (${proCount} da intermediari)` : ""}</span>
    </div>
    <!-- Il titolo è un link vero, non un <h3> con un gestore di
         click sopra. Cambia tre cose insieme: ci si arriva con il
         tabulatore, uno screen reader lo annuncia come link con la
         domanda per nome, e un motore di ricerca ha finalmente un
         filo da /bacheca/ alle guide — prima l'unica strada era la
         sitemap. La scheda resta cliccabile tutta grazie
         all'area estesa in CSS. -->
    <h3 class="qa-title"><a href="#/faq/${f.id}">${esc(f.domanda)}</a></h3>
    ${best ? `<p class="qa-excerpt">${esc(best.testo)}</p>` : `<p class="qa-excerpt" style="font-style:italic">Ancora senza risposta: sei un intermediario? Rispondi tu.</p>`}
    <div class="qa-foot">
      ${a ? (a.auto
        ? `<span class="qa-author"><span class="mini-avatar mini-qf">QF</span>${esc(a.nome)} <span class="level-badge badge-auto">risposta automatica</span></span>`
        : `<span class="qa-author"><span class="mini-avatar">${esc(initials(a.nome))}</span>${esc(a.nome)} ${etichettaAutore(a)}</span>`) : `<span></span>`}
      ${best ? `<span class="pts">▲ ${best.voti} utile</span>` : `<span class="pts">in attesa di risposta</span>`}
    </div>
  </article>`;
}

views.bacheca = () => {
  const cats = ["Tutte", "Auto", "Casa", "Vita", "Impresa", "Salute", "Viaggi"];
  /* Le domande Staff restano in cima: sono le pagine su cui
     puntiamo il posizionamento, devono essere le prime viste. */
  const merged = [...staffFaqs(), ...publishedDaily(), ...domandeCommunity()];
  const list = merged.filter(f => boardFilter === "Tutte" || f.cat === boardFilter);
  const leaders = [...DB.brokers, ...(DB.proProfile ? [DB.proProfile] : [])].sort((a, b) => b.punti - a.punti).slice(0, 5);
  const nDaily = dailyPublishedCount();
  setJsonLd(elencoJsonLd(merged));
  return `
  <section class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Bacheca Q&amp;A</span>
        <h1 class="titolo-sezione">Domande vere, risposte firmate</h1>
        <p class="muted">Qui chiunque può pubblicare una domanda di assicurazioni, gratis e senza
        registrarsi. La domanda compare in questa pagina, leggibile da tutti. A risponderti può
        essere la <strong>redazione di QuotaFacile</strong> oppure uno degli
        <strong>intermediari iscritti</strong>: ogni risposta è firmata con nome, ruolo e numero
        RUI di chi la scrive, e passa da una verifica prima di diventare pubblica. Non promettiamo
        tempi — dipende da chi legge e da quanto è specifica la domanda.</p>
      </div>

      <!-- Il modulo sta in alto, non in fondo alla lista.
           Chi arriva qui da una ricerca ha una domanda in testa
           adesso: se per scriverla deve prima scorrere venticinque
           schede, la scrive altrove. -->
      <div class="card chiedi-card">
        <div class="chiedi-testa">
          <h2 style="margin:0">Fai la tua domanda</h2>
          <span class="chiedi-gratis">gratis, senza registrarsi</span>
        </div>
        <ol class="chiedi-passi">
          <li><strong>Scrivi la domanda.</strong> Compare subito in bacheca, in fondo a questa pagina.</li>
          <li><strong>Risponde la redazione o un intermediario iscritto.</strong> La risposta porta il nome di chi la firma e viene verificata prima di essere pubblicata.</li>
          <li><strong>Resta consultabile.</strong> La domanda e la sua risposta restano qui, per chiunque avrà lo stesso dubbio.</li>
        </ol>
        <form id="ask-form" class="form-grid">
          <div class="field full"><label for="ask-q">La tua domanda</label><textarea id="ask-q" required placeholder="Es. Conviene la kasko su un'auto di 8 anni?"></textarea></div>
          <div class="field"><label for="ask-cat">Categoria</label>
            <select id="ask-cat">${["Auto","Casa","Vita","Impresa","Salute","Viaggi"].map(c => `<option>${c}</option>`).join("")}</select>
          </div>
          <div class="field full">
            ${consentBox("ask-consenso", `Ho letto l'<a href="#/privacy">informativa privacy</a> e acconsento alla pubblicazione della domanda in bacheca. So che sarà visibile pubblicamente e indicizzabile dai motori di ricerca: non inserisco dati personali miei o di terzi.`)}
          </div>
          <div class="field" style="justify-content:flex-end"><button class="btn btn-primary" type="submit">Pubblica la domanda</button></div>
        </form>
      </div>

      <div class="daily-counter card">
        ${dailyEsaurite() ? `
          <div>
            <strong>☀️ ${nDaily} domande del giorno pubblicate</strong>
            <div class="muted" style="font-size:.8rem">Il ciclo è concluso: restano tutte qui sotto, consultabili. Le prossime arriveranno quando ci sarà altro da dire, non per riempire un contatore.</div>
          </div>`
        : `
          <div>
            <strong>☀️ Domanda del giorno ${nDaily} di ${dailyTotale()}</strong>
            <div class="muted" style="font-size:.8rem">Prossima domanda tra ~${hoursToNextDaily()}h · una al giorno, con risposta della redazione</div>
          </div>
          <div class="progressbar" style="flex:1;max-width:260px"><i style="width:${Math.round(nDaily / dailyTotale() * 100)}%"></i></div>`}
      </div>

      <div class="board-layout">
        <div>
          <div class="filterbar">
            ${cats.map(c => `<button class="chip ${c === boardFilter ? "active" : ""}" data-boardfilter="${c}">${c}</button>`).join("")}
          </div>
          ${list.map(f => qaCard(f)).join("") || `<p class="muted">Nessuna domanda in questa categoria.</p>`}
        </div>
        <aside>
          <div class="card leader-card">
            <h3>🏆 Classifica esperti</h3>
            <p class="muted" style="font-size:.8rem;margin-top:-.3rem">Chi risponde in bacheca, e quanto</p>
            ${leaders.length ? leaders.map((b, i) => `
              <div class="leader-row">
                <span class="leader-rank ${i === 0 ? "gold" : ""}">${i + 1}</span>
                <span class="mini-avatar">${esc(initials(b.nome))}</span>
                <span class="leader-info"><strong>${esc(b.nome)}${b.id === "me" ? " (tu)" : ""}</strong><span>${esc(b.ruolo)} · ${b.risposte || 0} risposte</span></span>
                <span class="leader-pts">${b.punti ?? 0} pt</span>
              </div>`).join("")
            /* Un titolo sopra il nulla sembra una pagina rotta. Finché
               non c'è nessun iscritto, la scheda dice com'è. */
            : `<p class="muted" style="font-size:.88rem">Ancora nessun intermediario iscritto: la classifica si riempie da sé quando i primi cominciano a rispondere.</p>`}
            <a href="#/professionisti" class="btn btn-outline btn-sm btn-block" style="margin-top:1rem">Come si entra in classifica</a>
          </div>
        </aside>
      </div>
    </div>
  </section>`;
};

/* Collegamenti interni fra guide: tengono il lettore sul sito,
   distribuiscono autorità fra le pagine e danno ai motori il
   contesto tematico che una pagina isolata non ha. Prima le
   guide della stessa categoria, poi le altre. */
function guideCorrelate(f, quante = 4) {
  /* Prima portava solo alle guide. Ora porta anche alle domande
     che hanno un indirizzo pubblico, e il motivo è che senza
     quelle ogni pagina della bacheca era un ramo che finisce:
     chi arrivava da Google leggeva la risposta e usciva, e le
     quindici pagine nuove non si passavano niente l'una con
     l'altra.

     Si escludono le pagine senza slug. Non è pignoleria: sono
     pagine che dichiarano "noindex", e mandarci dei link da una
     pagina indicizzata sparpaglia autorità verso indirizzi che
     abbiamo chiesto di ignorare. Restano raggiungibili dalla
     bacheca, che è il posto giusto per loro. */
  const candidati = [...staffFaqs(), ...publishedDaily(), ...domandeCommunity()]
    .filter(g => g.id !== f.id && g.slug && (g.risposte || []).length);

  const ordinate = [
    ...candidati.filter(g => g.cat === f.cat),
    ...candidati.filter(g => g.cat !== f.cat)
  ].slice(0, quante);
  if (!ordinate.length) return "";

  const estratto = g => {
    if (g.meta) return g.meta;
    const best = g.risposte.find(r => r.accettata) || g.risposte[0];
    return best ? String(best.testo || "").slice(0, 110).replace(/\s+\S*$/, "") + "…" : "";
  };

  return `
  <nav class="correlate" aria-label="Contenuti correlati">
    <h3>Continua a leggere</h3>
    ${ordinate.map(g => `
      <a href="#/faq/${g.id}" class="correlata">
        <span class="correlata-cat">${g.staff ? "📌 Guida" : "💬 Bacheca"} · ${esc(g.cat)}</span>
        <span class="correlata-titolo">${esc(g.titolo || g.domanda)}</span>
        ${estratto(g) ? `<span class="correlata-meta">${esc(estratto(g))}</span>` : ""}
      </a>`).join("")}
  </nav>`;
}


/* ================= MAGAZINE (pubblico) =================

   Gli articoli arrivano dal database e le pagine le scrive il
   deploy, come per le guide. La differenza è che qui il legame
   fra pillar e cluster è un dato, non una convenzione: i link
   fra articoli li costruisce il sito, e restano giusti anche
   quando gli articoli diventano venti. */

const MAG = () => window.QFMagazine;
const urlArticolo = a => SITO() + "magazine/" + (a && a.slug ? a.slug + "/" : "");

function magCategoria(a) {
  const c = MAG()?.categoria(a && a.categoria_id);
  return c ? c.nome : "";
}

const magData = s => s
  ? new Date(s).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })
  : "";

/* 220 parole al minuto è la velocità media di lettura su schermo
   in italiano. Serve a dire quanto tempo chiede un articolo,
   prima che qualcuno cominci a leggerlo. */
const magMinuti = html => Math.max(1, Math.round(
  String(html || "").replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length / 220));

/* Cloudinary serve la stessa immagine a qualunque misura: basta
   cambiare il w_ dentro la trasformazione. Senza srcset un
   telefono da 390 punti scarica comunque il file da 1200, cioè
   circa nove volte i pixel che gli servono — su rete mobile è la
   differenza fra una pagina che appare e una che si fa aspettare.

   Se l'indirizzo non ha la forma attesa non si inventa niente e
   si torna stringa vuota: meglio nessun srcset che un srcset che
   punta a indirizzi che non esistono. */
const MAG_LARGHEZZE = [320, 480, 768, 1120, 1600];

const magSrcset = url => {
  const u = String(url || "");
  if (!/\/upload\/[^/]*w_\d+/.test(u)) return "";
  return MAG_LARGHEZZE
    .map(w => u.replace(/(\/upload\/[^/]*?)w_\d+/, "$1w_" + w) + " " + w + "w")
    .join(", ");
};

/* Quanto spazio occuperà davvero l'immagine, per ogni larghezza di
   finestra. Senza questa riga il browser assume 100vw e scarica il
   file più grande anche per una scheda da 210 punti: è la
   differenza fra una copertina nitida e mezzo megabyte sprecato.
   I valori seguono i punti di rottura della griglia nel CSS: se si
   cambiano là, vanno cambiati qui. */
const MAG_SIZES_SCHEDA =
  "(min-width: 1180px) 210px, (min-width: 992px) 22vw, (min-width: 768px) 30vw, (min-width: 520px) 45vw, 90vw";
const MAG_SIZES_APERTURA = "(min-width: 1180px) 1120px, 92vw";

const magCoverHtml = (a, classe, sizes, priorita) =>
  a.cover_url
    ? `<img class="${classe}" src="${esc(a.cover_url)}" alt="${esc(a.cover_alt || "")}"
            srcset="${esc(magSrcset(a.cover_url))}" sizes="${esc(sizes)}"
            width="1200" height="675" decoding="async"
            ${priorita ? 'fetchpriority="high"' : 'loading="lazy"'}>`
    : `<span class="${classe} mag-card-vuota" aria-hidden="true"></span>`;

const magTempo = a => a.pubblicato_il
  ? `<time datetime="${esc(String(a.pubblicato_il).slice(0, 10))}">${esc(magData(a.pubblicato_il))}</time>`
  : "";

/* L'apertura di un articolo può essere lunga: nella scheda si
   taglia a una lunghezza che non manda a capo la griglia. Il
   taglio è sull'ultima parola intera, non a metà sillaba. */
const magStringa = (s, max) => {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, t.lastIndexOf(" ", max) > 0 ? t.lastIndexOf(" ", max) : max).trim() + "…";
};

/* La scheda non è più un <a> che avvolge tutto: dentro doveva
   starci il bottone «Leggi tutto l'articolo», e un link dentro un
   link non è HTML valido — il browser lo sfascia e la tastiera ci
   si perde.

   Quindi il link è uno solo, sul titolo, e si allarga su tutta la
   scheda con un ::after. Chi naviga a tastiera o con uno screen
   reader sente un collegamento per scheda, e il suo nome è il
   titolo dell'articolo: cinque link chiamati tutti «Leggi tutto
   l'articolo» sarebbero cinque voci identiche in un elenco di
   collegamenti. Per questo il bottone è decorativo. */
function magSchedaHtml(a, livello) {
  const cat = magCategoria(a);
  const h = livello === 2 ? "h2" : "h3";
  return `
  <article class="mag-card ${a.tipo === "pillar" ? "mag-card-pillar" : ""}">
    ${magCoverHtml(a, "mag-card-cover", MAG_SIZES_SCHEDA, false)}
    <div class="mag-card-corpo">
      <div class="mag-card-meta">
        ${a.tipo === "pillar" ? `<span class="mag-pillar-tag">Guida completa</span>` : ""}
        ${cat ? `<span class="mag-card-cat">${esc(cat)}</span>` : ""}
      </div>
      <${h} class="mag-card-titolo">
        <a class="mag-card-link" href="#/magazine/${esc(a.slug)}">${esc(a.titolo)}</a>
      </${h}>
      ${a.apertura ? `<p class="mag-card-apertura">${esc(magStringa(a.apertura, 120))}</p>` : ""}
      <div class="mag-card-piede">
        ${magTempo(a)}
        <span class="mag-card-cta" aria-hidden="true">Leggi tutto l'articolo</span>
      </div>
    </div>
  </article>`;
}

/* L'articolo più recente in apertura. È la prima cosa che si vede
   e l'unica immagine sopra la piega, quindi la sua copertina si
   carica con priorità invece che pigramente: è quella che decide
   quanto la pagina *sembra* veloce. */
function magAperturaHtml(a) {
  const cat = magCategoria(a);
  return `
  <article class="mag-apertura">
    ${magCoverHtml(a, "mag-apertura-cover", MAG_SIZES_APERTURA, true)}
    <div class="mag-apertura-testo">
      <div class="mag-card-meta">
        <span class="mag-apertura-tag">Ultimo pubblicato</span>
        ${a.tipo === "pillar" ? `<span class="mag-pillar-tag">Guida completa</span>` : ""}
        ${cat ? `<span class="mag-card-cat">${esc(cat)}</span>` : ""}
      </div>
      <h2 class="mag-apertura-titolo">${esc(a.titolo)}</h2>
      ${a.apertura ? `<p class="mag-apertura-occhiello">${esc(magStringa(a.apertura, 260))}</p>` : ""}
      <div class="mag-apertura-piede">
        <span class="mag-apertura-firma">${esc(a.firma || "Redazione QuotaFacile")} · ${magTempo(a)}</span>
        <a class="btn btn-primary" href="#/magazine/${esc(a.slug)}">Leggi tutto l'articolo</a>
      </div>
    </div>
  </article>`;
}

/* Le categorie selezionate. Vive fuori dalla vista perché render()
   ricostruisce l'HTML da capo a ogni giro: una variabile dentro la
   funzione si azzererebbe al primo clic. Vuoto = tutte, che è
   anche lo stato che il pre-render salva nell'HTML pubblicato. */
let magFiltro = [];

views.magazine = () => {
  const m = MAG();
  const arts = m ? m.stato.articoli : [];

  /* Il grafo dell'elenco dichiara che questa è una raccolta di
     articoli e quali sono: senza, per un motore è una pagina
     qualsiasi con dei link dentro. */
  if (arts.length) {
    setJsonLd({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Blog",
          "@id": SITO() + "magazine/#blog",
          "name": "Magazine QuotaFacile",
          "description": "Guide e approfondimenti sulle assicurazioni, scritti dalla redazione con riferimenti normativi verificabili.",
          "inLanguage": "it-IT",
          "publisher": { "@id": SITO() + "#org" },
          "isPartOf": { "@id": SITO() + "#website" }
        },
        {
          "@type": "ItemList",
          "itemListOrder": "https://schema.org/ItemListOrderDescending",
          "numberOfItems": arts.length,
          /* Ogni voce porta con sé copertina e descrizione, non
             solo titolo e indirizzo: è quello che un motore
             generativo legge per decidere se citare l'articolo
             senza doverlo aprire. La descrizione è quella vera
             dell'articolo, mai inventata qui. */
          "itemListElement": arts.slice(0, 30).map((a, i) => ({
            "@type": "ListItem", "position": i + 1,
            "url": urlArticolo(a),
            "item": {
              "@type": "BlogPosting",
              "@id": urlArticolo(a) + "#articolo",
              "headline": a.titolo,
              "url": urlArticolo(a),
              ...(a.meta_description || a.apertura
                ? { "description": a.meta_description || a.apertura } : {}),
              ...(a.cover_url ? { "image": a.cover_url } : {}),
              ...(a.pubblicato_il ? { "datePublished": a.pubblicato_il } : {}),
              ...(magCategoria(a) ? { "articleSection": magCategoria(a) } : {}),
              "isPartOf": { "@id": SITO() + "magazine/#blog" }
            }
          }))
        },
        breadcrumbJsonLd([
          { nome: "Home", rotta: "home" },
          { nome: "Magazine", rotta: "magazine" }
        ])
      ]
    });
  } else {
    setJsonLd(null);
  }

  /* Si filtra solo su categorie che esistono davvero: se una
     categoria viene rinominata o tolta mentre qualcuno ha la
     pagina aperta, il filtro si svuota da solo invece di mostrare
     un elenco vuoto senza spiegazione. */
  const cats = (m ? m.stato.categorie : [])
    .filter(c => arts.some(a => a.categoria_id === c.id));
  const attivi = magFiltro.filter(id => cats.some(c => c.id === id));
  const scelti = attivi.length
    ? arts.filter(a => attivi.includes(a.categoria_id))
    : arts;

  /* L'apertura è l'ultimo pubblicato fra quelli che passano il
     filtro, e non compare due volte: sotto c'è tutto il resto. */
  const apertura = scelti[0] || null;
  const restanti = apertura ? scelti.slice(1) : [];
  const pillar = restanti.filter(a => a.tipo === "pillar");
  const resto = restanti.filter(a => a.tipo !== "pillar");

  const chip = (id, testo, acceso) => `
    <button type="button" class="mag-chip ${acceso ? "acceso" : ""}"
            data-magcat="${esc(id)}" aria-pressed="${acceso ? "true" : "false"}">${esc(testo)}</button>`;

  return `
  <section class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Magazine</span>
        <h1 class="titolo-sezione">Capire le assicurazioni prima di comprarle</h1>
        <p class="muted">Guide lunghe e approfondimenti scritti dalla redazione, con i riferimenti
        normativi in chiaro. Niente promesse di risparmio: quello che serve per leggere una polizza
        e capire cosa stai firmando.</p>
      </div>

      ${!m || !m.stato.caricata ? `
        <div class="card"><p class="muted">${m && m.stato.errore
          ? "Gli articoli non si sono caricati. Ricarica la pagina fra un momento."
          : "Caricamento degli articoli…"}</p></div>`
      : arts.length === 0 ? `
        <div class="card">
          <h2 style="margin-top:0;font-size:1.2rem">Il primo articolo sta arrivando</h2>
          <p class="muted">Nel frattempo, in <a href="#/bacheca">bacheca</a> ci sono nove guide
          già pubblicate e una domanda nuova ogni giorno.</p>
        </div>`
      : `
        ${cats.length > 1 ? `
          <div class="mag-filtri">
            <h2 class="mag-filtri-titolo" id="mag-categorie">Scegli le categorie</h2>
            <div class="mag-chips" role="group" aria-labelledby="mag-categorie">
              ${chip("", "Tutte", attivi.length === 0)}
              ${cats.map(c => chip(c.id, c.nome, attivi.includes(c.id))).join("")}
            </div>
          </div>` : ""}

        ${scelti.length === 0 ? `
          <div class="card"><p class="muted">Nessun articolo in questa categoria.
          <button type="button" class="link-btn" data-magcat="">Mostra tutti</button></p></div>`
        : `
          ${apertura ? magAperturaHtml(apertura) : ""}

          ${pillar.length ? `
            <h2 class="mag-sezione-titolo">Guide complete</h2>
            <div class="mag-griglia">
              ${pillar.map(a => magSchedaHtml(a, 3)).join("")}
            </div>` : ""}
          ${resto.length ? `
            <h2 class="mag-sezione-titolo">Approfondimenti</h2>
            <div class="mag-griglia">
              ${resto.map(a => magSchedaHtml(a, 3)).join("")}
            </div>` : ""}`}`}
    </div>
  </section>`;
};

/* Indice costruito dai titoli del testo. Non è un campo da
   compilare: su un articolo da cinquemila parole nessuno lo
   terrebbe aggiornato, e un indice sbagliato è peggio di nessun
   indice. Gli identificativi nascono qui e sono gli stessi che
   finiscono nell'HTML salvato dal deploy, quindi un link a una
   sezione continua a funzionare. */
function magIndice(html) {
  const voci = [];
  const visti = new Set();
  String(html || "").replace(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi, (tutto, liv, dentro) => {
    const testo = dentro.replace(/<[^>]+>/g, "").trim();
    if (!testo) return tutto;
    let id = testo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "sezione";
    let unico = id, n = 1;
    while (visti.has(unico)) unico = id + "-" + (++n);
    visti.add(unico);
    voci.push({ id: unico, testo, livello: +liv });
    return tutto;
  });
  return voci;
}

function magConAncore(html, voci) {
  let i = 0;
  return String(html || "").replace(/<h([23])([^>]*)>/gi, (tutto, liv, attr) => {
    const v = voci[i++];
    return v ? `<h${liv} id="${v.id}"${attr}>` : tutto;
  });
}

/* Le domande frequenti in fondo a un articolo sono già, nella
   forma, quello che schema.org chiama FAQPage: una domanda e la
   sua risposta. Dichiararlo cambia come i motori — di ricerca e
   generativi — possono usarle: diventano citabili una per una.

   Si leggono dal testo invece di essere un campo a parte per la
   stessa ragione dell'indice: un campo che duplica il testo, dopo
   la prima correzione, racconta una cosa diversa dal testo. */
function magFaq(html) {
  const testo = String(html || "");
  const inizio = testo.search(/<h2[^>]*>\s*(domande frequenti|faq)\b/i);
  if (inizio === -1) return [];
  const coda = testo.slice(inizio);
  const voci = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(coda))) {
    const d = m[1].replace(/<[^>]+>/g, "").trim();
    const r = m[2].replace(/<[^>]+>/g, "").trim();
    if (d && r) voci.push({ domanda: d, risposta: r });
  }
  return voci;
}

views.magazineArticolo = (slug) => {
  const m = MAG();
  const a = m ? m.articolo(slug) : undefined;

  /* undefined = sta arrivando; null = chiesto, non esiste. */
  if (a === undefined) {
    /* Se questa pagina è il file che il deploy ha scritto per
       questo articolo, il testo è già sotto gli occhi di chi
       legge: si lascia stare finché i dati non arrivano, invece
       di cancellarlo per riscriverlo identico. */
    if (PERCORSO_PAGINA && ROTTA_PAGINA === "magazine/" + slug) return null;
    return `<section class="section"><div class="container">
      <p class="muted">Caricamento dell'articolo…</p></div></section>`;
  }
  if (!a) {
    setJsonLd(null);
    return `<section class="section"><div class="container" style="max-width:640px">
      <h1 class="titolo-sezione">Questo articolo non c'è</h1>
      <p class="lead">Può essere stato ritirato, o l'indirizzo può essere sbagliato.</p>
      <p><a class="btn btn-primary" href="#/magazine">Vai al Magazine</a></p>
    </div></section>`;
  }

  const voci = magIndice(a.corpo);
  const corpo = magConAncore(a.corpo, voci);
  const faq = magFaq(a.corpo);
  const cat = magCategoria(a);
  const url = urlArticolo(a);
  const data = a.pubblicato_il || a.creato_il;
  const aggiornato = a.aggiornato_il || data;

  /* Un articolo dichiarato per quello che è. I campi sono tutti
     veri: la data è quella della pubblicazione, l'editore è
     quello delle note legali, il testo è quello visibile in
     pagina. Dove un dato non c'è, il campo non compare. */
  setJsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": url + "#articolo",
        "headline": String(a.titolo).slice(0, 110),
        "description": a.meta_description || String(a.apertura || "").slice(0, 200),
        "inLanguage": "it-IT",
        "datePublished": data,
        "dateModified": aggiornato,
        "author": { "@id": SITO() + "#org" },
        "publisher": { "@id": SITO() + "#org" },
        "isPartOf": { "@id": SITO() + "magazine/#blog" },
        "mainEntityOfPage": { "@type": "WebPage", "@id": url },
        "articleSection": cat || undefined,
        "image": a.cover_url || (SITO() + "assets/img/og-quotafacile.png"),
        "wordCount": String(a.corpo || "").replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length,
        "about": a.keyword ? { "@type": "Thing", "name": a.keyword } : undefined
      },
      breadcrumbJsonLd([
        { nome: "Home", rotta: "home" },
        { nome: "Magazine", rotta: "magazine" },
        { nome: a.titolo, percorso: "magazine/" + a.slug + "/" }
      ]),
      ...(faq.length ? [{
        "@type": "FAQPage",
        "@id": url + "#faq",
        "mainEntity": faq.map(v => ({
          "@type": "Question",
          "name": v.domanda,
          "acceptedAnswer": { "@type": "Answer", "text": v.risposta }
        }))
      }] : [])
    ]
  });

  const correlati = a.correlati || [];
  const padre = correlati.find(x => x.tipo === "pillar" && x.id === a.pillar_id);
  const fratelli = correlati.filter(x => x !== padre);

  return `
  <article class="section mag-articolo">
    <div class="container" style="max-width:760px">
      <nav class="mag-briciole" aria-label="Percorso">
        <a href="#/">Home</a> <span aria-hidden="true">/</span>
        <a href="#/magazine">Magazine</a>
      </nav>

      <div class="mag-testa-meta">
        ${a.tipo === "pillar" ? `<span class="mag-pillar-tag">Guida completa</span>` : ""}
        ${cat ? `<span class="mag-card-cat">${esc(cat)}</span>` : ""}
        <span>${esc(magData(data))}</span>
        <span>· ${magMinuti(a.corpo)} min di lettura</span>
      </div>

      <h1 class="mag-titolo-articolo">${esc(a.titolo)}</h1>
      ${a.apertura ? `<p class="lead mag-apertura">${esc(a.apertura)}</p>` : ""}

      ${a.cover_url ? `
        <img class="mag-cover" src="${esc(a.cover_url)}" alt="${esc(a.cover_alt || "")}"
             srcset="${esc(magSrcset(a.cover_url))}"
             sizes="(max-width: 860px) 100vw, 800px"
             width="1200" height="675"
             fetchpriority="high" decoding="async">` : ""}

      ${padre ? `
        <p class="mag-risale">Questo approfondimento fa parte della guida
        <a href="#/magazine/${esc(padre.slug)}">${esc(padre.titolo)}</a>.</p>` : ""}

      ${voci.length >= 3 ? `
        <nav class="mag-indice" aria-label="Indice dell'articolo">
          <h2 class="mag-indice-titolo">In questo articolo</h2>
          <ol>
            ${voci.map(v => `<li class="${v.livello === 3 ? "mag-indice-sotto" : ""}">
              <a href="#${v.id}">${esc(v.testo)}</a></li>`).join("")}
          </ol>
        </nav>` : ""}

      <div class="prosa mag-prosa">${corpo}</div>

      <p class="mag-firma">— ${esc(a.firma || "Redazione QuotaFacile")}</p>

      <p class="privacy-hint mag-avvertenza">
        Contenuto informativo di carattere generale: non è consulenza personalizzata e non sostituisce
        il set informativo del prodotto. Verifica sempre condizioni, esclusioni e massimali sul
        contratto. QuotaFacile non distribuisce polizze — <a href="#/note-legali">note legali</a>.
      </p>

      <div class="mag-cta">
        <h2 style="margin:0 0 .4rem;font-size:1.2rem">Ti serve un preventivo su questo?</h2>
        <p class="muted" style="margin:0 0 .9rem">Ti mettiamo in contatto con intermediari iscritti
        al RUI specializzati nel ramo. Gratuito, senza registrazione.</p>
        <a class="btn btn-primary" href="#/preventivo">Richiedi un preventivo</a>
      </div>

      ${fratelli.length ? `
        <nav class="mag-correlati" aria-label="Articoli collegati">
          <h2 class="mag-sezione-titolo">${padre ? "Altri approfondimenti della stessa guida" : "Approfondimenti collegati"}</h2>
          <div class="mag-griglia">${fratelli.map(x => magSchedaHtml(x, 3)).join("")}</div>
        </nav>` : ""}
    </div>
  </article>`;
};

/* ----- DETTAGLIO FAQ ----- */
views.faqDetail = (id) => {
  const f = getFaqById(id);
  if (!f) {
    /* Le guide dell'area Admin arrivano dal database, e per
       qualche istante dopo il caricamento non sono ancora qui.
       Se però questa pagina è proprio il file che il deploy ha
       scritto per questa guida, il testo è già sotto gli occhi
       di chi legge: sostituirlo con "non trovata" vorrebbe dire
       cancellare un contenuto giusto per riscriverlo identico
       mezzo secondo dopo — e, se la bacheca non risponde,
       cancellarlo e basta. Si restituisce null e render() lascia
       la pagina com'è finché i dati non arrivano. */
    if (PERCORSO_PAGINA && ROTTA_PAGINA === "faq/" + id &&
        !window.QFBacheca?.stato.caricata) return null;
    return `<section class="section"><div class="container"><h2>Domanda non trovata</h2><a href="#/bacheca" class="btn btn-outline">← Torna alla bacheca</a></div></section>`;
  }
  /* Una guida è scritta da noi, domanda compresa: FAQPage, più
     l'Article che dice chi l'ha scritta e quando. Una domanda
     della bacheca è di chi l'ha posta: QAPage. */
  const ld = f.staff ? faqJsonLd([f]) : qaPageJsonLd(f);
  /* Niente gradino per la categoria: non esiste una pagina di
     categoria, e metterla porterebbe allo stesso indirizzo del
     gradino precedente. Un percorso con due tappe identiche
     descrive una struttura che il sito non ha. La categoria
     resta dichiarata, al posto giusto, in articleSection. */
  ld["@graph"].push(breadcrumbJsonLd([
    { nome: "Home", rotta: "home" },
    { nome: "Bacheca Q&A", rotta: "bacheca" },
    { nome: f.titolo || f.domanda, percorso: percorsoDomanda(f) }
  ]));
  /* Una guida e' un articolo, e dichiararlo cambia cosa i motori
     — di ricerca e generativi — sanno farci: chi l'ha scritta,
     quando, di cosa parla, quanto e' lunga. FAQPage da solo dice
     che ci sono domande e risposte, non che c'e' un testo
     redazionale con una data e una firma. */
  if (f.staff) ld["@graph"].push(articoloJsonLd(f));
  setJsonLd(ld);
  const pro = DB.proProfile;
  return `
  <section class="section">
    <div class="container" style="max-width:820px">
      <a href="#/bacheca" class="muted" style="font-size:.85rem">← Bacheca Q&amp;A</a>
      <div class="qa-meta" style="margin-top:1rem">
        ${f.daily ? `<span class="badge-cat badge-daily">☀️ Domanda del giorno #${f.num}</span>` : ""}
        ${f.staff ? `<span class="badge-cat badge-staff">📌 Guida QuotaFacile</span>` : ""}
        <span class="badge-cat">${esc(f.cat)}</span><span>${esc(f.data)}</span>
      </div>
      <h1 style="font-size:clamp(1.5rem,4vw,2.2rem)">${esc(f.domanda)}</h1>

      <p class="privacy-hint" style="margin-bottom:1rem">
        Le risposte pubblicate hanno valore informativo generale e non costituiscono consulenza
        personalizzata: verifica sempre le condizioni di polizza e il set informativo del prodotto.
        <a href="#/note-legali">Note legali</a>.
      </p>

      ${f.risposte.length ? f.risposte.map((r, i) => {
        const a = autoreDi(r) || { nome: "Intermediario", punti: 0 };
        const voted = DB.votati.includes(f.id + ":" + i);
        return `
        <div class="answer ${r.auto ? "answer-auto" : ""}">
          <div class="answer-head">
            <span class="qa-author">
              ${r.auto
                ? `<span class="mini-avatar mini-qf">QF</span>${esc(a.nome)} <span class="level-badge badge-auto">${r.staff ? "guida redazionale" : "risposta automatica"}</span>`
                : `<span class="mini-avatar">${esc(initials(a.nome))}</span>${esc(a.nome)} ${etichettaAutore(a)}`}
              ${r.accettata && !r.auto ? `<span class="badge-cat" style="background:var(--gold-100);color:#9A6B14">★ Migliore risposta</span>` : ""}
            </span>
            <button class="vote-btn" data-vote="${f.id}:${i}" ${voted ? "disabled" : ""}>▲ Utile (${r.voti})</button>
          </div>
          ${r.rich
            ? `<div class="answer-rich">${r.rich}</div>`
            : `<p style="margin:.2rem 0">${esc(r.testo)}</p>`}
          ${r.auto ? `<p class="muted" style="font-size:.72rem;margin:.5rem 0 0">Contenuto redazionale a carattere divulgativo: non è consulenza personalizzata. Gli intermediari iscritti al RUI possono integrarlo qui sotto con la propria esperienza.</p>` : ""}
          ${!r.auto && a.id ? `<div class="pass-actions" style="margin-top:.7rem;max-width:340px">
            ${ctaChiama(a)}
            <a class="btn btn-outline btn-sm" href="#/preventivo?to=${a.id}">Chiedi consulenza</a>
          </div>` : ""}
          <div class="answer-foot">
            <!-- Il bersaglio della segnalazione è l'identificativo della
                 risposta quando esiste: la posizione nell'elenco cambia
                 appena arriva una risposta nuova, e chi modera si
                 troverebbe davanti un contenuto diverso da quello segnalato. -->
            <button class="report-btn" data-report="${r.remota && r.id ? "risposta:" + r.id : f.id + ":" + i}" title="Segnala questo contenuto">🚩 Segnala</button>
          </div>
        </div>`;
      }).join("") : `<p class="muted" style="font-style:italic">Ancora nessuna risposta.</p>`}

      ${guideCorrelate(f)}

      <div class="card" style="margin-top:1.8rem">
        <h3>Sei un intermediario? ${f.daily ? "Integra la risposta automatica" : "Rispondi"}</h3>
        ${pro ? `
        <form id="answer-form">
          <div class="field full"><label for="ans-t">La tua risposta pubblica, firmata ${esc(pro.nome)}</label><textarea id="ans-t" required placeholder="${f.daily ? "Aggiungi esperienza pratica, casi concreti, cosa verificare in polizza..." : "Scrivi una risposta chiara e completa..."}"></textarea></div>
          <button class="btn btn-primary" style="margin-top:.8rem" type="submit">Pubblica risposta</button>
        </form>` : `
        <p class="muted" style="font-size:.9rem">Crea prima il tuo profilo nell'Area Pro: le risposte sono firmate con la tua QuotaPass.</p>
        <a href="#/area-pro" class="btn btn-outline">Vai all'Area Pro →</a>`}
      </div>
    </div>
  </section>`;
};

/* ----- PREVENTIVO (cliente, multi-step) ----- */
const quoteState = { step: 1, tipo: null, ramo: null, to: null, esito: null };
function resetQuote() {
  Object.assign(quoteState, { step: 1, tipo: null, ramo: null, to: null, esito: null });
}
views.preventivo = (query) => {
  setJsonLd(null);
  if (query?.to) quoteState.to = query.to;
  const dest = quoteState.to ? broker(quoteState.to) : null;
  const s = quoteState.step;
  return `
  <section class="section">
    <div class="container" style="max-width:680px">
      <div class="section-head">
        <span class="eyebrow">Gratis e senza impegno</span>
        <h1 class="titolo-sezione">${dest ? `Richiesta a ${esc(dest.nome)}` : "Richiedi un preventivo assicurativo o una consulenza"}</h1>
        ${dest ? `<p class="muted">Stai contattando direttamente ${esc(dest.ruolo).toLowerCase()} ${esc(dest.nome)} (${esc(dest.azienda)}).</p>` : `<p class="muted">Compila in 2 minuti: gli intermediari specializzati ti ricontattano direttamente.</p>`}
      </div>
      <div class="card">
        <div class="stepper" aria-hidden="true">
          <span class="${s >= 1 ? "done" : ""}"></span><span class="${s >= 2 ? "done" : ""}"></span><span class="${s >= 3 ? "done" : ""}"></span>
        </div>

        ${s === 1 ? `
        <h3>1 · Di cosa hai bisogno?</h3>
        <div class="choice-grid">
          <button class="choice ${quoteState.tipo === "preventivo" ? "selected" : ""}" data-tipo="preventivo"><span class="icon-dot">📄</span>Preventivo polizza</button>
          <button class="choice ${quoteState.tipo === "consulenza" ? "selected" : ""}" data-tipo="consulenza"><span class="icon-dot">💬</span>Consulenza gratuita</button>
          <button class="choice ${quoteState.tipo === "revisione" ? "selected" : ""}" data-tipo="revisione"><span class="icon-dot">🔍</span>Revisione polizza attuale</button>
        </div>
        <button class="btn btn-primary btn-block" style="margin-top:1.4rem" data-step="2" ${quoteState.tipo ? "" : "disabled"}>Continua</button>` : ""}

        ${s === 2 ? `
        <h3>2 · Per quale ramo?</h3>
        <div class="choice-grid">
          ${["Auto", "Casa", "Vita", "Salute", "Impresa", "Viaggi"].map(r => `
          <button class="choice ${quoteState.ramo === r ? "selected" : ""}" data-ramo="${r}"><span class="icon-dot">${{ Auto: "🚗", Casa: "🏠", Vita: "❤️", Salute: "🩺", Impresa: "🏢", Viaggi: "✈️" }[r]}</span>${r}</button>`).join("")}
        </div>
        <div style="display:flex;gap:.6rem;margin-top:1.4rem">
          <button class="btn btn-ghost" data-step="1">← Indietro</button>
          <button class="btn btn-primary" style="flex:1" data-step="3" ${quoteState.ramo ? "" : "disabled"}>Continua</button>
        </div>` : ""}

        ${s === 3 ? `
        <h3>3 · I tuoi contatti</h3>
        <form id="quote-form" class="form-grid">
          <div class="field"><label for="q-nome">Nome e cognome</label><input id="q-nome" required placeholder="Mario Rossi"></div>
          <div class="field"><label for="q-citta">Città</label><input id="q-citta" required placeholder="Milano"></div>
          <div class="field"><label for="q-email">Email</label><input id="q-email" type="email" required placeholder="mario@email.it"></div>
          <div class="field"><label for="q-tel">Telefono</label><input id="q-tel" type="tel" required placeholder="+39 ..."></div>
          <div class="field full"><label for="q-note">Note (facoltative)</label><textarea id="q-note" placeholder="Es. attualmente pago 620€/anno per la RC auto..."></textarea>
            <p class="privacy-hint">Non inserire dati sanitari o riferimenti a terze persone: per quelli parlane direttamente con l'intermediario.</p>
          </div>
          <div class="field full">
            ${consentBox("q-consenso", `Ho letto l'<a href="#/privacy">informativa privacy</a> e acconsento alla trasmissione dei miei recapiti ${dest ? "a " + esc(dest.nome) : "agli intermediari specializzati nel ramo indicato"}, che li tratterà come autonomo titolare per ricontattarmi.`)}
          </div>
          <div class="field full" style="flex-direction:row;gap:.6rem">
            <button class="btn btn-ghost" type="button" data-step="2">← Indietro</button>
            <button class="btn btn-gold" style="flex:1" type="submit">Invia la richiesta</button>
          </div>
        </form>` : ""}

        ${s === 4 ? (quoteState.esito && !quoteState.esito.salvato ? `
        <div style="text-align:center;padding:1.5rem 0">
          <div class="icon-dot" style="margin:0 auto 1rem;width:64px;height:64px;font-size:2rem">✉️</div>
          <h3>Ultimo passaggio: conferma l'invio</h3>
          <p class="muted">${quoteState.esito.fallback
            ? "Non siamo riusciti a registrare la richiesta: il servizio non risponde. Nessun dato è andato perso, apri l'email già compilata e premi invio."
            : esc(quoteState.esito.errore || "Controlla i dati inseriti e riprova.")}</p>
          <div style="display:flex;gap:.6rem;justify-content:center;margin-top:1rem;flex-wrap:wrap">
            ${quoteState.esito.fallback
              ? `<a href="${quoteState.esito.fallback}" class="btn btn-gold">Apri l'email e invia</a>`
              : `<button class="btn btn-gold" data-step="3">← Correggi e riprova</button>`}
            <a href="#/" class="btn btn-outline">Torna alla home</a>
          </div>
        </div>` : `
        <div style="text-align:center;padding:1.5rem 0">
          <div class="icon-dot" style="margin:0 auto 1rem;width:64px;height:64px;font-size:2rem">✅</div>
          <h3>Richiesta inviata!</h3>
          <p class="muted">${dest ? esc(dest.nome) + " riceverà" : "Gli intermediari specializzati in " + esc(quoteState.ramo || "polizze") + " riceveranno"} la tua richiesta di ${esc(quoteState.tipo || "preventivo")} e ti ricontatteranno a breve ai recapiti che ci hai lasciato.</p>
          <div style="display:flex;gap:.6rem;justify-content:center;margin-top:1rem;flex-wrap:wrap">
            <a href="#/bacheca" class="btn btn-outline">Esplora la bacheca</a>
            <a href="#/" class="btn btn-primary">Torna alla home</a>
          </div>
        </div>`) : ""}
      </div>
      <p class="muted" style="font-size:.75rem;margin-top:.8rem">
        I tuoi dati vengono condivisi solo con gli intermediari pertinenti alla richiesta e conservati
        24 mesi dall'ultimo contatto. Puoi revocare il consenso e chiederne la cancellazione in ogni
        momento scrivendo a <a href="#/privacy">privacy@quotafacile.net</a>.
        Consulta <a href="#/termini">Termini e Condizioni</a>, <a href="#/privacy">Privacy Policy</a> e
        <a href="#/note-legali">Note legali</a>. QuotaFacile non è un intermediario assicurativo e non
        è iscritta al RUI: mette solo in contatto.
      </p>
    </div>
  </section>`;
};

/* ----- AREA PRO ----- */
let proTab = "dashboard";
const LEAD_ICON = { chiamata: "📞", email: "✉️", consulenza: "💬" };
const LEAD_LABEL = { chiamata: "Chiamata ricevuta", email: "Email ricevuta", consulenza: "Richiesta di consulenza" };

function proFormHTML(p) {
  return `
  <div class="card">
    <h3>${p ? "Modifica profilo" : "Il tuo profilo pubblico"}</h3>
    <p class="muted" style="font-size:.85rem">Questi dati compongono la tua QuotaPass, visibile agli utenti. Anteprima live a fianco.</p>
    <form id="pro-form" class="form-grid">
      <div class="field"><label for="p-nome">Nome e cognome *</label><input id="p-nome" required value="${esc(p?.nome || "")}" placeholder="Laura Bianchi"></div>
      <div class="field"><label for="p-ruolo">Ruolo *</label>
        <select id="p-ruolo">${["Agente", "Broker", "Collaboratore", "Subagente", "Intermediario"].map(r => `<option ${p?.ruolo === r ? "selected" : ""}>${r}</option>`).join("")}</select>
      </div>
      <div class="field"><label for="p-azienda">Ragione sociale *</label><input id="p-azienda" required value="${esc(p?.azienda || "")}" placeholder="LB Insurance Srl"></div>
      <div class="field"><label for="p-rui">Numero RUI *</label><input id="p-rui" required value="${esc(p?.rui || "")}" placeholder="B000123456"></div>
      <div class="field"><label for="p-citta">Città *</label><input id="p-citta" required value="${esc(p?.citta || "")}" placeholder="Milano"></div>
      <div class="field"><label for="p-tel">Cellulare * <span class="muted" style="font-weight:400">— qui ti chiamano</span></label><input id="p-tel" type="tel" required value="${esc(p?.tel || "")}" placeholder="+39 ..."></div>
      <div class="field"><label for="p-email">Email * <span class="muted" style="font-weight:400">— qui arrivano le richieste</span></label><input id="p-email" type="email" required value="${esc(p?.email || "")}" placeholder="nome@azienda.it"></div>
      <div class="field"><label for="p-spec">Specializzazioni (max 3, separate da virgola)</label><input id="p-spec" value="${esc((p?.spec || []).join(", "))}" placeholder="Auto, Casa, Impresa"></div>
      <div class="field full"><label for="p-bio">About me (breve)</label><textarea id="p-bio" placeholder="Racconta in due righe come aiuti i tuoi clienti...">${esc(p?.bio || "")}</textarea></div>
      ${p ? "" : `
      <div class="field full">
        ${consentBox("pro-rui", `Dichiaro sotto la mia responsabilità di essere <strong>regolarmente iscritto al RUI</strong> con il numero indicato e in posizione attiva, e mi impegno a comunicare tempestivamente ogni variazione o cancellazione dell'iscrizione.`)}
      </div>
      <div class="field full">
        ${consentBox("pro-terms", `Accetto i <a href="#/termini">Termini e Condizioni</a> e ho letto l'<a href="#/privacy">informativa privacy</a>. Sono consapevole che i dati del profilo (nome, ruolo, azienda, numero RUI, città e recapiti professionali) saranno <strong>pubblici</strong> sul sito e indicizzabili dai motori di ricerca.`)}
      </div>
      <div class="field full">
        ${consentBox("pro-lead", `Acconsento a ricevere all'indirizzo indicato le richieste di preventivo e consulenza degli utenti.`, false)}
      </div>`}
      <div class="field full"><button class="btn btn-primary" type="submit">${p ? "Salva modifiche" : "Crea la QuotaPass"}</button>
        <p class="privacy-hint">Le dichiarazioni sull'iscrizione al RUI sono verificate sul registro pubblico IVASS. I profili non riscontrabili vengono sospesi. Il badge “Verificato RUI” attesta solo l'esito di quel controllo formale.</p>
      </div>
    </form>
  </div>`;
}

function proDashboardHTML(p) {
  const nCall = DB.leads.filter(l => l.tipo === "chiamata").length;
  const nMail = DB.leads.filter(l => l.tipo === "email").length;
  const nCons = DB.leads.filter(l => l.tipo === "consulenza").length;
  const market = DB.richieste.filter(r => !r.to || r.to === "me").slice(-5).reverse();
  const recent = [...DB.leads].sort((a, b) => (b.data > a.data ? 1 : -1));
  return `
  <div class="grid-2" style="align-items:start">
    <div>
      <div class="stats-row stats-row-4">
        <div class="stat"><strong>${nCall}</strong><span>📞 chiamate</span></div>
        <div class="stat"><strong>${nMail}</strong><span>✉️ email</span></div>
        <div class="stat"><strong>${nCons}</strong><span>💬 consulenze</span></div>
        <div class="stat"><strong>${p.viste ?? 0}</strong><span>👁 viste profilo</span></div>
      </div>
      <div class="card recapiti-card" style="margin-top:1rem">
        <h3>📬 Dove ti arrivano i contatti</h3>
        <p class="muted" style="font-size:.85rem">Non c'è nessuna casella interna da controllare: le richieste degli utenti arrivano direttamente qui.</p>
        <div class="recapiti-row"><span>📞 Chiamate al</span><strong>${campo(p.tel)}</strong></div>
        <div class="recapiti-row"><span>✉️ Richieste via email a</span><strong>${campo(p.email)}</strong></div>
        <p class="privacy-hint">Sono gli stessi recapiti pubblicati sulla tua QuotaPass: il pulsante <strong>CHIAMA</strong> compone quel numero, il modulo di consulenza scrive a quell'indirizzo. Per cambiarli vai in <a href="#/area-pro">Profilo &amp; QuotaPass</a>.</p>
      </div>

      <div class="card" style="margin-top:1rem">
        <h3>Ultimi contatti ricevuti</h3>
        ${recent.length ? recent.map(l => `
          <div class="lead-row">
            <span class="lead-icon">${LEAD_ICON[l.tipo] || "•"}</span>
            <span class="leader-info">
              <strong>${esc(l.nome)} · ${esc(LEAD_LABEL[l.tipo] || l.tipo)}</strong>
              <span>${esc(l.ramo || "")}${l.nota ? " — " + esc(l.nota) : ""}</span>
            </span>
            <span class="muted" style="font-size:.72rem;white-space:nowrap">${esc(l.data)}</span>
          </div>`).join("") : `<p class="muted" style="font-size:.9rem">Ancora nessun contatto. Rispondi in bacheca per farti trovare: le tue risposte sono la tua pubblicità.</p>`}
      </div>
    </div>
    <div>
      <div class="card">
        <h3>Richieste dal marketplace</h3>
        <p class="muted" style="font-size:.82rem">Preventivi e consulenze pubblicati dagli utenti, in linea con le tue specializzazioni.</p>
        ${market.length ? market.map(r => `
          <div class="lead-row">
            <span class="lead-icon">📄</span>
            <span class="leader-info">
              <strong>${esc(r.nome || "Utente")} · ${esc(r.tipo || "preventivo")}</strong>
              <span>Ramo ${esc(r.ramo || "-")}</span>
            </span>
            <a class="btn btn-outline btn-sm" href="mailto:?subject=QuotaFacile">Rispondi</a>
          </div>`).join("") : `<p class="muted" style="font-size:.9rem">Nessuna richiesta aperta al momento. Le nuove richieste degli utenti compariranno qui.</p>`}
      </div>
      <div class="card" style="margin-top:1rem">
        <h3>📌 Pubblica una FAQ</h3>
        <p class="muted" style="font-size:.82rem">Domanda frequente + tua risposta: il modo più veloce per farti trovare su Google.</p>
        <form id="pubfaq-form">
          <div class="field"><label for="pf-q">Domanda</label><input id="pf-q" required placeholder="Es. Quanto costa assicurare un monopattino?"></div>
          <div class="field" style="margin-top:.6rem"><label for="pf-cat">Categoria</label>
            <select id="pf-cat">${["Auto","Casa","Vita","Impresa","Salute","Viaggi"].map(c => `<option>${c}</option>`).join("")}</select>
          </div>
          <div class="field" style="margin-top:.6rem"><label for="pf-a">La tua risposta</label><textarea id="pf-a" required placeholder="Rispondi in modo chiaro e completo..."></textarea></div>
          <button class="btn btn-gold btn-block" style="margin-top:.9rem" type="submit">Pubblica FAQ</button>
        </form>
      </div>
    </div>
  </div>`;
}

function proBoardHTML() {
  const daily = publishedDaily().slice(0, 6);
  const staff = staffFaqs();
  const community = domandeCommunity().filter(f => !f.risposte.length);
  const row = f => `
    <div class="lead-row lead-row-link" data-goto="#/faq/${f.id}">
      <span class="lead-icon">${f.staff ? "📌" : f.daily ? "☀️" : "🙋"}</span>
      <span class="leader-info">
        <strong><a href="#/faq/${f.id}">${esc(f.domanda)}</a></strong>
        <span>${f.staff ? "Guida su keyword strategica · massima visibilità organica"
              : f.daily ? `Domanda del giorno #${f.num} · risposta automatica da integrare`
              : (f.risposte.length ? f.risposte.length + " risposte di altri intermediari" : "Ancora senza risposta")} · ${esc(f.cat)}</span>
      </span>
      <span class="pts" style="white-space:nowrap">—</span>
    </div>`;
  return `
  <div class="card" style="margin-bottom:1.2rem">
    <h3>📌 Guide QuotaFacile — le pagine che portano traffico</h3>
    <p class="muted" style="font-size:.82rem">Sono le domande su cui stiamo puntando il posizionamento su Google: chi le integra per primo si mette la firma sotto la pagina più letta del portale.</p>
    ${staff.length ? staff.map(row).join("") : `<p class="muted" style="font-size:.9rem">Hai integrato tutte le guide pubblicate. 🏆</p>`}
  </div>
  <div class="grid-2" style="align-items:start">
    <div class="card">
      <h3>🙋 Domande della community</h3>
      <p class="muted" style="font-size:.82rem">Utenti reali in attesa: chi risponde per primo si prende la visibilità.</p>
      ${community.length ? community.map(row).join("") : `<p class="muted" style="font-size:.9rem">Hai risposto a tutte le domande della community. 👏</p>`}
    </div>
    <div class="card">
      <h3>☀️ Domande del giorno da integrare</h3>
      <p class="muted" style="font-size:.82rem">Escono con una risposta automatica generale: la tua esperienza pratica vale di più. Integra e firma.</p>
      ${daily.length ? daily.map(row).join("") : `<p class="muted" style="font-size:.9rem">Hai integrato tutte le domande pubblicate finora.</p>`}
    </div>
  </div>`;
}

/* Lo stato dell'abbonamento, detto come sta.

   Il dato arriva da pro_abbonamenti, che scrive solo il webhook
   di Stripe: qui non si decide niente, si riporta. Le date sono
   quelle che Stripe considera vere, e "annulla a fine periodo"
   compare perché chi ha disdetto deve vedere fino a quando ha
   ancora quello che ha pagato — non una schermata che finge che
   sia già finito. */
const ABBONAMENTO_STATI = {
  trialing: ["Prova gratuita", "green"],
  active: ["Attivo", "green"],
  past_due: ["Pagamento non riuscito", "rosso"],
  unpaid: ["Non pagato", "rosso"],
  paused: ["In pausa", "grigio"],
  canceled: ["Disdetto", "grigio"],
  incomplete: ["Da completare", "grigio"],
  incomplete_expired: ["Scaduto senza completarsi", "grigio"]
};

function abbonamentoHTML(p) {
  const a = p.abbonamento;
  const data = s => s ? new Date(s).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "—";

  if (!a) {
    return `
    <div class="card abbo-card">
      <div class="abbo-testa">
        <strong>Nessun abbonamento attivo</strong>
        <span class="pill">QuotaPass gratuita</span>
      </div>
      <p class="muted" style="font-size:.88rem;margin:.4rem 0 0">Il profilo, le risposte in bacheca e la
      presenza nella lista intermediari restano gratuiti e lo resteranno. I piani a pagamento sono
      sulla <a href="#/professionisti#piani">pagina per i professionisti</a>.</p>
    </div>`;
  }

  const [etichetta, colore] = ABBONAMENTO_STATI[a.stato] || [a.stato, "grigio"];
  const scade = a.periodo_fine;
  return `
  <div class="card abbo-card abbo-${colore}">
    <div class="abbo-testa">
      <strong>Abbonamento: ${esc(etichetta)}</strong>
      ${a.annulla_a_fine_periodo ? `<span class="pill">si chiude il ${esc(data(scade))}</span>` : ""}
    </div>
    <p class="muted" style="font-size:.88rem;margin:.4rem 0 .8rem">
      ${a.stato === "trialing"
        ? `Prova gratuita fino al <strong>${esc(data(scade))}</strong>. Da quel giorno parte l'addebito, salvo disdetta.`
        : a.stato === "active" && !a.annulla_a_fine_periodo
          ? `Rinnovo il <strong>${esc(data(scade))}</strong>.`
          : a.stato === "past_due" || a.stato === "unpaid"
            ? `L'ultimo addebito non è andato a buon fine: aggiorna la carta per non perdere l'abbonamento.`
            : `Periodo coperto fino al <strong>${esc(data(scade))}</strong>.`}
    </p>
    <button class="btn btn-outline btn-sm" id="pro-portale">Gestisci abbonamento, carta e disdetta</button>
  </div>`;
}

/* La porta dell'Area Pro.

   Prima non c'era: chi apriva questa pagina compilava un modulo e
   il profilo nasceva nel localStorage del suo browser. Da un altro
   dispositivo non esisteva, svuotando la cache spariva, e lo stato
   "abbonato" sarebbe stato una riga che chiunque si riscriveva
   dalla console. Ora l'identità è un'utenza vera. */
let proModo = "entra";   // entra | registrati

function proPortaHTML() {
  const reg = proModo === "registrati";
  const RUOLI = ["Agente", "Broker", "Collaboratore", "Subagente", "Intermediario"];
  return `
  <section class="section">
    <div class="container" style="max-width:${reg ? "720px" : "460px"}">
      <div class="section-head">
        <span class="eyebrow">Area professionisti</span>
        <h1 class="titolo-sezione">${reg ? "Crea la tua QuotaPass" : "Entra nella tua area"}</h1>
        <p class="muted">${reg
          ? "Gratis. Il profilo compare in vetrina solo quando lo chiedi tu e solo dopo il riscontro del numero RUI sul registro pubblico IVASS."
          : "Con l'email e la password che hai scelto alla registrazione."}</p>
      </div>
      <div class="card">
        ${reg ? `
        <form id="pro-reg-form" class="form-grid">
          <div class="field"><label for="r-nome">Nome e cognome *</label><input id="r-nome" required placeholder="Laura Bianchi"></div>
          <div class="field"><label for="r-ruolo">Ruolo *</label>
            <select id="r-ruolo">${RUOLI.map(r => `<option>${r}</option>`).join("")}</select></div>
          <div class="field"><label for="r-email">Email *</label><input id="r-email" type="email" required autocomplete="email" placeholder="nome@studio.it"></div>
          <div class="field"><label for="r-pass">Password *</label><input id="r-pass" type="password" required minlength="10" autocomplete="new-password" placeholder="almeno 10 caratteri"></div>
          <div class="field"><label for="r-rui">Numero RUI</label><input id="r-rui" placeholder="E000123456"></div>
          <div class="field"><label for="r-rui-sez">Sezione RUI</label>
            <select id="r-rui-sez"><option value="">—</option>${["A","B","C","D","E","F"].map(s => `<option>${s}</option>`).join("")}</select></div>
          <div class="field"><label for="r-azienda">Azienda o studio</label><input id="r-azienda" placeholder="Bianchi Assicurazioni srl"></div>
          <div class="field"><label for="r-citta">Città</label><input id="r-citta" placeholder="Milano"></div>
          <div class="field full">
            ${consentBox("r-rui-ok", `Dichiaro di essere iscritto al <strong>RUI</strong> (registro IVASS) e che i dati inseriti sono veri. So che il badge «Verificato» viene concesso solo dopo il riscontro sul registro pubblico.`)}
          </div>
          <div class="field full">
            ${consentBox("r-terms", `Ho letto e accetto i <a href="#/termini">Termini</a> e l'<a href="#/privacy">informativa privacy</a>.`)}
          </div>
          <div class="field full"><button class="btn btn-primary btn-block" type="submit">Crea l'account</button></div>
        </form>
        <button class="footer-linkbtn" style="color:var(--ink-soft);margin-top:1rem;text-align:center;width:100%" data-promodo="entra">
          Ho già un account, entro
        </button>`
        : `
        <form id="pro-entra-form">
          <div class="field"><label for="e-email">Email</label><input id="e-email" type="email" required autocomplete="email"></div>
          <div class="field" style="margin-top:.6rem"><label for="e-pass">Password</label><input id="e-pass" type="password" required autocomplete="current-password"></div>
          <button class="btn btn-primary btn-block" style="margin-top:1rem" type="submit">Entra</button>
        </form>
        <button class="footer-linkbtn" style="color:var(--ink-soft);margin-top:1rem;text-align:center;width:100%" data-promodo="registrati">
          Non ho ancora un account: registrami
        </button>`}
        <p class="privacy-hint" style="margin-top:1rem">
          La password viene verificata dal server, non da questa pagina. L'accesso resta valido su
          questo dispositivo finché non esci: è il tuo, non quello di un ufficio.
        </p>
      </div>
    </div>
  </section>`;
}

views.areaPro = () => {
  setJsonLd(null);

  if (!window.QF_PRO?.autenticato()) return proPortaHTML();

  const s = window.QF_PRO.stato;
  if (!s.caricato) {
    return `<section class="section"><div class="container"><div class="card"><p class="muted">Carico la tua area…</p></div></div></section>`;
  }
  if (!s.profilo) {
    return `
    <section class="section"><div class="container" style="max-width:520px">
      <div class="legal-warning" role="alert">
        <strong>Area non disponibile.</strong> ${esc(s.errore || "")}
        <br><button class="btn btn-outline btn-sm" style="margin-top:.6rem" id="pro-esci">Esci</button>
      </div>
    </div></section>`;
  }

  const p = s.profilo;
  const punti = p.punti ?? 0;
  return `
  <section class="section">
    <div class="container">
      <div class="admin-top" style="margin-bottom:1.4rem">
        <div>
          <span class="eyebrow">Area professionisti</span>
          <h1 class="titolo-sezione" style="margin:0">Ciao ${esc(p.nome.split(" ")[0])}, ecco la tua vetrina</h1>
        </div>
        <button class="btn btn-ghost btn-sm" id="pro-esci">Esci</button>
      </div>

      <!-- I punti sono fermi, e qui c'è scritto. La versione
           precedente diceva "ti mancano N punti al livello
           Consulente, rispondi in bacheca per salire": una barra
           che avanza verso un livello che non dà niente, perché
           niente di ciò che i livelli promettevano è costruito.
           Meglio dire che il conteggio è sospeso che far salire
           un numero verso una porta che non si apre. -->
      <div class="gami-banner">
        <span class="icon">🏅</span>
        <div style="flex:1">
          <strong>${punti} punti</strong>
          <div class="muted" style="font-size:.8rem">Il conteggio è sospeso: i punti non salgono finché non c'è qualcosa di concreto che vanno a sbloccare. Le risposte che pubblichi restano firmate e pubbliche come prima.</div>
        </div>
        <a href="#/bacheca" class="btn btn-gold btn-sm">Rispondi ora</a>
      </div>

      ${abbonamentoHTML(p)}

      <div class="filterbar" role="tablist" aria-label="Sezioni area pro">
        <button class="chip ${proTab === "dashboard" ? "active" : ""}" data-protab="dashboard" role="tab">📊 Dashboard</button>
        <button class="chip ${proTab === "bacheca" ? "active" : ""}" data-protab="bacheca" role="tab">💬 Bacheca da rispondere</button>
        <button class="chip ${proTab === "profilo" ? "active" : ""}" data-protab="profilo" role="tab">🪪 Profilo &amp; QuotaPass</button>
      </div>

      ${proTab === "dashboard" ? proDashboardHTML(p) : ""}
      ${proTab === "bacheca" ? proBoardHTML() : ""}
      ${proTab === "profilo" ? `
      <div class="pro-layout">
        ${proFormHTML(p)}
        <div class="pro-preview">
          <div id="pass-preview" style="width:100%;display:flex;justify-content:center">${qpass(p, true)}</div>
          <div class="stats-row">
            <div class="stat"><strong>${p.viste ?? 0}</strong><span>viste profilo</span></div>
            <div class="stat"><strong>${DB.leads.length}</strong><span>contatti ricevuti</span></div>
            <div class="stat"><strong>${p.risposte ?? 0}</strong><span>risposte in bacheca</span></div>
          </div>
        </div>
      </div>` : ""}
    </div>
  </section>`;
};

/* ---------------- ROUTER ---------------- */
/* Pagine legali servite da assets/js/legal.js */
const LEGAL_ROUTES = {
  "privacy": () => window.QF_LEGAL.views.privacy(),
  /* L'informativa per le aziende che ricevono le nostre email. Ha
     una rotta sua perché è il link che portano in fondo: chi ci
     arriva deve trovare la risposta, non un documento in cui
     cercarla. */
  "privacy-imprese": () => window.QF_LEGAL.views.privacyImprese(),
  "cookie-policy": () => window.QF_LEGAL.views.cookie(),
  "termini": () => window.QF_LEGAL.views.termini(),
  "note-legali": () => window.QF_LEGAL.views.noteLegali(),
  "contatti": () => window.QF_LEGAL.views.contatti(),
  "chi-siamo": () => window.QF_LEGAL.views.contatti()
};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "") || "";
  /* Senza frammento comanda la pagina: i file pre-renderizzati
     stanno a un indirizzo vero e dichiarano quale rotta sono.
     Chi arriva da Google su /guide/polizza-vita-pignorabile/
     deve vedere quella guida, non la homepage — e deve vederla
     senza un salto di redirect, che il motore leggerebbe come
     "questa pagina non è quella giusta". */
  if (!raw && ROTTA_PAGINA) {
    return { path: ROTTA_PAGINA.split("/").filter(Boolean), query: {} };
  }
  const [pathPart, queryPart] = raw.split("?");
  const query = {};
  if (queryPart) queryPart.split("&").forEach(kv => { const [k, v] = kv.split("="); query[k] = decodeURIComponent(v || ""); });
  return { path: pathPart.split("/").filter(Boolean), query };
}

const SEO_PAGINE = {
  "intermediari": ["Trova un intermediario assicurativo verificato RUI | QuotaFacile", "Agenti, broker e collaboratori iscritti al RUI in vetrina: ruolo, città, specializzazioni e numero di iscrizione. Contatta direttamente chi preferisci, gratis."],
  "bacheca": ["Bacheca Q&A: domande e risposte sulle assicurazioni | QuotaFacile", "Dubbi assicurativi reali con risposte firmate da intermediari iscritti al RUI. Una nuova domanda ogni giorno, tutte le risposte pubbliche e verificabili."],
  "professionisti": ["La prima piattaforma per intermediari assicurativi | QuotaFacile", "Profilo gratuito con numero RUI verificabile, piani da 8,99 € al mese e nessuna commissione sui contratti. Con il calcolo in chiaro di quanti contatti vale una posizione."],
  "preventivo": ["Richiedi un preventivo assicurativo gratuito | QuotaFacile", "Compila in due minuti e ricevi il contatto di intermediari specializzati nel ramo che ti serve. Gratuito, senza impegno, senza registrazione."],
  "area-pro": ["Area Pro — dashboard intermediari | QuotaFacile", "Gestisci la tua QuotaPass, rispondi alle domande della bacheca e monitora i contatti ricevuti."],
  "privacy": ["Privacy Policy | QuotaFacile", "Informativa sul trattamento dei dati personali ai sensi degli artt. 13-14 del Regolamento (UE) 2016/679."],
  "privacy-imprese": ["Da dove abbiamo il tuo indirizzo — informativa per le aziende | QuotaFacile", "Hai ricevuto una nostra email? Qui trovi da dove viene il tuo recapito, perché ti scriviamo e come dirci di smettere: una riga, senza doverlo motivare."],
  "cookie-policy": ["Cookie Policy | QuotaFacile", "Cookie e strumenti di tracciamento usati su QuotaFacile, categorie, durate e come gestire il consenso."],
  "termini": ["Termini e Condizioni | QuotaFacile", "Condizioni generali di utilizzo della piattaforma QuotaFacile per utenti e intermediari assicurativi."],
  "note-legali": ["Note legali | QuotaFacile", "Informazioni sul gestore del sito, natura dell'attività e avvertenze IVASS. QuotaFacile non è un intermediario assicurativo."],
  "contatti": ["Chi siamo e contatti | QuotaFacile", "Chi c'è dietro QuotaFacile e come raggiungerci: informazioni, privacy, segnalazioni."],
  "chi-siamo": ["Chi siamo e contatti | QuotaFacile", "Chi c'è dietro QuotaFacile e come raggiungerci: informazioni, privacy, segnalazioni."],
  "magazine": ["Magazine QuotaFacile — guide e approfondimenti sulle assicurazioni", "Guide lunghe e approfondimenti scritti dalla redazione, con i riferimenti normativi in chiaro: come leggere una polizza e capire cosa stai firmando."],
  "admin": ["Area riservata | QuotaFacile", "Console di amministrazione."],
  "404": ["Pagina non trovata | QuotaFacile", "L'indirizzo cercato non esiste o è stato spostato. Da qui puoi tornare alla home, alla directory degli intermediari o alla bacheca."]
};

function applicaSeo(page, path) {
  if (page === "faq") {
    const f = getFaqById(path[1]);
    if (f) {
      const best = f.risposte.find(r => r.accettata) || f.risposte[0];
      /* Il suffisso si aggiunge solo se ci sta: un titolo scritto
         a mano che arriva a sessanta caratteri è già stato pensato
         per la SERP, e appiccicargli " | QuotaFacile" lo porta
         oltre il punto in cui Google taglia — cioè butta via
         proprio le parole che qualcuno aveva scelto. */
      const titoloBase = f.titolo || f.domanda;
      setSeo(
        titoloBase.length > 60 ? titoloBase : titoloBase + " | QuotaFacile",
        f.meta || (best ? best.testo.slice(0, 155).replace(/\s+\S*$/, "") + "…" : SEO_BASE.desc)
      );
      return;
    }
  }
  if (page === "magazine" && path[1]) {
    const a = window.QFMagazine?.stato.corpi[path[1]]
           || window.QFMagazine?.stato.articoli.find(x => x.slug === path[1]);
    if (a) {
      setSeo(
        a.titolo.length > 55 ? a.titolo : a.titolo + " | QuotaFacile",
        a.meta_description || String(a.apertura || "").slice(0, 155).replace(/\s+\S*$/, "") + "…",
        a.cover_url || null
      );
      return;
    }
    /* L'articolo non è ancora arrivato. Sulla pagina scritta dal
       deploy il titolo giusto c'è già: riscriverlo con quello
       dell'elenco vorrebbe dire farlo lampeggiare per mezzo
       secondo, e per un crawler che legge a metà rendering
       vorrebbe dire leggere il titolo sbagliato. */
    if (PERCORSO_PAGINA && ROTTA_PAGINA === "magazine/" + path[1]) return;
  }
  const s = SEO_PAGINE[page];
  setSeo(s ? s[0] : null, s ? s[1] : null);
}

let ultimoHash = null;

function render() {
  const { path, query } = parseHash();
  const page = path[0] || "home";
  let html, navKey = page || "home";

  /* Va segnata prima di costruire le viste, non dopo: i dati
     strutturati nascono dentro le viste e devono già sapere su
     quale indirizzo pubblico si trovano. Segnarla dopo vorrebbe
     dire che ogni pagina dichiara nel proprio grafo l'indirizzo
     di quella precedente — un errore che si nota solo leggendo
     il JSON-LD, cioè quasi mai. */
  paginaCorrente = { page, path };

  /* Dopo un invio completato, qualunque nuova navigazione riporta il
     preventivo a un modulo vuoto: chi torna sulla pagina vuole fare
     una nuova richiesta, non rivedere la conferma di quella prima.
     Il confronto è sull'hash e non sulla pagina, perché anche il
     passaggio da "#/preventivo?to=b1" a "#/preventivo" è una nuova
     richiesta. I render successivi a hash invariato (invio, cambio
     step) non azzerano nulla. */
  if (ultimoHash !== null && location.hash !== ultimoHash && quoteState.step === 4) resetQuote();
  ultimoHash = location.hash;

  if (page === "" || page === "home") { html = views.home(); navKey = "home"; }
  else if (page === "professionisti") html = views.professionisti();
  else if (page === "intermediari") html = views.intermediari();
  else if (page === "bacheca") html = views.bacheca();
  else if (page === "faq") { html = views.faqDetail(path[1]); navKey = "bacheca"; }
  else if (page === "magazine") {
    html = path[1] ? views.magazineArticolo(path[1]) : views.magazine();
    navKey = "magazine";
  }
  else if (page === "preventivo") html = views.preventivo(query);
  else if (page === "area-pro") html = views.areaPro();
  else if (LEGAL_ROUTES[page]) { setJsonLd(null); html = LEGAL_ROUTES[page](); navKey = ""; }
  /* L'area riservata riceve tutto il percorso, non solo il primo
     segmento: dentro ci sono due applicazioni con rotte proprie. */
  else if (page === "admin") {
    setJsonLd(null); navKey = "";
    if (dentroCornice) {
      /* Si prova anche a uscire dalla cornice: se chi incornicia
         è della stessa origine funziona, se è di un'altra il
         browser lo impedisce — e in quel caso resta il rifiuto
         qui sotto, che è comunque la cosa importante. */
      try { window.top.location = window.self.location.href; } catch (e) { /* atteso da altra origine */ }
      html = `
        <section class="section"><div class="container" style="max-width:34rem">
          <h1 class="titolo-sezione">Questa pagina non si apre dentro un'altra</h1>
          <p class="lead">L'area riservata di QuotaFacile funziona solo come pagina a sé.
          Se ci sei arrivato da un link di qualcun altro, quel link non è nostro.</p>
          <p><a class="btn btn-primary" href="https://www.quotafacile.net/">Vai su www.quotafacile.net</a></p>
        </div></section>`;
    }
    else if (window.QF_ADMIN) {
      html = window.QF_ADMIN.view(path.slice(1));
    } else {
      /* Primo ingresso: il codice dell'area riservata non è
         ancora arrivato. Si dice che sta arrivando invece di
         mostrare una pagina vuota, e appena c'è si ridisegna. */
      html = `<div class="card"><p class="muted">Apertura dell'area riservata…</p></div>`;
      caricaRiservata().then(render).catch(() => {
        app.innerHTML = `<div class="legal-warning" role="alert">
          <strong>L'area riservata non si è caricata.</strong>
          Può essere la rete. Ricarica la pagina e riprova.
        </div>`;
      });
    }
  }
  /* Rotta che non esiste. Mostrare la homepage sarebbe comodo e
     sbagliato: chi ha sbagliato a scrivere l'indirizzo crede di
     essere arrivato, e un motore di ricerca si ritrova la stessa
     pagina a indirizzi diversi. Meglio dirlo. */
  else { setJsonLd(null); html = views.nonTrovato(); navKey = ""; }

  applicaSeo(page, path);
  /* null non è "pagina vuota": è "quello che c'è va bene così".
     Lo usa la guida pre-renderizzata che aspetta i propri dati. */
  if (html !== null) app.innerHTML = html;
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === navKey));
  window.scrollTo({ top: 0 });
  bind();
  annunciaPagina(path.join("/"));
}

/* Dopo un cambio di rotta il browser non fa niente: la pagina non
   si è ricaricata, quindi il fuoco resta dov'era — di solito sul
   link appena premuto, che nel frattempo è sparito. Chi naviga con
   la tastiera si ritrova a ripartire dall'inizio del documento, e
   chi usa uno screen reader non sa che è successo qualcosa.

   Il fuoco va sul titolo della pagina nuova, e una riga invisibile
   annuncia dove siamo. È il posto giusto dove ricominciare a
   leggere e dove ricominciare a tabulare. */
let rottaAnnunciata = null;
function annunciaPagina(rotta) {
  /* Solo quando la rotta cambia davvero. render() viene chiamata
     anche per ridisegnare la stessa pagina — quando la bacheca
     risponde, quando si cambia un filtro, quando si vota una
     risposta — e spostare il fuoco in quei casi vorrebbe dire
     strapparlo di mano a chi sta usando la tastiera proprio
     mentre lo usa.

     La prima volta è un'assegnazione, non un cambio: chi apre il
     sito non ha ancora navigato da nessuna parte, e il fuoco
     deve restare dove il browser l'ha messo. */
  const prima = rottaAnnunciata;
  rottaAnnunciata = rotta;
  if (prima === null || prima === rotta) return;

  const titolo = app.querySelector("h1");
  const bersaglio = titolo || app;
  if (!titolo) app.setAttribute("tabindex", "-1");
  else if (!titolo.hasAttribute("tabindex")) titolo.setAttribute("tabindex", "-1");
  /* preventScroll: la pagina è già stata riportata in cima poco
     sopra, e un secondo salto la farebbe sobbalzare. */
  try { bersaglio.focus({ preventScroll: true }); } catch (e) { bersaglio.focus(); }

  const avviso = document.getElementById("annuncio-rotta");
  if (avviso) {
    /* Il titolo del documento, non quello visibile: è più corto e
       dice anche di che sito si tratta. Svuotare prima costringe
       la regione a rileggere anche se il testo è identico. */
    const testo = (document.title || "").split("|")[0].trim();
    avviso.textContent = "";
    setTimeout(() => { avviso.textContent = testo + ". Pagina caricata."; }, 60);
  }
}

/* ---------------- SEGNALAZIONE CONTENUTI (DSA) ----------------
   Art. 16 Reg. UE 2022/2065: meccanismo di notifica accessibile,
   facile da usare, che consente la notifica in via elettronica.
   La segnalazione finisce in coda di moderazione (area Admin). */
const MOTIVI_SEGNALAZIONE = [
  "Informazione errata o fuorviante",
  "Contenuto non pertinente alla domanda",
  "Pubblicità ingannevole o promessa di risultati",
  "Contenuto offensivo, diffamatorio o discriminatorio",
  "Dati personali di terzi",
  "Violazione di diritti d'autore o di marchio",
  "Altro"
];

function apriSegnalazione(target) {
  const host = document.createElement("div");
  host.innerHTML = `
  <div class="cc-overlay" data-close-report>
    <div class="cc-modal" role="dialog" aria-modal="true" aria-labelledby="rep-t">
      <div class="cc-modal-head">
        <h2 id="rep-t">🚩 Segnala questo contenuto</h2>
        <button class="cc-x" data-close-report aria-label="Chiudi">✕</button>
      </div>
      <form id="report-form" class="cc-modal-body">
        <p class="muted" style="font-size:.88rem">
          Esaminiamo ogni segnalazione in modo tempestivo e non arbitrario. Se il contenuto viene
          rimosso, l'autore riceve una motivazione e può contestarla. Le segnalazioni manifestamente
          infondate e ripetute possono comportare la sospensione della possibilità di segnalare.
        </p>
        <div class="field"><label for="rep-motivo">Motivo</label>
          <select id="rep-motivo">${MOTIVI_SEGNALAZIONE.map(m => `<option>${m}</option>`).join("")}</select>
        </div>
        <div class="field" style="margin-top:.7rem"><label for="rep-det">Spiega brevemente perché *</label>
          <textarea id="rep-det" required placeholder="Indica cosa non va nel contenuto..."></textarea>
        </div>
        <div class="field" style="margin-top:.7rem"><label for="rep-mail">La tua email (facoltativa, per la conferma di ricezione)</label>
          <input id="rep-mail" type="email" placeholder="tu@email.it">
        </div>
        <p class="privacy-hint">I dati della segnalazione sono trattati per la sola gestione della
        stessa (art. 6.1.c e 6.1.f GDPR) — <a href="#/privacy">informativa</a>.</p>
      </form>
      <div class="cc-modal-foot">
        <button class="btn btn-ghost btn-sm" data-close-report>Annulla</button>
        <button class="btn btn-primary btn-sm" form="report-form" type="submit">Invia segnalazione</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(host);
  const chiudi = () => { document.removeEventListener("keydown", conEsc); host.remove(); };
  /* Escape chiude, come in qualsiasi finestra di dialogo. Senza,
     l'unica via d'uscita erano due bottoni da trovare col
     tabulatore — e per chi usa la tastiera "annulla" è Escape. */
  const conEsc = e => { if (e.key === "Escape") { e.stopPropagation(); chiudi(); } };
  document.addEventListener("keydown", conEsc);
  host.querySelectorAll("[data-close-report]").forEach(el =>
    el.addEventListener("click", e => { if (e.target === el) chiudi(); }));
  host.querySelector("#report-form").addEventListener("submit", e => {
    e.preventDefault();
    const seg = {
      motivo: host.querySelector("#rep-motivo").value,
      dettaglio: host.querySelector("#rep-det").value.trim(),
      email: host.querySelector("#rep-mail").value.trim()
    };
    DB.segnalazioni.unshift({ id: "s" + Date.now(), target, ...seg, data: new Date().toISOString(), stato: "aperta" });
    saveDB();
    chiudi();
    toast("Segnalazione ricevuta. La esamineremo al più presto.");
    window.QFMailer.invia("segnalazione", { target, ...seg });
  });
}

/* La richiesta Enterprise passa dal canale che esiste già.

   Serviva un modo per raccogliere "raccontaci cosa ti serve", e
   la tentazione era costruire un modulo nuovo con la sua tabella
   e la sua azione sul server. Ma una richiesta Enterprise è, di
   fatto, una richiesta di consulenza: l'endpoint la sa già
   registrare, notificare e far comparire in console. Aggiungere
   un secondo percorso avrebbe voluto dire un secondo posto in cui
   una richiesta può perdersi senza che nessuno se ne accorga.

   Quindi: tipo "consulenza", ramo "Enterprise", e l'origine che
   dice da dove è arrivata. Zero righe sul server. */
function apriEnterprise() {
  const host = document.createElement("div");
  host.innerHTML = `
  <div class="cc-overlay" data-close-ent>
    <div class="cc-modal" role="dialog" aria-modal="true" aria-labelledby="ent-t">
      <div class="cc-modal-head">
        <h2 id="ent-t">Raccontaci cosa ti serve</h2>
        <button class="cc-x" data-close-ent aria-label="Chiudi">✕</button>
      </div>
      <form id="ent-form" class="cc-modal-body">
        <p class="muted" style="font-size:.88rem">Scrivi che lavoro fai e qual è la cosa ripetitiva che
        ti porta via più tempo. Ti rispondiamo con un'idea di come si automatizza e quanto costa —
        oppure con il motivo per cui, nel tuo caso, non conviene.</p>
        <div class="grid-2" style="gap:.6rem">
          <div class="field"><label for="ent-nome">Nome e cognome *</label>
            <input id="ent-nome" required autocomplete="name"></div>
          <div class="field"><label for="ent-email">Email *</label>
            <input id="ent-email" type="email" required autocomplete="email"></div>
        </div>
        <div class="grid-2" style="gap:.6rem;margin-top:.6rem">
          <div class="field"><label for="ent-tel">Telefono</label>
            <input id="ent-tel" autocomplete="tel"></div>
          <div class="field"><label for="ent-citta">Città</label>
            <input id="ent-citta" autocomplete="address-level2"></div>
        </div>
        <div class="field" style="margin-top:.6rem">
          <label for="ent-note">Cosa vorresti automatizzare *</label>
          <textarea id="ent-note" required rows="5"
            placeholder="Es.: ogni mese ricontrollo a mano le scadenze di 400 polizze su un foglio Excel e mando i solleciti uno per uno. Uso il gestionale X."></textarea>
        </div>
        ${consentBox("ent-consenso", "Acconsento al trattamento dei dati per essere ricontattato su questa richiesta.", false)}
      </form>
      <div class="cc-modal-foot">
        <button class="btn btn-ghost btn-sm" data-close-ent>Annulla</button>
        <button class="btn btn-primary btn-sm" form="ent-form" type="submit">Invia la richiesta</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(host);
  const chiudi = () => { document.removeEventListener("keydown", conEsc); host.remove(); };
  const conEsc = e => { if (e.key === "Escape") { e.stopPropagation(); chiudi(); } };
  document.addEventListener("keydown", conEsc);
  host.querySelectorAll("[data-close-ent]").forEach(el =>
    el.addEventListener("click", e => { if (e.target === el) chiudi(); }));

  host.querySelector("#ent-form").addEventListener("submit", async e => {
    e.preventDefault();
    if (!host.querySelector("#ent-consenso").checked) {
      toast("Per inviare la richiesta serve il consenso al trattamento dei dati.");
      return;
    }
    const btn = host.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Invio…";
    const esito = await window.QFMailer.invia("richiesta", {
      tipo: "consulenza",
      ramo: "Enterprise",
      nome: host.querySelector("#ent-nome").value.trim(),
      email: host.querySelector("#ent-email").value.trim(),
      telefono: host.querySelector("#ent-tel").value.trim(),
      citta: host.querySelector("#ent-citta").value.trim(),
      note: host.querySelector("#ent-note").value.trim(),
      origine: "professionisti/piano-enterprise",
      consenso: true,
      consensoTesto: "Acconsento al trattamento dei dati per essere ricontattato su questa richiesta."
    });
    chiudi();
    toast(esito && esito.ok === false
      ? "La richiesta non è partita. Riprova fra poco, oppure scrivici dalla pagina Contatti."
      : "Richiesta ricevuta. Ti rispondiamo entro due giorni lavorativi.");
  });
}

/* ---------------- EVENTS ---------------- */
function bind() {
  /* card cliccabili */
  document.querySelectorAll("[data-goto]").forEach(el =>
    el.addEventListener("click", e => { if (e.target.closest("a,button")) return; location.hash = el.dataset.goto; }));

  /* filtri */
  document.querySelectorAll("[data-filter]").forEach(b =>
    b.addEventListener("click", () => { dirFilter = b.dataset.filter; render(); }));
  document.querySelectorAll("[data-boardfilter]").forEach(b =>
    b.addEventListener("click", () => { boardFilter = b.dataset.boardfilter; render(); }));
  /* ---- attivare un abbonamento ----
     Senza un account non c'è niente a cui agganciare
     l'abbonamento: si manda a registrarsi invece di aprire un
     pagamento che poi non saprebbe a chi attribuirsi. */
  document.querySelectorAll("[data-abbona]").forEach(b =>
    b.addEventListener("click", async () => {
      const piano = b.dataset.abbona;
      if (!window.QF_PRO?.autenticato()) {
        proModo = "registrati";
        location.hash = "#/area-pro";
        toast("Crea il tuo account: l'abbonamento si aggancia a quello.");
        return;
      }
      const testoPrec = b.textContent;
      b.disabled = true; b.textContent = "Apro il pagamento…";
      const esito = await window.QF_PRO.checkout(piano);
      if (!esito.ok) { b.disabled = false; b.textContent = testoPrec; toast(esito.errore); }
    }));

  /* ---- la porta dell'Area Pro ---- */
  document.querySelectorAll("[data-promodo]").forEach(b =>
    b.addEventListener("click", () => { proModo = b.dataset.promodo; render(); }));

  $("#pro-entra-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = "Verifica…"; }
    const esito = await window.QF_PRO.entra($("#e-email").value, $("#e-pass").value);
    if (!esito.ok) {
      if (btn) { btn.disabled = false; btn.textContent = "Entra"; }
      toast(esito.errore || "Accesso non riuscito.");
      return;
    }
    proTab = "dashboard";
    render();
  });

  $("#pro-reg-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!$("#r-rui-ok").checked || !$("#r-terms").checked) {
      toast("Servono la dichiarazione di iscrizione al RUI e l'accettazione dei Termini.");
      return;
    }
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = "Creazione…"; }

    const dati = {
      nome: $("#r-nome").value.trim(),
      ruolo: $("#r-ruolo").value,
      email: $("#r-email").value.trim(),
      password: $("#r-pass").value,
      rui: $("#r-rui").value.trim(),
      ruiSezione: $("#r-rui-sez").value,
      azienda: $("#r-azienda").value.trim(),
      citta: $("#r-citta").value.trim()
    };
    const esito = await window.QF_PRO.registrati(dati);
    if (!esito.ok) {
      if (btn) { btn.disabled = false; btn.textContent = "Crea l'account"; }
      toast(esito.errore || "Registrazione non riuscita.");
      return;
    }
    /* Il consenso si registra dopo, non prima: se la creazione
       fallisce resterebbe agli atti un consenso senza account. */
    registraConsenso("registrazione-pro", "Dichiarazione iscrizione RUI + accettazione Termini e informativa privacy");
    window.QFMailer?.invia("iscrizione-pro", {
      nome: dati.nome, ruolo: dati.ruolo, azienda: dati.azienda || null,
      rui: dati.rui || null, ruiSezione: dati.ruiSezione || null,
      citta: dati.citta || null, telefono: null, email: dati.email,
      spec: [], bio: null, consensoRui: true, consensoTermini: true
    });
    proTab = "profilo";
    render();
    toast("Account creato. Completa il profilo: la vetrina si attiva dopo il riscontro del RUI.");
  });

  $("#pro-esci")?.addEventListener("click", async () => {
    await window.QF_PRO.esci();
    proModo = "entra";
    render();
    toast("Sei uscito.");
  });

  $("#pro-portale")?.addEventListener("click", async e => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = "Apro Stripe…";
    const esito = await window.QF_PRO.portale();
    if (!esito.ok) {
      btn.disabled = false; btn.textContent = "Gestisci abbonamento, carta e disdetta";
      toast(esito.errore);
    }
  });

  document.querySelectorAll("[data-protab]").forEach(b =>
    b.addEventListener("click", () => { proTab = b.dataset.protab; render(); }));

  /* ---- pagina professionisti ---- */
  $("[data-apri-enterprise]")?.addEventListener("click", apriEnterprise);

  /* Le file di sezioni che su telefono scorrono di lato devono
     aprirsi mostrando dov'è che ci si trova. Senza questo,
     entrando nel CRM su "Produzione" la striscia parte da
     "Panoramica" e la voce attiva è fuori schermo: si vede una
     fila di sezioni e nessuna sembra selezionata.

     Solo se serve davvero: se la fila ci sta tutta, spostarla
     sarebbe un movimento senza motivo. */
  document.querySelectorAll(".filterbar, .mm-voci").forEach(fila => {
    if (fila.scrollWidth <= fila.clientWidth + 2) return;
    const attiva = fila.querySelector(".active, .attiva, [aria-selected='true']");
    if (!attiva) return;
    const centro = attiva.offsetLeft - (fila.clientWidth - attiva.offsetWidth) / 2;
    fila.scrollTo({ left: Math.max(0, centro), behavior: "instant" });
  });

  /* Il calcolatore dei contatti. Ricalcola le stesse righe che il
     pre-render ha già scritto nell'HTML: chi arriva senza
     JavaScript — un crawler, per esempio — vede comunque numeri
     veri, e chi ha JavaScript può cambiare le ipotesi. */
  const calcR = $("#calc-ricerche");
  const calcT = $("#calc-tasso");
  if (calcR && calcT) {
    const ricalcola = () => {
      const ricerche = Math.max(0, Number(calcR.value) || 0);
      const tasso = Math.max(0, Math.min(100, Number(calcT.value) || 0)) / 100;
      document.querySelectorAll("#calc-corpo tr").forEach(tr => {
        const ctr = Number(tr.dataset.ctr);
        const visite = Math.round(ricerche * ctr);
        tr.children[1].textContent = visite.toLocaleString("it-IT");
        tr.children[2].innerHTML = "<strong>" + Math.round(visite * tasso).toLocaleString("it-IT") + "</strong>";
      });
    };
    calcR.addEventListener("input", ricalcola);
    calcT.addEventListener("input", ricalcola);
  }

  /* Categorie del Magazine: si sommano invece di sostituirsi —
     «Auto» e «Imprese» insieme mostrano entrambe. Il pulsante
     senza valore è «Tutte» e azzera. */
  document.querySelectorAll("[data-magcat]").forEach(b =>
    b.addEventListener("click", () => {
      const id = b.dataset.magcat;
      if (!id) magFiltro = [];
      else if (magFiltro.includes(id)) magFiltro = magFiltro.filter(x => x !== id);
      else magFiltro = magFiltro.concat(id);
      render();
    }));

  /* preventivo: scelte e step */
  document.querySelectorAll("[data-tipo]").forEach(b =>
    b.addEventListener("click", () => { quoteState.tipo = b.dataset.tipo; render(); }));
  document.querySelectorAll("[data-ramo]").forEach(b =>
    b.addEventListener("click", () => { quoteState.ramo = b.dataset.ramo; render(); }));
  document.querySelectorAll("[data-step]").forEach(b =>
    b.addEventListener("click", () => { quoteState.step = +b.dataset.step; render(); }));

  $("#quote-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!$("#q-consenso").checked) { toast("Per inviare la richiesta serve il consenso al trattamento dei dati."); return; }
    registraConsenso("richiesta-preventivo", "Consenso alla trasmissione dei recapiti all'intermediario destinatario");

    const dest = quoteState.to ? broker(quoteState.to) : null;
    const dati = {
      tipo: quoteState.tipo || "preventivo",
      ramo: quoteState.ramo || null,
      nome: $("#q-nome").value.trim(),
      citta: $("#q-citta").value.trim(),
      email: $("#q-email").value.trim(),
      telefono: $("#q-tel").value.trim(),
      note: $("#q-note").value.trim(),
      destinatarioId: dest ? dest.id : null,
      destinatarioNome: dest ? `${dest.nome} (${dest.azienda})` : null,
      destinatarioEmail: dest && dest.email && !DA_COMPILARE(dest.email) ? dest.email : null,
      consenso: true,
      consensoTesto: "Consenso alla trasmissione dei recapiti all'intermediario destinatario",
      origine: location.origin + location.pathname
    };

    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = "Invio in corso…"; }

    const esito = await window.QFMailer.invia("richiesta", dati, {
      oggettoRipiego: `Richiesta ${dati.tipo} · ramo ${dati.ramo || "-"} · ${dati.nome}`
    });

    /* La richiesta resta anche nei dati locali: l'area admin la
       mostra subito, senza attendere il collegamento al database. */
    DB.richieste.push({
      tipo: quoteState.tipo, ramo: quoteState.ramo, to: quoteState.to,
      nome: dati.nome, email: dati.email, tel: dati.telefono,
      consegnato: esito.salvato, data: new Date().toISOString()
    });
    saveDB();
    quoteState.esito = esito;
    quoteState.step = 4;
    render();
  });

  /* coming soon app: notifica lancio */
  $("#notify-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!$("#notify-consenso")?.checked) { toast("Spunta il consenso per ricevere l'avviso di lancio."); return; }
    registraConsenso("waitlist-app", "Consenso all'uso dell'email per la notifica di lancio dell'app");
    const email = $("#notify-email").value.trim();
    DB.notifiche = DB.notifiche || [];
    DB.notifiche.push({ email, data: new Date().toISOString() });
    saveDB();
    $("#notify-email").value = "";
    toast("Perfetto! Ti avvisiamo appena l'app è disponibile 📱");
    window.QFMailer.invia("waitlist", { email, consenso: true });
  });

  /* nuova domanda in bacheca */
  $("#ask-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!$("#ask-consenso").checked) { toast("Serve il consenso alla pubblicazione per pubblicare la domanda."); return; }
    const domanda = $("#ask-q").value.trim(), cat = $("#ask-cat").value;
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = "Pubblicazione…"; }

    const esito = await window.QFBacheca.nuovaDomanda({ domanda, categoria: cat, consenso: true });
    if (!esito.ok) {
      if (btn) { btn.disabled = false; btn.textContent = "Pubblica la domanda"; }
      toast(esito.errore || "Non è stato possibile pubblicare la domanda.");
      return;
    }
    registraConsenso("domanda-bacheca", "Consenso alla pubblicazione della domanda in bacheca");
    saveDB(); render();
    toast("Domanda pubblicata! Ora è visibile a tutti gli intermediari.");
  });

  /* voto risposta */
  document.querySelectorAll("[data-vote]").forEach(b =>
    b.addEventListener("click", async () => {
      const key = b.dataset.vote;
      if (DB.votati.includes(key)) return;
      const sep = key.lastIndexOf(":");
      const fid = key.slice(0, sep), idx = +key.slice(sep + 1);
      const f = getFaqById(fid);
      const r = f?.risposte[idx];
      if (!r) return;

      if (r.remota) {
        /* Le risposte pubblicate vivono nel database: il voto va
           lì, così lo vedono tutti. Il vincolo di unicità impedisce
           che lo stesso dispositivo voti due volte. */
        b.disabled = true;
        const esito = await window.QFBacheca.vota(r.id);
        if (!esito.ok) { b.disabled = false; toast(esito.errore || "Voto non registrato."); return; }
        DB.votati.push(key);
        saveDB(); render();
        toast(esito.gia ? "Avevi già votato questa risposta." : "Grazie del feedback!");
        return;
      }

      /* Contenuti redazionali: il voto resta un segnale locale,
         non c'è un autore a cui attribuire punti. */
      if (/^k/.test(fid)) DB.staffVotes[fid] = (DB.staffVotes[fid] || 0) + 1;
      else if (/^d\d+$/.test(fid)) DB.autoVotes[fid] = (DB.autoVotes[fid] || 0) + 1;
      DB.votati.push(key);
      saveDB(); render();
      toast("Grazie del feedback!");
    }));

  /* console di amministrazione (rotta #/admin) */
  if (parseHash().path[0] === "admin" && window.QF_ADMIN) window.QF_ADMIN.bind();

  /* segnalazione contenuti — notice & action art. 16 Reg. UE 2022/2065 (DSA) */
  document.querySelectorAll("[data-report]").forEach(b =>
    b.addEventListener("click", () => apriSegnalazione(b.dataset.report)));

  /* risposta a una FAQ (pro) — community o domanda del giorno */
  $("#answer-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const { path } = parseHash();
    const id = path[1];
    const p = DB.proProfile;
    if (!p) return;
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = "Invio…"; }

    /* Le domande del database hanno un identificativo proprio; le
       guide del repository e le domande del giorno si riferiscono
       per chiave ("k1", "d12"). */
    const f = getFaqById(id);
    const dati = {
      testo: $("#ans-t").value.trim(),
      autoreNome: p.nome, autoreRuolo: p.ruolo, autoreAzienda: p.azienda,
      autoreRui: p.rui, autoreEmail: p.email,
      ...(f && f.uuid ? { domandaId: f.uuid } : { domandaChiave: id })
    };

    const esito = await window.QFBacheca.nuovaRisposta(dati);
    if (!esito.ok) {
      if (btn) { btn.disabled = false; btn.textContent = "Pubblica risposta"; }
      toast(esito.errore || "Risposta non inviata.");
      return;
    }
    /* I punti sono fermi: il meccanismo che li trasformava in
       qualcosa - profilo in evidenza, priorita' - non e'
       costruito, e un numero che sale senza portare a niente e'
       una promessa travestita da premio. Restano a zero finche'
       non c'e' qualcosa di vero dietro. */
    DB.proProfile.risposte = (DB.proProfile.risposte || 0) + 1;
    saveDB(); render();
    toast("Risposta inviata: sarà pubblica dopo la verifica.");
  });

  /* profilo pro: salvataggio + anteprima live */
  const proForm = $("#pro-form");
  if (proForm) {
    const collect = () => ({
      id: "me",
      nome: $("#p-nome").value.trim() || "Il tuo nome",
      ruolo: $("#p-ruolo").value,
      azienda: $("#p-azienda").value.trim() || "La tua azienda",
      rui: $("#p-rui").value.trim() || "•••••••••",
      citta: $("#p-citta").value.trim() || "Città",
      tel: $("#p-tel").value.trim(),
      email: $("#p-email").value.trim(),
      bio: $("#p-bio").value.trim(),
      spec: $("#p-spec").value.split(",").map(s => s.trim()).filter(Boolean).slice(0, 3),
      /* La sezione RUI si dichiara alla registrazione e questo
         modulo non la contiene. Senza riportarla qui, ogni
         salvataggio la cancellerebbe: un campo che il modulo non
         mostra non è un campo che l'utente ha scelto di svuotare. */
      ruiSezione: DB.proProfile?.ruiSezione || null,
      verificato: false,
      punti: DB.proProfile?.punti ?? 0,
      risposte: DB.proProfile?.risposte ?? 0
    });
    proForm.addEventListener("input", () => {
      const prev = collect();
      if (!prev.spec.length) prev.spec = ["Le tue", "specializzazioni"];
      $("#pass-preview").innerHTML = qpass(prev, true);
    });
    /* Il salvataggio va al server, non più al localStorage: il
       profilo è una riga di pro_profili e il database lascia
       scrivere solo le colonne che riguardano chi le scrive. Il
       badge "Verificato" non è fra quelle — dichiararsi verificati
       senza il riscontro sul registro pubblico sarebbe
       un'attestazione non veritiera, e ora non è più questione di
       buona volontà del browser: il permesso non c'è. */
    proForm.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = "Salvataggio…"; }

      const esito = await window.QF_PRO.salvaProfilo(collect());
      if (btn) { btn.disabled = false; btn.textContent = "Salva il profilo"; }
      if (!esito.ok) { toast(esito.errore || "Profilo non salvato."); return; }

      proTab = "dashboard";
      render();
      toast("Profilo aggiornato.");
    });
  }

  /* pubblica FAQ (pro) */
  $("#pubfaq-form")?.addEventListener("submit", e => {
    e.preventDefault();
    DB.faqs.unshift({
      id: "f" + Date.now(), cat: $("#pf-cat").value, autore: "me",
      data: new Date().toISOString().slice(0, 10), domanda: $("#pf-q").value.trim(),
      risposte: [{ autore: "me", testo: $("#pf-a").value.trim(), voti: 0, accettata: true }]
    });
    /* I punti sono fermi: il meccanismo che li trasformava in
       qualcosa - profilo in evidenza, priorita' - non e'
       costruito, e un numero che sale senza portare a niente e'
       una promessa travestita da premio. Restano a zero finche'
       non c'e' qualcosa di vero dietro. */
    DB.proProfile.risposte = (DB.proProfile.risposte || 0) + 1;
    saveDB();
    toast("FAQ pubblicata in bacheca.");
    location.hash = "#/bacheca";
  });
}

/* ---------------- API INTERNA ----------------
   Superficie minima esposta ai moduli (admin.js): evita che
   ognuno reimplementi store, rendering e helper. */
window.QF = {
  get DB() { return DB; },
  saveDB, render, toast, esc, initials, livello, qpass, broker,
  staffFaqs, publishedDaily, dailyPublishedCount, getFaqById,
  domandeIndicizzabili,
  contaRisposte, sincronizzaBrokers, campo, DA_COMPILARE, ruiLabel,
  /* La radice del sito. Serve a chi carica un file da assets/ e
     non può scrivere un percorso assoluto: in locale il sito sta
     in "/", su GitHub Pages può stare sotto una sottocartella, e
     un "/assets/..." scritto a mano funzionerebbe solo in uno dei
     due posti. */
  base: BASE_SITO,
  /* Serve a chi deve parlare con l'area riservata prima che il
     router ci arrivi: l'uscita dall'Area Pro di un collaboratore
     la rimanda lì, e senza aspettare il caricamento parlerebbe a
     un oggetto che non esiste ancora. */
  caricaRiservata
};

window.addEventListener("hashchange", render);

/* L'intestazione che si ritrae scorrendo in giù.

   Tre cose che sembrano dettagli e non lo sono:

   - la soglia. Senza, l'intestazione sfarfalla a ogni micro
     movimento del dito, e il rimbalzo di iOS a fine pagina la fa
     sparire e riapparire da sola;
   - il ritorno immediato appena si scorre in su. Se tornasse solo
     in cima alla pagina, per cambiare sezione bisognerebbe
     risalire tutto;
   - non si ritrae mai nei primi 80 punti, perché lassù non sta
     rubando spazio a nessuno.

   Il calcolo sta dentro requestAnimationFrame: leggere scrollY a
   ogni evento di scorrimento significa chiedere al browser di
   ricalcolare il layout decine di volte al secondo. */
(() => {
  const barra = document.querySelector(".topbar");
  if (!barra) return;

  let ultimo = window.scrollY;
  let inCoda = false;

  const valuta = () => {
    inCoda = false;
    const y = Math.max(0, window.scrollY);
    const delta = y - ultimo;
    if (Math.abs(delta) < 6) return;
    /* In cima si mostra sempre; più giù comanda la direzione. */
    barra.classList.toggle("ritratta", y > 80 && delta > 0);
    ultimo = y;
  };

  window.addEventListener("scroll", () => {
    if (inCoda) return;
    inCoda = true;
    requestAnimationFrame(valuta);
  }, { passive: true });

  /* Cambiando schermata l'intestazione deve esserci: si arriva in
     cima alla pagina nuova, ed è il momento in cui serve di più. */
  window.addEventListener("hashchange", () => {
    barra.classList.remove("ritratta");
    ultimo = 0;
  });
})();

/* Il link "salta al contenuto" punta a #app, che per un browser
   senza JavaScript è esattamente il salto giusto. Ma qui il
   frammento è il router: lasciarlo passare vorrebbe dire chiedere
   la rotta "app", che non esiste, e finire sulla pagina 404.
   Quindi si sposta il fuoco a mano e l'indirizzo non si tocca. */
document.querySelector(".skip-link")?.addEventListener("click", e => {
  e.preventDefault();
  const m = document.getElementById("app");
  const bersaglio = m.querySelector("h1") || m;
  if (!bersaglio.hasAttribute("tabindex")) bersaglio.setAttribute("tabindex", "-1");
  bersaglio.focus();
  bersaglio.scrollIntoView({ block: "start" });
});

/* I link veri delle pagine pre-renderizzate, ripresi al volo.
   Senza questo, ogni clic sul menu di una pagina arrivata da
   Google ricaricherebbe l'intero sito — mezzo megabyte — per
   cambiare sezione. Con questo, il motore di ricerca continua a
   vedere link normali e la persona continua a navigare
   nell'applicazione.

   I guardrail contano quanto il resto: si interviene solo sul
   tasto sinistro senza modificatori (chi apre in una scheda
   nuova vuole una pagina vera), solo su link interni, e solo su
   rotte che hanno un indirizzo pubblico. Tutto il resto —
   area riservata compresa — passa e si comporta come sempre. */
document.addEventListener("click", e => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest("a[href]");
  if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
  if (a.origin !== location.origin) return;

  /* Un link che è solo un frammento — href="#/faq/k1" — non
     racconta niente nel suo percorso: per il browser quel
     percorso è quello della pagina in cui si trova. Passarlo di
     qui significherebbe leggere "sono su /bacheca/" e mandare a
     /bacheca/ chiunque clicchi su una guida. Su una pagina
     pre-renderizzata era esattamente quello che succedeva: tutti
     i link interni riportavano alla pagina di partenza.
     Questi link li gestisce il router, come ha sempre fatto. */
  const href = a.getAttribute("href") || "";
  if (href.startsWith("#")) return;

  const rotta = rottaDaPercorso(a.pathname);
  if (rotta === null) return;
  e.preventDefault();
  const nuovo = "#/" + rotta + (a.search || "");
  /* Stesso indirizzo: cambiare l'hash non scatenerebbe niente,
     quindi si ridisegna a mano. Capita tornando sulla home dalla
     home, ed è il caso in cui azzerare il modulo del preventivo
     serve davvero. */
  if (location.hash === nuovo) { render(); return; }
  location.hash = nuovo;
});

render();

/* La bacheca è contenuto condiviso: si carica dal database e la
   pagina si ridisegna appena arriva. Il primo render non aspetta,
   così guide e domanda del giorno — che vivono nel codice — sono
   visibili subito anche con una rete lenta. */
window.QFBacheca?.onAggiorna(() => render());
/* Il Magazine arriva dal database come la bacheca: quando
   risponde, la pagina si ridisegna con gli articoli veri. */
window.QFMagazine?.onAggiorna(() => render());
window.QFBacheca?.carica();
window.QFMagazine?.carica();

/* L'Area Pro: se c'è una sessione, il profilo si rilegge dal
   database a ogni caricamento. Non è una cache da scaldare — è
   che nel frattempo può essere arrivata la verifica del RUI, o
   può essere cambiato lo stato dell'abbonamento, e quello che
   vale è cosa dice il server adesso. */
window.QF_PRO?.ascolta(() => { sincronizzaBrokers(); render(); });
if (window.QF_PRO?.autenticato()) window.QF_PRO.ripristina();
/* La vetrina pubblica: chi si è registrato da sé non sta nel
   repository, e senza questa lettura un abbonato pagherebbe per
   una visibilità che non riceve — che è il modo peggiore di
   accendere un pagamento. */
window.QF_PRO?.caricaVetrina();
