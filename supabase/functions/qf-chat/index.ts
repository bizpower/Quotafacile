// ============================================================
// QuotaFacile — Assistente del CRM
// ------------------------------------------------------------
// Salvare un lead o creare una lista parlando, invece di
// compilare un modulo. Dietro c'è un modello linguistico
// (Gemini), ma il modo in cui è messo in mezzo conta più del
// modello stesso.
//
// IL MODELLO SCEGLIE LO STRUMENTO, IL SERVER LO USA
// Al modello arriva una cosa sola: la frase che l'operatore ha
// scritto o dettato. Non l'archivio, non i lead, non le liste,
// non le email dei clienti. Il suo compito è scegliere uno
// strumento fra quelli dichiarati e riempirne gli argomenti.
//
// La scelta torna qui e viene ricontrollata da capo: strumento
// nell'elenco dichiarato — un nome inventato non esiste — campi
// ripuliti, email validata, lunghezze tagliate. Poi è questa
// funzione a leggere e a scrivere sul database, con il ruolo di
// servizio, e a comporre la risposta che l'operatore legge — dal
// risultato vero, non da ciò che il modello dice di aver fatto.
// Un modello che allucina "hai 400 lead a Milano" qui non riesce
// a farlo comparire: quel numero lo scrive il server dopo aver
// contato, e al modello non torna indietro niente.
//
// Gli strumenti sono di due razze. Quelli di LETTURA si eseguono
// subito. Quelli di SCRITTURA non si eseguono affatto: diventano
// una proposta con i campi in chiaro, e la scrittura avviene solo
// dopo che qualcuno ha premuto Conferma.
//
// Questo risolve anche la domanda che conta: manipolando il
// frontend non si arriva ai dati del CRM, perché il frontend non
// ha mai in mano nulla che il modello possa ampliare. E il
// modello non ha una connessione al database da cui tirare
// fuori qualcosa che non gli è stato dato.
//
// DUE PASSAGGI, NON UNO
// "interpreta" propone, "esegui" scrive. In mezzo c'è un
// bottone. Serve perché il dettato sbaglia i nomi propri più
// spesso di quanto si creda — "Rossi" e "Grossi", "Bianchi" e
// "Bianco" — e una scrittura silenziosa partita da una frase
// capita male sporca l'archivio senza che nessuno se ne accorga.
// "esegui" non chiama affatto il modello: è una scrittura
// normale, validata. Se la chiave di Gemini manca o è scaduta,
// la conferma di una proposta già fatta funziona lo stesso.
//
// COSA ESCE DA QUI
// La frase dell'operatore va a Google. Se contiene il nome e
// l'email di una persona, quel nome e quell'email vanno a
// Google. Non c'è modo di evitarlo e non va nascosto: la
// schermata lo dice, e va detto anche nell'informativa.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qf-admin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;

const db = createClient(
  URL_SUPABASE,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const rispondi = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const testo = (v: unknown, max = 300) =>
  v === undefined || v === null ? null : String(v).trim().slice(0, max) || null;

const emailValida = (v: string | null) =>
  !!v && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v);

// ---------------- Accesso ----------------

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

// La chiave sta in un posto solo, e si rilegge a ogni richiesta.
//
// Prima ce n'erano due: il segreto QF_ADMIN_TOKEN vinceva sul
// database, cambiare l'impronta non aveva alcun effetto finche'
// il segreto esisteva, e il segreto non e' leggibile da nessuna
// schermata dell'applicazione. Ora la fonte e' una sola:
// l'impronta SHA-256 in impostazioni_admin.
//
// E non viene tenuta in memoria fra una richiesta e l'altra.
// Costa la lettura di una riga su chiave primaria - niente,
// accanto a quello che la funzione fa comunque - e in cambio un
// cambio di chiave vale subito, dappertutto. Con la copia in
// memoria un'istanza gia' avviata avrebbe continuato ad
// accettare la chiave vecchia finche' non veniva spenta: e'
// esattamente il "quale delle due e' attiva?" che si voleva
// togliere di mezzo.
//
// Nel database resta soltanto l'impronta: la frase non e'
// conservata da nessuna parte e non e' recuperabile. Si cambia
// dalla console, oppure a mano:
//
//   update impostazioni_admin
//      set token_hash = encode(digest('nuova-frase','sha256'),'hex'),
//          aggiornato_il = now()
//    where id = 1;
async function improntaAttesa(): Promise<string | null> {
  const { data } = await db.from("impostazioni_admin")
    .select("token_hash").eq("id", 1).maybeSingle();
  return data?.token_hash ?? null;
}

// ---------------- Il modello ----------------
//
// PERCHE' IL NOME NON E' SOLO UNA COSTANTE
//
// Qui c'era "gemini-2.0-flash", scritto una volta e dato per
// buono. Google l'ha ritirato il primo giugno 2026, e da quel
// giorno ogni richiesta tornava 404. A schermo si leggeva "il
// servizio di Google ha risposto con un errore (404)", che non
// dice niente a nessuno: sembrava la chiave, ed era il nome.
//
// I nomi dei modelli scadono, e scadono con un 404 secco. Quindi
// non si rimette un altro nome destinato a scadere e si aspetta:
// se il nome in uso non esiste piu', la funzione chiede a Google
// l'elenco dei modelli disponibili, ne sceglie uno adatto e
// riprova una volta sola. La scelta resta in memoria per le
// richieste successive della stessa istanza.
//
// L'ordine di preferenza: un "flash" non-lite col numero di
// versione piu' alto, poi un "flash" qualsiasi, poi qualunque
// modello che sappia generateContent. Serve un modello veloce e
// capace di function calling, non il piu' potente: qui si traduce
// una frase in un comando.
//
// QF_GEMINI_MODELLO continua a scavalcare tutto, per poter fissare
// un nome preciso senza ripubblicare la funzione.

const MODELLO_SCELTO = Deno.env.get("QF_GEMINI_MODELLO") || "";
const MODELLO_PREDEFINITO = "gemini-3.5-flash";

// Il nome in uso adesso. Parte dal segreto, o dal predefinito, e
// cambia solo se Google dice che quel modello non esiste.
let modelloInUso = MODELLO_SCELTO || MODELLO_PREDEFINITO;

// Da "models/gemini-3.8-flash" a 3.8, per poter confrontare.
function versioneDi(nome: string): number {
  const m = nome.match(/gemini-(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  return Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0);
}

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

// ---------------- Gli strumenti ----------------
//
// Il modello non sceglie piu' fra tre comandi scritti in un
// elenco: sceglie uno strumento e ne riempie gli argomenti. Il
// vocabolario si allarga aggiungendo una voce qui sotto e la sua
// esecuzione piu' in basso, senza toccare il resto.
//
// Gli strumenti sono di due razze, e la differenza e' la sola
// cosa che conta per la sicurezza:
//
//   LETTURA  - si eseguono subito e il risultato va a schermo.
//              Al modello non torna indietro NIENTE: la frase
//              che l'operatore legge la compone questa funzione
//              con i dati veri. Un modello che inventasse
//              "hai 400 lead a Milano" non riuscirebbe a farlo
//              comparire, perche' quel numero lo scrive il
//              server dopo aver contato.
//
//   SCRITTURA - non si eseguono affatto. Diventano una proposta
//              con i campi in chiaro, e la scrittura avviene in
//              "esegui" solo dopo che qualcuno ha premuto
//              Conferma. "esegui" il modello non lo chiama
//              nemmeno.

// Le categorie che il lead finder sa cercare. Sono le stesse di
// qf-lead: se il modello ne inventa una, qf-lead la scarta e la
// ricerca parte senza. Stando nell'enum il modello e' costretto a
// tradurre "ristoranti" in "ristorazione" invece di provarci.
const CHIAVI_CATEGORIE = [
  "ristorazione", "bar", "hotel", "cantine", "enoteche", "agriturismi",
  "officine", "concessionarie", "edilizia", "impiantisti", "studi",
  "avvocati", "medici", "palestre", "parrucchieri", "negozi",
  "supermercati", "trasporti", "agenzie_immobiliari", "assicurazioni",
];

const STRUMENTI = [
  {
    name: "vai",
    description:
      "Porta l'operatore a una schermata dell'area riservata. Da usare quando chiede di " +
      "aprire, vedere o andare in una sezione.",
    parameters: {
      type: "OBJECT",
      properties: {
        dove: {
          type: "STRING",
          description: "La schermata di destinazione.",
          enum: [
            "panoramica", "collaboratori", "lead", "posta", "produzione", "magazine",
            "mm-dashboard", "mm-lead-finder", "mm-liste", "mm-campagne", "mm-pronte",
            "mm-ai-writer", "mm-modelli", "mm-smtp", "mm-registro", "mm-automazioni",
            "mm-blacklist",
          ],
        },
      },
      required: ["dove"],
    },
  },
  {
    name: "riepilogo",
    description:
      "Quanti contatti, liste, campagne, email in coda e collaboratori ci sono. " +
      "Da usare per domande come «a che punto siamo», «quanti lead ho», «quante liste».",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "elenca",
    description: "Elenca le liste, le campagne, i modelli email o i collaboratori.",
    parameters: {
      type: "OBJECT",
      properties: {
        cosa: { type: "STRING", enum: ["liste", "campagne", "modelli", "collaboratori"] },
      },
      required: ["cosa"],
    },
  },
  {
    name: "trova_contatto",
    description:
      "Cerca nell'archivio i contatti il cui nome o email somiglia al testo dato. " +
      "Serve a ritrovare qualcuno, non a cercarne di nuovi su Google.",
    parameters: {
      type: "OBJECT",
      properties: { testo: { type: "STRING", description: "Nome o email, anche parziale." } },
      required: ["testo"],
    },
  },
  {
    name: "comuni",
    description:
      "I comuni di una provincia italiana, con il CAP. Da usare quando l'operatore nomina " +
      "una provincia o una regione e serve sapere dove cercare, oppure quando chiede " +
      "consiglio su quali comuni battere.",
    parameters: {
      type: "OBJECT",
      properties: {
        provincia: {
          type: "STRING",
          description: "Sigla (MI, MB, TO) o nome per esteso (Milano, Monza e della Brianza).",
        },
        regione: {
          type: "STRING",
          description: "Nome della regione, se l'operatore ha nominato quella invece di una provincia.",
        },
      },
    },
  },
  {
    name: "cerca_lead",
    description:
      "Cerca attivita' su Google in una zona, per categoria. Read-only: mostra solo " +
      "un'anteprima di cosa si trova, non salva niente. Da usare quando l'operatore " +
      "vuole vedere prima, o non ha detto come chiamare la lista.",
    parameters: {
      type: "OBJECT",
      properties: {
        categorie: {
          type: "ARRAY",
          items: { type: "STRING", enum: CHIAVI_CATEGORIE },
          description: "Da una a quattro categorie.",
        },
        zona: {
          type: "STRING",
          description: "Dove cercare, come lo direbbe una persona: 'Opera, Milano', " +
            "'20900', 'via Dante 10 Monza'. Un comune preciso vale piu' di una provincia.",
        },
        raggio: { type: "NUMBER", description: "Metri: 500, 1000, 2000, 5000 o 10000. Predefinito 2000." },
        soloConEmail: { type: "BOOLEAN", description: "Solo attivita' con un'email pubblicata sul loro sito." },
        soloQualita: { type: "BOOLEAN", description: "Solo con valutazione almeno 3,5 e almeno 5 recensioni." },
        massimo: { type: "NUMBER", description: "Quante al massimo, fino a 50." },
      },
      required: ["categorie", "zona"],
    },
  },
  {
    name: "cerca_e_salva",
    description:
      "Cerca attivita' su Google, crea una lista e ci mette dentro quello che trova, " +
      "in un colpo solo. Non esegue: prepara una proposta da confermare. " +
      "Se l'operatore non dice come chiamare la lista, lasciala vuota: la propone il server.",
    parameters: {
      type: "OBJECT",
      properties: {
        categorie: {
          type: "ARRAY",
          items: { type: "STRING", enum: CHIAVI_CATEGORIE },
          description: "Da una a quattro categorie.",
        },
        zona: { type: "STRING", description: "Dove cercare. Un comune preciso vale piu' di una provincia." },
        raggio: { type: "NUMBER", description: "Metri: 500, 1000, 2000, 5000 o 10000. Predefinito 2000." },
        soloConEmail: { type: "BOOLEAN", description: "Solo attivita' con un'email pubblicata sul loro sito." },
        soloQualita: { type: "BOOLEAN", description: "Solo con valutazione almeno 3,5 e almeno 5 recensioni." },
        massimo: { type: "NUMBER", description: "Quante al massimo, fino a 50." },
        nomeLista: { type: "STRING", description: "Come chiamare la lista, se l'operatore lo dice." },
      },
      required: ["categorie", "zona"],
    },
  },
  {
    name: "aggiorna_contatto",
    description:
      "Cambia lo stato di un contatto in archivio, a chi e' assegnato, o le sue note. " +
      "Non esegue: prepara una proposta da confermare.",
    parameters: {
      type: "OBJECT",
      properties: {
        contatto: { type: "STRING", description: "Nome o email del contatto. Vuoto se la frase dice «lui», «questo», «l'ultimo»." },
        stato: {
          type: "STRING",
          enum: ["nuovo", "contattato", "in_trattativa", "cliente", "scartato"],
          description: "Il nuovo stato, se la frase lo dice.",
        },
        assegnatario: { type: "STRING", description: "Nome del collaboratore a cui assegnarlo." },
        note: { type: "STRING", description: "Note da scrivere sulla scheda." },
      },
    },
  },
  {
    name: "opposizione_contatto",
    description:
      "Registra che un'azienda si e' opposta a ricevere comunicazioni (art. 21 GDPR), " +
      "oppure toglie l'opposizione. Da quel momento il server rifiuta l'invio. " +
      "Non esegue: prepara una proposta da confermare.",
    parameters: {
      type: "OBJECT",
      properties: {
        contatto: { type: "STRING", description: "Nome o email del contatto." },
        attivo: { type: "BOOLEAN", description: "true per registrare l'opposizione, false per toglierla." },
        motivo: { type: "STRING", description: "Come si e' opposto, se la frase lo dice: telefonata, email, PEC." },
      },
      required: ["contatto"],
    },
  },
  {
    name: "elimina_contatto",
    description:
      "Cancella un contatto dall'archivio. Non esegue: prepara una proposta da confermare. " +
      "Se l'azienda ha solo chiesto di non essere contattata usa opposizione_contatto, " +
      "che e' la cosa giusta: cancellarla la farebbe ritrovare alla prossima ricerca.",
    parameters: {
      type: "OBJECT",
      properties: { contatto: { type: "STRING", description: "Nome o email del contatto." } },
      required: ["contatto"],
    },
  },
  {
    name: "collaboratore",
    description:
      "Gestisce i collaboratori della societa': aggiungerne uno, disattivarlo o " +
      "riattivarlo, dargli un accesso, rigenerare la sua password, togliergli " +
      "l'accesso. Non esegue: prepara una proposta da confermare.",
    parameters: {
      type: "OBJECT",
      properties: {
        azione: {
          type: "STRING",
          enum: ["aggiungi", "attiva", "disattiva", "crea-accesso", "rigenera-password", "revoca-accesso"],
        },
        chi: { type: "STRING", description: "Nome o email del collaboratore. Non serve per «aggiungi»." },
        nome: { type: "STRING", description: "Solo per «aggiungi»: nome e cognome." },
        email: { type: "STRING", description: "Solo per «aggiungi»." },
        ruolo: {
          type: "STRING",
          enum: ["titolare", "direttore", "account", "commerciale", "consulente"],
          description: "Solo per «aggiungi». Predefinito commerciale.",
        },
        telefono: { type: "STRING", description: "Solo per «aggiungi»." },
      },
      required: ["azione"],
    },
  },
  {
    name: "salva_contatto",
    description:
      "Registra un nuovo contatto in archivio. Non esegue: prepara una proposta da confermare.",
    parameters: {
      type: "OBJECT",
      properties: {
        nome: { type: "STRING" },
        email: { type: "STRING" },
        telefono: { type: "STRING" },
        citta: { type: "STRING" },
        provincia: { type: "STRING" },
        categoria: { type: "STRING" },
        note: { type: "STRING" },
      },
      required: ["nome"],
    },
  },
  {
    name: "crea_lista",
    description:
      "Crea una nuova lista per le campagne email. Non esegue: prepara una proposta da confermare.",
    parameters: {
      type: "OBJECT",
      properties: { nome: { type: "STRING" }, descrizione: { type: "STRING" } },
      required: ["nome"],
    },
  },
  {
    name: "aggiungi_a_lista",
    description:
      "Mette un contatto gia' in archivio dentro una lista che esiste gia'. " +
      "Non esegue: prepara una proposta da confermare.",
    parameters: {
      type: "OBJECT",
      properties: {
        contatto: {
          type: "STRING",
          description: "Nome o email del contatto. Lascialo vuoto se la frase dice «lui», «questo», «l'ultimo».",
        },
        lista: { type: "STRING", description: "Nome della lista." },
      },
      required: ["lista"],
    },
  },
];

const ISTRUZIONI = `Sei l'assistente dell'area riservata di QuotaFacile, usata da chi
lavora in Bizpower. Parli italiano, in modo breve e concreto.

Hai degli strumenti. Per fare qualcosa chiama lo strumento giusto:
non descrivere a parole l'azione, chiamala.

Regole che non puoi violare:

1. NON INVENTARE NULLA. Un argomento che la frase non dice resta
   vuoto. Non dedurre la citta' dal prefisso telefonico, non
   costruire un'email dal nome, non immaginare una categoria. Un
   campo vuoto e' corretto; un campo inventato e' un danno.

2. NON INVENTARE NUMERI NE' ELENCHI. Non sai quanti contatti ci
   sono, non sai come si chiamano le liste, non hai l'archivio.
   Se te lo chiedono, chiama lo strumento: la risposta la scrive
   il server con i dati veri. Se rispondi a memoria, menti.

3. Riporta i valori come sono stati detti, correggendo solo le
   maiuscole dei nomi propri e togliendo gli spazi negli indirizzi
   email dettati a voce ("mario chiocciola rossi punto it" ->
   "mario@rossi.it").

4. NON INVII MAI EMAIL, e non esiste uno strumento per farlo.
   Puoi preparare e correggere, ma la partenza e' un gesto di una
   persona. Se te lo chiedono, dillo in una riga.

5. Se la frase chiede un'altra cosa che nessuno strumento sa fare,
   dillo in una riga invece di chiamare uno strumento a caso.

6. Non salutare, non ringraziare, non commentare. Una riga.`;

// Che cosa il modello ha deciso di chiamare. Torna il nome dello
// strumento e i suoi argomenti, oppure il testo se ha preferito
// rispondere a parole.
type Mossa = { strumento: string | null; argomenti: Record<string, unknown>; testo: string };

async function interroga(frase: string): Promise<Mossa> {
  const chiave = Deno.env.get("QF_GEMINI_KEY");
  if (!chiave) {
    const e = new Error(
      "L'assistente non ha una chiave: va creata su Google AI Studio " +
        "(aistudio.google.com/apikey, gratuita) e messa fra i segreti " +
        "del progetto Supabase con il nome QF_GEMINI_KEY.",
    );
    (e as Error & { configurazione?: boolean }).configurazione = true;
    throw e;
  }

  const corpo = JSON.stringify({
    systemInstruction: { parts: [{ text: ISTRUZIONI }] },
    contents: [{ role: "user", parts: [{ text: frase }] }],
    tools: [{ functionDeclarations: STRUMENTI }],
    // AUTO e non ANY: deve poter rispondere "questo non so
    // farlo" invece di essere costretto a chiamare lo
    // strumento meno sbagliato fra quelli che ha.
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    // temperatura 0: qui non si vuole fantasia, si vuole
    // che la stessa frase produca sempre lo stesso comando
    generationConfig: { temperature: 0, maxOutputTokens: 500 },
  });

  const chiedi = async (modello: string) => {
    try {
      return await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modello}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": chiave },
          signal: AbortSignal.timeout(20000),
          body: corpo,
        },
      );
    } catch {
      throw new Error("Il servizio di Google non ha risposto in tempo. Riprova fra poco.");
    }
  };

  let r = await chiedi(modelloInUso);

  /* 404 vuol dire "quel modello non esiste (piu')", non "chiave
     sbagliata". Succede quando Google ritira un nome, e succede
     senza preavviso utile: si chiede l'elenco, si prende il
     migliore e si riprova una volta. Se il nome e' stato fissato
     a mano con QF_GEMINI_MODELLO non si cambia di nascosto -
     quella e' una scelta di chi l'ha scritta, e va detto che non
     vale piu'. */
  if (r.status === 404 && !MODELLO_SCELTO) {
    const altro = await scegliModello(chiave);
    if (altro && altro !== modelloInUso) {
      console.warn("[qf-chat] modello", modelloInUso, "non disponibile: passo a", altro);
      modelloInUso = altro;
      r = await chiedi(modelloInUso);
    }
  }

  if (r.status === 429) {
    throw new Error(
      "Hai superato il limite gratuito di Google per oggi. L'assistente torna " +
        "disponibile domani, oppure serve un piano a pagamento su AI Studio.",
    );
  }
  if (r.status === 400 || r.status === 403) {
    throw new Error("Google ha rifiutato la chiave QF_GEMINI_KEY: controlla che sia valida e attiva.");
  }

  /* Quello che Google ha scritto, non un numero.
     Prima qui c'era "ha risposto con un errore (404)", e per mesi
     quel 404 ha significato "il modello e' stato ritirato" senza
     che la frase lo dicesse: si e' cercato il guasto nella chiave,
     che era giusta. Il messaggio di Google lo diceva, e veniva
     buttato via. */
  if (!r.ok) {
    const e = await r.json().catch(() => null);
    const messaggio = e?.error?.message || null;
    if (r.status === 404) {
      console.error("[qf-chat] modello non trovato:", modelloInUso, "-", messaggio || "(nessun messaggio)");
      throw new Error(
        "Il modello «" + modelloInUso + "» non è disponibile su questa chiave" +
          (MODELLO_SCELTO
            ? ": è il nome fissato nel segreto QF_GEMINI_MODELLO, che va aggiornato o rimosso."
            : ", e non ne ho trovato un altro adatto.") +
          (messaggio ? " Google dice: " + messaggio : ""),
      );
    }
    console.error("[qf-chat] Google ha risposto", r.status, "-", messaggio || "(nessun messaggio)");
    throw new Error("Il servizio di Google ha risposto con un errore (" + r.status + ")" +
      (messaggio ? ": " + messaggio : "."));
  }

  const j = await r.json().catch(() => null);
  const parti = j?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parti)) {
    throw new Error("Il servizio di Google ha risposto in un modo che non so leggere.");
  }

  const chiamata = parti.find((x: Record<string, unknown>) => x?.functionCall)?.functionCall;
  const testo = parti.map((x: Record<string, unknown>) => x?.text ?? "").join(" ").trim();

  // Uno strumento che non e' nell'elenco non esiste: il modello
  // puo' scrivere qualunque nome, qui vale solo quello dichiarato.
  const nome = chiamata?.name ?? null;
  const valido = STRUMENTI.some((s) => s.name === nome);

  return {
    strumento: valido ? nome : null,
    argomenti: (chiamata?.args ?? {}) as Record<string, unknown>,
    testo,
  };
}

// ---------------- I comuni ----------------
// Il file sta nel sito, non qui: e' lo stesso che carica il lead
// finder, e duplicarlo vorrebbe dire tenerne allineate due copie.
// Si scarica una volta per istanza e resta in memoria.

type Comuni = {
  regioni: Record<string, string[]>;
  province: Record<string, { nome: string; regione: string }>;
  comuni: Record<string, [string, string][]>;
};

let comuniInCorso: Promise<Comuni | null> | null = null;

function caricaComuni(): Promise<Comuni | null> {
  if (comuniInCorso) return comuniInCorso;
  comuniInCorso = fetch("https://www.quotafacile.net/assets/data/comuni.json", {
    signal: AbortSignal.timeout(8000),
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((d) => {
      // Se non si e' caricato non si tiene la promessa fallita:
      // il prossimo tentativo deve poter riprovare.
      if (!d) comuniInCorso = null;
      return d as Comuni | null;
    });
  return comuniInCorso;
}

// La sigla di una provincia, da una sigla o da un nome per
// esteso. "Monza" e "Monza e della Brianza" devono arrivare
// nello stesso posto.
function siglaProvincia(c: Comuni, detto: string): string | null {
  const q = detto.trim().toLowerCase();
  if (!q) return null;
  if (c.province[q.toUpperCase()]) return q.toUpperCase();
  const voci = Object.entries(c.province);
  const esatta = voci.find(([, v]) => v.nome.toLowerCase() === q);
  if (esatta) return esatta[0];
  const parziale = voci.find(([, v]) => v.nome.toLowerCase().startsWith(q) || q.startsWith(v.nome.toLowerCase()));
  return parziale ? parziale[0] : null;
}

// ---------------- Ricerca nell'archivio ----------------
// Serve solo a risolvere un nome detto a voce in una riga vera.
// Quello che trova non torna mai al modello: resta fra il server
// e la schermata di chi ha gia' la chiave di amministrazione.

// I filtri di PostgREST si scrivono dentro una stringa separata
// da virgole: una virgola o una parentesi nel testo cercato
// cambierebbero il significato del filtro, non il risultato
// della ricerca.
const perFiltro = (s: string) => s.replace(/[,()*%\\]/g, " ").trim();

async function cercaLead(q: string) {
  const p = perFiltro(q);
  if (p.length < 2) return [];
  const { data } = await db.from("crm_lead")
    .select("id, nome, email, citta")
    .or(`nome.ilike.%${p}%,email.ilike.%${p}%`)
    .order("creato_il", { ascending: false })
    .limit(6);
  return data ?? [];
}

async function cercaListe(q: string) {
  const p = perFiltro(q);
  if (p.length < 2) return [];
  const { data } = await db.from("mm_liste")
    .select("id, nome")
    .ilike("nome", `%${p}%`)
    .limit(6);
  return data ?? [];
}

// ---------------- Gli strumenti di lettura ----------------
// Si eseguono qui, con il ruolo di servizio, e quello che
// trovano non torna mai al modello.

const ROTTE: Record<string, [string, string]> = {
  panoramica:     ["#/admin/crm",                      "la panoramica del CRM"],
  collaboratori:  ["#/admin/crm/collaboratori",        "i collaboratori"],
  lead:           ["#/admin/crm/lead",                 "i lead locali"],
  posta:          ["#/admin/crm/posta",                "la posta"],
  produzione:     ["#/admin/crm/produzione",           "la produzione"],
  magazine:       ["#/admin/crm/magazine",             "il Magazine"],
  "mm-dashboard":   ["#/admin/crm/mail/dashboard",     "la dashboard del Mail Marketing"],
  "mm-lead-finder": ["#/admin/crm/mail/lead-finder",   "il Lead Finder"],
  "mm-liste":       ["#/admin/crm/mail/liste",         "le Lead Lists"],
  "mm-campagne":    ["#/admin/crm/mail/campagne",      "le campagne"],
  "mm-pronte":      ["#/admin/crm/mail/pronte",        "Email Ready"],
  "mm-ai-writer":   ["#/admin/crm/mail/ai-writer",     "l'Email AI Writer"],
  "mm-modelli":     ["#/admin/crm/mail/modelli",       "i modelli"],
  "mm-smtp":        ["#/admin/crm/mail/smtp",          "SMTP e invio"],
  "mm-registro":    ["#/admin/crm/mail/registro",      "il registro degli invii"],
  "mm-automazioni": ["#/admin/crm/mail/automazioni",   "le automazioni"],
  "mm-blacklist":   ["#/admin/crm/mail/blacklist",     "la blacklist"],
};

async function strumentoVai(a: Record<string, unknown>) {
  const r = ROTTE[String(a.dove ?? "")];
  if (!r) return { messaggio: "Non so dove andare: quella schermata non esiste." };
  return { messaggio: `Apro ${r[1]}.`, vai: r[0] };
}

async function strumentoRiepilogo() {
  const conta = async (tabella: string, filtro?: [string, string | boolean]) => {
    let q = db.from(tabella).select("id", { count: "exact", head: true });
    if (filtro) q = q.eq(filtro[0], filtro[1]);
    const { count } = await q;
    return count ?? 0;
  };
  const [lead, conEmail, liste, campagne, inCoda, collaboratori] = await Promise.all([
    conta("crm_lead"),
    db.from("crm_lead").select("id", { count: "exact", head: true })
      .not("email", "is", null).then((x: { count: number | null }) => x.count ?? 0),
    conta("mm_liste"),
    conta("mm_campagne"),
    conta("mm_email", ["stato", "in_coda"]),
    conta("crm_collaboratori", ["attivo", true]),
  ]);
  return {
    messaggio:
      `${lead} contatti in archivio, ${conEmail} con email · ${liste} liste · ` +
      `${campagne} campagne · ${inCoda} email in coda · ${collaboratori} collaboratori attivi.`,
    risultato: {
      titolo: "A che punto siamo",
      numeri: {
        Contatti: lead, "Con email": conEmail, Liste: liste,
        Campagne: campagne, "In coda": inCoda, Collaboratori: collaboratori,
      },
    },
  };
}

async function strumentoElenca(a: Record<string, unknown>) {
  const cosa = String(a.cosa ?? "");

  if (cosa === "liste") {
    const { data } = await db.from("mm_liste").select("id, nome, descrizione")
      .order("creata_il", { ascending: false }).limit(40);
    const righe = (data ?? []).map((l: Record<string, any>) => ({ testo: l.nome, sotto: l.descrizione ?? null }));
    return {
      messaggio: righe.length ? `${righe.length} liste.` : "Non c'è ancora nessuna lista.",
      risultato: righe.length ? { titolo: "Liste", righe, totale: righe.length } : null,
    };
  }

  if (cosa === "campagne") {
    const { data } = await db.from("mm_campagne").select("id, nome, stato, creata_il")
      .order("creata_il", { ascending: false }).limit(40);
    const righe = (data ?? []).map((c: Record<string, any>) => ({ testo: c.nome, sotto: c.stato }));
    return {
      messaggio: righe.length ? `${righe.length} campagne.` : "Non c'è ancora nessuna campagna.",
      risultato: righe.length ? { titolo: "Campagne", righe, totale: righe.length } : null,
    };
  }

  if (cosa === "modelli") {
    const { data } = await db.from("crm_email_modelli").select("id, nome, oggetto")
      .order("nome").limit(40);
    const righe = (data ?? []).map((m: Record<string, any>) => ({ testo: m.nome, sotto: m.oggetto }));
    return {
      messaggio: righe.length ? `${righe.length} modelli.` : "Non c'è ancora nessun modello.",
      risultato: righe.length ? { titolo: "Modelli email", righe, totale: righe.length } : null,
    };
  }

  if (cosa === "collaboratori") {
    const { data } = await db.from("crm_collaboratori").select("id, nome, ruolo, attivo")
      .order("attivo", { ascending: false }).order("nome").limit(40);
    const righe = (data ?? []).map((c: Record<string, any>) => ({
      testo: c.nome, sotto: c.ruolo + (c.attivo ? "" : " · disattivato"),
    }));
    return {
      messaggio: righe.length ? `${righe.length} collaboratori.` : "Non c'è ancora nessun collaboratore.",
      risultato: righe.length ? { titolo: "Collaboratori", righe, totale: righe.length } : null,
    };
  }

  return { messaggio: "Non so elencare quella cosa." };
}

async function strumentoTrova(a: Record<string, unknown>) {
  const q = testo(a.testo, 200);
  if (!q) return { messaggio: "Dimmi che cosa cercare." };
  const trovati = await cercaLead(q);
  if (!trovati.length) return { messaggio: `Non trovo nessun contatto che somigli a «${q}».` };
  return {
    messaggio: `${trovati.length} contatti somigliano a «${q}».`,
    risultato: {
      titolo: `Contatti che somigliano a «${q}»`,
      righe: trovati.map((l: Record<string, any>) => ({
        testo: l.nome,
        sotto: [l.citta, l.email].filter(Boolean).join(" · ") || null,
      })),
      totale: trovati.length,
    },
  };
}

async function strumentoComuni(a: Record<string, unknown>) {
  const c = await caricaComuni();
  if (!c) return { messaggio: "L'elenco dei comuni non si è caricato. Riprova fra poco." };

  const dettaRegione = testo(a.regione, 60);
  const dettaProvincia = testo(a.provincia, 80);

  // Una regione non e' un posto in cui cercare: le province sono
  // fino a dodici e ognuna e' una ricerca a se'. Si dice quali
  // sono e si lascia scegliere.
  if (dettaRegione && !dettaProvincia) {
    const q = dettaRegione.toLowerCase();
    const nome = Object.keys(c.regioni).find((r) => r.toLowerCase() === q)
      ?? Object.keys(c.regioni).find((r) => r.toLowerCase().startsWith(q));
    if (!nome) return { messaggio: `Non conosco una regione che si chiami «${dettaRegione}».` };
    const sigle = c.regioni[nome];
    return {
      messaggio: `${nome}: ${sigle.length} province. Dimmi da quale partire.`,
      risultato: {
        titolo: `Province — ${nome}`,
        righe: sigle.map((s) => ({ testo: c.province[s]?.nome ?? s, sotto: s })),
        totale: sigle.length,
      },
    };
  }

  if (!dettaProvincia) return { messaggio: "Dimmi una provincia o una regione." };

  const sigla = siglaProvincia(c, dettaProvincia);
  if (!sigla) return { messaggio: `Non conosco una provincia che si chiami «${dettaProvincia}».` };

  const elenco = c.comuni[sigla] ?? [];
  const p = c.province[sigla];
  return {
    messaggio:
      `${p.nome} (${sigla}, ${p.regione}): ${elenco.length} comuni. ` +
      `Dimmi in quale cercare, oppure una città e un raggio.`,
    risultato: {
      titolo: `Comuni — ${p.nome} (${sigla})`,
      righe: elenco.slice(0, 60).map(([nome, cap]) => ({ testo: nome, sotto: cap })),
      totale: elenco.length,
    },
  };
}

// ---------------- Il lead finder ----------------
// La ricerca su Google sta in qf-lead e ci resta: e' la' che
// vivono le categorie, i raggi, il geocoding e la lettura
// dell'email dal sito, con tutto quello che comporta dirlo
// nell'informativa. Qui si chiede a quella funzione, passandole
// la stessa chiave di amministrazione gia' verificata all'entrata
// — non se ne inventa una seconda, e non si duplica la logica che
// dovrebbe poi restare allineata in due posti.

const URL_LEAD = URL_SUPABASE.replace(/\/+$/, "") + "/functions/v1/qf-lead";

async function chiamaLead(azione: string, dati: Record<string, unknown>, chiave: string) {
  const r = await fetch(URL_LEAD, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-qf-admin": chiave },
    body: JSON.stringify({ azione, dati }),
    signal: AbortSignal.timeout(90000),
  });
  const j = await r.json().catch(() => null);
  /* L'errore di qf-lead si riporta parola per parola: e' gia'
     scritto per chi legge — "Geocoding non riuscito", "Scegli
     almeno una categoria" — e riscriverlo qui vorrebbe dire
     tenere allineate due versioni dello stesso messaggio. */
  if (!j?.ok) throw new Error(j?.errore || "La ricerca non ha risposto.");
  return j as Record<string, unknown>;
}

// I parametri della ricerca, ripuliti una volta sola e usati sia
// per l'anteprima sia per la proposta: due letture diverse degli
// stessi argomenti sono il modo di far divergere quello che si
// vede da quello che poi parte.
function parametriRicerca(a: Record<string, unknown>) {
  const categorie = Array.isArray(a.categorie)
    ? a.categorie.map(String).filter((c) => CHIAVI_CATEGORIE.includes(c)).slice(0, 4)
    : [];
  const raggio = [500, 1000, 2000, 5000, 10000].includes(Number(a.raggio)) ? Number(a.raggio) : 2000;
  return {
    categorie,
    zona: testo(a.zona, 200),
    raggio,
    soloConEmail: a.soloConEmail === true,
    soloQualita: a.soloQualita === true,
    massimo: Math.min(Math.max(Number(a.massimo) || 50, 1), 50),
  };
}

const CATEGORIE_NOMI: Record<string, string> = {
  ristorazione: "Ristoranti e pizzerie", bar: "Bar e caffetterie",
  hotel: "Hotel e B&B", cantine: "Cantine", enoteche: "Enoteche",
  agriturismi: "Agriturismi", officine: "Officine", concessionarie: "Concessionarie",
  edilizia: "Imprese edili", impiantisti: "Impiantisti", studi: "Commercialisti",
  avvocati: "Studi legali", medici: "Studi medici", palestre: "Palestre",
  parrucchieri: "Parrucchieri ed estetica", negozi: "Negozi",
  supermercati: "Supermercati", trasporti: "Trasporti",
  agenzie_immobiliari: "Agenzie immobiliari", assicurazioni: "Agenzie assicurative",
};

const nomiCategorie = (c: string[]) => c.map((x) => CATEGORIE_NOMI[x] ?? x).join(", ");

async function strumentoCercaLead(a: Record<string, unknown>, chiave: string) {
  const p = parametriRicerca(a);
  if (!p.categorie.length) return { messaggio: "Dimmi che tipo di attività cercare." };
  if (!p.zona) return { messaggio: "Dimmi dove cercare: un comune, un CAP o una via." };

  const e = await chiamaLead("cerca", { modalita: "rapida", ...p }, chiave);
  const righe = (e.risultati as Record<string, unknown>[] | undefined) ?? [];
  const nuovi = righe.filter((r) => !r.gia).length;

  if (!righe.length) {
    return {
      messaggio: `Nessuna attività trovata a ${p.zona} entro ${p.raggio} metri. ` +
        "Prova ad allargare il raggio o a cambiare zona.",
    };
  }
  return {
    messaggio:
      `${righe.length} attività a ${p.zona}, ${nuovi} non ancora in archivio. ` +
      "Dimmi come chiamare la lista e le salvo.",
    risultato: {
      titolo: `${nomiCategorie(p.categorie)} — ${p.zona}`,
      righe: righe.slice(0, 12).map((r) => ({
        testo: String(r.nome ?? "—"),
        sotto: [r.citta, r.email, r.gia ? "già in archivio" : null].filter(Boolean).join(" · ") || null,
      })),
      totale: righe.length,
    },
  };
}

// Il nome della lista, quando non lo si e' detto: categoria e
// zona, che e' come la si chiamerebbe a voce.
function nomeListaAuto(categorie: string[], zona: string) {
  const primo = CATEGORIE_NOMI[categorie[0]] ?? categorie[0];
  const altre = categorie.length > 1 ? ` +${categorie.length - 1}` : "";
  return `${primo}${altre} — ${zona}`.slice(0, 160);
}

async function propostaCercaSalva(a: Record<string, unknown>, frase: string) {
  const p = parametriRicerca(a);
  if (!p.categorie.length) return { messaggio: "Dimmi che tipo di attività cercare." };
  if (!p.zona) return { messaggio: "Dimmi dove cercare: un comune, un CAP o una via." };

  const nomeLista = testo(a.nomeLista, 160) || nomeListaAuto(p.categorie, p.zona);
  /* Due cose diverse, e vanno viste diverse: un avviso e' un
     problema da guardare prima di premere — una lista doppia,
     un'email che non sembra valida — una nota e' solo qualcosa
     da sapere. Con lo stesso rosso per entrambi si impara a non
     leggere nessuno dei due. */
  const avvisi: string[] = [];
  const note: string[] = [];
  const { data } = await db.from("mm_liste").select("id").ilike("nome", nomeLista).limit(1);
  if (data?.length) avvisi.push("Una lista con questo nome esiste già: ne avresti due uguali.");
  if (p.soloConEmail) {
    note.push(
      "Con «solo con email» la ricerca apre il sito di ogni attività per leggerne il " +
      "recapito: può metterci un minuto.",
    );
  }
  note.push(`Cerco fino a ${p.massimo} attività entro ${p.raggio} metri da ${p.zona}.`);

  /* La proposta porta i parametri, non i risultati: la ricerca
     vera parte alla conferma. Cercare adesso per poi rifarlo dopo
     vorrebbe dire pagare Google due volte e, peggio, mostrare
     un'anteprima che alla conferma potrebbe non coincidere. */
  return {
    proposta: {
      azione: "cerca_e_salva",
      titolo: `Cerco e salvo nella lista «${nomeLista}»?`,
      campi: {
        nomeLista,
        categorie: p.categorie.join(", "),
        zona: p.zona,
        raggio: String(p.raggio),
        massimo: String(p.massimo),
        soloConEmail: p.soloConEmail ? "si" : "no",
        soloQualita: p.soloQualita ? "si" : "no",
      },
      etichette: {
        nomeLista: "Nome della lista", categorie: "Categorie", zona: "Dove",
        raggio: "Raggio (metri)", massimo: "Quante al massimo",
        soloConEmail: "Solo con email", soloQualita: "Solo ben recensite",
      },
      larghi: ["nomeLista", "zona", "categorie"],
      scelte: {
        raggio: [500, 1000, 2000, 5000, 10000].map((x) => ({ id: String(x), nome: String(x) })),
        soloConEmail: [{ id: "no", nome: "no" }, { id: "si", nome: "sì" }],
        soloQualita: [{ id: "no", nome: "no" }, { id: "si", nome: "sì" }],
      },
      frase, avvisi, note,
    },
  };
}

// L'esecuzione, dopo il bottone. Tre passaggi che devono restare
// in quest'ordine: cerca, salva in archivio, lega alla lista.
async function cercaESalva(c: Record<string, unknown>, chiave: string) {
  const categorie = String(c.categorie ?? "").split(",")
    .map((x) => x.trim()).filter((x) => CHIAVI_CATEGORIE.includes(x)).slice(0, 4);
  const zona = testo(c.zona, 200);
  const nomeLista = testo(c.nomeLista, 160);
  if (!categorie.length) throw new Error("Nessuna categoria valida");
  if (!zona) throw new Error("Manca la zona");
  if (!nomeLista) throw new Error("Manca il nome della lista");

  const e = await chiamaLead("cerca", {
    modalita: "rapida", categorie, zona,
    raggio: [500, 1000, 2000, 5000, 10000].includes(Number(c.raggio)) ? Number(c.raggio) : 2000,
    soloConEmail: String(c.soloConEmail) === "si",
    soloQualita: String(c.soloQualita) === "si",
    massimo: Math.min(Math.max(Number(c.massimo) || 50, 1), 50),
  }, chiave);

  const righe = (e.risultati as Record<string, unknown>[] | undefined) ?? [];
  if (!righe.length) {
    return { messaggio: `Nessuna attività trovata a ${zona}: la lista non è stata creata.` };
  }

  // La lista si crea solo adesso, a ricerca riuscita: una lista
  // vuota nata da una ricerca a vuoto e' un residuo che poi
  // qualcuno deve cancellare a mano.
  const { data: lista, error: errLista } = await db.from("mm_liste")
    .insert({ nome: nomeLista, descrizione: `Da ricerca: ${nomiCategorie(categorie)} — ${zona}` })
    .select("id, nome").single();
  if (errLista) throw new Error(errLista.message);

  await chiamaLead("salva", { lead: righe, query: String(e.query ?? zona) }, chiave);

  /* Gli identificativi si rileggono dall'archivio, non si
     prendono dalla risposta di "salva": quella restituisce solo
     le righe appena inserite, e chi era gia' in archivio — che
     nella lista ci deve stare lo stesso — non comparirebbe. */
  const places = righe.map((r) => String(r.place_id)).filter(Boolean);
  const { data: inArchivio } = await db.from("crm_lead")
    .select("id").in("place_id", places);

  const legami = (inArchivio ?? []).map((l: Record<string, any>) => ({
    lista_id: lista.id, lead_id: l.id,
  }));
  if (legami.length) {
    const { error } = await db.from("mm_lista_lead")
      .upsert(legami, { onConflict: "lista_id,lead_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  return {
    messaggio:
      `Lista «${lista.nome}» creata con ${legami.length} attività` +
      (righe.length !== legami.length ? ` (${righe.length} trovate)` : "") + ".",
    listaId: lista.id,
    vai: "#/admin/crm/mail/liste?l=" + lista.id,
  };
}

// ---------------- Gli strumenti di scrittura ----------------
// Non scrivono: preparano una proposta. La scrittura sta in
// "esegui", dopo il bottone.

async function propostaContatto(a: Record<string, unknown>, frase: string) {
  const nome = testo(a.nome, 200);
  if (!nome) {
    return { messaggio: "Ho capito che vuoi salvare un contatto ma non ho sentito il nome." };
  }
  const avvisi: string[] = [];
  const email = testo(a.email, 200);
  if (email && !emailValida(email)) {
    avvisi.push(`«${email}» non sembra un indirizzo valido: correggilo prima di salvare.`);
  }
  if (emailValida(email)) {
    const { data } = await db.from("crm_lead").select("id, nome").ilike("email", email!).limit(1);
    if (data?.length) avvisi.push(`C'è già un contatto con questa email: ${data[0].nome}.`);
  }
  return {
    proposta: {
      azione: "salva_lead",
      titolo: "Salvo questo contatto?",
      campi: {
        nome, email,
        telefono: testo(a.telefono, 60),
        citta: testo(a.citta, 120),
        provincia: testo(a.provincia, 60),
        categoria: testo(a.categoria, 120),
        note: testo(a.note, 1000),
      },
      etichette: {
        nome: "Nome", email: "Email", telefono: "Telefono", citta: "Città",
        provincia: "Provincia", categoria: "Categoria", note: "Note",
      },
      larghi: ["note"],
      frase, avvisi,
    },
  };
}

async function propostaLista(a: Record<string, unknown>, frase: string) {
  const nome = testo(a.nome, 160);
  if (!nome) return { messaggio: "Ho capito che vuoi creare una lista ma non ho sentito come si chiama." };
  const avvisi: string[] = [];
  const { data } = await db.from("mm_liste").select("id, nome").ilike("nome", nome).limit(1);
  if (data?.length) avvisi.push("Una lista con questo nome esiste già: salvandola ne avresti due uguali.");
  return {
    proposta: {
      azione: "crea_lista",
      titolo: "Creo questa lista?",
      campi: { nome, descrizione: testo(a.descrizione, 600) },
      etichette: { nome: "Nome della lista", descrizione: "Descrizione" },
      larghi: ["nome", "descrizione"],
      frase, avvisi,
    },
  };
}

async function propostaAggiungi(a: Record<string, unknown>, frase: string, ultimo: string | null) {
  const nomeLista = testo(a.lista, 160);
  if (!nomeLista) {
    return { messaggio: "Ho capito che vuoi aggiungere qualcuno a una lista, ma non ho sentito quale." };
  }
  const liste = await cercaListe(nomeLista);
  if (!liste.length) {
    return {
      messaggio: `Non trovo nessuna lista che somigli a «${nomeLista}». ` +
        "Creala prima, oppure ripeti il nome com'è scritto.",
    };
  }

  const riferimento = testo(a.contatto, 200);
  let lead: { id: string; nome: string; email?: string | null; citta?: string | null }[] = [];
  if (riferimento) {
    lead = await cercaLead(riferimento);
    if (!lead.length) return { messaggio: `Non trovo nessun contatto che somigli a «${riferimento}».` };
  } else if (ultimo) {
    const { data } = await db.from("crm_lead").select("id, nome, email, citta").eq("id", ultimo).limit(1);
    lead = data ?? [];
  }
  if (!lead.length) {
    return { messaggio: "Non ho capito quale contatto aggiungere. Dimmi il nome o l'indirizzo email." };
  }

  return {
    proposta: {
      azione: "aggiungi_lista",
      titolo: "Aggiungo alla lista?",
      campi: { lead_id: lead[0].id, lista_id: liste[0].id },
      etichette: { lead_id: "Contatto", lista_id: "Lista" },
      larghi: ["lead_id", "lista_id"],
      /* Le scelte diventano tendine: il nome detto a voce puo'
         somigliare a piu' di un contatto, e sceglierlo qui e'
         piu' onesto che indovinare il primo. */
      scelte: {
        lead_id: lead.map((l) => ({
          id: l.id,
          nome: l.nome + (l.citta ? " — " + l.citta : "") + (l.email ? " · " + l.email : ""),
        })),
        lista_id: liste.map((l: Record<string, any>) => ({ id: l.id, nome: l.nome })),
      },
      frase, avvisi: [],
    },
  };
}

// ---------------- Le mansioni del CRM ----------------
// Le stesse che si fanno a mano nelle schermate. Le scritture non
// le fa questa funzione: le fanno qf-crm e qf-lead e qf-mail, le
// stesse che rispondono ai bottoni, con le stesse convalide. Qui
// si propone e si instrada.
//
// Una cosa che NON c'e', e la sua assenza e' una scelta: inviare
// email. Si puo' preparare, si puo' correggere, ma la partenza
// resta un gesto di una persona davanti a quello che sta per
// uscire a nome della societa'.

const URL_CRM = URL_SUPABASE.replace(/\/+$/, "") + "/functions/v1/qf-crm";
const URL_MAIL = URL_SUPABASE.replace(/\/+$/, "") + "/functions/v1/qf-mail";

async function chiamaAltrove(url: string, azione: string, dati: Record<string, unknown>, chiave: string) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-qf-admin": chiave },
    body: JSON.stringify({ azione, dati }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => null);
  if (!j?.ok) throw new Error(j?.errore || "L'operazione non e' riuscita.");
  return j as Record<string, unknown>;
}

const STATI_LEAD: Record<string, string> = {
  nuovo: "Nuovo", contattato: "Contattato", in_trattativa: "In trattativa",
  cliente: "Cliente", scartato: "Scartato",
};

const RUOLI = ["titolare", "direttore", "account", "commerciale", "consulente"];

async function cercaCollaboratori(q: string) {
  const p = perFiltro(q);
  if (p.length < 2) return [];
  const { data } = await db.from("crm_collaboratori")
    .select("id, nome, email, ruolo, attivo, utente_id")
    .or(`nome.ilike.%${p}%,email.ilike.%${p}%`)
    .order("attivo", { ascending: false }).limit(6);
  return data ?? [];
}

// Il contatto di cui si sta parlando: quello nominato, oppure
// l'ultimo toccato se la frase dice "lui".
async function risolviContatto(detto: string | null, ultimo: string | null) {
  if (detto) return await cercaLead(detto);
  if (!ultimo) return [];
  const { data } = await db.from("crm_lead")
    .select("id, nome, email, citta").eq("id", ultimo).limit(1);
  return data ?? [];
}

const elencoLead = (lead: Record<string, any>[]) => lead.map((l) => ({
  id: l.id,
  nome: l.nome + (l.citta ? " — " + l.citta : "") + (l.email ? " · " + l.email : ""),
}));

async function propostaAggiornaContatto(a: Record<string, unknown>, frase: string, ultimo: string | null) {
  const lead = await risolviContatto(testo(a.contatto, 200), ultimo);
  if (!lead.length) {
    return { messaggio: "Non ho capito di quale contatto parli. Dimmi il nome o l'email." };
  }

  const stato = STATI_LEAD[String(a.stato ?? "")] ? String(a.stato) : "";
  const note = testo(a.note, 2000);
  const cercato = testo(a.assegnatario, 200);

  // Chi lavora qui dentro: l'elenco serve alla tendina, e senza
  // collaboratori l'assegnazione semplicemente non si propone.
  const { data: squadra } = await db.from("crm_collaboratori")
    .select("id, nome, ruolo").eq("attivo", true).order("nome");
  const attivi = squadra ?? [];
  const scelto = cercato
    ? attivi.find((c: Record<string, any>) =>
        String(c.nome).toLowerCase().includes(cercato.toLowerCase()))
    : null;

  if (!stato && !note && !cercato) {
    return { messaggio: "Dimmi cosa cambiare: lo stato, a chi assegnarlo, o le note." };
  }
  if (cercato && !attivi.length) {
    return { messaggio: "Non c'è ancora nessun collaboratore attivo a cui assegnarlo." };
  }
  if (cercato && !scelto) {
    return {
      messaggio: `Non trovo nessun collaboratore che somigli a «${cercato}».`,
      risultato: attivi.length
        ? { titolo: "Chi c'è", righe: attivi.map((c: Record<string, any>) => ({ testo: c.nome, sotto: c.ruolo })), totale: attivi.length }
        : null,
    };
  }

  const campi: Record<string, unknown> = { lead_id: lead[0].id };
  const etichette: Record<string, string> = { lead_id: "Contatto" };
  const scelte: Record<string, unknown> = { lead_id: elencoLead(lead) };
  const larghi = ["lead_id"];

  if (stato) {
    campi.stato = stato;
    etichette.stato = "Stato";
    scelte.stato = Object.entries(STATI_LEAD).map(([id, nome]) => ({ id, nome }));
  }
  if (cercato && scelto) {
    campi.assegnato_a = scelto.id;
    etichette.assegnato_a = "Assegnato a";
    scelte.assegnato_a = attivi.map((c: Record<string, any>) => ({ id: c.id, nome: c.nome }));
    larghi.push("assegnato_a");
  }
  if (note) { campi.note = note; etichette.note = "Note"; larghi.push("note"); }

  return {
    proposta: {
      azione: "aggiorna_contatto",
      titolo: `Aggiorno la scheda di ${lead[0].nome}?`,
      campi, etichette, scelte, larghi, frase, avvisi: [],
    },
  };
}

async function propostaOpposizione(a: Record<string, unknown>, frase: string, ultimo: string | null) {
  const lead = await risolviContatto(testo(a.contatto, 200), ultimo);
  if (!lead.length) return { messaggio: "Non trovo quel contatto in archivio." };
  const attiva = a.attivo !== false;

  return {
    proposta: {
      azione: "opposizione_contatto",
      titolo: attiva
        ? `Registro che ${lead[0].nome} si è opposto a ricevere comunicazioni?`
        : `Tolgo l'opposizione a ${lead[0].nome}?`,
      campi: {
        lead_id: lead[0].id,
        attivo: attiva ? "si" : "no",
        motivo: testo(a.motivo, 300) ?? "",
      },
      etichette: { lead_id: "Contatto", attivo: "Opposizione", motivo: "Come si è opposto" },
      scelte: {
        lead_id: elencoLead(lead),
        attivo: [{ id: "si", nome: "registrata" }, { id: "no", nome: "tolta" }],
      },
      larghi: ["lead_id", "motivo"],
      frase,
      avvisi: [],
      note: attiva
        ? ["Da questo momento il server rifiuta l'invio verso questo indirizzo: non è una schermata che lo nasconde. È l'art. 21 del GDPR."]
        : ["L'opposizione si toglie solo se è stata l'azienda a chiederlo."],
    },
  };
}

async function propostaEliminaContatto(a: Record<string, unknown>, frase: string, ultimo: string | null) {
  const lead = await risolviContatto(testo(a.contatto, 200), ultimo);
  if (!lead.length) return { messaggio: "Non trovo quel contatto in archivio." };

  return {
    proposta: {
      azione: "elimina_contatto",
      titolo: `Cancello ${lead[0].nome} dall'archivio?`,
      campi: { lead_id: lead[0].id },
      etichette: { lead_id: "Contatto" },
      scelte: { lead_id: elencoLead(lead) },
      larghi: ["lead_id"],
      frase,
      avvisi: ["Si cancella la scheda e tutto quello che ci sta attaccato. Non si torna indietro."],
      note: ["Se l'azienda ha solo chiesto di non essere contattata, registra l'opposizione invece di cancellarla: cancellata, la prossima ricerca la ritrova come nuova."],
    },
  };
}

const VERBI_COLLAB: Record<string, string> = {
  aggiungi: "Aggiungo",
  attiva: "Riattivo",
  disattiva: "Disattivo",
  "crea-accesso": "Creo l'accesso per",
  "rigenera-password": "Rigenero la password di",
  "revoca-accesso": "Tolgo l'accesso a",
};

async function propostaCollaboratore(a: Record<string, unknown>, frase: string) {
  const azione = String(a.azione ?? "");
  if (!VERBI_COLLAB[azione]) return { messaggio: "Non ho capito cosa fare con il collaboratore." };

  if (azione === "aggiungi") {
    const nome = testo(a.nome, 200);
    const email = testo(a.email, 200);
    if (!nome) return { messaggio: "Per aggiungere un collaboratore mi serve nome e cognome." };
    const avvisi: string[] = [];
    if (email && !emailValida(email)) {
      avvisi.push(`«${email}» non sembra un indirizzo valido.`);
    } else if (!email) {
      avvisi.push("Senza email non si può salvare: serve anche per dargli un accesso.");
    }
    const ruolo = RUOLI.includes(String(a.ruolo)) ? String(a.ruolo) : "commerciale";
    return {
      proposta: {
        azione: "collaboratore",
        titolo: `Aggiungo ${nome} alla squadra?`,
        campi: {
          operazione: "aggiungi", nome, email: email ?? "",
          ruolo, telefono: testo(a.telefono, 60) ?? "",
        },
        etichette: { operazione: "Operazione", nome: "Nome", email: "Email", ruolo: "Ruolo", telefono: "Telefono" },
        scelte: {
          operazione: [{ id: "aggiungi", nome: "aggiungi alla squadra" }],
          ruolo: RUOLI.map((r) => ({ id: r, nome: r })),
        },
        larghi: ["nome", "email"],
        frase, avvisi,
        note: ["Nasce attivo e senza accesso. L'accesso si dà dopo, quando serve."],
      },
    };
  }

  const chi = testo(a.chi, 200);
  if (!chi) return { messaggio: "Di quale collaboratore parli?" };
  const trovati = await cercaCollaboratori(chi);
  if (!trovati.length) return { messaggio: `Non trovo nessun collaboratore che somigli a «${chi}».` };

  const c = trovati[0] as Record<string, any>;
  const avvisi: string[] = [];
  const note: string[] = [];

  if (azione === "crea-accesso" && c.utente_id) avvisi.push(`${c.nome} ha già un accesso.`);
  if (azione === "crea-accesso" && !c.attivo) avvisi.push(`${c.nome} è disattivato: va riattivato prima.`);
  if ((azione === "rigenera-password" || azione === "revoca-accesso") && !c.utente_id) {
    avvisi.push(`${c.nome} non ha un accesso.`);
  }
  if (azione === "disattiva") {
    note.push("Disattivare chiude anche l'accesso: la persona esce, la sua produzione resta.");
  }
  if (azione === "crea-accesso" || azione === "rigenera-password") {
    note.push("La password si legge una volta sola, subito dopo. Nel database resta solo cifrata e non è recuperabile.");
  }
  if (azione === "revoca-accesso") {
    note.push("Si cancella l'utenza, non la scheda: la persona esce, la sua storia resta.");
  }

  return {
    proposta: {
      azione: "collaboratore",
      titolo: `${VERBI_COLLAB[azione]} ${c.nome}?`,
      campi: { operazione: azione, collaboratore_id: c.id },
      etichette: { operazione: "Operazione", collaboratore_id: "Collaboratore" },
      scelte: {
        operazione: [{ id: azione, nome: VERBI_COLLAB[azione].toLowerCase() }],
        collaboratore_id: trovati.map((x: Record<string, any>) => ({
          id: x.id, nome: x.nome + " · " + x.ruolo + (x.attivo ? "" : " · disattivato"),
        })),
      },
      larghi: ["collaboratore_id"],
      frase, avvisi, note,
    },
  };
}

// ---------------- Le esecuzioni ----------------

async function eseguiAggiornaContatto(c: Record<string, unknown>, chiave: string) {
  const id = testo(c.lead_id, 40);
  if (!id) throw new Error("Manca il contatto");
  const dati: Record<string, unknown> = { id };
  if (testo(c.stato, 40)) dati.stato = testo(c.stato, 40);
  if (testo(c.assegnato_a, 40)) dati.assegnato_a = testo(c.assegnato_a, 40);
  if (c.note !== undefined) dati.note = testo(c.note, 2000);
  await chiamaAltrove(URL_LEAD, "aggiorna", dati, chiave);

  const { data } = await db.from("crm_lead").select("nome").eq("id", id).maybeSingle();
  return { messaggio: `Scheda di ${data?.nome ?? "questo contatto"} aggiornata.`, leadId: id };
}

async function eseguiOpposizione(c: Record<string, unknown>, chiave: string) {
  const id = testo(c.lead_id, 40);
  if (!id) throw new Error("Manca il contatto");
  const attivo = String(c.attivo) === "si";
  await chiamaAltrove(URL_MAIL, "no-contatto", {
    id, attivo, motivo: testo(c.motivo, 300),
  }, chiave);

  const { data } = await db.from("crm_lead").select("nome").eq("id", id).maybeSingle();
  return {
    messaggio: attivo
      ? `Opposizione registrata per ${data?.nome ?? "questo contatto"}: da adesso l'invio è bloccato dal server.`
      : `Opposizione tolta a ${data?.nome ?? "questo contatto"}.`,
    leadId: id,
  };
}

async function eseguiEliminaContatto(c: Record<string, unknown>, chiave: string) {
  const id = testo(c.lead_id, 40);
  if (!id) throw new Error("Manca il contatto");
  const { data } = await db.from("crm_lead").select("nome").eq("id", id).maybeSingle();
  await chiamaAltrove(URL_LEAD, "elimina", { id }, chiave);
  return { messaggio: `${data?.nome ?? "Il contatto"} è stato cancellato dall'archivio.` };
}

async function eseguiCollaboratore(c: Record<string, unknown>, chiave: string) {
  const operazione = String(c.operazione ?? "");

  if (operazione === "aggiungi") {
    const e = await chiamaAltrove(URL_CRM, "salva-collaboratore", {
      nome: testo(c.nome, 200), email: testo(c.email, 200),
      ruolo: RUOLI.includes(String(c.ruolo)) ? String(c.ruolo) : "commerciale",
      telefono: testo(c.telefono, 60),
    }, chiave);
    return {
      messaggio: `${testo(c.nome, 200)} è nella squadra.`,
      vai: "#/admin/crm/collaboratori",
      collaboratoreId: e.id,
    };
  }

  const id = testo(c.collaboratore_id, 40);
  if (!id) throw new Error("Manca il collaboratore");
  const { data: chi } = await db.from("crm_collaboratori").select("nome").eq("id", id).maybeSingle();
  const nome = chi?.nome ?? "Il collaboratore";

  if (operazione === "attiva" || operazione === "disattiva") {
    await chiamaAltrove(URL_CRM, "attiva-collaboratore", { id, attivo: operazione === "attiva" }, chiave);
    return {
      messaggio: operazione === "attiva" ? `${nome} è di nuovo attivo.` : `${nome} è stato disattivato, accesso compreso.`,
      vai: "#/admin/crm/collaboratori",
    };
  }

  if (operazione === "revoca-accesso") {
    await chiamaAltrove(URL_CRM, "revoca-accesso", { id }, chiave);
    return { messaggio: `Accesso di ${nome} revocato. La scheda resta.`, vai: "#/admin/crm/collaboratori" };
  }

  /* crea-accesso e rigenera-password restituiscono una password
     leggibile una volta sola. Non la si scrive qui dentro: la
     conversazione resta a schermo e verrebbe riletta da chiunque
     passi. Si manda alla schermata dei collaboratori, che e' fatta
     per mostrarla una volta e poi chiuderla. */
  const azione = operazione === "crea-accesso" ? "crea-accesso" : "rigenera-password";
  await chiamaAltrove(URL_CRM, azione, { id }, chiave);
  return {
    messaggio: azione === "crea-accesso"
      ? `Accesso creato per ${nome}. La password si legge una volta sola: te la mostro nella scheda dei collaboratori.`
      : `Password di ${nome} rigenerata. Te la mostro nella scheda dei collaboratori.`,
    vai: "#/admin/crm/collaboratori",
  };
}

// ---------------- interpreta ----------------

async function interpreta(d: Record<string, unknown>, chiave: string) {
  const frase = testo(d.frase, 600);
  if (!frase) throw new Error("Non hai detto niente.");

  const m = await interroga(frase);
  const ultimo = testo(d.ultimoLead, 40);

  switch (m.strumento) {
    case "vai":             return await strumentoVai(m.argomenti);
    case "riepilogo":       return await strumentoRiepilogo();
    case "elenca":          return await strumentoElenca(m.argomenti);
    case "trova_contatto":  return await strumentoTrova(m.argomenti);
    case "comuni":          return await strumentoComuni(m.argomenti);
    case "cerca_lead":      return await strumentoCercaLead(m.argomenti, chiave);
    case "cerca_e_salva":   return await propostaCercaSalva(m.argomenti, frase);
    case "aggiorna_contatto":    return await propostaAggiornaContatto(m.argomenti, frase, ultimo);
    case "opposizione_contatto": return await propostaOpposizione(m.argomenti, frase, ultimo);
    case "elimina_contatto":     return await propostaEliminaContatto(m.argomenti, frase, ultimo);
    case "collaboratore":        return await propostaCollaboratore(m.argomenti, frase);
    case "salva_contatto":  return await propostaContatto(m.argomenti, frase);
    case "crea_lista":      return await propostaLista(m.argomenti, frase);
    case "aggiungi_a_lista": return await propostaAggiungi(m.argomenti, frase, ultimo);
  }

  /* Nessuno strumento: il modello ha preferito rispondere a
     parole. Va bene per "questo non so farlo", che e' una
     risposta utile — ma quel testo non e' mai un dato: qui
     dentro non c'e' niente che venga dall'archivio. */
  return {
    messaggio: m.testo ||
      "Non ho capito che cosa devo fare. Posso portarti in una schermata, " +
      "dirti a che punto siamo, elencare liste campagne modelli e collaboratori, " +
      "cercare un contatto in archivio, dirti i comuni di una provincia, cercare " +
      "attività su Google e salvarle in una lista, salvare un contatto, creare una " +
      "lista o metterci dentro qualcuno, cambiare stato o assegnatario di un " +
      "contatto, registrare un'opposizione, cancellare un contatto, e gestire i " +
      "collaboratori con i loro accessi. Inviare email no: quelle le mandi tu.",
  };
}

// ---------------- esegui ----------------
// Da qui in giù non c'è nessun modello: sono tre scritture
// normali, validate come se arrivassero da un modulo.

async function salvaLead(c: Record<string, unknown>, frase: string | null) {
  const nome = testo(c.nome, 200);
  if (!nome) throw new Error("Il nome è obbligatorio");
  const email = testo(c.email, 200);
  if (email && !emailValida(email)) throw new Error("L'indirizzo email non è valido");

  const { data, error } = await db.from("crm_lead").insert({
    nome,
    email,
    // La scheda deve poter dire da dove viene il recapito. Qui la
    // risposta è: l'ha dettato chi lavora in agenzia, non l'ha
    // trovato un programma su un sito.
    email_fonte: email ? "dettato" : null,
    email_trovata_il: email ? new Date().toISOString() : null,
    telefono: testo(c.telefono, 60),
    citta: testo(c.citta, 120),
    provincia: testo(c.provincia, 60),
    categoria: testo(c.categoria, 120),
    note: testo(c.note, 1000),
    fonte: "assistente",
    query_origine: frase ? "assistente: " + frase : null,
  }).select("id, nome").single();
  if (error) throw new Error(error.message);

  return { messaggio: `Salvato: ${data.nome}.`, leadId: data.id };
}

async function creaLista(c: Record<string, unknown>) {
  const nome = testo(c.nome, 160);
  if (!nome) throw new Error("Il nome della lista è obbligatorio");
  const { data, error } = await db.from("mm_liste").insert({
    nome, descrizione: testo(c.descrizione, 600),
  }).select("id, nome").single();
  if (error) throw new Error(error.message);
  return { messaggio: `Lista creata: ${data.nome}.`, listaId: data.id };
}

async function aggiungiALista(c: Record<string, unknown>) {
  const leadId = testo(c.lead_id, 40);
  const listaId = testo(c.lista_id, 40);
  if (!leadId || !listaId) throw new Error("Manca il contatto o la lista");

  const [{ data: l }, { data: li }] = await Promise.all([
    db.from("crm_lead").select("nome").eq("id", leadId).maybeSingle(),
    db.from("mm_liste").select("nome").eq("id", listaId).maybeSingle(),
  ]);
  if (!l) throw new Error("Questo contatto non esiste più");
  if (!li) throw new Error("Questa lista non esiste più");

  // Era già dentro: non è un errore da mostrare come tale, è una
  // cosa che l'operatore deve solo sapere.
  const { error } = await db.from("mm_lista_lead")
    .insert({ lista_id: listaId, lead_id: leadId });
  if (error && error.code === "23505") {
    return { messaggio: `${l.nome} era già nella lista «${li.nome}».` };
  }
  if (error) throw new Error(error.message);
  return { messaggio: `${l.nome} aggiunto alla lista «${li.nome}».` };
}

async function esegui(d: Record<string, unknown>, chiave: string) {
  const azione = String(d.azione ?? "");
  const campi = (d.campi ?? {}) as Record<string, unknown>;
  const frase = testo(d.frase, 600);

  if (azione === "salva_lead") return await salvaLead(campi, frase);
  if (azione === "crea_lista") return await creaLista(campi);
  if (azione === "aggiungi_lista") return await aggiungiALista(campi);
  if (azione === "cerca_e_salva") return await cercaESalva(campi, chiave);
  if (azione === "aggiorna_contatto") return await eseguiAggiornaContatto(campi, chiave);
  if (azione === "opposizione_contatto") return await eseguiOpposizione(campi, chiave);
  if (azione === "elimina_contatto") return await eseguiEliminaContatto(campi, chiave);
  if (azione === "collaboratore") return await eseguiCollaboratore(campi, chiave);
  throw new Error("Azione non riconosciuta");
}

/* Le azioni ricevono la chiave gia' verificata all'entrata: serve
   a chi deve parlare con un'altra funzione — la ricerca dei lead
   vive in qf-lead — e non a chi lavora sul database, che usa il
   ruolo di servizio. */
const AZIONI: Record<string, (d: Record<string, unknown>, chiave: string) => Promise<unknown>> = {
  interpreta,
  esegui,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return rispondi({ ok: false, errore: "Metodo non consentito" }, 405);

  const atteso = await improntaAttesa();
  if (!atteso) {
    return rispondi({
      ok: false,
      errore: "CRM non attivo: non risulta configurata alcuna chiave di amministrazione.",
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
    return rispondi({ ok: true, ...(await azione(body.dati ?? {}, fornita) as object) });
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : "Errore imprevisto";
    const mancante = !!(e as { configurazione?: boolean })?.configurazione;
    console.error("[qf-chat]", messaggio);
    return rispondi(
      { ok: false, errore: messaggio, chiaveMancante: mancante },
      mancante ? 503 : 400,
    );
  }
});
