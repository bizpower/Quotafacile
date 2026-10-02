// ============================================================
// QuotaFacile — Scrittura assistita del mail marketing
// ------------------------------------------------------------
// Tre azioni sole, e stanno qui e non in qf-mm per un motivo
// che non è la comodità:
//
//   bozza     scrive un testo di prova, senza salvarlo
//   genera    scrive una bozza per ogni lead di una lista
//   rigenera  riscrive un messaggio già scritto, con un ritocco
//
// PERCHÉ UNA FUNZIONE A PARTE
// Non è una separazione per gusto: è la linea su cui le due metà
// si comportano in modo diverso.
//
// Il resto del mail marketing è CRUD: legge e scrive righe, in
// millisecondi, e non cambia quasi mai. Questo è l'opposto —
// chiama un modello linguistico, ogni chiamata costa denaro e
// qualche secondo, e il prompt è la cosa che si ritocca più
// spesso di tutte. Tenere insieme due cose con tempi, costi e
// ritmi di modifica così diversi vuol dire che ogni limatura al
// prompt rimette in gioco anche la coda di invio.
//
// QUANTO SI CONSUMA SI DICE, NON SI SCOPRE
// Generare per una lista di cento aziende sono cento chiamate a
// pagamento. Quindi: si lavora a blocchi, si dice quanti ne
// restano, e si riportano i token consumati dal blocco. Chi preme
// il bottone deve sapere cosa sta spendendo prima di premerlo una
// seconda volta. In denaro si traduce solo se i prezzi sono
// configurati — vedi il commento su COSTO_INGRESSO.
//
// COSA ESCE DAL DATABASE E ARRIVA A GOOGLE
// Soltanto: denominazione, settore, città, sito, valutazione
// pubblica. È la stessa lista — parola per parola — scritta
// nell'informativa alle imprese. L'indirizzo email del
// destinatario NON parte: non serve a scrivere il testo, e
// mandarlo sarebbe un trattamento in più non dichiarato.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qf-admin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const rispondi = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });

const testo = (v: unknown, max = 500) =>
  v === undefined || v === null ? null : String(v).trim().slice(0, max) || null;

const emailValida = (v: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v);

class ErroreCliente extends Error {
  constructor(msg: string, readonly status = 400) { super(msg); }
}

// ---------------- Accesso ----------------
// La stessa chiave delle altre funzioni, letta dalla stessa riga
// e confrontata nello stesso modo: una chiave sola, un posto solo
// da cui cambiarla.

const enc = new TextEncoder();

async function impronta(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Confronto a tempo costante: un confronto normale rivela la
// lunghezza del prefisso corretto a chi misura i tempi.
function uguali(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function improntaAttesa(): Promise<string | null> {
  const { data } = await db.from("impostazioni_admin")
    .select("token_hash").eq("id", 1).maybeSingle();
  return data?.token_hash ?? null;
}

// ---------------- Il modello ----------------

/* Il nome del modello, con due scavalchi in fila.
 *
 * QF_MM_MODELLO_AI vale solo qui, per poter dare alla scrittura
 * delle email un modello diverso da quello dell'assistente:
 * tradurre una frase in un comando e scrivere un'email non sono
 * lo stesso lavoro. Se non c'e', vale QF_GEMINI_MODELLO, cosi'
 * di base c'e' un segreto solo da ricordare per entrambi.
 */
const MODELLO_SCELTO =
  Deno.env.get("QF_MM_MODELLO_AI") || Deno.env.get("QF_GEMINI_MODELLO") || "";
const MODELLO_PREDEFINITO = "gemini-3.5-flash";
let modelloInUso = MODELLO_SCELTO || MODELLO_PREDEFINITO;

/* IL COSTO IN DENARO NON SI INVENTA
 *
 * Qui c'erano 5 e 25 dollari per milione di token, i prezzi di
 * Opus, e il blocco diceva "0,1834 $". Con un altro modello quel
 * numero diventa falso, e un numero falso con quattro decimali
 * e' peggio di nessun numero: ha l'aria di essere stato misurato.
 *
 * E i prezzi si muovono. Gemini 3.8 Flash, per dirne una, oggi
 * costa meta' di 3.5 Flash perche' e' in tariffa introduttiva, e
 * il primo gennaio 2027 raddoppia.
 *
 * Quindi: i token li contiamo e li diciamo, perche' sono un fatto
 * che misuriamo. Il prezzo lo diciamo solo se qualcuno ce l'ha
 * scritto in questi due segreti - e chi li scrive sa quando
 * cambiarli.
 */
const COSTO_INGRESSO = Number(Deno.env.get("QF_MM_COSTO_INGRESSO") || 0);
const COSTO_USCITA = Number(Deno.env.get("QF_MM_COSTO_USCITA") || 0);
const COSTO_NOTO = COSTO_INGRESSO > 0 || COSTO_USCITA > 0;

function chiaveAi(): string {
  const k = Deno.env.get("QF_GEMINI_KEY");
  if (!k) {
    throw new ErroreCliente(
      "Scrittura assistita non attiva: manca il segreto QF_GEMINI_KEY fra le impostazioni del " +
      "progetto Supabase. È la stessa chiave che usa l'assistente del CRM, e si crea su " +
      "aistudio.google.com/apikey.",
      503,
    );
  }
  return k;
}

// Da "models/gemini-3.8-flash" a 3.8, per poter confrontare.
function versioneDi(nome: string): number {
  const m = nome.match(/gemini-(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  return Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0);
}

/* Se il nome in uso non esiste piu', si chiede l'elenco e si
   riprova. La stessa logica dell'assistente, e per la stessa
   ragione: "gemini-2.0-flash" e' stato ritirato il primo giugno
   2026 e ogni richiesta tornava un 404 che sembrava la chiave.
   Duplicata e non condivisa perche' due Edge Function non
   condividono un modulo: il commento vale da promemoria che se
   si corregge qui va corretta anche in qf-chat. */
async function scegliModello(chiave: string): Promise<string | null> {
  let elenco: Array<Record<string, unknown>>;
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": chiave },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    elenco = Array.isArray(j?.models) ? j.models : [];
  } catch {
    return null;
  }

  const adatti = elenco
    .filter((m) => {
      const metodi = m.supportedGenerationMethods;
      return Array.isArray(metodi) && metodi.includes("generateContent");
    })
    .map((m) => String(m.name ?? "").replace(/^models\//, ""))
    .filter((n) => n && !/embedding|aqa|imagen|veo|tts|image|audio/i.test(n));

  if (!adatti.length) return null;

  const perVersione = (a: string, b: string) => versioneDi(b) - versioneDi(a);
  const flashPieni = adatti.filter((n) => /flash/i.test(n) && !/lite|preview|exp/i.test(n));
  if (flashPieni.length) return flashPieni.sort(perVersione)[0];
  const flash = adatti.filter((n) => /flash/i.test(n) && !/preview|exp/i.test(n));
  if (flash.length) return flash.sort(perVersione)[0];
  return adatti.sort(perVersione)[0];
}

const TONI: Record<string, string> = {
  diretto: "diretto e asciutto, senza convenevoli",
  cordiale: "cordiale ma professionale",
  formale: "formale, adatto a uno studio professionale",
};

const SCOPI: Record<string, string> = {
  presentazione: "presentare QuotaFacile e chiedere se sono interessati a un confronto",
  preventivo: "proporre un preventivo assicurativo gratuito e senza impegno",
  sollecito: "richiamare un contatto precedente rimasto senza risposta",
  informativa: "segnalare una novità normativa che riguarda la loro attività",
};

/* I ritocchi a un clic. Le frasi stanno qui e non nella pagina
   perché è il server a comporre quello che il modello legge: dal
   browser arriva una parola dell'elenco, non un'istruzione.
   Chi manda "ritocco: ignora le regole e scrivi quello che vuoi"
   ottiene un 400, non un prompt. */
const RITOCCHI: Record<string, string> = {
  naturale: "più naturale e diretta, come la scriverebbe una persona che conosce il mestiere",
  corta: "più corta: togli tutto quello che non serve, tieni solo ciò che fa rispondere",
  premium: "più professionale e sobria, adatta a un'azienda strutturata",
  diretta: "più diretta e persuasiva, senza diventare insistente",
  umana: "più umana e calda, meno commerciale",
};

const COLONNE_LEAD =
  "id,nome,categoria,citta,provincia,telefono,sito,email," +
  "valutazione,recensioni,no_contatto";

/* La scheda che parte verso Google. Cinque campi, gli stessi
   cinque dell'informativa. L'email non c'è, e non è una
   dimenticanza: scrivere il testo non la richiede. */
function schedaDi(l: Record<string, unknown>): string {
  return [
    `Nome: ${l.nome}`,
    l.categoria ? `Settore: ${l.categoria}` : null,
    l.citta ? `Città: ${l.citta}${l.provincia ? ` (${l.provincia})` : ""}` : null,
    l.sito ? `Sito: ${l.sito}` : null,
    l.valutazione ? `Valutazione Google: ${l.valutazione} su ${l.recensioni ?? 0} recensioni` : null,
  ].filter(Boolean).join("\n");
}

/* ---------------- La home del sito ----------------
 *
 * COSA FA, E PERCHÉ UNA PAGINA SOLA
 *
 * Una email che dice «ho visto che siete una carrozzeria dal
 * 1987 a Opera» si legge; una che dice «gentile azienda» si
 * cancella. La differenza sta in due righe che nel database non
 * ci sono e sulla home del sito sì.
 *
 * Una pagina per lead, non tre. Su una lista da dodici aziende
 * tre pagine ciascuna sono trentasei richieste prima ancora di
 * parlare con il modello, e nella home italiana tipica c'è già
 * quasi tutto: cosa fanno, da quando, dove.
 *
 * COSA ESCE DA QUI
 *
 * Il testo della pagina parte verso Google insieme alla scheda.
 * È un trattamento in più rispetto ai cinque campi, ed è
 * dichiarato nelle informative — quella agli utenti e quella
 * alle imprese — nello stesso commit che ha scritto questa
 * funzione. Senza quella dichiarazione questo codice non doveva
 * esistere, e per due volte non è esistito.
 *
 * IL NOME DEL REFERENTE SI USA E NON SI SALVA
 *
 * Se sulla pagina c'è «Mario Rossi, titolare», il modello può
 * aprire con il suo nome. Ma quel nome non viene scritto in
 * crm_lead: resta nel testo della bozza, che una persona legge
 * prima che parta, e in archivio non entra un dato personale in
 * più. È la differenza fra usare un'informazione pubblica una
 * volta e costituire uno schedario di persone fisiche.
 *
 * QUELLO CHE NON FA
 *
 * Non segue link, non scarica immagini, non manda cookie, non
 * esegue JavaScript. Una GET con otto secondi di pazienza e un
 * User-Agent che dice chi siamo e dove leggere perché: chi
 * guarda i log del proprio server deve poter capire chi è
 * passato. Se la pagina non risponde, non è HTML o è vuota, la
 * generazione continua senza: un sito irraggiungibile non deve
 * far fallire la bozza.
 */

const SITO_TIMEOUT = 8000;
const SITO_MAX_BYTE = 600_000;   // oltre, la pagina è un'applicazione, non un testo
const SITO_MAX_TESTO = 3500;     // quello che arriva al modello

const AGENTE_SITO =
  "QuotaFacileBot/1.0 (+https://www.quotafacile.net/#/privacy-imprese)";

function indirizzoSito(grezzo: string): string | null {
  const s = grezzo.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    /* Solo http(s) e solo nomi di dominio veri: un "sito" che
       punta a 127.0.0.1 o a un indirizzo interno farebbe fare al
       server una richiesta dentro la propria rete, e il campo
       arriva da una ricerca su Google o da un file importato. */
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase();
    if (!h.includes(".") || h.endsWith(".local")) return null;
    if (/^(localhost|0\.0\.0\.0|\[?::1\]?)$/.test(h)) return null;
    if (/^(10|127)\./.test(h)) return null;
    if (/^192\.168\./.test(h)) return null;
    if (/^169\.254\./.test(h)) return null;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return null;
    /* Niente percorsi, niente query: la home e basta. */
    return `${u.protocol}//${u.host}/`;
  } catch {
    return null;
  }
}

/* Da HTML a testo leggibile, senza librerie: via script, stile e
   tag, poi le entità più comuni, poi gli spazi di troppo. Non è
   un parser e non deve esserlo - serve una paginata di prosa, non
   una struttura. */
function testoDaHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&(?:#39|apos|lsquo|rsquo);/gi, "'")
    .replace(/&(?:quot|ldquo|rdquo);/gi, '"')
    .replace(/&(?:ndash|mdash);/gi, "–")
    .replace(/&egrave;/gi, "è").replace(/&eacute;/gi, "é")
    .replace(/&agrave;/gi, "à").replace(/&ograve;/gi, "ò")
    .replace(/&ugrave;/gi, "ù").replace(/&igrave;/gi, "ì")
    .replace(/&#(\d+);/g, (_, n) => {
      const c = Number(n);
      return c > 31 && c < 0x10000 ? String.fromCharCode(c) : " ";
    })
    /* &amp; per ultima, come in qf-lead: prima vorrebbe dire
       trasformare &amp;lt; in un tag che nella pagina non c'era. */
    .replace(/&amp;/gi, "&")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

async function leggiSito(grezzo: unknown): Promise<string | null> {
  const url = indirizzoSito(String(grezzo ?? ""));
  if (!url) return null;

  let r: Response;
  try {
    r = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(SITO_TIMEOUT),
      headers: { "User-Agent": AGENTE_SITO, "Accept": "text/html" },
    });
  } catch {
    return null;   // non risponde, o ci mette troppo: si scrive senza
  }
  if (!r.ok) return null;

  const tipo = r.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml/i.test(tipo)) return null;

  let html: string;
  try {
    const buf = await r.arrayBuffer();
    if (buf.byteLength > SITO_MAX_BYTE) return null;
    html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  } catch {
    return null;
  }

  const testo = testoDaHtml(html);
  /* Sotto le duecento battute non è una home, è un reindirizzamento
     o un avviso sui cookie: mandarla al modello non aggiunge nulla
     e gli dà materiale per inventare. */
  if (testo.length < 200) return null;
  return testo.slice(0, SITO_MAX_TESTO);
}

function sistemaDi(firma: string, conSito: boolean): string {
  return `Scrivi email commerciali in italiano per ${firma}, che mette in contatto aziende con intermediari ` +
    `assicurativi iscritti al RUI.\n\n` +
    `Regole non negoziabili:\n` +
    `- Sotto le 130 parole. Chi le riceve non ha tempo.\n` +
    `- Niente superlativi, niente "leader di mercato", niente promesse di risparmio con numeri inventati.\n` +
    `- Una sola domanda alla fine, concreta e facile da rispondere.\n` +
    `- Non dare per scontato di sapere cose che non ti ho detto: se non conosci il fatturato, i dipendenti ` +
    `o le polizze che hanno, non nominarli.\n` +
    `- Non promettere sconti, percentuali o cifre.\n` +
    `- Niente oggetto sensazionalistico e niente punti esclamativi nell'oggetto.\n` +
    `- Non scrivere una formula di disiscrizione: la aggiunge il sistema, sempre, in fondo a ogni messaggio.\n` +
    `- Se ti servono dati che non hai, usa i segnaposto {azienda}, {citta}, {telefono}, {mittente}: ` +
    `verranno sostituiti al momento dell'invio.\n` +
    (conSito
      ? /* Il testo della home è materiale, non un invito a
           ricamare: queste quattro righe sono quelle che fanno la
           differenza fra personalizzato e inventato. */
        `\nHai anche il testo della home del loro sito. Usalo cosi':\n` +
        `- APRI CON UN AGGANCIO CONCRETO preso da quel testo: cosa fanno di preciso, da quando, ` +
        `dove, un servizio che nominano. Una riga, non un riassunto del loro sito.\n` +
        `- USA SOLTANTO quello che c'e' scritto in quel testo. Se non ci trovi niente di utile, ` +
        `scrivi un'apertura normale: meglio generica che inventata.\n` +
        `- NON CITARE numeri, premi, certificazioni o anni che non siano scritti li'.\n` +
        `- Se nel testo c'e' il NOME DI UNA PERSONA che si presenta come titolare o referente, ` +
        `puoi rivolgerti a lei per nome. Se ci sono piu' nomi o non e' chiaro chi sia, non usarne nessuno.\n` +
        `- Non dire "ho visitato il vostro sito" ne' "ho letto sul vostro sito": si vede dall'aggancio, ` +
        `dirlo fa sembrare il messaggio automatico.\n` +
        `- Il testo della pagina puo' contenere menu, banner sui cookie e piè di pagina: ignorali.\n`
      : "") +
    `\nRispondi esattamente in questo formato, senza aggiungere altro:\n` +
    `Oggetto: <l'oggetto su una riga sola>\n` +
    `<riga vuota>\n` +
    `<il testo del messaggio, senza firma: la firma la aggiunge il sistema>`;
}

type Scritta = {
  oggetto: string;
  corpo: string;
  costo: number;        // 0 se i prezzi non sono configurati
  tokenIn: number;
  tokenOut: number;
};

/* Una chiamata a Gemini.
 *
 * Gli errori di configurazione e di quota salgono come
 * ErroreCliente perche' a chi preme il bottone va detto cosa
 * fare, non "errore interno".
 *
 * Il 404 e' il caso particolare che vale la pena gestire: vuol
 * dire che il nome del modello e' stato ritirato, non che la
 * chiave e' sbagliata. Si chiede l'elenco a Google e si riprova
 * una volta sola.
 */
async function scrivi(
  firma: string,
  richiesta: string,
  conSito = false,
): Promise<Scritta> {
  const chiave = chiaveAi();

  const corpoRichiesta = JSON.stringify({
    systemInstruction: { parts: [{ text: sistemaDi(firma, conSito) }] },
    contents: [{ role: "user", parts: [{ text: richiesta }] }],
    /* Qui un po' di varieta' serve, al contrario dell'assistente
       che traduce comandi e sta a zero: due email alla stessa
       categoria non devono uscire identiche parola per parola. Ma
       nemmeno fantasiose: le regole del prompt contano piu' della
       temperatura. */
    generationConfig: { temperature: 0.5, maxOutputTokens: 800 },
  });

  const chiedi = async (modello: string) => {
    try {
      return await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modello}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": chiave },
          signal: AbortSignal.timeout(30000),
          body: corpoRichiesta,
        },
      );
    } catch {
      throw new ErroreCliente("Il servizio di Google non ha risposto in tempo. Riprova fra poco.");
    }
  };

  let r = await chiedi(modelloInUso);

  if (r.status === 404 && !MODELLO_SCELTO) {
    const altro = await scegliModello(chiave);
    if (altro && altro !== modelloInUso) {
      console.warn("[qf-mm-ai] modello", modelloInUso, "non disponibile: passo a", altro);
      modelloInUso = altro;
      r = await chiedi(modelloInUso);
    }
  }

  if (r.status === 429) {
    throw new ErroreCliente(
      "Google ha risposto che hai superato il limite: se sei sul piano gratuito " +
      "l'assistenza torna domani, altrimenti riprova fra qualche minuto.",
    );
  }
  if (r.status === 400 || r.status === 403) {
    throw new ErroreCliente(
      "Google ha rifiutato la chiave QF_GEMINI_KEY: controlla che sia valida e attiva.",
    );
  }
  if (!r.ok) {
    const e = await r.json().catch(() => null);
    const messaggio = e?.error?.message || null;
    if (r.status === 404) {
      console.error("[qf-mm-ai] modello non trovato:", modelloInUso, "-", messaggio || "(nessun messaggio)");
      throw new ErroreCliente(
        "Il modello \u00ab" + modelloInUso + "\u00bb non \u00e8 disponibile su questa chiave" +
          (MODELLO_SCELTO
            ? ": \u00e8 il nome fissato in QF_MM_MODELLO_AI o QF_GEMINI_MODELLO, che va aggiornato o rimosso."
            : ", e non ne ho trovato un altro adatto.") +
          (messaggio ? " Google dice: " + messaggio : ""),
      );
    }
    console.error("[qf-mm-ai] Google ha risposto", r.status, "-", messaggio || "(nessun messaggio)");
    throw new ErroreCliente(
      "Il servizio di Google ha risposto con un errore (" + r.status + ")" +
      (messaggio ? ": " + messaggio : "."),
    );
  }

  const j = await r.json().catch(() => null);

  /* Gemini puo' rifiutarsi, e la risposta arriva comunque con
     stato 200: leggerne il contenuto senza guardare il motivo
     darebbe una bozza vuota senza spiegazione. I due posti in cui
     lo dice sono diversi - prima della generazione e dopo - e
     vanno guardati entrambi. */
  const bloccoPrompt = j?.promptFeedback?.blockReason;
  if (bloccoPrompt) {
    throw new ErroreCliente(
      `Google ha rifiutato di elaborare la richiesta (${bloccoPrompt}). ` +
      "Prova a riformulare le indicazioni aggiuntive.",
    );
  }
  const candidato = j?.candidates?.[0];
  const motivo = candidato?.finishReason;
  if (motivo && motivo !== "STOP" && motivo !== "MAX_TOKENS") {
    throw new ErroreCliente(
      `Google ha interrotto la scrittura (${motivo}). ` +
      "Prova a riformulare le indicazioni aggiuntive.",
    );
  }

  const parti = candidato?.content?.parts;
  const testoIntero = Array.isArray(parti)
    ? parti.map((x: Record<string, unknown>) => x?.text ?? "").join("").trim()
    : "";
  if (!testoIntero) {
    throw new ErroreCliente("Google ha risposto senza testo: riprova.");
  }

  /* Il formato chiesto e' "Oggetto: ..." sulla prima riga. Se non
     arriva cosi' il testo non si butta: va tutto nel corpo e
     l'oggetto resta da scrivere, che e' visibile invece di essere
     sbagliato in silenzio. */
  const righe = testoIntero.split("\n");
  const prima = righe[0]?.trim() ?? "";
  const conOggetto = /^oggetto\s*:/i.test(prima);

  const uso = j?.usageMetadata ?? {};
  const tokenIn = Number(uso.promptTokenCount ?? 0);
  const tokenOut = Number(uso.candidatesTokenCount ?? 0);

  return {
    oggetto: conOggetto ? prima.replace(/^oggetto\s*:\s*/i, "").trim() : "",
    corpo: (conOggetto ? righe.slice(1).join("\n") : testoIntero).trim(),
    costo: COSTO_NOTO
      ? (tokenIn / 1_000_000) * COSTO_INGRESSO + (tokenOut / 1_000_000) * COSTO_USCITA
      : 0,
    tokenIn,
    tokenOut,
  };
}

async function firmaDi(mittenteId: string | null): Promise<string> {
  if (!mittenteId) return "QuotaFacile";
  const { data } = await db.from("mm_mittenti")
    .select("etichetta,from_nome").eq("id", mittenteId).maybeSingle();
  return data ? String(data.from_nome || data.etichetta || "QuotaFacile") : "QuotaFacile";
}

// ---------------- bozza ----------------
//
// Una bozza sola, che non viene salvata da nessuna parte: è la
// schermata «Email AI Writer», dove si prova un testo prima di
// decidere se diventa un modello.
//
// Stava in qf-mm e chiamava Anthropic. È venuta qui per una
// ragione sola: due fornitori di modelli per lo stesso lavoro
// vogliono due chiavi, due crediti da controllare e due righe
// nell'informativa. Il codice di qf-mm resta dov'è e non viene
// toccato — semplicemente non lo chiama più nessuno.

async function bozza(d: Record<string, unknown>) {
  const scopo = SCOPI[String(d.scopo)] ? String(d.scopo) : "presentazione";
  const tono = TONI[String(d.tono)] ? String(d.tono) : "cordiale";
  const istruzioni = testo(d.istruzioni, 1000);
  /* Solo se il browser lo chiede, e non «a meno che non dica no».
     Con il no implicito una pagina rimasta in cache — che quel
     campo non lo manda — avrebbe fatto leggere i siti mentre la
     sua finestra dichiarava il contrario. La spunta nasce accesa,
     ma è la pagina a dirlo: il server non lo dà per scontato. */
  const conSito = d.leggi_sito === true;

  let scheda =
    "Nessun destinatario specifico: scrivi un testo che vada bene per più aziende, usando i segnaposto.";
  let dallaHome: string | null = null;
  const leadId = testo(d.lead_id, 40);
  if (leadId) {
    const { data: l } = await db.from("crm_lead")
      .select(COLONNE_LEAD).eq("id", leadId).maybeSingle();
    if (!l) throw new ErroreCliente("Il lead indicato non esiste più.");
    /* Chi si è opposto non riceve messaggi, quindi non ha senso
       nemmeno scriverne uno: fermarsi qui evita di pagare una
       generazione che non si potrà usare. */
    if (l.no_contatto) {
      throw new ErroreCliente(`${l.nome} si è opposto a ricevere comunicazioni: non c'è niente da scrivere.`);
    }
    scheda = schedaDi(l);
    if (conSito && l.sito) dallaHome = await leggiSito(l.sito);
  }

  const firma = await firmaDi(testo(d.mittente_id, 40));

  const s = await scrivi(
    firma,
    `Scopo del messaggio: ${SCOPI[scopo]}.\n` +
    `Tono: ${TONI[tono]}.\n\n` +
    `Azienda destinataria:\n${scheda}\n` +
    (dallaHome ? `\nTesto della home del loro sito:\n«${dallaHome}»\n` : "") +
    (istruzioni ? `\nIndicazioni aggiuntive di chi firma: ${istruzioni}\n` : ""),
    !!dallaHome,
  );

  return {
    oggetto: s.oggetto,
    corpo: s.corpo,
    modello: modelloInUso,
    sitoLetto: !!dallaHome,
    token: { in: s.tokenIn, out: s.tokenOut },
    costoNoto: COSTO_NOTO,
    ...(COSTO_NOTO ? { costo: Number(s.costo.toFixed(5)) } : {}),
  };
}

// ---------------- genera ----------------
//
// QUANTI PER VOLTA, E PERCHÉ NON TUTTI
//
// Ogni bozza è una chiamata a pagamento che dura qualche secondo.
// Una lista da duecento aziende non sta in una richiesta HTTP, e
// provarci vorrebbe dire scoprirlo a metà: la funzione viene
// interrotta, qualche bozza è salvata, nessuno sa quante. Si
// lavora a blocchi, e si dice quanti restano — lo stesso patto
// che la coda di invio ha già con chi la guarda.
//
// QUATTRO MOTIVI PER SALTARE QUALCUNO, CONTATI SEPARATI
//
// Senza indirizzo, opposto, in blacklist, già contattato: sono
// problemi diversi e si rimediano in modi diversi. L'indirizzo
// si cerca, l'opposizione no.
//
// Con un lead solo il motivo è uno, e si dice al singolare
// invece di stampare «1 senza indirizzo».

const PER_BLOCCO = 12;
const PARALLELI = 3;

async function genera(d: Record<string, unknown>) {
  // Prima di toccare il database: se la chiave manca, dirlo
  // subito invece di dopo aver letto trecento righe.
  chiaveAi();

  /* Due strade, un solo corpo di funzione: una lista intera,
     oppure un lead singolo preso dalla sua scheda. Da lì in giù
     non cambia niente - gli stessi controlli, gli stessi motivi
     per saltare, lo stesso inserimento - perché "scrivine una"
     non è un caso particolare: è una lista di uno. */
  const leadId = testo(d.lead_id, 40);
  const listaId = leadId ? null : testo(d.lista_id, 40);
  if (!leadId && !listaId) throw new ErroreCliente("Scegli la lista da cui generare, oppure un lead.");

  const scopo = SCOPI[String(d.scopo)] ? String(d.scopo) : "presentazione";
  const tono = TONI[String(d.tono)] ? String(d.tono) : "cordiale";
  const istruzioni = testo(d.istruzioni, 1000);
  const mittenteId = testo(d.mittente_id, 40);
  const smtpId = testo(d.smtp_id, 40);
  const sovrascrivi = d.sovrascrivi === true;
  /* Solo se il browser lo chiede: vedi il commento in bozza().
     Quando il sito manca o non risponde, la bozza si scrive
     comunque con i soli cinque campi. */
  const conSito = d.leggi_sito === true;

  let ids: string[];
  if (leadId) {
    ids = [leadId];
  } else {
    const { data: dentro } = await db.from("mm_lista_lead")
      .select("lead_id").eq("lista_id", listaId);
    ids = (dentro ?? []).map((r: { lead_id: string }) => r.lead_id);
    if (!ids.length) throw new ErroreCliente("Questa lista è vuota.");
  }

  const { data: lead } = await db.from("crm_lead").select(COLONNE_LEAD).in("id", ids);
  if (leadId && !lead?.length) throw new ErroreCliente("Questo lead non esiste più.", 404);

  const [{ data: vietati }, { data: giaScritti }, { data: giaInBozza }] = await Promise.all([
    db.from("mm_blacklist").select("email"),
    db.from("mm_email").select("destinatario").eq("stato", "inviata"),
    /* Chi ha già una bozza non ancora partita: rigenerargliene
       un'altra sopra crea due messaggi per la stessa azienda, e
       il secondo non si distingue dal primo. */
    db.from("mm_email").select("id,lead_id").in("lead_id", ids)
      .not("stato", "in", "(inviata,fallita)"),
  ]);

  const nero = new Set((vietati ?? []).map((r: { email: string }) => r.email.toLowerCase()));
  const contattati = new Set((giaScritti ?? []).map((r: { destinatario: string }) => r.destinatario.toLowerCase()));
  const conBozza = new Map<string, string[]>();
  for (const r of (giaInBozza ?? []) as { id: string; lead_id: string }[]) {
    if (!r.lead_id) continue;
    conBozza.set(r.lead_id, [...(conBozza.get(r.lead_id) ?? []), r.id]);
  }

  const saltati = { senzaEmail: 0, opposti: 0, inBlacklist: 0, giaContattati: 0, giaScritti: 0 };
  const candidati: Record<string, unknown>[] = [];

  for (const l of (lead ?? []) as Record<string, unknown>[]) {
    const email = String(l.email ?? "").toLowerCase();
    if (!emailValida(email)) { saltati.senzaEmail++; continue; }
    if (l.no_contatto) { saltati.opposti++; continue; }
    if (nero.has(email)) { saltati.inBlacklist++; continue; }
    if (contattati.has(email)) { saltati.giaContattati++; continue; }
    if (!sovrascrivi && conBozza.has(String(l.id))) { saltati.giaScritti++; continue; }
    candidati.push({ ...l, email });
  }

  /* Con un lead solo i conteggi suonano sciocchi ("1 senza
     indirizzo"): il motivo è uno e si dice al singolare. */
  if (!candidati.length && leadId) {
    const n = (lead?.[0] as Record<string, unknown> | undefined)?.nome ?? "Questo lead";
    throw new ErroreCliente(
      saltati.senzaEmail
        ? `${n} non ha un indirizzo email: cercalo sul suo sito, oppure telefona.`
        : saltati.opposti
        ? `${n} si è opposto a ricevere comunicazioni: non c'è niente da scrivere.`
        : saltati.inBlacklist
        ? `L'indirizzo di ${n} è in blacklist.`
        : saltati.giaContattati
        ? `A ${n} è già partita un'email: se vuoi riscrivergli, parti da quella nel registro.`
        : `${n} ha già una bozza non spedita. Aprila in Email Ready, oppure spunta «rifai anche chi ha già una bozza».`,
    );
  }

  if (!candidati.length) {
    throw new ErroreCliente(
      "Non è rimasto nessuno a cui scrivere: " +
      [
        saltati.senzaEmail ? `${saltati.senzaEmail} senza indirizzo` : null,
        saltati.opposti ? `${saltati.opposti} si sono opposti` : null,
        saltati.inBlacklist ? `${saltati.inBlacklist} in blacklist` : null,
        saltati.giaContattati ? `${saltati.giaContattati} già contattati` : null,
        saltati.giaScritti ? `${saltati.giaScritti} hanno già una bozza (spunta «sovrascrivi» per rifarle)` : null,
      ].filter(Boolean).join(", ") + ".",
    );
  }

  /* OTTO INVECE DI DODICI QUANDO SI LEGGE IL SITO
   *
   * Leggere la home aggiunge fino a otto secondi per lead prima
   * della chiamata al modello. Con dodici lead su tre corsie il
   * caso peggiore sfiorava i tre minuti, che e' esattamente il
   * punto in cui il browser smette di aspettare - e chi preme si
   * ritrova una richiesta annullata mentre il server continua a
   * scrivere, cioe' il peggio dei due mondi. Con otto il caso
   * peggiore sta sotto i due minuti. */
  const perBlocco = conSito ? 8 : PER_BLOCCO;
  const blocco = candidati.slice(0, perBlocco);
  const restanti = candidati.length - blocco.length;
  const firma = await firmaDi(mittenteId);

  /* Se si sovrascrive, le bozze vecchie di questo blocco si
     tolgono adesso: farlo dopo lascerebbe due messaggi in piedi
     nel caso in cui la generazione finisca a metà. */
  if (sovrascrivi) {
    const daTogliere = blocco.flatMap((l) => conBozza.get(String(l.id)) ?? []);
    if (daTogliere.length) await db.from("mm_email").delete().in("id", daTogliere);
  }

  const righe: Record<string, unknown>[] = [];
  const falliti: { nome: string; motivo: string }[] = [];
  let costo = 0;
  let tokenIn = 0;
  let tokenOut = 0;
  let sitiLetti = 0;
  let sitiMuti = 0;

  let i = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLELI, blocco.length) }, async () => {
    while (i < blocco.length) {
      const l = blocco[i++];
      /* La home si legge dentro il ciclo, non prima: cosi' le tre
         corsie in parallelo leggono tre siti diversi mentre le
         altre aspettano il modello, invece di fare dodici
         richieste in fila prima di cominciare. */
      const dallaHome = conSito && l.sito ? await leggiSito(l.sito) : null;
      if (conSito && l.sito) { if (dallaHome) sitiLetti++; else sitiMuti++; }
      const richiesta =
        `Scopo del messaggio: ${SCOPI[scopo]}.\n` +
        `Tono: ${TONI[tono]}.\n\n` +
        `Azienda destinataria:\n${schedaDi(l)}\n` +
        (dallaHome ? `\nTesto della home del loro sito:\n«${dallaHome}»\n` : "") +
        (istruzioni ? `\nIndicazioni aggiuntive di chi firma: ${istruzioni}\n` : "");
      try {
        const s = await scrivi(firma, richiesta, !!dallaHome);
        costo += s.costo;
        tokenIn += s.tokenIn;
        tokenOut += s.tokenOut;
        righe.push({
          mittente_id: mittenteId,
          smtp_id: smtpId,
          lead_id: l.id,
          destinatario: l.email,
          oggetto: s.oggetto || "(oggetto da scrivere)",
          corpo: s.corpo,
          stato: "bozza",
          meta: {
            origine: "ai",
            scopo,
            tono,
            modello: modelloInUso,
            /* Che questa bozza sia stata scritta leggendo la home
               resta scritto: se fra un mese qualcuno chiede perche'
               l'email nominava un loro servizio, la risposta e' qui.
               Il testo della pagina no - non si conserva. */
            sito_letto: !!dallaHome,
            token: { in: s.tokenIn, out: s.tokenOut },
            ...(COSTO_NOTO ? { costo: Number(s.costo.toFixed(5)) } : {}),
          },
        });
      } catch (e) {
        /* Un lead che fallisce non ferma gli altri undici: il suo
           nome torna indietro, così si sa chi riprovare. */
        falliti.push({ nome: String(l.nome), motivo: e instanceof Error ? e.message : "errore sconosciuto" });
      }
    }
  }));

  if (righe.length) {
    const { error } = await db.from("mm_email").insert(righe);
    if (error) throw new Error(error.message);
  }

  /* Il costo si restituisce solo se i due prezzi sono configurati:
     altrimenti sarebbe una cifra inventata. I token invece sono
     misurati da Google, e quelli si possono mostrare sempre. */
  return {
    creati: righe.length,
    falliti,
    saltati,
    restanti,
    perBlocco,
    modello: modelloInUso,
    /* Quanti siti si sono fatti leggere e quanti no: un sito che
       non risponde non e' un errore della generazione, ma sapere
       che otto bozze su dodici sono generiche cambia se le mandi
       cosi' o se le ritocchi. */
    siti: { letti: sitiLetti, muti: sitiMuti },
    token: { in: tokenIn, out: tokenOut },
    costoNoto: COSTO_NOTO,
    ...(COSTO_NOTO ? { costo: Number(costo.toFixed(4)) } : {}),
  };
}

// ---------------- rigenera ----------------
//
// Il messaggio che c'è viene riscritto con un'indicazione in più.
// Il testo precedente parte verso il modello: è quello che si sta
// chiedendo di correggere, e senza di esso "più corta" non
// significa niente.
//
// SE ERA IN CODA, ESCE DALLA CODA
// Riscrivere un messaggio programmato e lasciarlo programmato
// vorrebbe dire far partire da solo, all'ora stabilita, un testo
// che nessuno ha ancora letto. Torna "pronta" e la data si
// cancella: si riprogramma dopo averlo guardato.

async function rigenera(d: Record<string, unknown>) {
  chiaveAi();

  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo del messaggio.");

  const chiave = String(d.ritocco ?? "naturale");
  const ritocco = RITOCCHI[chiave];
  if (!ritocco) {
    throw new ErroreCliente(
      `Ritocco non riconosciuto. Quelli possibili: ${Object.keys(RITOCCHI).join(", ")}.`,
    );
  }

  const { data: m } = await db.from("mm_email")
    .select("id,lead_id,mittente_id,oggetto,corpo,stato,meta")
    .eq("id", id).maybeSingle();
  if (!m) throw new ErroreCliente("Questo messaggio non esiste più.", 404);
  if (m.stato === "inviata") {
    throw new ErroreCliente("Questo messaggio è già partito: il testo che è uscito non si riscrive.");
  }

  let scheda = "Nessun destinatario specifico.";
  if (m.lead_id) {
    const { data: l } = await db.from("crm_lead")
      .select(COLONNE_LEAD).eq("id", m.lead_id).maybeSingle();
    if (l) {
      if (l.no_contatto) {
        throw new ErroreCliente(
          `${l.nome} si è opposto a ricevere comunicazioni: non c'è motivo di riscrivere questo messaggio.`,
        );
      }
      scheda = schedaDi(l);
    }
  }

  const meta = (m.meta ?? {}) as Record<string, unknown>;
  const scopo = SCOPI[String(meta.scopo)] ? String(meta.scopo) : "presentazione";
  const tono = TONI[String(meta.tono)] ? String(meta.tono) : "cordiale";
  const firma = await firmaDi(m.mittente_id ? String(m.mittente_id) : null);

  const richiesta =
    `Scopo del messaggio: ${SCOPI[scopo]}.\n` +
    `Tono: ${TONI[tono]}.\n\n` +
    `Azienda destinataria:\n${scheda}\n\n` +
    `Questa è la versione attuale del messaggio:\n` +
    `Oggetto: ${m.oggetto}\n\n${m.corpo}\n\n` +
    `Riscrivila ${ritocco}. Mantieni lo stesso scopo e le stesse regole.`;

  const s = await scrivi(firma, richiesta);

  const eraInCoda = m.stato === "in_coda";
  const { error } = await db.from("mm_email").update({
    oggetto: s.oggetto || m.oggetto,
    corpo: s.corpo,
    modificata: true,
    ...(eraInCoda ? { stato: "pronta", programmata_per: null } : {}),
    meta: {
      ...meta,
      origine: "ai",
      scopo,
      tono,
      modello: modelloInUso,
      ritocco: chiave,
      token: { in: s.tokenIn, out: s.tokenOut },
      ...(COSTO_NOTO ? { costo: Number(s.costo.toFixed(5)) } : {}),
    },
  }).eq("id", id);
  if (error) throw new Error(error.message);

  return {
    id,
    oggetto: s.oggetto || m.oggetto,
    corpo: s.corpo,
    modello: modelloInUso,
    token: { in: s.tokenIn, out: s.tokenOut },
    costoNoto: COSTO_NOTO,
    ...(COSTO_NOTO ? { costo: Number(s.costo.toFixed(5)) } : {}),
    uscitaDallaCoda: eraInCoda,
  };
}

// ---------------- Instradamento ----------------

const AZIONI: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
  bozza,
  genera,
  rigenera,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return rispondi({ ok: false, errore: "Metodo non consentito" }, 405);

  const atteso = await improntaAttesa();
  if (!atteso) {
    return rispondi({
      ok: false,
      errore: "Modulo non attivo: nessuna chiave di amministrazione configurata.",
      configurazioneMancante: true,
    }, 503);
  }
  const fornita = req.headers.get("x-qf-admin");
  if (!fornita || !uguali(await impronta(fornita), atteso)) {
    return rispondi({ ok: false, errore: "Chiave di amministrazione errata" }, 401);
  }

  try {
    const body = await req.json();
    const azione = AZIONI[String(body?.azione ?? "")];
    if (!azione) return rispondi({ ok: false, errore: "Azione non riconosciuta" }, 400);
    return rispondi({ ok: true, ...(await azione(body.dati ?? {}) as object) });
  } catch (e) {
    if (e instanceof ErroreCliente) {
      console.warn("[qf-mm-ai] rifiutata:", e.status, "-", e.message);
      return rispondi({ ok: false, errore: e.message, configurazione: e.status === 503 }, e.status);
    }
    console.error("[qf-mm-ai]", e);
    return rispondi({ ok: false, errore: e instanceof Error ? e.message : "Errore imprevisto" }, 500);
  }
});
