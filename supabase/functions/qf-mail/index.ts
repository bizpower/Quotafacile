// ============================================================
// QuotaFacile — Posta del CRM
// ------------------------------------------------------------
// Invio dalla casella della società, con modelli riutilizzabili
// e registro di ciò che è partito.
//
// PERCHÉ SOLO L'INVIO, E NON LA LETTURA DELLA CASELLA
// Leggere la posta richiede IMAP, cioè una connessione lunga a
// un server di posta: le Edge Function sono fatte per rispondere
// in fretta a una richiesta e poi spegnersi, e per Deno non
// esiste un client IMAP che io mi senta di mettere in mezzo fra
// te e la tua casella. Costruirlo lo stesso avrebbe prodotto una
// schermata che a volte mostra la posta e a volte no, e una
// schermata inaffidabile è peggio di una che manca.
//
// LE CREDENZIALI STANNO NEI SEGRETI DEL PROGETTO
// Mai nel codice, mai nella pagina. Servono:
//   QF_SMTP_HOST   (Aruba: smtps.aruba.it)
//   QF_SMTP_PORT   (Aruba: 465)
//   QF_SMTP_USER   (l'indirizzo completo della casella)
//   QF_SMTP_PASS   (la password della casella)
//   QF_SMTP_FROM   (facoltativo: "Nome <indirizzo>")
// Finché mancano, la funzione risponde 503 e lo dice.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

const testo = (v: unknown, max = 20000) =>
  v === undefined || v === null ? null : String(v).trim().slice(0, max) || null;

const emailValida = (v: string | null) =>
  !!v && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v);

class ErroreCliente extends Error {
  constructor(msg: string, readonly status = 400) { super(msg); }
}

// ---------------- Accesso ----------------

const enc = new TextEncoder();

async function impronta(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function uguali(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

let improntaDb: string | null | undefined;

async function improntaAttesa(): Promise<string | null> {
  const segreto = Deno.env.get("QF_ADMIN_TOKEN");
  if (segreto) return await impronta(segreto);
  if (improntaDb === undefined) {
    const { data } = await db.from("impostazioni_admin")
      .select("token_hash").eq("id", 1).maybeSingle();
    improntaDb = data?.token_hash ?? null;
  }
  return improntaDb;
}

// ---------------- Posta ----------------

function configSmtp() {
  const host = Deno.env.get("QF_SMTP_HOST");
  const user = Deno.env.get("QF_SMTP_USER");
  const pass = Deno.env.get("QF_SMTP_PASS");
  if (!host || !user || !pass) {
    throw new ErroreCliente(
      "Invio non attivo: mancano i segreti della casella nel progetto Supabase " +
      "(QF_SMTP_HOST, QF_SMTP_USER, QF_SMTP_PASS). Su Aruba l'host è smtps.aruba.it sulla porta 465.",
      503,
    );
  }
  const porta = Number(Deno.env.get("QF_SMTP_PORT") || 465);
  return {
    host, user, pass, porta,
    // 465 è la porta con TLS dall'inizio; 587 comincia in chiaro
    // e passa a TLS con STARTTLS. Sono due cose diverse e va
    // detto al client quale delle due sta usando.
    tls: porta === 465,
    from: Deno.env.get("QF_SMTP_FROM") || user,
  };
}

/* Le variabili del modello. Volutamente poche e tutte ricavabili
   da ciò che il CRM sa già: un modello che chiede dati che non
   abbiamo produce email con i buchi dentro. */
function sostituisci(testoModello: string, v: Record<string, string>): string {
  return testoModello.replace(/\{(\w+)\}/g, (intero, nome) =>
    v[nome] !== undefined && v[nome] !== "" ? v[nome] : intero);
}

/* Ogni messaggio dice come farsi togliere. Non è cortesia: i
   contatti sono raccolti in legittimo interesse, e l'art. 21 del
   GDPR dà a chiunque il diritto di opporsi. Un diritto che per
   essere esercitato richiede di indovinare a chi scrivere non è
   un diritto esercitabile. */
const congedo = () =>
  `\n\n—\nHai ricevuto questo messaggio perché la tua attività è presente negli elenchi pubblici della tua zona. ` +
  `Se non desideri altre comunicazioni, rispondi a questa email scrivendo NO: ` +
  `il tuo indirizzo verrà escluso da ogni invio futuro.\nBizpower`;

// ---------------- Azioni ----------------

async function elenco() {
  const [modelli, inviate] = await Promise.all([
    db.from("crm_email_modelli").select("*").order("nome"),
    db.from("crm_email_inviate").select("*")
      .order("inviata_il", { ascending: false }).limit(300),
  ]);
  if (modelli.error) throw new Error(modelli.error.message);
  return {
    modelli: modelli.data ?? [],
    inviate: inviate.data ?? [],
    configurata: !!(Deno.env.get("QF_SMTP_HOST") && Deno.env.get("QF_SMTP_USER") && Deno.env.get("QF_SMTP_PASS")),
    letteIl: new Date().toISOString(),
  };
}

async function salvaModello(d: Record<string, unknown>) {
  const nome = testo(d.nome, 120);
  const oggetto = testo(d.oggetto, 300);
  const corpo = testo(d.corpo, 20000);
  const scopo = String(d.scopo ?? "contatto");
  if (!nome || !oggetto || !corpo) throw new ErroreCliente("Nome, oggetto e testo sono obbligatori");
  if (!["contatto", "preventivo", "sollecito", "informativa"].includes(scopo)) {
    throw new ErroreCliente("Scopo non riconosciuto");
  }
  const riga = { nome, oggetto, corpo, scopo };
  const id = testo(d.id, 40);

  if (id) {
    const { error } = await db.from("crm_email_modelli").update(riga).eq("id", id);
    if (error) throw new Error(error.message);
    return { id, aggiornato: true };
  }
  const { data, error } = await db.from("crm_email_modelli").insert(riga).select("id").single();
  if (error) {
    throw new ErroreCliente(error.code === "23505"
      ? "Esiste già un modello con questo nome"
      : error.message);
  }
  return { id: data.id };
}

async function eliminaModello(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo del modello");
  const { error } = await db.from("crm_email_modelli").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { eliminato: true };
}

// Anteprima: mostra il messaggio esatto che partirebbe, senza
// mandarlo. Vedere prima cosa si sta per scrivere a una persona
// vale più di qualunque controllo automatico.
async function anteprima(d: Record<string, unknown>) {
  const { oggetto, corpo, destinatario, avvisi } = await comporre(d);
  return { oggetto, corpo, destinatario, avvisi };
}

async function comporre(d: Record<string, unknown>) {
  const leadId = testo(d.leadId, 40);
  const modelloId = testo(d.modelloId, 40);
  const avvisi: string[] = [];

  let lead: Record<string, unknown> | null = null;
  if (leadId) {
    const { data } = await db.from("crm_lead").select("*").eq("id", leadId).maybeSingle();
    lead = data;
    if (!lead) throw new ErroreCliente("Il lead indicato non esiste più");
    if (lead.no_contatto) {
      throw new ErroreCliente(
        `${lead.nome} si è opposto a ricevere comunicazioni. L'invio è bloccato.`,
      );
    }
  }

  let modello: Record<string, unknown> | null = null;
  if (modelloId) {
    const { data } = await db.from("crm_email_modelli").select("*").eq("id", modelloId).maybeSingle();
    modello = data;
    if (!modello) throw new ErroreCliente("Il modello indicato non esiste più");
  }

  /* Se non è indicato chi firma, {mittente} resta com'è e fa
     scattare l'avviso sui segnaposto: meglio che venga chiesto,
     piuttosto che partire un "mi chiamo Bizpower e lavoro per
     Bizpower". */
  let mittente = "";
  const collaboratoreId = testo(d.collaboratoreId, 40);
  if (collaboratoreId) {
    const { data } = await db.from("crm_collaboratori")
      .select("nome").eq("id", collaboratoreId).maybeSingle();
    if (data?.nome) mittente = data.nome;
  }

  const variabili: Record<string, string> = {
    azienda: String(lead?.nome ?? ""),
    citta: String(lead?.citta ?? "la vostra zona"),
    telefono: String(lead?.telefono ?? ""),
    mittente,
  };

  const oggetto = sostituisci(testo(d.oggetto, 300) ?? String(modello?.oggetto ?? ""), variabili);
  const corpoBase = sostituisci(testo(d.corpo, 20000) ?? String(modello?.corpo ?? ""), variabili);
  if (!oggetto || !corpoBase) throw new ErroreCliente("Servono oggetto e testo");

  // Variabili rimaste non sostituite: sarebbero partite così,
  // con le graffe in bella vista dentro il messaggio.
  const rimaste = [...corpoBase.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (rimaste.length) {
    avvisi.push(`Nel testo restano segnaposto non compilati: ${[...new Set(rimaste)].join(", ")}. Partirebbero così come sono scritti.`);
  }

  /* L'indirizzo: quello scritto adesso, oppure quello già
     annotato sul lead. Google Places non restituisce le email,
     quindi la prima volta va cercata e scritta a mano. */
  const dest = testo(d.destinatario, 200) ?? (lead?.email ? String(lead.email) : null);
  if (!emailValida(dest)) {
    throw new ErroreCliente(lead
      ? `Per ${lead.nome} non c'è un indirizzo email. Google Places non le fornisce: cercala sul loro sito e scrivila nella scheda del lead, oppure telefona.`
      : "Indirizzo del destinatario mancante o non valido");
  }

  return { oggetto, corpo: corpoBase + congedo(), destinatario: dest!, lead, modello, mittente, avvisi };
}

async function invia(d: Record<string, unknown>) {
  const cfg = configSmtp();
  const { oggetto, corpo, destinatario, lead, modello, avvisi } = await comporre(d);

  const riga = {
    lead_id: lead?.id ?? null,
    collaboratore_id: testo(d.collaboratoreId, 40),
    modello_id: modello?.id ?? null,
    destinatario,
    oggetto,
    corpo,
  };

  let errore: string | null = null;
  try {
    const client = new SMTPClient({
      connection: {
        hostname: cfg.host,
        port: cfg.porta,
        tls: cfg.tls,
        auth: { username: cfg.user, password: cfg.pass },
      },
    });
    await client.send({ from: cfg.from, to: destinatario, subject: oggetto, content: corpo });
    await client.close();
  } catch (e) {
    errore = e instanceof Error ? e.message : "Invio non riuscito";
  }

  // Il registro si scrive comunque, riuscito o no: un invio
  // fallito è un fatto da sapere, non da dimenticare.
  await db.from("crm_email_inviate").insert({
    ...riga,
    esito: errore ? "fallita" : "inviata",
    errore,
  });

  /* L'indirizzo usato resta sul lead: la prossima volta non si
     ricomincia dalla ricerca sul sito dell'azienda. */
  if (!errore && lead?.id && !lead.email) {
    await db.from("crm_lead").update({ email: destinatario }).eq("id", lead.id);
  }

  if (errore) {
    throw new ErroreCliente(
      "La casella ha rifiutato l'invio: " + errore +
      ". Controlla host, porta e credenziali fra i segreti del progetto.",
      502,
    );
  }

  // Un'email mandata è un'attività: registrarla da qui evita di
  // doverla ricordare due volte, e fa sì che conti nella
  // produzione come conta una telefonata.
  if (lead?.id) {
    await db.from("crm_attivita").insert({
      lead_id: lead.id,
      collaboratore_id: riga.collaboratore_id,
      tipo: "email",
      testo: "Inviata: " + oggetto,
    });
    await db.from("crm_lead")
      .update({ stato: "contattato", contattato_il: new Date().toISOString() })
      .eq("id", lead.id).eq("stato", "nuovo");
  }

  return { inviata: true, destinatario, avvisi };
}

// Registrare l'opposizione di qualcuno. È l'altra faccia
// dell'invio: senza questo, il diritto di opporsi resterebbe una
// frase nel congedo delle email.
async function noContatto(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo del lead");
  const attivo = d.attivo !== false;
  const { error } = await db.from("crm_lead").update({
    no_contatto: attivo,
    no_contatto_il: attivo ? new Date().toISOString() : null,
    no_contatto_motivo: attivo ? (testo(d.motivo, 500) ?? "Opposizione ricevuta") : null,
  }).eq("id", id);
  if (error) throw new Error(error.message);
  return { no_contatto: attivo };
}

const AZIONI: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
  elenco: () => elenco(),
  "salva-modello": salvaModello,
  "elimina-modello": eliminaModello,
  anteprima,
  invia,
  "no-contatto": noContatto,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return rispondi({ ok: false, errore: "Metodo non consentito" }, 405);

  const atteso = await improntaAttesa();
  if (!atteso) {
    return rispondi({ ok: false, errore: "CRM non attivo: nessuna chiave di amministrazione configurata.", configurazioneMancante: true }, 503);
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
    if (e instanceof ErroreCliente) return rispondi({ ok: false, errore: e.message }, e.status);
    console.error("[qf-mail]", e);
    return rispondi({ ok: false, errore: e instanceof Error ? e.message : "Errore imprevisto" }, 500);
  }
});
