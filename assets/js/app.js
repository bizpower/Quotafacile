/* ============================================================
   QuotaFacile — SPA vanilla JS
   Router hash + store localStorage + gamification + SEO JSON-LD
   ============================================================ */
"use strict";

/* ---------------- STORE ---------------- */
const DB_KEY = "quotafacile_db_v1";

const seed = {
  brokers: [
    { id: "b1", nome: "Laura Bianchi", ruolo: "Broker", azienda: "LB Insurance Broker", rui: "B000123456", citta: "Milano", tel: "+39 02 1234567", email: "laura@lbinsurance.it", bio: "15 anni di esperienza in polizze per PMI e professionisti. Rispondo entro 24h.", spec: ["Impresa", "Professionale", "Casa"], punti: 320, risposte: 24, verificato: true },
    { id: "b2", nome: "Marco Ferri", ruolo: "Agente", azienda: "Ferri Assicurazioni", rui: "A000778899", citta: "Roma", tel: "+39 06 7654321", email: "marco@ferriassicura.it", bio: "Specializzato in RC Auto e polizze famiglia. Preventivi chiari, senza sorprese.", spec: ["Auto", "Famiglia", "Vita"], punti: 265, risposte: 19, verificato: true },
    { id: "b3", nome: "Giulia Conti", ruolo: "Subagente", azienda: "Conti & Partners", rui: "E000445566", citta: "Torino", tel: "+39 011 998877", email: "giulia@contipartners.it", bio: "Aiuto famiglie e giovani a proteggere casa e futuro con soluzioni su misura.", spec: ["Casa", "Vita", "Salute"], punti: 190, risposte: 14, verificato: true },
    { id: "b4", nome: "Antonio Russo", ruolo: "Broker", azienda: "Russo Risk Advisory", rui: "B000334455", citta: "Napoli", tel: "+39 081 445566", email: "antonio@russorisk.it", bio: "Risk management per aziende: flotte, cyber, D&O e credito commerciale.", spec: ["Impresa", "Cyber", "Flotte"], punti: 148, risposte: 11, verificato: false }
  ],
  faqs: [
    {
      id: "f1", cat: "Auto", autore: "b2", data: "2026-07-10",
      domanda: "La classe di merito si trasferisce se compro un'auto nuova?",
      risposte: [
        { autore: "b2", testo: "Sì: la classe di merito (CU) segue il proprietario, non il veicolo. Quando acquisti un'auto nuova, l'attestato di rischio resta valido e mantieni la tua classe. Con la Legge Bersani puoi anche ereditare la classe di un familiare convivente sul primo veicolo.", voti: 12, accettata: true },
        { autore: "b1", testo: "Aggiungo: verifica sempre che l'attestato di rischio sia aggiornato nella banca dati ANIA. Se cambi compagnia, la nuova assicurazione lo recupera automaticamente.", voti: 5, accettata: false }
      ]
    },
    {
      id: "f2", cat: "Casa", autore: "b3", data: "2026-07-08",
      domanda: "La polizza casa copre i danni causati da un tubo che perde nel condominio?",
      risposte: [
        { autore: "b3", testo: "Dipende dalla garanzia \"danni da acqua condotta\": se il tubo è di tua proprietà esclusiva, la tua polizza copre i danni causati a terzi (RC verso i vicini). Se il tubo è condominiale, interviene la polizza globale fabbricati del condominio. Controlla sempre franchigie e scoperti.", voti: 9, accettata: true }
      ]
    },
    {
      id: "f3", cat: "Vita", autore: "b1", data: "2026-07-05",
      domanda: "Che differenza c'è tra polizza vita temporanea (TCM) e polizza vita intera?",
      risposte: [
        { autore: "b1", testo: "La TCM (temporanea caso morte) copre solo un periodo definito, ad esempio 20 anni, con premi molto più bassi: è ideale per proteggere un mutuo o i figli. La vita intera copre per sempre e ha una componente di risparmio, ma costa molto di più. Per la maggior parte delle famiglie la TCM è la scelta più efficiente.", voti: 15, accettata: true },
        { autore: "b3", testo: "Concordo. Attenzione anche alla dichiarazione dello stato di salute: essere trasparenti in fase di sottoscrizione evita contestazioni al momento del sinistro.", voti: 6, accettata: false }
      ]
    },
    {
      id: "f4", cat: "Impresa", autore: "b4", data: "2026-07-01",
      domanda: "Una piccola srl ha davvero bisogno di una polizza cyber?",
      risposte: [
        { autore: "b4", testo: "Oggi sì, quasi sempre. Le PMI sono il bersaglio preferito del ransomware perché meno protette. Una polizza cyber copre ripristino dati, interruzione di attività, richieste di risarcimento per violazione dati (GDPR) e spesso include assistenza legale e tecnica 24/7. I premi partono da poche centinaia di euro l'anno.", voti: 8, accettata: true }
      ]
    },
    {
      id: "f5", cat: "Salute", autore: "b3", data: "2026-06-28",
      domanda: "Le polizze salute rimborsano anche le visite specialistiche private?",
      risposte: []
    }
  ],
  richieste: [],
  proProfile: null,
  votati: [],
  dailyExtra: {},   // risposte dei pro alle domande del giorno: { d3: [{...}] }
  autoVotes: {},    // voti "utile" alla risposta automatica: { d3: 4 }
  leads: []         // contatti ricevuti dal pro: {tipo, nome, ramo, nota, data}
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
function getFaqById(id) {
  if (/^d\d+$/.test(id)) {
    const i = +id.slice(1);
    return i < dailyPublishedCount() ? dailyFaq(i) : null;
  }
  return DB.faqs.find(x => x.id === id) || null;
}
function hoursToNextDaily() {
  const next = new Date(new Date(DAILY_EPOCH + "T00:00:00").getTime() + (dayIndex() + 1) * 86400000);
  return Math.max(1, Math.ceil((next - Date.now()) / 3600000));
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
          <div class="qpass-role">${esc(b.ruolo)} · ${esc(b.azienda)} · ${esc(b.citta)}</div>
        </div>
      </div>
    </div>
    <div class="qpass-bottom">
      <span class="qpass-rui">RUI ${esc(b.rui)}</span>
      <span class="qpass-tags">${b.spec.slice(0, 3).map(s => `<span>${esc(s)}</span>`).join("")}</span>
    </div>
  </div>`;
}

/* ---------------- VIEWS ---------------- */
const views = {};

/* ----- HOME ----- */
views.home = () => {
  const featured = [...DB.brokers].sort((a, b) => b.punti - a.punti).slice(0, 3);
  const topFaq = [publishedDaily()[0], ...DB.faqs.filter(f => f.risposte.length)].filter(Boolean).slice(0, 3);
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
          <div><strong>${DB.brokers.length * 37}+</strong><span>intermediari iscritti</span></div>
          <div><strong>${DB.faqs.length * 84}+</strong><span>risposte pubblicate</span></div>
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
              <a class="btn btn-outline btn-sm" href="tel:${esc(b.tel)}">📞 Chiama</a>
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
          <p class="muted" style="font-size:.88rem;margin:.1rem 0">${esc(b.bio)}</p>
          <div class="pass-actions">
            <a class="btn btn-outline btn-sm" href="tel:${esc(b.tel)}">📞 Chiama</a>
            <a class="btn btn-outline btn-sm" href="mailto:${esc(b.email)}">✉️ Email</a>
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
  <article class="card qa-card ${f.daily ? "qa-daily" : ""}" data-goto="#/faq/${f.id}">
    <div class="qa-meta">
      ${f.daily ? `<span class="badge-cat badge-daily">☀️ Domanda del giorno #${f.num}</span>` : ""}
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
  const merged = [...publishedDaily(), ...DB.faqs].sort((a, b) => (b.data > a.data ? 1 : b.data < a.data ? -1 : (b.daily ? 1 : -1)));
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
        <span class="badge-cat">${esc(f.cat)}</span><span>${esc(f.data)}</span>
      </div>
      <h1 style="font-size:clamp(1.5rem,4vw,2.2rem)">${esc(f.domanda)}</h1>

      ${f.risposte.length ? f.risposte.map((r, i) => {
        const a = broker(r.autore) || { nome: "Intermediario", punti: 0 };
        const voted = DB.votati.includes(f.id + ":" + i);
        return `
        <div class="answer ${r.auto ? "answer-auto" : ""}">
          <div class="answer-head">
            <span class="qa-author">
              ${r.auto
                ? `<span class="mini-avatar mini-qf">QF</span>${esc(a.nome)} <span class="level-badge badge-auto">risposta automatica</span>`
                : `<span class="mini-avatar">${esc(initials(a.nome))}</span>${esc(a.nome)} <span class="level-badge">${livello(a.punti)}</span>`}
              ${r.accettata && !r.auto ? `<span class="badge-cat" style="background:var(--gold-100);color:#9A6B14">★ Migliore risposta</span>` : ""}
            </span>
            <button class="vote-btn" data-vote="${f.id}:${i}" ${voted ? "disabled" : ""}>▲ Utile (${r.voti})</button>
          </div>
          <p style="margin:.2rem 0">${esc(r.testo)}</p>
          ${r.auto ? `<p class="muted" style="font-size:.72rem;margin:.5rem 0 0">Risposta generale della redazione: non sostituisce una consulenza. Gli intermediari possono integrare qui sotto.</p>` : ""}
          ${!r.auto && a.id ? `<div class="pass-actions" style="margin-top:.7rem;max-width:340px">
            ${a.tel ? `<a class="btn btn-outline btn-sm" href="tel:${esc(a.tel)}">📞 Chiama</a>` : ""}
            <a class="btn btn-primary btn-sm" href="#/preventivo?to=${a.id}">Chiedi consulenza</a>
          </div>` : ""}
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
          <div class="field full"><label for="q-note">Note (facoltative)</label><textarea id="q-note" placeholder="Es. attualmente pago 620€/anno per la RC auto..."></textarea></div>
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
      <p class="muted" style="font-size:.75rem;margin-top:.8rem">Inviando accetti i Termini e la Privacy Policy. I tuoi dati vengono condivisi solo con gli intermediari pertinenti alla richiesta.</p>
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
        <select id="p-ruolo">${["Agente", "Broker", "Subagente", "Intermediario"].map(r => `<option ${p?.ruolo === r ? "selected" : ""}>${r}</option>`).join("")}</select>
      </div>
      <div class="field"><label for="p-azienda">Ragione sociale *</label><input id="p-azienda" required value="${esc(p?.azienda || "")}" placeholder="LB Insurance Srl"></div>
      <div class="field"><label for="p-rui">Numero RUI *</label><input id="p-rui" required value="${esc(p?.rui || "")}" placeholder="B000123456"></div>
      <div class="field"><label for="p-citta">Città *</label><input id="p-citta" required value="${esc(p?.citta || "")}" placeholder="Milano"></div>
      <div class="field"><label for="p-tel">Telefono professionale *</label><input id="p-tel" type="tel" required value="${esc(p?.tel || "")}" placeholder="+39 ..."></div>
      <div class="field"><label for="p-email">Email professionale *</label><input id="p-email" type="email" required value="${esc(p?.email || "")}" placeholder="nome@azienda.it"></div>
      <div class="field"><label for="p-spec">Specializzazioni (max 3, separate da virgola)</label><input id="p-spec" value="${esc((p?.spec || []).join(", "))}" placeholder="Auto, Casa, Impresa"></div>
      <div class="field full"><label for="p-bio">About me (breve)</label><textarea id="p-bio" placeholder="Racconta in due righe come aiuti i tuoi clienti...">${esc(p?.bio || "")}</textarea></div>
      <div class="field full"><button class="btn btn-primary" type="submit">${p ? "Salva modifiche" : "Crea la QuotaPass"}</button></div>
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
        <div class="stat"><strong>${p.viste ?? 12}</strong><span>👁 viste profilo</span></div>
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
  const community = DB.faqs.filter(f => !f.risposte.some(r => r.autore === "me"));
  const row = f => `
    <div class="lead-row" data-goto="#/faq/${f.id}" style="cursor:pointer">
      <span class="lead-icon">${f.daily ? "☀️" : "🙋"}</span>
      <span class="leader-info">
        <strong>${esc(f.domanda)}</strong>
        <span>${f.daily ? `Domanda del giorno #${f.num} · risposta automatica da integrare` : (f.risposte.length ? f.risposte.length + " risposte di altri intermediari" : "Ancora senza risposta")} · ${esc(f.cat)}</span>
      </span>
      <span class="pts" style="white-space:nowrap">+10 pt</span>
    </div>`;
  return `
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
            <div class="stat"><strong>${p.viste ?? 12}</strong><span>viste profilo</span></div>
            <div class="stat"><strong>${DB.leads.length}</strong><span>contatti ricevuti</span></div>
            <div class="stat"><strong>${p.risposte ?? 0}</strong><span>risposte in bacheca</span></div>
          </div>
        </div>
      </div>` : ""}
    </div>
  </section>`;
};

/* ---------------- ROUTER ---------------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "") || "";
  const [pathPart, queryPart] = raw.split("?");
  const query = {};
  if (queryPart) queryPart.split("&").forEach(kv => { const [k, v] = kv.split("="); query[k] = decodeURIComponent(v || ""); });
  return { path: pathPart.split("/").filter(Boolean), query };
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
  else { html = views.home(); navKey = "home"; }

  app.innerHTML = html;
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === navKey));
  window.scrollTo({ top: 0 });
  bind();
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
    DB.richieste.push({ tipo: quoteState.tipo, ramo: quoteState.ramo, to: quoteState.to, nome: $("#q-nome").value, data: new Date().toISOString() });
    saveDB();
    quoteState.step = 4;
    render();
  });

  /* coming soon app: notifica lancio */
  $("#notify-form")?.addEventListener("submit", e => {
    e.preventDefault();
    DB.notifiche = DB.notifiche || [];
    DB.notifiche.push({ email: $("#notify-email").value.trim(), data: new Date().toISOString() });
    saveDB();
    $("#notify-email").value = "";
    toast("Perfetto! Ti avvisiamo appena l'app è disponibile 📱");
  });

  /* nuova domanda in bacheca */
  $("#ask-form")?.addEventListener("submit", e => {
    e.preventDefault();
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
      if (/^d\d+$/.test(fid)) {
        /* domanda del giorno */
        if (idx === 0) {
          DB.autoVotes[fid] = (DB.autoVotes[fid] || 0) + 1; // risposta automatica
        } else {
          const r = (DB.dailyExtra[fid] || [])[idx - 1];
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

  /* risposta a una FAQ (pro) — community o domanda del giorno */
  $("#answer-form")?.addEventListener("submit", e => {
    e.preventDefault();
    const { path } = parseHash();
    const id = path[1];
    if (!DB.proProfile) return;
    const testo = $("#ans-t").value.trim();
    if (/^d\d+$/.test(id)) {
      if (!DB.dailyExtra[id]) DB.dailyExtra[id] = [];
      DB.dailyExtra[id].push({ autore: "me", testo, voti: 0, accettata: false });
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
      DB.proProfile = collect();
      DB.proProfile.verificato = true; // demo: in produzione verifica RUI via IVASS
      if (wasNew && !DB.leads.length) {
        /* lead demo per popolare la dashboard (in produzione: tracking reale) */
        const oggi = new Date();
        const d = n => new Date(oggi - n * 86400000).toISOString().slice(0, 10);
        DB.leads = [
          { tipo: "consulenza", nome: "Paolo M.", ramo: "Auto", nota: "RC auto in scadenza, paga 640€/anno", data: d(0) },
          { tipo: "chiamata", nome: "Sara T.", ramo: "Casa", nota: "dalla tua QuotaPass in directory", data: d(1) },
          { tipo: "email", nome: "Studio Verdi", ramo: "Impresa", nota: "richiesta polizza catastrofale", data: d(2) },
          { tipo: "chiamata", nome: "Numero riservato", ramo: "", nota: "dalla risposta in bacheca", data: d(4) },
          { tipo: "consulenza", nome: "Anna R.", ramo: "Vita", nota: "TCM collegata al mutuo", data: d(6) }
        ];
      }
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

window.addEventListener("hashchange", render);
render();
