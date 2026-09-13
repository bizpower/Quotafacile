/* ============================================================
   QuotaFacile — pre-render delle pagine pubbliche
   ------------------------------------------------------------
   PERCHÉ ESISTE

   Il sito è una sola pagina che si riscrive da sola con
   JavaScript. Per una persona con un browser funziona
   benissimo. Per tutto il resto no:

   - il frammento (#/bacheca) non è un indirizzo per un motore
     di ricerca: Google ha smesso di trattarlo come tale nel
     2018. Venti pagine dietro al cancelletto sono una pagina;
   - <main> nell'HTML di partenza è vuoto. Chi scarica la pagina
     senza eseguire JavaScript trova un guscio. E i crawler dei
     motori generativi — GPTBot, ClaudeBot, PerplexityBot,
     CCBot — in larghissima parte JavaScript non lo eseguono.
     robots.txt li invita, e loro trovavano una pagina bianca.

   Questo script apre ogni rotta pubblica in un browser vero, la
   lascia disegnare, e salva il risultato come file HTML a un
   indirizzo vero. Da quel momento ogni pagina ha:

   - contenuto dentro l'HTML, leggibile senza eseguire nulla;
   - un canonical che punta a se stessa invece che alla home;
   - link interni veri, che un crawler può seguire.

   L'applicazione non cambia: chi ha JavaScript ricade
   sull'applicazione di sempre e naviga come prima.

   COSA NON VIENE PRE-RENDERIZZATO, E NON È UNA DIMENTICANZA

   - L'area riservata e la dashboard degli intermediari: non
     devono essere indicizzate, e una pagina pre-renderizzata è
     esattamente una pagina indicizzabile.
   - La domanda del giorno: cambia ogni giorno in base alla
     data, e un file scritto al momento del deploy la
     congelerebbe a quel giorno. Resta viva nell'applicazione.
   ============================================================ */

import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";

const RADICE = process.argv[2] || "_sito";
/* L'indirizzo a cui il sito sarà servito davvero, completo di
   origine: il workflow lo conosce, e da lì si ricavano sia la
   base dei percorsi sia il dominio da scrivere nella sitemap.
   Passarne uno sbagliato produrrebbe una sitemap che elenca
   pagine su un host che non le serve — e una sitemap che il
   crawler non riesce a scaricare vale meno di nessuna sitemap. */
const BASE_URL = new URL(process.argv[3] || "https://www.quotafacile.net/");
const BASE = BASE_URL.pathname.replace(/\/*$/, "/");
const ORIGINE = BASE_URL.origin;
const PORTA = 8099;

const TIPI = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml"
};

/* ---------------- un server statico minimo ----------------
   Non serve una dipendenza per venti file su localhost. */
function servi(radice) {
  return createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const f = join(radice, p);
    if (!f.startsWith(radice) || !existsSync(f) || statSync(f).isDirectory()) {
      res.writeHead(404); return res.end("no");
    }
    res.writeHead(200, { "Content-Type": TIPI[extname(f)] || "application/octet-stream" });
    readFile(f).then(b => res.end(b));
  });
}

/* ---------------- le rotte da scrivere ----------------
   Le pagine fisse sono note; le guide si leggono dal sorgente,
   così pubblicarne una nuova non richiede di toccare questo
   file né la sitemap. È il requisito di una sitemap che si
   aggiorna da sola quando esce un contenuto nuovo. */
const FISSE = [
  { rotta: "", percorso: "", priorita: "1.0", freq: "daily" },
  { rotta: "intermediari", percorso: "intermediari/", priorita: "0.9", freq: "daily" },
  { rotta: "bacheca", percorso: "bacheca/", priorita: "0.9", freq: "hourly" },
  { rotta: "professionisti", percorso: "professionisti/", priorita: "0.8", freq: "monthly" },
  { rotta: "preventivo", percorso: "preventivo/", priorita: "0.8", freq: "monthly" },
  { rotta: "contatti", percorso: "contatti/", priorita: "0.5", freq: "monthly" },
  /* Stessa pagina di /contatti/, raggiungibile con un secondo
     nome perché ci sono link che ci puntano. Il file si scrive —
     altrimenti quei link darebbero 404 — ma fuori dalla sitemap:
     il suo canonical dichiara /contatti/, e chiedere a Google di
     indicizzare una pagina che si dichiara copia di un'altra è
     un modo di contraddirsi. */
  { rotta: "chi-siamo", percorso: "chi-siamo/", priorita: "0.5", freq: "monthly", sitemap: false },
  { rotta: "privacy", percorso: "privacy/", priorita: "0.3", freq: "yearly" },
  { rotta: "privacy-imprese", percorso: "privacy-imprese/", priorita: "0.3", freq: "yearly" },
  { rotta: "cookie-policy", percorso: "cookie-policy/", priorita: "0.3", freq: "yearly" },
  { rotta: "termini", percorso: "termini/", priorita: "0.3", freq: "yearly" },
  { rotta: "note-legali", percorso: "note-legali/", priorita: "0.3", freq: "yearly" },
  /* La pagina di errore. GitHub Pages serve /404.html con stato
     404 vero quando il percorso non esiste: prima rispondeva con
     la sua pagina generica, e una rotta sbagliata dentro
     l'applicazione mostrava la homepage con stato 200 — cioè
     diceva a Google "questa pagina esiste" di un indirizzo
     inventato. Si scrive come file singolo, non come cartella,
     e naturalmente resta fuori dalla sitemap. */
  { rotta: "404", percorso: "404.html", priorita: "0", freq: "yearly", sitemap: false, file: true }
];

async function guide(radice) {
  const src = await readFile(join(radice, "assets/js/staff-questions.js"), "utf8");
  const out = [];
  const re = /id:\s*"(k\d+)",\s*\n\s*slug:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    out.push({ rotta: "faq/" + m[1], percorso: "guide/" + m[2] + "/", priorita: "0.9", freq: "weekly" });
  }
  return out;
}

/* Le guide pubblicate dall'area Admin non stanno nel repository:
   stanno nel database, e nascono fra un deploy e l'altro. Senza
   questo passaggio una guida pubblicata oggi resterebbe visibile
   solo dentro l'applicazione — nessun file, nessun indirizzo
   nella sitemap, nessun canonical — cioè invisibile a chi cerca.

   L'elenco non lo chiede questo script: lo chiede la pagina, che
   sa già parlare con il servizio e conosce già la forma dei dati.
   Duplicare qui la chiamata significherebbe tenerne allineate due.

   Se il servizio non risponde il deploy prosegue con le sole
   pagine del repository. Un contenuto in meno per qualche ora è
   un problema piccolo; un deploy che fallisce e lascia online la
   versione precedente del sito è un problema grande. */
async function guideRemote(page, porta) {
  try {
    await page.goto(`http://localhost:${porta}/#/bacheca`, { waitUntil: "load" });
    const elenco = await page.waitForFunction(() => {
      const b = window.QFBacheca;
      if (!b || !b.stato.caricata) return false;
      return b.guideRemote()
        .filter(g => g.slug)
        .map(g => ({ id: g.id, slug: g.slug, data: g.data }));
      /* il secondo argomento è l'argomento della funzione, non le
         opzioni: metterci il timeout vuol dire non impostarlo */
    }, null, { timeout: 20000 }).then(h => h.jsonValue());

    return elenco.map(g => ({
      rotta: "faq/" + g.id,
      percorso: "guide/" + g.slug + "/",
      priorita: "0.9",
      freq: "weekly"
    }));
  } catch (e) {
    console.warn(
      "  ! Guide dell'area Admin non lette (" + String(e.message || e).split("\n")[0] + ").\n" +
      "    Il deploy prosegue con le sole guide del repository.");
    return [];
  }
}

/* ---------------- riscritture sull'HTML salvato ---------------- */

/* Gli asset sono scritti relativi ("assets/css/style.css"): da
   una sottocartella si romperebbero. Diventano assoluti sulla
   base reale del sito. */
const assolutizza = (html, base) =>
  html.replace(/(src|href)="assets\//g, `$1="${base}assets/`);

/* I link interni al frammento diventano link veri. È quello che
   dà a un motore di ricerca un filo da seguire fra le pagine:
   con href="#/bacheca" il filo non c'è, perché per lui quel
   link torna alla pagina da cui parte. Appena JavaScript entra
   in funzione l'applicazione ridisegna il contenuto con i
   propri link e la navigazione torna istantanea. */
function linkVeri(html, base, mappa) {
  return html.replace(/href="#\/([^"]*)"/g, (intero, rotta) => {
    const [percorsoRotta, query] = rotta.split("?");
    const pulita = percorsoRotta.replace(/\/$/, "");
    const dest = mappa.get(pulita);
    if (dest === undefined) return intero;
    return `href="${base}${dest}${query ? "?" + query : ""}"`;
  });
}

/* Il pre-render gira su un server locale, quindi tutto ciò che
   l'applicazione costruisce a partire da location — canonical,
   og:url, gli @id dei dati strutturati — esce con l'indirizzo
   del server locale. Per un browser non è un problema: appena
   JavaScript parte, quei valori vengono ricalcolati sull'origine
   vera. Ma per un crawler che JavaScript non lo esegue quella è
   la dichiarazione definitiva, e dire a Google che la pagina
   vera sta su localhost è il modo più efficace di sparire dai
   risultati. Si riscrive prima di salvare. */
const viaLocalhost = (html, porta, base) =>
  html.replaceAll(`http://localhost:${porta}/`, base);

/* Il pre-render fotografa il DOM a lavoro finito: dentro ci sono
   anche le classi che l'applicazione usa per lo stato corrente.
   Le uniche che vanno tolte sono quelle del banner cookie, che
   deve tornare a decidere da sé se mostrarsi al prossimo
   visitatore. */
const togliBanner = html => html.replace(/<div id="cc-root"[\s\S]*?<\/div>\s*(?=<\/body>)/i, "");

/* La regione che annuncia il cambio di pagina a uno screen
   reader. Nel file salvato ci finisce l'annuncio dell'ultima
   navigazione fatta dal pre-render, che per chi apre la pagina
   sarebbe un "pagina caricata" detto prima di aver navigato da
   nessuna parte. Si riparte vuota, come all'apertura del sito. */
const svuotaAnnuncio = html =>
  html.replace(/(<p id="annuncio-rotta"[^>]*>)[\s\S]*?(<\/p>)/i, "$1$2");

function meta(html, rotta, percorso) {
  const tag =
    `<meta name="qf-rotta" content="${rotta}">\n` +
    `  <meta name="qf-percorso" content="${percorso}">`;
  return html.replace(/<meta charset="UTF-8">/i, `<meta charset="UTF-8">\n  ${tag}`);
}

/* ---------------- sitemap ---------------- */
function sitemap(pagine, origine, base) {
  const oggi = new Date().toISOString().slice(0, 10);
  const righe = pagine.map(p =>
    `  <url><loc>${origine}${base}${p.percorso}</loc>` +
    `<lastmod>${oggi}</lastmod>` +
    `<changefreq>${p.freq}</changefreq>` +
    `<priority>${p.priorita}</priority></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generata dal deploy: contiene solo indirizzi pubblici e
     indicizzabili, nessuna rotta dell'area riservata, e si
     aggiorna da sola quando viene pubblicata una guida nuova.
     Non modificarla a mano: la prossima pubblicazione la
     riscrive. Sorgente: tools/prerender.mjs -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${righe}
</urlset>
`;
}

/* ---------------- il giro ----------------
   Playwright è una dipendenza del deploy, non del sito: nel
   pacchetto pubblicato non finisce una riga di questo file. È
   l'unico modo onesto di fotografare quello che l'applicazione
   disegna davvero, invece di riscrivere le stesse viste una
   seconda volta in un generatore separato — due copie che dopo
   il primo ritocco raccontano cose diverse. */
async function caricaPlaywright() {
  /* In CI arriva da npm e si importa per nome. Su una macchina
     dove è già installato altrove — come l'ambiente in cui
     questo script è stato scritto e provato — si prende dal suo
     percorso. Provare in quest'ordine evita di obbligare
     chiunque tocchi il repository a reinstallarlo. */
  const candidati = ["playwright", process.env.QF_PLAYWRIGHT].filter(Boolean);
  for (const c of candidati) {
    try { const m = await import(c); return m.default ?? m; } catch { /* si prova il prossimo */ }
  }
  throw new Error(
    "Playwright non trovato. In CI: npm i --no-save playwright. " +
    "Altrove: QF_PLAYWRIGHT=/percorso/a/playwright/index.js");
}
const { chromium } = await caricaPlaywright();

const radice = join(process.cwd(), RADICE);

const server = servi(radice);
await new Promise(r => server.listen(PORTA, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errori = [];
page.on("pageerror", e => errori.push(String(e)));

const pagine = [...FISSE, ...(await guide(radice)), ...(await guideRemote(page, PORTA))];
const mappa = new Map(pagine.map(p => [p.rotta, p.percorso]));

let scritte = 0;
for (const p of pagine) {
  await page.goto(`http://localhost:${PORTA}/#/${p.rotta}`, { waitUntil: "load" });
  /* Il primo render è sincrono, ma la bacheca arriva dal
     database e ridisegna appena risponde: aspettare che il
     contenuto ci sia davvero evita di salvare una pagina a
     metà. */
  await page.waitForFunction(() => {
    const m = document.getElementById("app");
    return m && m.textContent.trim().length > 200;
  }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);

  let html = "<!DOCTYPE html>\n" + await page.evaluate(() => document.documentElement.outerHTML);
  html = meta(html, p.rotta, p.percorso);
  html = viaLocalhost(html, PORTA, ORIGINE + BASE);
  html = assolutizza(html, BASE);
  html = linkVeri(html, BASE, mappa);
  html = togliBanner(html);
  html = svuotaAnnuncio(html);

  const destinazione = p.file
    ? join(radice, p.percorso)
    : join(radice, p.percorso, "index.html");
  await mkdir(dirname(destinazione), { recursive: true });
  await writeFile(destinazione, html, "utf8");
  scritte++;

  const testo = await page.evaluate(() => document.getElementById("app").innerText.trim().length);
  const titolo = await page.title();
  console.log(`  ${(BASE + p.percorso).padEnd(52)} ${String(testo).padStart(6)} caratteri  ${titolo.slice(0, 44)}`);
  if (testo < 200) errori.push(`Pagina quasi vuota: ${p.percorso}`);
}

const inSitemap = pagine.filter(p => p.sitemap !== false);
await writeFile(join(radice, "sitemap.xml"), sitemap(inSitemap, ORIGINE, BASE), "utf8");

/* robots.txt dichiara dove trovare la sitemap. Deve dirlo
   sull'host che sta davvero servendo: un crawler che legge un
   indirizzo su un dominio diverso da quello che sta visitando
   quella sitemap non la scarica. */
{
  const p = join(radice, "robots.txt");
  const txt = (await readFile(p, "utf8"))
    .replace(/^Sitemap:.*$/m, `Sitemap: ${ORIGINE}${BASE}sitemap.xml`);
  await writeFile(p, txt, "utf8");
}

await browser.close();
server.close();

console.log(`\nPagine scritte: ${scritte}. Sitemap: ${inSitemap.length} indirizzi.`);
if (errori.length) {
  console.error("\nPROBLEMI:\n" + errori.map(e => "  - " + e).join("\n"));
  process.exit(1);
}
