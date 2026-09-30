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

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
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

const MODELLO = Deno.env.get("QF_GEMINI_MODELLO") || "gemini-2.0-flash";

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

4. Se la frase chiede una cosa che nessuno strumento sa fare
   (inviare un'email, cancellare, modificare un contatto), dillo
   in una riga invece di chiamare uno strumento a caso.

5. Non salutare, non ringraziare, non commentare. Una riga.`;

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

  const stop = AbortSignal.timeout(20000);
  let r: Response;
  try {
    r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELLO}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": chiave },
        signal: stop,
        body: JSON.stringify({
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
        }),
      },
    );
  } catch {
    throw new Error("Il servizio di Google non ha risposto in tempo. Riprova fra poco.");
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
  if (!r.ok) throw new Error("Il servizio di Google ha risposto con un errore (" + r.status + ").");

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
      scelte: { lead, liste },
      frase, avvisi: [],
    },
  };
}

// ---------------- interpreta ----------------

async function interpreta(d: Record<string, unknown>) {
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
      "cercare un contatto, dirti i comuni di una provincia, salvare un contatto, " +
      "creare una lista o metterci dentro qualcuno.",
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

async function esegui(d: Record<string, unknown>) {
  const azione = String(d.azione ?? "");
  const campi = (d.campi ?? {}) as Record<string, unknown>;
  const frase = testo(d.frase, 600);

  if (azione === "salva_lead") return await salvaLead(campi, frase);
  if (azione === "crea_lista") return await creaLista(campi);
  if (azione === "aggiungi_lista") return await aggiungiALista(campi);
  throw new Error("Azione non riconosciuta");
}

const AZIONI: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
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
    return rispondi({ ok: true, ...(await azione(body.dati ?? {}) as object) });
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
