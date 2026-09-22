/* ============================================================
   Copertine del Magazine QuotaFacile
   ------------------------------------------------------------
   Le copertine non sono immagini generate da un modello: sono
   disegnate qui, con forme geometriche e una tavolozza di cinque
   colori, e renderizzate da un browser vero. Tre motivi:

     - il risultato è deterministico, quindi rigenerarlo domani
       restituisce esattamente la stessa immagine;
     - il titolo è vero testo con un font vero, non una parola
       ridisegnata a mano da un modello che ogni tanto sbaglia una
       lettera o un accento;
     - il file sorgente è questo, versionato insieme al sito: una
       copertina si corregge cambiando due righe, non riscrivendo
       un prompt e sperando.

   Le immagini prodotte vivono su Cloudinary; qui restano i PNG a
   1400×800 da cui sono state caricate, in tools/copertine/, che
   non finiscono online (il deploy pubblica per inclusione).

   Il carattere è Inter: se non è installato nel sistema si
   ripiega su DejaVu Sans, che è più largo e manda a capo i titoli
   diversamente. Prima di rigenerare, quindi, va installato
   (i .ttf di Inter in ~/.fonts, poi fc-cache -f).

   Uso:  npm i --no-save playwright && node tools/copertine.mjs
         node tools/copertine.mjs <id>   per rifarne una sola
   ============================================================ */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const V = { fondo: "#0B2E1D", fondo2: "#103E27", chiaro: "#F3F1EE", oro: "#E2A63D", salvia: "#4E9B72" };

/* Le illustrazioni: forme geometriche piatte, niente testo. */
const DISEGNI = {
  catastrofale: `
    <g transform="translate(0,20)">
      <path d="M120 250 L260 150 L400 250 L400 400 L120 400 Z" fill="${V.chiaro}"/>
      <rect x="170" y="300" width="60" height="100" fill="${V.fondo}"/>
      <rect x="290" y="300" width="60" height="60" fill="${V.fondo}"/>
      <path d="M260 60 C 380 100 440 160 440 260 C 440 370 360 430 260 460
               C 160 430 80 370 80 260 C 80 160 140 100 260 60 Z"
            fill="none" stroke="${V.oro}" stroke-width="9" opacity=".95"/>
      <path d="M90 440 L160 470 L230 440 L300 470 L370 440 L430 470" fill="none" stroke="${V.salvia}" stroke-width="10" stroke-linecap="round"/>
      <path d="M150 505 L200 545 L250 505 L300 545 L350 505" fill="none" stroke="${V.salvia}" stroke-width="8" stroke-linecap="round" opacity=".6"/>
    </g>`,
  classe: `
    <g transform="translate(60,40)">
      ${[0,1,2,3,4,5].map(i => `<rect x="60" y="${60+i*70}" width="260" height="14" rx="7" fill="${V.chiaro}" opacity="${0.35+i*0.11}"/>`).join("")}
      <rect x="130" y="${60+2*70-34}" width="120" height="34" rx="9" fill="${V.oro}"/>
      <circle cx="158" cy="${60+2*70+2}" r="9" fill="${V.fondo}"/><circle cx="222" cy="${60+2*70+2}" r="9" fill="${V.fondo}"/>
      <path d="M380 110 L380 190 M380 190 L360 165 M380 190 L400 165" stroke="${V.salvia}" stroke-width="9" fill="none" stroke-linecap="round"/>
      <path d="M440 330 L440 180 M440 180 L420 210 M440 180 L460 210" stroke="${V.oro}" stroke-width="9" fill="none" stroke-linecap="round"/>
    </g>`,
  ore48: `
    <g transform="translate(20,90)">
      <line x1="76" y1="150" x2="330" y2="150" stroke="${V.chiaro}" stroke-width="8" opacity=".45"/>
      <circle cx="76" cy="150" r="52" fill="${V.oro}"/>
      <path d="M76 150 L76 112 M76 150 L104 164" stroke="${V.fondo}" stroke-width="10" stroke-linecap="round"/>
      ${[0,1].map(i => `<circle cx="${175+i*105}" cy="150" r="26" fill="${V.chiaro}"/>`).join("")}
      <rect x="330" y="40" width="180" height="220" rx="16" fill="${V.chiaro}"/>
      ${[0,1,2].map(i => `<path d="M360 ${100+i*58} l22 22 l42 -48" stroke="${V.salvia}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}
      <rect x="120" y="330" width="330" height="20" rx="10" fill="${V.salvia}" opacity=".5"/>
      <rect x="120" y="330" width="180" height="20" rx="10" fill="${V.salvia}"/>
    </g>`,
  franchigia: `
    <g transform="translate(40,140)">
      <rect x="30"  y="120" width="120" height="76" rx="8" fill="${V.oro}"/>
      <rect x="158" y="120" width="302" height="76" rx="8" fill="${V.chiaro}"/>
      <path d="M30 236 L30 260 M150 236 L150 260 M30 248 L150 248" stroke="${V.oro}" stroke-width="7" fill="none" stroke-linecap="round"/>
      ${[0,1,2,3].map(i => `<ellipse cx="245" cy="${430-i*38}" rx="86" ry="22" fill="${V.salvia}" opacity="${0.4+i*0.2}"/>`).join("")}
    </g>`,
  sismica: `
    <g transform="translate(60,60)">
      ${[0,1,2,3,4].map(i => `<circle cx="250" cy="200" r="${40+i*46}" fill="none" stroke="${V.chiaro}" stroke-width="6" opacity="${0.75-i*0.13}"/>`).join("")}
      <circle cx="250" cy="200" r="22" fill="${V.oro}"/>
      <path d="M40 430 C 120 400 180 460 260 430 C 340 400 400 460 470 430" fill="none" stroke="${V.salvia}" stroke-width="11" stroke-linecap="round"/>
      <path d="M40 490 C 120 460 180 520 260 490 C 340 460 400 520 470 490" fill="none" stroke="${V.salvia}" stroke-width="9" stroke-linecap="round" opacity=".55"/>
    </g>`,
  interruzione: `
    <g transform="translate(60,110)">
      <rect x="50" y="70" width="250" height="250" rx="10" fill="${V.chiaro}"/>
      ${[0,1,2,3].map(i => `<rect x="62" y="${84+i*34}" width="226" height="18" rx="9" fill="${V.fondo}" opacity=".85"/>`).join("")}
      <rect x="50" y="300" width="250" height="20" rx="6" fill="${V.salvia}"/>
      <circle cx="420" cy="200" r="86" fill="none" stroke="${V.oro}" stroke-width="12"/>
      <path d="M420 200 L420 146 M420 200 L458 224" stroke="${V.oro}" stroke-width="12" stroke-linecap="round"/>
    </g>`,
  bersani: `
    <g transform="translate(40,170)">
      <rect x="20"  y="150" width="180" height="72" rx="20" fill="${V.chiaro}"/>
      <circle cx="68"  cy="230" r="20" fill="${V.chiaro}"/><circle cx="158" cy="230" r="20" fill="${V.chiaro}"/>
      <rect x="310" y="150" width="180" height="72" rx="20" fill="${V.chiaro}"/>
      <circle cx="358" cy="230" r="20" fill="${V.chiaro}"/><circle cx="448" cy="230" r="20" fill="${V.chiaro}"/>
      <path d="M150 110 C 210 34 300 34 360 110" fill="none" stroke="${V.oro}" stroke-width="11" stroke-linecap="round"/>
      <path d="M360 110 l-30 -12 M360 110 l4 -32" stroke="${V.oro}" stroke-width="11" fill="none" stroke-linecap="round"/>
    </g>`,
  attestato: `
    <g transform="translate(70,90)">
      <rect x="40" y="40" width="300" height="380" rx="12" fill="${V.chiaro}" transform="rotate(-4 190 230)"/>
      ${[0,1,2,3,4,5].map(i => `<rect x="66" y="${96+i*52}" width="${i===2?240:200}" height="16" rx="8" fill="${i===2?V.oro:V.fondo}" opacity="${i===2?1:.8}" transform="rotate(-4 190 230)"/>`).join("")}
      <circle cx="380" cy="330" r="82" fill="none" stroke="${V.salvia}" stroke-width="13"/>
      <line x1="438" y1="388" x2="486" y2="436" stroke="${V.salvia}" stroke-width="15" stroke-linecap="round"/>
    </g>`,
  colpa: `
    <g transform="translate(40,180)">
      <rect x="20" y="120" width="170" height="66" rx="18" fill="${V.chiaro}"/>
      <circle cx="64" cy="194" r="19" fill="${V.chiaro}"/><circle cx="148" cy="194" r="19" fill="${V.chiaro}"/>
      <rect x="310" y="120" width="170" height="66" rx="18" fill="${V.chiaro}"/>
      <circle cx="354" cy="194" r="19" fill="${V.chiaro}"/><circle cx="438" cy="194" r="19" fill="${V.chiaro}"/>
      <path d="M250 60 a58 58 0 0 1 0 116 Z" fill="${V.oro}"/>
      <path d="M250 60 a58 58 0 0 0 0 116 Z" fill="${V.salvia}"/>
    </g>`,
  neopatentati: `
    <g transform="translate(40,140)">
      ${[0,1,2,3].map(i => `<rect x="${40+i*30}" y="${400-i*62}" width="${340-i*30}" height="20" rx="10" fill="${V.salvia}" opacity="${0.32+i*0.2}"/>`).join("")}
      <rect x="150" y="120" width="190" height="74" rx="22" fill="${V.chiaro}"/>
      <circle cx="198" cy="196" r="22" fill="${V.chiaro}"/><circle cx="292" cy="196" r="22" fill="${V.chiaro}"/>
      <rect x="374" y="126" width="80" height="80" rx="18" fill="${V.oro}"/>
    </g>`,
};

const pagina = (eyebrow, titolo, disegno) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1400px;height:800px;background:${V.fondo};font-family:"Inter Display","Inter","DejaVu Sans",Arial,sans-serif;overflow:hidden;-webkit-font-smoothing:antialiased}
  .sfondo{position:absolute;inset:0;
    background-image:radial-gradient(${V.fondo2} 2px, transparent 2px);
    background-size:34px 34px;opacity:.75}
  .barra{position:absolute;left:0;top:0;width:14px;height:100%;background:${V.oro}}
  .box{position:absolute;inset:0;display:flex;align-items:center;padding:0 88px 0 118px;gap:56px}
  .testo{flex:1 1 56%;min-width:0}
  .eyebrow{font-size:23px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:${V.oro};margin-bottom:26px}
  h1{font-size:80px;line-height:1.06;font-weight:800;color:${V.chiaro};letter-spacing:-.028em}
  .filo{width:104px;height:8px;background:${V.salvia};border-radius:4px;margin-top:34px}
  .marchio{position:absolute;right:76px;bottom:52px;font-size:22px;font-weight:700;color:${V.chiaro};opacity:.62;letter-spacing:.05em}
  .dis{flex:0 0 40%;display:flex;justify-content:center;align-items:center}
</style></head><body>
  <div class="sfondo"></div><div class="barra"></div>
  <div class="box">
    <div class="testo">
      <div class="eyebrow">${eyebrow}</div>
      <h1>${titolo}</h1>
      <div class="filo"></div>
    </div>
    <div class="dis"><svg viewBox="0 0 540 600" width="470" height="522">${disegno}</svg></div>
  </div>
  <div class="marchio">QuotaFacile</div>
</body></html>`;

export const COPERTINE = [
  { id: "polizza-catastrofale",  eyebrow: "Imprese",   titolo: "Polizza<br>catastrofale",        disegno: "catastrofale" },
  { id: "classe-di-merito",      eyebrow: "Auto",      titolo: "Classe<br>di merito",             disegno: "classe" },
  { id: "48-ore",                eyebrow: "Imprese",   titolo: "Le prime<br>48 ore",              disegno: "ore48" },
  { id: "franchigia-massimale",  eyebrow: "Imprese",   titolo: "Franchigia<br>e massimale",       disegno: "franchigia" },
  { id: "zona-sismica",          eyebrow: "Imprese",   titolo: "Zona<br>sismica",                 disegno: "sismica" },
  { id: "interruzione-attivita", eyebrow: "Imprese",   titolo: "Interruzione<br>dell'attività",   disegno: "interruzione" },
  { id: "legge-bersani",         eyebrow: "Auto",      titolo: "Legge<br>Bersani",                disegno: "bersani" },
  { id: "attestato-di-rischio",  eyebrow: "Auto",      titolo: "Attestato<br>di rischio",         disegno: "attestato" },
  { id: "concorso-di-colpa",     eyebrow: "Auto",      titolo: "Concorso<br>di colpa",            disegno: "colpa" },
  { id: "neopatentati",          eyebrow: "Auto",      titolo: "Neopatentati",                    disegno: "neopatentati" },
];

// La cartella di destinazione è accanto a questo file e non alla
// cartella da cui lo si lancia: così `node tools/copertine.mjs`
// dalla radice del repository scrive dove ci si aspetta.
const QUI = join(dirname(fileURLToPath(import.meta.url)), "copertine");

const solo = process.argv[2];
mkdirSync(QUI, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 1 });
for (const c of COPERTINE) {
  if (solo && c.id !== solo) continue;
  await p.setContent(pagina(c.eyebrow, c.titolo, DISEGNI[c.disegno]), { waitUntil: "load" });
  await p.screenshot({ path: join(QUI, c.id + ".png") });
  console.log("scritta tools/copertine/" + c.id + ".png");
}
await b.close();
