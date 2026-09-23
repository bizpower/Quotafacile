// ============================================================
// QuotaFacile — Assistente del CRM
// ------------------------------------------------------------
// Salvare un lead o creare una lista parlando, invece di
// compilare un modulo. Dietro c'è un modello linguistico
// (Gemini), ma il modo in cui è messo in mezzo conta più del
// modello stesso.
//
// IL MODELLO PROPONE, IL SERVER DECIDE
// Al modello arriva una cosa sola: la frase che l'operatore ha
// scritto o dettato. Non l'archivio, non i lead, non le liste,
// non le email dei clienti. Il suo compito è tradurre quella
// frase in un comando strutturato e nient'altro.
//
// Il comando torna qui e viene ricontrollato da capo: azione
// nell'elenco chiuso, campi ripuliti, email validata, lunghezze
// tagliate. Poi è questa funzione a scrivere sul database, con
// il ruolo di servizio, e a comporre la risposta che l'operatore
// legge — dal risultato vero della scrittura, non da ciò che il
// modello dice di aver fatto. Un modello che allucina "ho
// salvato il lead" qui non riesce a renderlo vero.
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

// Le tre cose che l'assistente sa fare, e basta. L'elenco è
// chiuso: qualunque altra cosa il modello restituisca finisce in
// "niente" e non produce nessuna scrittura.
const AZIONI_MODELLO = ["salva_lead", "crea_lista", "aggiungi_lista", "niente"];

const ISTRUZIONI = `Sei un traduttore, non un assistente.

Ricevi una frase in italiano detta o scritta da chi lavora in
un'agenzia. Devi trasformarla in un comando strutturato.

Le azioni possibili sono soltanto queste:
- "salva_lead": registrare un nuovo contatto. Campi: nome, email,
  telefono, citta, provincia, categoria, note.
- "crea_lista": creare una nuova lista per le campagne email.
  Campi: lista (il nome della lista), descrizione.
- "aggiungi_lista": mettere un contatto dentro una lista che
  esiste gia'. Campi: lead (nome o email del contatto, lascialo
  vuoto se la frase dice "lui", "questo", "l'ultimo"), lista.
- "niente": la frase non e' nessuna delle tre, oppure non hai
  capito, oppure manca l'informazione essenziale.

Regole che non puoi violare:
1. NON INVENTARE NULLA. Un campo che la frase non dice resta
   vuoto. Non dedurre la citta' dal prefisso telefonico, non
   costruire un'email dal nome, non immaginare una categoria.
   Un campo vuoto e' corretto; un campo inventato e' un danno.
2. Riporta i valori come sono stati detti, correggendo solo le
   maiuscole dei nomi propri e togliendo gli spazi negli
   indirizzi email dettati a voce ("mario chiocciola rossi punto
   it" -> "mario@rossi.it").
3. Se la frase chiede qualcosa che non e' fra le tre azioni
   (cancellare, inviare email, cercare, modificare), rispondi
   "niente".
4. Non rispondere mai alla frase, non commentarla, non salutare.
   Restituisci solo il comando.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    azione: { type: "STRING", enum: AZIONI_MODELLO },
    nome: { type: "STRING" },
    email: { type: "STRING" },
    telefono: { type: "STRING" },
    citta: { type: "STRING" },
    provincia: { type: "STRING" },
    categoria: { type: "STRING" },
    note: { type: "STRING" },
    lista: { type: "STRING" },
    descrizione: { type: "STRING" },
    lead: { type: "STRING" },
  },
  required: ["azione"],
};

async function interroga(frase: string): Promise<Record<string, unknown>> {
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
          // temperatura 0: qui non si vuole fantasia, si vuole
          // che la stessa frase produca sempre lo stesso comando
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 400,
            responseMimeType: "application/json",
            responseSchema: SCHEMA,
          },
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
  const grezzo = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!grezzo) throw new Error("Il servizio di Google ha risposto in un modo che non so leggere.");

  try {
    const c = JSON.parse(grezzo);
    return (c && typeof c === "object") ? c as Record<string, unknown> : {};
  } catch {
    throw new Error("Il servizio di Google ha risposto in un modo che non so leggere.");
  }
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

// ---------------- interpreta ----------------

async function interpreta(d: Record<string, unknown>) {
  const frase = testo(d.frase, 600);
  if (!frase) throw new Error("Non hai detto niente.");

  const c = await interroga(frase);
  const azione = AZIONI_MODELLO.includes(String(c.azione)) ? String(c.azione) : "niente";

  if (azione === "niente") {
    return {
      proposta: null,
      messaggio: "Non ho capito che cosa devo fare. So fare tre cose: salvare un " +
        "contatto, creare una lista, aggiungere un contatto a una lista.",
    };
  }

  const avvisi: string[] = [];

  if (azione === "salva_lead") {
    const nome = testo(c.nome, 200);
    if (!nome) {
      return {
        proposta: null,
        messaggio: "Ho capito che vuoi salvare un contatto ma non ho sentito il nome. " +
          "Ripeti mettendolo all'inizio.",
      };
    }
    const email = testo(c.email, 200);
    if (email && !emailValida(email)) {
      avvisi.push(`«${email}» non sembra un indirizzo valido: correggilo prima di salvare.`);
    }
    if (emailValida(email)) {
      const { data } = await db.from("crm_lead")
        .select("id, nome").ilike("email", email!).limit(1);
      if (data?.length) avvisi.push(`C'è già un contatto con questa email: ${data[0].nome}.`);
    }
    return {
      proposta: {
        azione,
        titolo: "Salvo questo contatto?",
        campi: {
          nome,
          email,
          telefono: testo(c.telefono, 60),
          citta: testo(c.citta, 120),
          provincia: testo(c.provincia, 60),
          categoria: testo(c.categoria, 120),
          note: testo(c.note, 1000),
        },
        frase,
        avvisi,
      },
    };
  }

  if (azione === "crea_lista") {
    const nome = testo(c.lista, 160);
    if (!nome) {
      return { proposta: null, messaggio: "Ho capito che vuoi creare una lista ma non ho sentito come si chiama." };
    }
    const { data } = await db.from("mm_liste").select("id, nome").ilike("nome", nome).limit(1);
    if (data?.length) avvisi.push("Una lista con questo nome esiste già: salvandola ne avresti due uguali.");
    return {
      proposta: {
        azione,
        titolo: "Creo questa lista?",
        campi: { nome, descrizione: testo(c.descrizione, 600) },
        frase,
        avvisi,
      },
    };
  }

  // aggiungi_lista
  const nomeLista = testo(c.lista, 160);
  if (!nomeLista) {
    return { proposta: null, messaggio: "Ho capito che vuoi aggiungere qualcuno a una lista, ma non ho sentito quale lista." };
  }
  const riferimentoLead = testo(c.lead, 200);
  const ultimo = testo(d.ultimoLead, 40);

  const liste = await cercaListe(nomeLista);
  if (!liste.length) {
    return {
      proposta: null,
      messaggio: `Non trovo nessuna lista che somigli a «${nomeLista}». ` +
        "Creala prima, oppure ripeti il nome com'è scritto.",
    };
  }

  let lead: { id: string; nome: string; email?: string | null; citta?: string | null }[] = [];
  if (riferimentoLead) {
    lead = await cercaLead(riferimentoLead);
    if (!lead.length) {
      return {
        proposta: null,
        messaggio: `Non trovo nessun contatto che somigli a «${riferimentoLead}».`,
      };
    }
  } else if (ultimo) {
    const { data } = await db.from("crm_lead")
      .select("id, nome, email, citta").eq("id", ultimo).limit(1);
    lead = data ?? [];
  }
  if (!lead.length) {
    return {
      proposta: null,
      messaggio: "Non ho capito quale contatto aggiungere. Dimmi il nome o l'indirizzo email.",
    };
  }

  return {
    proposta: {
      azione,
      titolo: "Aggiungo alla lista?",
      campi: { lead_id: lead[0].id, lista_id: liste[0].id },
      scelte: { lead, liste },
      frase,
      avvisi,
    },
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
