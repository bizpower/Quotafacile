// ============================================================
// QuotaFacile — Scrittura assistita del mail marketing
// ------------------------------------------------------------
// Due azioni sole, e stanno qui e non in qf-mm per un motivo
// che non è la comodità:
//
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
// IL COSTO SI DICE, NON SI SCOPRE
// Generare per una lista di cento aziende sono cento chiamate a
// pagamento. Quindi: si lavora a blocchi, si dice quanti ne
// restano, e si riporta quanto è costato il blocco. Chi preme il
// bottone deve sapere cosa sta spendendo prima di premerlo una
// seconda volta.
//
// COSA ESCE DAL DATABASE E ARRIVA AD ANTHROPIC
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

const MODELLO_AI = Deno.env.get("QF_MM_MODELLO_AI") || "claude-opus-5";

/* Dollari per milione di token, per poter dire quanto è costato
   un blocco. Se si cambia modello vanno cambiati anche questi,
   altrimenti il numero a schermo diventa una bugia precisa. */
const COSTO_INGRESSO = Number(Deno.env.get("QF_MM_COSTO_INGRESSO") || 5);
const COSTO_USCITA = Number(Deno.env.get("QF_MM_COSTO_USCITA") || 25);

function chiaveAi(): string {
  const k = Deno.env.get("QF_ANTHROPIC_KEY");
  if (!k) {
    throw new ErroreCliente(
      "Scrittura assistita non attiva: manca il segreto QF_ANTHROPIC_KEY fra le impostazioni del " +
      "progetto Supabase. La chiave si crea su console.anthropic.com; ogni email scritta ha un costo, " +
      "che compare accanto alla bozza.",
      503,
    );
  }
  return k;
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

/* La scheda che parte verso Anthropic. Cinque campi, gli stessi
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

function sistemaDi(firma: string): string {
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
    `verranno sostituiti al momento dell'invio.\n\n` +
    `Rispondi esattamente in questo formato, senza aggiungere altro:\n` +
    `Oggetto: <l'oggetto su una riga sola>\n` +
    `<riga vuota>\n` +
    `<il testo del messaggio, senza firma: la firma la aggiunge il sistema>`;
}

type Scritta = { oggetto: string; corpo: string; costo: number };

/* Una chiamata al modello. Gli errori di configurazione e di
   credito salgono come ErroreCliente perché a chi preme il
   bottone va detto cosa fare, non "errore interno". */
async function scrivi(
  firma: string,
  richiesta: string,
): Promise<Scritta> {
  const { default: Anthropic } = await import("npm:@anthropic-ai/sdk");
  const claude = new Anthropic({ apiKey: chiaveAi() });

  let risposta;
  try {
    risposta = await claude.beta.messages.create({
      model: MODELLO_AI,
      max_tokens: 2000,
      /* Un'email di centotrenta parole non è un problema
         difficile: allo sforzo minimo costa meno e non scrive
         peggio. */
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: sistemaDi(firma),
      messages: [{ role: "user", content: richiesta }],
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/401|authentication|api key/i.test(m)) {
      throw new ErroreCliente("La chiave QF_ANTHROPIC_KEY è stata rifiutata: controllala su console.anthropic.com.");
    }
    if (/429|rate.?limit/i.test(m)) {
      throw new ErroreCliente("Troppe richieste di seguito al modello. Riprova fra qualche secondo.");
    }
    if (/credit|billing|quota/i.test(m)) {
      throw new ErroreCliente("Il credito del profilo Anthropic è esaurito: ricaricalo su console.anthropic.com.");
    }
    throw new ErroreCliente(`Il modello non ha risposto: ${m.slice(0, 300)}`);
  }

  /* Il modello può rifiutarsi, e la risposta arriva comunque con
     stato 200: leggerne il contenuto senza guardare il motivo
     darebbe una bozza vuota senza spiegazione. */
  if (risposta.stop_reason === "refusal") {
    throw new ErroreCliente(
      "Il modello ha rifiutato di scrivere questo messaggio" +
      (risposta.stop_details?.category ? ` (${risposta.stop_details.category})` : "") +
      ". Prova a riformulare le indicazioni aggiuntive.",
    );
  }

  const testoIntero = risposta.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n").trim();

  /* Il formato chiesto è "Oggetto: …" sulla prima riga. Se non
     arriva così il testo non si butta: va tutto nel corpo e
     l'oggetto resta da scrivere, che è visibile invece di essere
     sbagliato in silenzio. */
  const righe = testoIntero.split("\n");
  const prima = righe[0]?.trim() ?? "";
  const conOggetto = /^oggetto\s*:/i.test(prima);

  const uso = risposta.usage;
  return {
    oggetto: conOggetto ? prima.replace(/^oggetto\s*:\s*/i, "").trim() : "",
    corpo: (conOggetto ? righe.slice(1).join("\n") : testoIntero).trim(),
    costo: (uso.input_tokens / 1_000_000) * COSTO_INGRESSO +
      (uso.output_tokens / 1_000_000) * COSTO_USCITA,
  };
}

async function firmaDi(mittenteId: string | null): Promise<string> {
  if (!mittenteId) return "QuotaFacile";
  const { data } = await db.from("mm_mittenti")
    .select("etichetta,from_nome").eq("id", mittenteId).maybeSingle();
  return data ? String(data.from_nome || data.etichetta || "QuotaFacile") : "QuotaFacile";
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
// TRE DENOMINATORI PER SALTARE QUALCUNO, CONTATI SEPARATI
//
// Senza indirizzo, opposto, in blacklist, già contattato: sono
// quattro problemi diversi e si rimediano in modi diversi.
// L'indirizzo si cerca, l'opposizione no.

const PER_BLOCCO = 12;
const PARALLELI = 3;

async function genera(d: Record<string, unknown>) {
  // Prima di toccare il database: se la chiave manca, dirlo
  // subito invece di dopo aver letto trecento righe.
  chiaveAi();

  const listaId = testo(d.lista_id, 40);
  if (!listaId) throw new ErroreCliente("Scegli la lista da cui generare.");

  const scopo = SCOPI[String(d.scopo)] ? String(d.scopo) : "presentazione";
  const tono = TONI[String(d.tono)] ? String(d.tono) : "cordiale";
  const istruzioni = testo(d.istruzioni, 1000);
  const mittenteId = testo(d.mittente_id, 40);
  const smtpId = testo(d.smtp_id, 40);
  const sovrascrivi = d.sovrascrivi === true;

  const { data: dentro } = await db.from("mm_lista_lead")
    .select("lead_id").eq("lista_id", listaId);
  const ids = (dentro ?? []).map((r: { lead_id: string }) => r.lead_id);
  if (!ids.length) throw new ErroreCliente("Questa lista è vuota.");

  const { data: lead } = await db.from("crm_lead").select(COLONNE_LEAD).in("id", ids);

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

  const blocco = candidati.slice(0, PER_BLOCCO);
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

  let i = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLELI, blocco.length) }, async () => {
    while (i < blocco.length) {
      const l = blocco[i++];
      const richiesta =
        `Scopo del messaggio: ${SCOPI[scopo]}.\n` +
        `Tono: ${TONI[tono]}.\n\n` +
        `Azienda destinataria:\n${schedaDi(l)}\n` +
        (istruzioni ? `\nIndicazioni aggiuntive di chi firma: ${istruzioni}\n` : "");
      try {
        const s = await scrivi(firma, richiesta);
        costo += s.costo;
        righe.push({
          mittente_id: mittenteId,
          smtp_id: smtpId,
          lead_id: l.id,
          destinatario: l.email,
          oggetto: s.oggetto || "(oggetto da scrivere)",
          corpo: s.corpo,
          stato: "bozza",
          meta: { origine: "ai", scopo, tono, modello: MODELLO_AI, costo: Number(s.costo.toFixed(5)) },
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

  return {
    creati: righe.length,
    falliti,
    saltati,
    restanti,
    costo: Number(costo.toFixed(4)),
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
    meta: { ...meta, origine: "ai", scopo, tono, modello: MODELLO_AI, ritocco: chiave, costo: Number(s.costo.toFixed(5)) },
  }).eq("id", id);
  if (error) throw new Error(error.message);

  return {
    id,
    oggetto: s.oggetto || m.oggetto,
    corpo: s.corpo,
    costo: Number(s.costo.toFixed(5)),
    uscitaDallaCoda: eraInCoda,
  };
}

// ---------------- Instradamento ----------------

const AZIONI: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
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
