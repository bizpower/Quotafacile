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
  DB.brokers = (window.INTERMEDIARI || []).map(i => {
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
  const daBacheca = DB.faqs.reduce((n, f) => n + f.risposte.length, 0);
  const daGiornaliere = Object.values(DB.dailyExtra).reduce((n, r) => n + r.length, 0);
  return daBacheca + daGiornaliere + dailyPublishedCount();
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
function dailyFaq(i) {
  const src = (window.DAILY_POOL || [])[i];
  if (!src) return null;
  const d = new Date(new Date(DAILY_EPOCH + "T00:00:00").getTime() + i * 86400000);
  const id = "d" + i;
  const risposte = [
    { autore: "qf", testo: src.rispostaAuto, voti: DB.autoVotes[id] || 0, accettata: true, auto: true },
    ...(DB.dailyExtra[id] || [])
  ];
  return { id, daily: true, num: i + 1, cat: src.cat, keyword: src.keyword, autore: "qf", data: d.toISOString().slice(0, 10), domanda: src.domanda, risposte };
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

function staffFaqs() {
  /* Guide scritte nel repo + guide create dall'area Admin,
     meno quelle ritirate dall'Admin. */
  const base = (window.STAFF_FAQS || []).filter(s => !(DB.staffHidden || []).includes(s.id));
  return [...(DB.staffCustom || []), ...base].map(s => ({
    id: s.id, staff: true, cat: s.cat, keyword: s.keyword, meta: s.meta, titolo: s.titolo,
    autore: "qf", data: s.data, domanda: s.domanda,
    risposte: [
      { autore: "qf", testo: s.testo || spoglia(s.risposta), rich: s.risposta, voti: DB.staffVotes[s.id] || 0, accettata: true, auto: true, staff: true },
      ...(DB.staffExtra[s.id] || [])
    ]
  }));
}

function getFaqById(id) {
  if (/^d\d+$/.test(id)) {
    const i = +id.slice(1);
    return i < dailyPublishedCount() ? dailyFaq(i) : null;
  }
  if (/^k/.test(id)) return staffFaqs().find(x => x.id === id) || null;
  return DB.faqs.find(x => x.id === id) || null;
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

function setSeo(title, desc) {
  document.title = title || SEO_BASE.title;
  const m = document.querySelector('meta[name="description"]');
  if (m) m.content = desc || SEO_BASE.desc;
  const og = document.querySelector('meta[property="og:title"]');
  if (og) og.content = title || SEO_BASE.title;
  const ogd = document.querySelector('meta[property="og:description"]');
  if (ogd) ogd.content = desc || SEO_BASE.desc;
  /* Canonical e og:url si costruiscono dall'origine reale della pagina.
     Puntarli a un dominio fisso mentre il sito è servito da un altro
     host direbbe a Google che la pagina "vera" sta altrove, con il
     rischio di far deindicizzare quella pubblicata. */
  const url = location.origin + location.pathname + (location.hash || "");
  const can = document.querySelector('link[rel="canonical"]');
  if (can) can.href = url;
  const ogu = document.querySelector('meta[property="og:url"]');
  if (ogu) ogu.content = url;
}

/* JSON-LD dinamico per SEO (FAQPage) */
function setJsonLd(obj) {
  $("#jsonld-dynamic").textContent = obj ? JSON.stringify(obj) : "";
}
function faqJsonLd(faqs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.filter(f => f.risposte.length).map(f => ({
      "@type": "Question",
      "name": f.domanda,
      "answerCount": f.risposte.length,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": (f.risposte.find(r => r.accettata) || f.risposte[0]).testo,
        "author": { "@type": "Person", "name": broker((f.risposte.find(r => r.accettata) || f.risposte[0]).autore)?.nome || "Intermediario QuotaFacile" }
      }
    }))
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

/* QuotaPass component */
function qpass(b, flat = false) {
  return `
  <div class="qpass ${flat ? "flat" : ""}" role="img" aria-label="Tessera di ${esc(b.nome)}">
    <div class="qpass-top">
      <span class="qpass-logo">Quota<em>Pass</em></span>
      ${b.verificato ? `<span class="qpass-verified">✓ Verificato RUI</span>` : `<span class="qpass-verified" style="opacity:.55">In verifica</span>`}
    </div>
    <div>
      <div class="qpass-chip" aria-hidden="true"></div>
      <div class="qpass-identity">
        <div class="qpass-avatar">${esc(initials(b.nome))}</div>
        <div>
          <div class="qpass-name">${esc(b.nome)}</div>
          <div class="qpass-role">${esc(b.ruolo)} · ${campo(b.azienda)} · ${campo(b.citta)}</div>
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
views.home = () => {
  const featured = [...DB.brokers].sort((a, b) => b.punti - a.punti).slice(0, 3);
  const topFaq = [...staffFaqs().slice(0, 2), publishedDaily()[0], ...DB.faqs.filter(f => f.risposte.length)].filter(Boolean).slice(0, 3);
  setJsonLd(faqJsonLd(topFaq));
  return `
  <section class="hero">
    <div class="container hero-inner">
      <div class="rise">
        <span class="eyebrow">Marketplace assicurativo italiano</span>
        <h1>Assicurazioni al miglior prezzo, in un solo marketplace.</h1>
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
              ${DA_COMPILARE(b.tel) ? "" : `<a class="btn btn-outline btn-sm" href="tel:${esc(b.tel)}">📞 Chiama</a>`}
              <a class="btn btn-primary btn-sm" href="#/preventivo?to=${b.id}">Richiedi consulenza</a>
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

/* ----- PAGINA PROFESSIONISTI ----- */
views.professionisti = () => {
  setJsonLd(null);
  return `
  <section class="hero">
    <div class="container hero-inner">
      <div class="rise">
        <span class="eyebrow">Per agenti, broker e subagenti</span>
        <h1>La tua vetrina digitale. I clienti ti trovano da soli.</h1>
        <p class="lead">Su QuotaFacile non compri contatti: li conquisti. Crea il tuo profilo, rispondi alle domande degli utenti e fatti trovare da chi sta già cercando una polizza.</p>
        <div class="hero-actions">
          <a href="#/area-pro" class="btn btn-gold">Inizia gratis — crea la QuotaPass</a>
        </div>
      </div>
      <div class="rise-2">${qpass(DB.brokers[1])}</div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-head"><span class="eyebrow">Come funziona per te</span><h2>Un motore di visibilità in 3 mosse</h2></div>
      <div class="grid-3">
        <div class="card"><span class="step-num">1</span><h3>Crea la tua QuotaPass</h3><p class="muted">Nome, ruolo, numero RUI, specializzazioni. Il tuo profilo diventa una tessera professionale che ispira fiducia a colpo d'occhio.</p></div>
        <div class="card"><span class="step-num">2</span><h3>Rispondi in bacheca</h3><p class="muted">Gli utenti pubblicano dubbi assicurativi. Ogni tua risposta è pubblica, firmata e indicizzata su Google: contenuto che lavora per te 24/7.</p></div>
        <div class="card"><span class="step-num">3</span><h3>Sali in classifica</h3><p class="muted">Ogni risposta vale punti. Chi ne ha di più appare in evidenza in home e nei risultati: più aiuti, più visibilità, più contatti.</p></div>
      </div>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container">
      <div class="section-head"><span class="eyebrow">Il sistema punti</span><h2>La reputazione si costruisce, non si compra</h2></div>
      <div class="grid-3">
        <div class="card"><span class="icon-dot">✍️</span><h3>+10 punti</h3><p class="muted">Per ogni risposta pubblicata in bacheca.</p></div>
        <div class="card"><span class="icon-dot">👍</span><h3>+5 punti</h3><p class="muted">Per ogni voto "utile" ricevuto dagli utenti.</p></div>
        <div class="card"><span class="icon-dot">🏆</span><h3>+25 punti</h3><p class="muted">Se la tua risposta viene segnata come "migliore risposta".</p></div>
      </div>
      <div class="card" style="margin-top:1.2rem">
        <h3>I livelli</h3>
        <p class="muted">Novizio (0) → Consulente (50) → Esperto (150) → <strong style="color:var(--gold-500)">Top Advisor (300)</strong>. I Top Advisor compaiono nella sezione "Intermediari in evidenza" della home.</p>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="cta-band">
        <div>
          <h2 style="color:#fff">Iscrizione gratuita. Ti bastano 3 minuti.</h2>
          <p>Nessuna commissione sui contratti: il cliente è tuo, il rapporto è tuo.</p>
        </div>
        <a href="#/area-pro" class="btn btn-gold">Crea il profilo ora</a>
      </div>
    </div>
  </section>`;
};

/* ----- DIRECTORY INTERMEDIARI ----- */
let dirFilter = "Tutti";
views.intermediari = () => {
  setJsonLd(null);
  const cats = ["Tutti", "Auto", "Casa", "Vita", "Impresa", "Salute", "Cyber"];
  const list = DB.brokers.filter(b => dirFilter === "Tutti" || b.spec.includes(dirFilter));
  return `
  <section class="section">
    <div class="container">
      <div class="section-head"><span class="eyebrow">Directory</span><h2>Trova il tuo intermediario</h2>
      <p class="muted">Ogni QuotaPass mostra ruolo, città, numero RUI e specializzazioni. Contatta direttamente chi preferisci.</p></div>
      <div class="filterbar">
        ${cats.map(c => `<button class="chip ${c === dirFilter ? "active" : ""}" data-filter="${c}">${c}</button>`).join("")}
      </div>
      <div class="pass-grid">
        ${list.map(b => `
        <div class="pass-wrap">
          ${qpass(b, true)}
          <p class="muted" style="font-size:.88rem;margin:.1rem 0">${campo(b.bio)}</p>
          <div class="pass-actions">
            ${DA_COMPILARE(b.tel) ? "" : `<a class="btn btn-outline btn-sm" href="tel:${esc(b.tel)}">📞 Chiama</a>`}
            ${DA_COMPILARE(b.email) ? "" : `<a class="btn btn-outline btn-sm" href="mailto:${esc(b.email)}">✉️ Email</a>`}
            <a class="btn btn-primary btn-sm" href="#/preventivo?to=${b.id}">Consulenza</a>
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
  const a = best ? broker(best.autore) : null;
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
    <h3 class="qa-title">${esc(f.domanda)}</h3>
    ${best ? `<p class="qa-excerpt">${esc(best.testo)}</p>` : `<p class="qa-excerpt" style="font-style:italic">Ancora senza risposta: sei un intermediario? Rispondi e guadagna punti.</p>`}
    <div class="qa-foot">
      ${a ? (a.auto
        ? `<span class="qa-author"><span class="mini-avatar mini-qf">QF</span>${esc(a.nome)} <span class="level-badge badge-auto">risposta automatica</span></span>`
        : `<span class="qa-author"><span class="mini-avatar">${esc(initials(a.nome))}</span>${esc(a.nome)} <span class="level-badge">${livello(a.punti)}</span></span>`) : `<span></span>`}
      ${best ? `<span class="pts">▲ ${best.voti} utile</span>` : `<span class="pts">+10 pt per chi risponde</span>`}
    </div>
  </article>`;
}

views.bacheca = () => {
  const cats = ["Tutte", "Auto", "Casa", "Vita", "Impresa", "Salute", "Viaggi"];
  /* Le domande Staff restano in cima: sono le pagine su cui
     puntiamo il posizionamento, devono essere le prime viste. */
  const merged = [...staffFaqs(), ...publishedDaily(), ...DB.faqs.filter(f => !f.staff)];
  const list = merged.filter(f => boardFilter === "Tutte" || f.cat === boardFilter);
  const leaders = [...DB.brokers, ...(DB.proProfile ? [DB.proProfile] : [])].sort((a, b) => b.punti - a.punti).slice(0, 5);
  const nDaily = dailyPublishedCount();
  setJsonLd(faqJsonLd(list));
  return `
  <section class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Bacheca Q&amp;A · il sapere assicurativo, aperto</span>
        <h2>Domande vere, risposte firmate</h2>
        <p class="muted">Ogni giorno pubblichiamo una nuova domanda con risposta della redazione; gli intermediari integrano, guadagnano punti e salgono in classifica.</p>
      </div>
      <div class="daily-counter card">
        <div>
          <strong>☀️ Domanda del giorno ${nDaily} di ${DAILY_TOTAL}</strong>
          <div class="muted" style="font-size:.8rem">Prossima domanda tra ~${hoursToNextDaily()}h · una al giorno, tutti i giorni</div>
        </div>
        <div class="progressbar" style="flex:1;max-width:260px"><i style="width:${Math.round(nDaily / DAILY_TOTAL * 100)}%"></i></div>
      </div>
      <div class="board-layout">
        <div>
          <div class="filterbar">
            ${cats.map(c => `<button class="chip ${c === boardFilter ? "active" : ""}" data-boardfilter="${c}">${c}</button>`).join("")}
          </div>
          ${list.map(f => qaCard(f)).join("") || `<p class="muted">Nessuna domanda in questa categoria.</p>`}
          <div class="card" style="margin-top:1.4rem">
            <h3>Hai un dubbio assicurativo?</h3>
            <p class="muted" style="font-size:.9rem">Pubblicalo: un intermediario verificato ti risponderà pubblicamente.</p>
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
        </div>
        <aside>
          <div class="card leader-card">
            <h3>🏆 Classifica esperti</h3>
            <p class="muted" style="font-size:.8rem;margin-top:-.3rem">Aggiornata in tempo reale</p>
            ${leaders.map((b, i) => `
              <div class="leader-row">
                <span class="leader-rank ${i === 0 ? "gold" : ""}">${i + 1}</span>
                <span class="mini-avatar">${esc(initials(b.nome))}</span>
                <span class="leader-info"><strong>${esc(b.nome)}${b.id === "me" ? " (tu)" : ""}</strong><span>${esc(b.ruolo)} · ${b.risposte || 0} risposte</span></span>
                <span class="leader-pts">${b.punti} pt</span>
              </div>`).join("")}
            <a href="#/professionisti" class="btn btn-outline btn-sm btn-block" style="margin-top:1rem">Vuoi entrare in classifica?</a>
          </div>
        </aside>
      </div>
    </div>
  </section>`;
};

/* ----- DETTAGLIO FAQ ----- */
views.faqDetail = (id) => {
  const f = getFaqById(id);
  if (!f) return `<section class="section"><div class="container"><h2>Domanda non trovata</h2><a href="#/bacheca" class="btn btn-outline">← Torna alla bacheca</a></div></section>`;
  setJsonLd(faqJsonLd([f]));
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
        const a = broker(r.autore) || { nome: "Intermediario", punti: 0 };
        const voted = DB.votati.includes(f.id + ":" + i);
        return `
        <div class="answer ${r.auto ? "answer-auto" : ""}">
          <div class="answer-head">
            <span class="qa-author">
              ${r.auto
                ? `<span class="mini-avatar mini-qf">QF</span>${esc(a.nome)} <span class="level-badge badge-auto">${r.staff ? "guida redazionale" : "risposta automatica"}</span>`
                : `<span class="mini-avatar">${esc(initials(a.nome))}</span>${esc(a.nome)} <span class="level-badge">${livello(a.punti)}</span>`}
              ${r.accettata && !r.auto ? `<span class="badge-cat" style="background:var(--gold-100);color:#9A6B14">★ Migliore risposta</span>` : ""}
            </span>
            <button class="vote-btn" data-vote="${f.id}:${i}" ${voted ? "disabled" : ""}>▲ Utile (${r.voti})</button>
          </div>
          ${r.rich
            ? `<div class="answer-rich">${r.rich}</div>`
            : `<p style="margin:.2rem 0">${esc(r.testo)}</p>`}
          ${r.auto ? `<p class="muted" style="font-size:.72rem;margin:.5rem 0 0">Contenuto redazionale a carattere divulgativo: non è consulenza personalizzata. Gli intermediari iscritti al RUI possono integrarlo qui sotto con la propria esperienza.</p>` : ""}
          ${!r.auto && a.id ? `<div class="pass-actions" style="margin-top:.7rem;max-width:340px">
            ${a.tel ? `<a class="btn btn-outline btn-sm" href="tel:${esc(a.tel)}">📞 Chiama</a>` : ""}
            <a class="btn btn-primary btn-sm" href="#/preventivo?to=${a.id}">Chiedi consulenza</a>
          </div>` : ""}
          <div class="answer-foot">
            <button class="report-btn" data-report="${f.id}:${i}" title="Segnala questo contenuto">🚩 Segnala</button>
          </div>
        </div>`;
      }).join("") : `<p class="muted" style="font-style:italic">Ancora nessuna risposta.</p>`}

      <div class="card" style="margin-top:1.8rem">
        <h3>Sei un intermediario? ${f.daily ? "Integra la risposta automatica" : "Rispondi"} (+10 pt)</h3>
        ${pro ? `
        <form id="answer-form">
          <div class="field full"><label for="ans-t">La tua risposta pubblica, firmata ${esc(pro.nome)}</label><textarea id="ans-t" required placeholder="${f.daily ? "Aggiungi esperienza pratica, casi concreti, cosa verificare in polizza..." : "Scrivi una risposta chiara e completa..."}"></textarea></div>
          <button class="btn btn-primary" style="margin-top:.8rem" type="submit">Pubblica risposta · +10 pt</button>
        </form>` : `
        <p class="muted" style="font-size:.9rem">Crea prima il tuo profilo nell'Area Pro: le risposte sono firmate con la tua QuotaPass.</p>
        <a href="#/area-pro" class="btn btn-outline">Vai all'Area Pro →</a>`}
      </div>
    </div>
  </section>`;
};

/* ----- PREVENTIVO (cliente, multi-step) ----- */
const quoteState = { step: 1, tipo: null, ramo: null, to: null };
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
        <h2>${dest ? `Richiesta a ${esc(dest.nome)}` : "Richiedi preventivo o consulenza"}</h2>
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

        ${s === 4 ? `
        <div style="text-align:center;padding:1.5rem 0">
          <div class="icon-dot" style="margin:0 auto 1rem;width:64px;height:64px;font-size:2rem">✅</div>
          <h3>Richiesta inviata!</h3>
          <p class="muted">${dest ? esc(dest.nome) + " riceverà" : "Gli intermediari specializzati in " + esc(quoteState.ramo || "polizze") + " riceveranno"} la tua richiesta di ${esc(quoteState.tipo || "preventivo")} e ti ricontatteranno a breve.</p>
          <div style="display:flex;gap:.6rem;justify-content:center;margin-top:1rem;flex-wrap:wrap">
            <a href="#/bacheca" class="btn btn-outline">Esplora la bacheca</a>
            <a href="#/" class="btn btn-primary">Torna alla home</a>
          </div>
        </div>` : ""}
      </div>
      <p class="muted" style="font-size:.75rem;margin-top:.8rem">
        I tuoi dati vengono condivisi solo con gli intermediari pertinenti alla richiesta e conservati
        24 mesi dall'ultimo contatto. Puoi revocare il consenso e chiederne la cancellazione in ogni
        momento scrivendo a <a href="#/privacy">privacy@quotafacile.it</a>.
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
      <div class="field"><label for="p-tel">Telefono professionale *</label><input id="p-tel" type="tel" required value="${esc(p?.tel || "")}" placeholder="+39 ..."></div>
      <div class="field"><label for="p-email">Email professionale *</label><input id="p-email" type="email" required value="${esc(p?.email || "")}" placeholder="nome@azienda.it"></div>
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
          <button class="btn btn-gold btn-block" style="margin-top:.9rem" type="submit">Pubblica FAQ · +10 pt</button>
        </form>
      </div>
    </div>
  </div>`;
}

function proBoardHTML() {
  const daily = publishedDaily().filter(f => !(DB.dailyExtra[f.id] || []).some(r => r.autore === "me")).slice(0, 6);
  const staff = staffFaqs().filter(f => !(DB.staffExtra[f.id] || []).some(r => r.autore === "me"));
  const community = DB.faqs.filter(f => !f.risposte.some(r => r.autore === "me"));
  const row = f => `
    <div class="lead-row" data-goto="#/faq/${f.id}" style="cursor:pointer">
      <span class="lead-icon">${f.staff ? "📌" : f.daily ? "☀️" : "🙋"}</span>
      <span class="leader-info">
        <strong>${esc(f.domanda)}</strong>
        <span>${f.staff ? "Guida su keyword strategica · massima visibilità organica"
              : f.daily ? `Domanda del giorno #${f.num} · risposta automatica da integrare`
              : (f.risposte.length ? f.risposte.length + " risposte di altri intermediari" : "Ancora senza risposta")} · ${esc(f.cat)}</span>
      </span>
      <span class="pts" style="white-space:nowrap">+10 pt</span>
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

views.areaPro = () => {
  setJsonLd(null);
  const p = DB.proProfile;
  const preview = p || { nome: "Il tuo nome", ruolo: "Broker", azienda: "La tua azienda", rui: "•••••••••", citta: "Città", spec: ["Le tue", "specializzazioni"], verificato: false };

  /* Onboarding: nessun profilo → solo form + anteprima */
  if (!p) {
    return `
    <section class="section">
      <div class="container">
        <div class="section-head">
          <span class="eyebrow">Area professionisti</span>
          <h2>Crea la tua QuotaPass</h2>
          <p class="muted">Gratis, in 3 minuti. Subito dopo sblocchi dashboard, bacheca e statistiche.</p>
        </div>
        <div class="pro-layout">
          ${proFormHTML(null)}
          <div class="pro-preview">
            <div id="pass-preview" style="width:100%;display:flex;justify-content:center">${qpass(preview, true)}</div>
          </div>
        </div>
      </div>
    </section>`;
  }

  const punti = p.punti ?? 0;
  const next = punti >= 300 ? 300 : punti >= 150 ? 300 : punti >= 50 ? 150 : 50;
  const pct = Math.min(100, Math.round(punti / next * 100));
  return `
  <section class="section">
    <div class="container">
      <div class="section-head" style="margin-bottom:1.4rem">
        <span class="eyebrow">Area professionisti</span>
        <h2>Ciao ${esc(p.nome.split(" ")[0])}, ecco la tua vetrina</h2>
      </div>

      <div class="gami-banner">
        <span class="icon">🏅</span>
        <div style="flex:1">
          <strong>${livello(punti)} · ${punti} punti</strong>
          <div class="muted" style="font-size:.8rem">${punti >= 300 ? "Sei un Top Advisor: profilo in evidenza in home!" : `Ti mancano ${next - punti} punti al livello ${livello(next)}. Rispondi in bacheca per salire.`}</div>
          <div class="progressbar"><i style="width:${pct}%"></i></div>
        </div>
        <a href="#/bacheca" class="btn btn-gold btn-sm">Rispondi ora</a>
      </div>

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
  "cookie-policy": () => window.QF_LEGAL.views.cookie(),
  "termini": () => window.QF_LEGAL.views.termini(),
  "note-legali": () => window.QF_LEGAL.views.noteLegali(),
  "contatti": () => window.QF_LEGAL.views.contatti(),
  "chi-siamo": () => window.QF_LEGAL.views.contatti()
};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "") || "";
  const [pathPart, queryPart] = raw.split("?");
  const query = {};
  if (queryPart) queryPart.split("&").forEach(kv => { const [k, v] = kv.split("="); query[k] = decodeURIComponent(v || ""); });
  return { path: pathPart.split("/").filter(Boolean), query };
}

const SEO_PAGINE = {
  "intermediari": ["Trova un intermediario assicurativo verificato RUI | QuotaFacile", "Agenti, broker e collaboratori iscritti al RUI in vetrina: ruolo, città, specializzazioni e numero di iscrizione. Contatta direttamente chi preferisci, gratis."],
  "bacheca": ["Bacheca Q&A: domande e risposte sulle assicurazioni | QuotaFacile", "Dubbi assicurativi reali con risposte firmate da intermediari iscritti al RUI. Una nuova domanda ogni giorno, tutte le risposte pubbliche e verificabili."],
  "professionisti": ["Per agenti e broker: la tua vetrina digitale | QuotaFacile", "Crea la tua QuotaPass gratis, rispondi in bacheca e fatti trovare da chi cerca una polizza. Nessuna commissione sui contratti: il cliente è tuo."],
  "preventivo": ["Richiedi un preventivo assicurativo gratuito | QuotaFacile", "Compila in due minuti e ricevi il contatto di intermediari specializzati nel ramo che ti serve. Gratuito, senza impegno, senza registrazione."],
  "area-pro": ["Area Pro — dashboard intermediari | QuotaFacile", "Gestisci la tua QuotaPass, rispondi alle domande della bacheca e monitora i contatti ricevuti."],
  "privacy": ["Privacy Policy | QuotaFacile", "Informativa sul trattamento dei dati personali ai sensi degli artt. 13-14 del Regolamento (UE) 2016/679."],
  "cookie-policy": ["Cookie Policy | QuotaFacile", "Cookie e strumenti di tracciamento usati su QuotaFacile, categorie, durate e come gestire il consenso."],
  "termini": ["Termini e Condizioni | QuotaFacile", "Condizioni generali di utilizzo della piattaforma QuotaFacile per utenti e intermediari assicurativi."],
  "note-legali": ["Note legali | QuotaFacile", "Informazioni sul gestore del sito, natura dell'attività e avvertenze IVASS. QuotaFacile non è un intermediario assicurativo."],
  "contatti": ["Chi siamo e contatti | QuotaFacile", "Chi c'è dietro QuotaFacile e come raggiungerci: informazioni, privacy, segnalazioni."],
  "chi-siamo": ["Chi siamo e contatti | QuotaFacile", "Chi c'è dietro QuotaFacile e come raggiungerci: informazioni, privacy, segnalazioni."],
  "admin": ["Area riservata | QuotaFacile", "Console di amministrazione."]
};

function applicaSeo(page, path) {
  if (page === "faq") {
    const f = getFaqById(path[1]);
    if (f) {
      const best = f.risposte.find(r => r.accettata) || f.risposte[0];
      setSeo(
        f.titolo ? f.titolo + " | QuotaFacile" : (f.domanda.length > 60 ? f.domanda : f.domanda + " | QuotaFacile"),
        f.meta || (best ? best.testo.slice(0, 155).replace(/\s+\S*$/, "") + "…" : SEO_BASE.desc)
      );
      return;
    }
  }
  const s = SEO_PAGINE[page];
  setSeo(s ? s[0] : null, s ? s[1] : null);
}

function render() {
  const { path, query } = parseHash();
  const page = path[0] || "home";
  let html, navKey = page || "home";

  if (page === "" || page === "home") { html = views.home(); navKey = "home"; }
  else if (page === "professionisti") html = views.professionisti();
  else if (page === "intermediari") html = views.intermediari();
  else if (page === "bacheca") html = views.bacheca();
  else if (page === "faq") { html = views.faqDetail(path[1]); navKey = "bacheca"; }
  else if (page === "preventivo") html = views.preventivo(query);
  else if (page === "area-pro") html = views.areaPro();
  else if (LEGAL_ROUTES[page]) { setJsonLd(null); html = LEGAL_ROUTES[page](); navKey = ""; }
  else if (page === "admin") { setJsonLd(null); html = window.QF_ADMIN ? window.QF_ADMIN.view(path[1]) : ""; navKey = ""; }
  else { html = views.home(); navKey = "home"; }

  applicaSeo(page, path);
  app.innerHTML = html;
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === navKey));
  window.scrollTo({ top: 0 });
  bind();
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
  const chiudi = () => host.remove();
  host.querySelectorAll("[data-close-report]").forEach(el =>
    el.addEventListener("click", e => { if (e.target === el) chiudi(); }));
  host.querySelector("#report-form").addEventListener("submit", e => {
    e.preventDefault();
    DB.segnalazioni.unshift({
      id: "s" + Date.now(),
      target,
      motivo: host.querySelector("#rep-motivo").value,
      dettaglio: host.querySelector("#rep-det").value.trim(),
      email: host.querySelector("#rep-mail").value.trim(),
      data: new Date().toISOString(),
      stato: "aperta"
    });
    saveDB();
    chiudi();
    toast("Segnalazione ricevuta. La esamineremo al più presto.");
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
  document.querySelectorAll("[data-protab]").forEach(b =>
    b.addEventListener("click", () => { proTab = b.dataset.protab; render(); }));

  /* preventivo: scelte e step */
  document.querySelectorAll("[data-tipo]").forEach(b =>
    b.addEventListener("click", () => { quoteState.tipo = b.dataset.tipo; render(); }));
  document.querySelectorAll("[data-ramo]").forEach(b =>
    b.addEventListener("click", () => { quoteState.ramo = b.dataset.ramo; render(); }));
  document.querySelectorAll("[data-step]").forEach(b =>
    b.addEventListener("click", () => { quoteState.step = +b.dataset.step; render(); }));

  $("#quote-form")?.addEventListener("submit", e => {
    e.preventDefault();
    if (!$("#q-consenso").checked) { toast("Per inviare la richiesta serve il consenso al trattamento dei dati."); return; }
    registraConsenso("richiesta-preventivo", "Consenso alla trasmissione dei recapiti all'intermediario destinatario");
    DB.richieste.push({ tipo: quoteState.tipo, ramo: quoteState.ramo, to: quoteState.to, nome: $("#q-nome").value, data: new Date().toISOString() });
    saveDB();
    quoteState.step = 4;
    render();
  });

  /* coming soon app: notifica lancio */
  $("#notify-form")?.addEventListener("submit", e => {
    e.preventDefault();
    if (!$("#notify-consenso")?.checked) { toast("Spunta il consenso per ricevere l'avviso di lancio."); return; }
    registraConsenso("waitlist-app", "Consenso all'uso dell'email per la notifica di lancio dell'app");
    DB.notifiche = DB.notifiche || [];
    DB.notifiche.push({ email: $("#notify-email").value.trim(), data: new Date().toISOString() });
    saveDB();
    $("#notify-email").value = "";
    toast("Perfetto! Ti avvisiamo appena l'app è disponibile 📱");
  });

  /* nuova domanda in bacheca */
  $("#ask-form")?.addEventListener("submit", e => {
    e.preventDefault();
    if (!$("#ask-consenso").checked) { toast("Serve il consenso alla pubblicazione per pubblicare la domanda."); return; }
    registraConsenso("domanda-bacheca", "Consenso alla pubblicazione della domanda in bacheca");
    DB.faqs.unshift({ id: "f" + Date.now(), cat: $("#ask-cat").value, autore: null, data: new Date().toISOString().slice(0, 10), domanda: $("#ask-q").value.trim(), risposte: [] });
    saveDB(); render();
    toast("Domanda pubblicata! Un intermediario ti risponderà.");
  });

  /* voto risposta */
  document.querySelectorAll("[data-vote]").forEach(b =>
    b.addEventListener("click", () => {
      const key = b.dataset.vote;
      if (DB.votati.includes(key)) return;
      const sep = key.lastIndexOf(":");
      const fid = key.slice(0, sep), idx = +key.slice(sep + 1);
      if (/^k/.test(fid) || /^d\d+$/.test(fid)) {
        /* domanda del giorno (d) o domanda Staff (k, incluse le
           kc… create dall'Admin): la prima risposta è quella
           redazionale, le altre sono dei professionisti */
        const staff = fid[0] === "k";
        const voti = staff ? DB.staffVotes : DB.autoVotes;
        const extra = staff ? DB.staffExtra : DB.dailyExtra;
        if (idx === 0) {
          voti[fid] = (voti[fid] || 0) + 1;
        } else {
          const r = (extra[fid] || [])[idx - 1];
          if (!r) return;
          r.voti++;
          const a = broker(r.autore); if (a) a.punti += 5;
        }
      } else {
        const f = DB.faqs.find(x => x.id === fid);
        const r = f?.risposte[idx];
        if (!r) return;
        r.voti++;
        const a = broker(r.autore); if (a) a.punti += 5;
      }
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
  $("#answer-form")?.addEventListener("submit", e => {
    e.preventDefault();
    const { path } = parseHash();
    const id = path[1];
    if (!DB.proProfile) return;
    const testo = $("#ans-t").value.trim();
    if (/^k/.test(id) || /^d\d+$/.test(id)) {
      const extra = id[0] === "k" ? DB.staffExtra : DB.dailyExtra;
      if (!extra[id]) extra[id] = [];
      extra[id].push({ autore: "me", testo, voti: 0, accettata: false });
    } else {
      const f = DB.faqs.find(x => x.id === id);
      if (!f) return;
      f.risposte.push({ autore: "me", testo, voti: 0, accettata: false });
    }
    DB.proProfile.punti += 10;
    DB.proProfile.risposte = (DB.proProfile.risposte || 0) + 1;
    saveDB(); render();
    toast("Risposta pubblicata! +10 punti 🏅");
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
      verificato: false,
      punti: DB.proProfile?.punti ?? 0,
      risposte: DB.proProfile?.risposte ?? 0
    });
    proForm.addEventListener("input", () => {
      const prev = collect();
      if (!prev.spec.length) prev.spec = ["Le tue", "specializzazioni"];
      $("#pass-preview").innerHTML = qpass(prev, true);
    });
    proForm.addEventListener("submit", e => {
      e.preventDefault();
      const wasNew = !DB.proProfile;
      if (wasNew) {
        if (!$("#pro-rui").checked || !$("#pro-terms").checked) {
          toast("Devi dichiarare l'iscrizione al RUI e accettare i Termini per creare il profilo.");
          return;
        }
        registraConsenso("registrazione-pro", "Dichiarazione iscrizione RUI + accettazione Termini e informativa privacy");
      }
      const statoPrec = DB.proProfile?.statoVerifica;
      DB.proProfile = collect();
      /* Il badge "Verificato RUI" viene assegnato solo dopo il riscontro
         sul registro pubblico IVASS, mai in automatico: dichiararsi
         verificati senza controllo sarebbe un'attestazione non veritiera. */
      DB.proProfile.statoVerifica = statoPrec || "in_attesa";
      DB.proProfile.verificato = DB.proProfile.statoVerifica === "verificato";
      /* Nessun lead fittizio: la dashboard mostra solo contatti reali.
         Popolarla con dati inventati falserebbe le metriche di business
         mostrate al professionista. */
      proTab = "dashboard";
      saveDB(); render();
      toast(wasNew ? "QuotaPass creata! Benvenuto su QuotaFacile 🎉" : "Profilo aggiornato.");
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
    DB.proProfile.punti += 10;
    DB.proProfile.risposte = (DB.proProfile.risposte || 0) + 1;
    saveDB();
    toast("FAQ pubblicata in bacheca! +10 punti 🏅");
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
  contaRisposte, sincronizzaBrokers, campo, DA_COMPILARE, ruiLabel
};

window.addEventListener("hashchange", render);
render();
