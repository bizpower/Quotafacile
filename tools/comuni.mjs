/* ============================================================
   L'elenco dei comuni italiani per le tendine del Lead Finder
   ------------------------------------------------------------
   Il CRM chiedeva città e provincia come testo libero. Scrivere
   «Milano» a mano funziona; scrivere «Reggio nell'Emilia» invece
   di «Reggio Emilia», o «Bolzano» invece di «Bolzano/Bozen», fa
   partire una ricerca centrata altrove — e l'errore si scopre
   dai risultati sbagliati, non da un messaggio.

   Quindi le tendine. Ma l'elenco dei comuni non si inventa e non
   si scrive a mano: si prende da una fonte pubblica e si rigenera
   quando cambia (i comuni italiani si fondono e si dividono più
   spesso di quanto sembri).

   FONTE
   matteocontrini/comuni-json, che pubblica in JSON i dati ISTAT
   dei comuni italiani con regione, provincia, sigla e CAP.

   COSA PRODUCE
   assets/data/comuni.json, molto più piccolo dell'originale
   perché tiene solo ciò che serve a riempire tre tendine:
   nessun codice catastale, nessuna popolazione, un CAP solo per
   comune (quello che serve a precompilare il campo; le città
   grandi ne hanno decine e sceglierne uno a caso sarebbe peggio
   che lasciare il campo vuoto, quindi per quelle non se ne mette
   nessuno).

   Uso:  node tools/comuni.mjs
   ============================================================ */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FONTE = "https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json";
const RADICE = join(dirname(fileURLToPath(import.meta.url)), "..");

const risposta = await fetch(FONTE);
if (!risposta.ok) throw new Error(`La fonte ha risposto ${risposta.status}`);
const grezzi = await risposta.json();

if (!Array.isArray(grezzi) || grezzi.length < 7000) {
  throw new Error(`Elenco sospetto: ${grezzi.length} comuni. Non lo scrivo.`);
}

/* L'ordine è quello in cui compariranno nelle tendine, quindi si
   ordina qui una volta sola invece che nel browser ogni volta.
   localeCompare con "it" mette gli accenti al posto giusto: senza,
   «Sant'Àngelo» finisce dopo «Sassari». */
const perNome = (a, b) => String(a).localeCompare(String(b), "it");

const regioni = {};      // regione → [sigla]
const province = {};     // sigla   → { nome, regione }
const comuni = {};       // sigla   → [[nome, cap|""]]

for (const c of grezzi) {
  const sigla = c.sigla;
  const regione = c.regione?.nome;
  if (!sigla || !regione || !c.nome) continue;

  if (!province[sigla]) {
    province[sigla] = { nome: c.provincia?.nome || sigla, regione };
    (regioni[regione] ||= []).push(sigla);
    comuni[sigla] = [];
  }
  /* Un solo CAP: quando il comune ne ha più d'uno il campo resta
     vuoto e lo compila chi cerca. Mettere il primo dei quaranta
     CAP di Milano vorrebbe dire precompilare un valore sbagliato
     nel 97% dei casi, e un campo sbagliato è peggio di un campo
     vuoto perché nessuno lo ricontrolla. */
  comuni[sigla].push([c.nome, c.cap?.length === 1 ? c.cap[0] : ""]);
}

for (const r of Object.keys(regioni)) {
  regioni[r].sort((a, b) => perNome(province[a].nome, province[b].nome));
}
for (const s of Object.keys(comuni)) comuni[s].sort((a, b) => perNome(a[0], b[0]));

const ordinate = {};
for (const r of Object.keys(regioni).sort(perNome)) ordinate[r] = regioni[r];

const fuori = {
  aggiornato: new Date().toISOString().slice(0, 10),
  fonte: FONTE,
  regioni: ordinate,
  province,
  comuni,
};

mkdirSync(join(RADICE, "assets/data"), { recursive: true });
const percorso = join(RADICE, "assets/data/comuni.json");
writeFileSync(percorso, JSON.stringify(fuori));

const quanti = Object.values(comuni).reduce((n, v) => n + v.length, 0);
console.log(
  `scritto assets/data/comuni.json — ${Object.keys(ordinate).length} regioni, ` +
  `${Object.keys(province).length} province, ${quanti} comuni, ` +
  `${(JSON.stringify(fuori).length / 1024).toFixed(0)} KB`,
);
