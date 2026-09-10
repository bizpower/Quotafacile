// ============================================================
// QuotaFacile — Mail Marketing
// ------------------------------------------------------------
// Il modulo che su Lovable stava nel progetto Bizpower, portato
// dentro QuotaFacile. Undici sezioni; questa funzione le serve
// tutte, una azione per volta.
//
// Tutte e undici sono costruite: la Dashboard, il Lead Finder,
// le liste, le campagne, la posta in uscita, la scrittura
// assistita, i modelli, le caselle di invio, il registro, le
// sequenze e la blacklist.
//
// I LEAD NON SI DUPLICANO
// Su Lovable ogni lista aveva le proprie righe: la stessa azienda
// in tre liste erano tre schede che invecchiavano separate, e
// l'opposizione registrata su una non fermava le altre due. Qui
// il lead vive una volta sola in crm_lead — lo stesso archivio
// della pipeline del CRM — e le liste ci puntano.
//
// LE PASSWORD DELLE CASELLE STANNO NEL VAULT
// Su Lovable la password del server di posta era una colonna
// della tabella. Qui la tabella conserva solo l'identificativo
// del segreto nel Vault di Supabase: chi legge le righe vede il
// numero della cassetta, non cosa c'è dentro, e la chiave ce
// l'ha il database. Le tre funzioni che aprono la cassetta sono
// eseguibili solo da service_role.
//
// I CONTI SI FANNO QUI, NON NEL BROWSER
// Su Lovable la Dashboard scaricava fino a 2000 email e le
// contava in pagina. Funziona finché le email sono poche: al
// primo mese di invii veri diventa un megabyte di JSON per
// mostrare otto numeri. Qui i conteggi li fa il database, che è
// il posto in cui contare costa meno.
//
// ACCESSO: la stessa chiave dell'area riservata, confrontata per
// impronta a tempo costante. Nessun dato esce senza.
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
let improntaCoda: string | null | undefined;

/* Il token del cron apre una porta sola. Tenerlo separato dalla
   chiave di amministrazione vuol dire che un cron compromesso fa
   partire posta gia approvata, non legge il CRM. */
async function improntaCodaAttesa(): Promise<string | null> {
  if (improntaCoda === undefined) {
    const { data } = await db.from("impostazioni_admin")
      .select("coda_hash").eq("id", 1).maybeSingle();
    improntaCoda = data?.coda_hash ?? null;
  }
  return improntaCoda;
}

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

// ---------------- Le caselle di invio ----------------

const testo = (v: unknown, max = 20000) =>
  v === undefined || v === null ? null : String(v).trim().slice(0, max) || null;

const emailValida = (v: string | null) =>
  !!v && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v);

const oggi = () => new Date().toISOString().slice(0, 10);

/* Il contatore giornaliero non si azzera da solo a mezzanotte:
   si azzera la prima volta che lo si guarda in un giorno nuovo.
   Un cron per una sottrazione sarebbe una cosa in più che si può
   rompere. */
const inviateOggiDi = (s: { inviate_oggi: number; giorno_contatore: string }) =>
  s.giorno_contatore === oggi() ? (s.inviate_oggi ?? 0) : 0;

/* La password non torna mai indietro verso il browser, nemmeno
   mascherata: queste sono le colonne che si possono leggere. */
const COLONNE_SMTP =
  "id,creato_il,mittente_id,nome,host,porta,utente,from_email,from_nome,rispondi_a,tls," +
  "stato,limite_giornaliero,inviate_oggi,giorno_contatore,ultimo_uso," +
  "ultimo_test_il,ultimo_test_esito,ultimo_test_errore,firma,firma_attiva," +
  "spf_stato,dkim_stato,dmarc_stato,dkim_selettore,punteggio,dns_esito,dns_verificato_il";

type Casella = Record<string, string | number | boolean | null>;

async function caselle(): Promise<Casella[]> {
  /* segreto_id serve qui dentro per sapere se una password c'è,
     e non deve uscire: è il numero della cassetta. */
  const { data, error } = await db.from("mm_smtp")
    .select(`${COLONNE_SMTP},segreto_id`).order("creato_il");
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ segreto_id, ...s }) => ({
    ...s,
    inviate_oggi: inviateOggiDi(s as never),
    ha_password: segreto_id != null,
  })) as Casella[];
}

async function casellaConPassword(id: string) {
  const { data, error } = await db.from("mm_smtp").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ErroreCliente("Questa casella non esiste più.", 404);
  if (!data.segreto_id) {
    throw new ErroreCliente(
      `La casella «${data.nome}» non ha una password salvata. Aprila in modifica e inseriscila.`,
    );
  }
  const { data: pass, error: e2 } = await db.rpc("mm_segreto_leggi", { p_id: data.segreto_id });
  if (e2) throw new Error(e2.message);
  if (!pass) throw new ErroreCliente(`La password della casella «${data.nome}» non è più leggibile. Reinseriscila.`);
  return { casella: data, password: String(pass) };
}

/* La Dashboard deve poter dire "non puoi ancora spedire" prima
   che qualcuno prepari una campagna intera. */
function statoInvio(cc: Casella[]) {
  const attive = cc.filter((c) => c.stato === "attivo");
  const provate = attive.filter((c) => c.ultimo_test_esito === "ok");
  return {
    configurato: attive.length > 0,
    provato: provate.length > 0,
    caselle: cc.length,
    attive: attive.length,
  };
}

// ---------------- Panoramica ----------------

/* Un conteggio non ha bisogno delle righe: head:true chiede al
   database solo quante sono. */
const numero = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

async function panoramica() {
  const ora = new Date();
  const ieri = new Date(ora.getTime() - 86400000).toISOString();
  const settimana = new Date(ora.getTime() - 7 * 86400000).toISOString();
  const cont = { count: "exact", head: true } as const;

  const [
    mittenti, smtp, liste, campagne, ultimeInviate, ultimiErrori,
    perStato, seriePerGiorno,
    lead, leadNoContatto, blacklist, inviateOggi, ultimi7,
  ] = await Promise.all([
    db.from("mm_mittenti").select("*").order("creato_il"),
    caselle().then((data) => ({ data, error: null })),
    /* Le liste con quanti lead contengono: una lista senza il suo
       numero accanto costringe ad aprirla per sapere se è vuota. */
    db.from("mm_liste").select("*,mm_lista_lead(count)").order("creata_il", { ascending: false }),
    db.from("mm_campagne").select("*,mm_email(count)").order("creata_il", { ascending: false }).limit(50),
    db.from("mm_email").select("id,destinatario,oggetto,inviata_il,mittente_id")
      .eq("stato", "inviata").order("inviata_il", { ascending: false }).limit(6),
    db.from("mm_email").select("id,destinatario,oggetto,errore,creata_il")
      .eq("stato", "fallita").order("creata_il", { ascending: false }).limit(4),
    db.from("mm_email").select("stato"),
    db.from("mm_email").select("inviata_il").eq("stato", "inviata")
      .gte("inviata_il", new Date(ora.getTime() - 14 * 86400000).toISOString()),
    numero(db.from("crm_lead").select("id", cont)),
    numero(db.from("crm_lead").select("id", cont).eq("no_contatto", true)),
    numero(db.from("mm_blacklist").select("id", cont)),
    numero(db.from("mm_email").select("id", cont).eq("stato", "inviata").gte("inviata_il", ieri)),
    numero(db.from("mm_email").select("id", cont).gte("creata_il", settimana)),
  ]);

  const errore = [mittenti, smtp, liste, campagne, perStato].find((r) => r.error);
  if (errore?.error) throw new Error(errore.error.message);

  /* Un solo passaggio sugli stati invece di sei conteggi
     separati: le righe sono le stesse, le query no. */
  const stati: Record<string, number> = {
    bozza: 0, pronta: 0, in_coda: 0, inviata: 0, fallita: 0, annullata: 0,
  };
  for (const r of (perStato.data ?? []) as { stato: string }[]) {
    stati[r.stato] = (stati[r.stato] ?? 0) + 1;
  }

  /* Quattordici colonne, una per giorno, comprese quelle a zero:
     un grafico che salta i giorni vuoti mente sull'andamento. */
  const giorni: { giorno: string; quante: number }[] = [];
  const indice = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(ora);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    indice.set(k, giorni.length);
    giorni.push({ giorno: k, quante: 0 });
  }
  for (const r of (seriePerGiorno.data ?? []) as { inviata_il: string }[]) {
    if (!r.inviata_il) continue;
    const k = new Date(r.inviata_il).toISOString().slice(0, 10);
    const i = indice.get(k);
    if (i !== undefined) giorni[i].quante++;
  }

  const consegnate = stati.inviata;
  const fallite = stati.fallita;
  const denom = consegnate + fallite;

  return {
    mittenti: mittenti.data ?? [],
    smtp: smtp.data ?? [],
    liste: (liste.data ?? []).map((l: Record<string, unknown>) => {
      const { mm_lista_lead, ...resto } = l as { mm_lista_lead?: { count: number }[] };
      return { ...resto, quanti: mm_lista_lead?.[0]?.count ?? 0 };
    }),
    campagne: (campagne.data ?? []).map((c: Record<string, unknown>) => {
      const { mm_email, ...resto } = c as { mm_email?: { count: number }[] };
      return { ...resto, quanti: mm_email?.[0]?.count ?? 0 };
    }),
    ultimeInviate: ultimeInviate.data ?? [],
    ultimiErrori: ultimiErrori.data ?? [],
    giorni,
    invio: statoInvio((smtp.data ?? []) as Casella[]),
    numeri: {
      inviateOggi,
      inviateTotali: consegnate,
      inCoda: stati.in_coda,
      pronte: stati.pronta,
      bozze: stati.bozza,
      fallite,
      ultimi7,
      lead,
      leadNoContatto,
      blacklist,
      liste: (liste.data ?? []).length,
      // null e non 0: "nessun invio ancora" non è "0% di consegne"
      consegna: denom === 0 ? null : Math.round((consegnate / denom) * 100),
    },
  };
}

// ---------------- SMTP: la casella ----------------

async function smtpSalva(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  const nome = testo(d.nome, 120);
  const host = testo(d.host, 200);
  const utente = testo(d.utente, 200);
  const fromEmail = (testo(d.from_email, 200) || "").toLowerCase() || null;
  const password = testo(d.password, 400);
  const porta = Number(d.porta) || 465;

  if (!nome) throw new ErroreCliente("Dai un nome alla casella: serve a riconoscerla nell'elenco.");
  if (!host) throw new ErroreCliente("Manca l'host del server di posta. Su Aruba è smtps.aruba.it.");
  if (!utente) throw new ErroreCliente("Manca l'utente. Di solito è l'indirizzo completo della casella.");
  if (!emailValida(fromEmail)) throw new ErroreCliente("L'indirizzo del mittente non è valido.");
  const rispondiA = testo(d.rispondi_a, 200);
  if (rispondiA && !emailValida(rispondiA)) throw new ErroreCliente("L'indirizzo per le risposte non è valido.");
  if (porta < 1 || porta > 65535) throw new ErroreCliente("La porta deve essere un numero fra 1 e 65535.");

  const limite = Math.max(1, Math.min(100000, Number(d.limite_giornaliero) || 200));
  const riga: Record<string, unknown> = {
    nome, host, porta, utente,
    from_email: fromEmail,
    from_nome: testo(d.from_nome, 120) ?? "",
    rispondi_a: rispondiA,
    /* 465 apre già in TLS; 587 parte in chiaro e ci passa con
       STARTTLS. Sono due cose diverse e sbagliarle dà un errore
       che non somiglia a quello che è. */
    tls: d.tls === undefined ? porta === 465 : !!d.tls,
    limite_giornaliero: limite,
    firma: testo(d.firma, 4000),
    firma_attiva: d.firma_attiva !== false,
  };
  /* Solo se indicati: un campo assente vuol dire "non toccarlo".
     Altrimenti correggere il limite giornaliero di una casella
     che funziona la riporterebbe a «nuova» e senza mittente. */
  const mittente = testo(d.mittente_id, 40);
  if (mittente) riga.mittente_id = mittente;
  if (["nuovo", "attivo", "errore", "sospeso"].includes(String(d.stato))) riga.stato = d.stato;

  if (id) {
    const { data: esistente } = await db.from("mm_smtp").select("id,segreto_id,nome").eq("id", id).maybeSingle();
    if (!esistente) throw new ErroreCliente("Questa casella non esiste più.", 404);
    /* Password vuota in modifica vuol dire "lasciala com'era":
       chiederla di nuovo a ogni ritocco del limite giornaliero
       è il modo migliore per farla scrivere su un foglietto. */
    if (password) {
      const { data: sid, error } = await db.rpc("mm_segreto_scrivi", {
        p_id: esistente.segreto_id, p_valore: password, p_nome: `mm_smtp_${id}`,
      });
      if (error) throw new Error(error.message);
      riga.segreto_id = sid;
    }
    const { error } = await db.from("mm_smtp").update(riga).eq("id", id);
    if (error) throw new Error(error.message);
    return { id };
  }

  if (!password) throw new ErroreCliente("Serve la password della casella per poterci spedire.");
  const { data: creata, error } = await db.from("mm_smtp").insert(riga).select("id").single();
  if (error) throw new Error(error.message);
  const { data: sid, error: e2 } = await db.rpc("mm_segreto_scrivi", {
    p_id: null, p_valore: password, p_nome: `mm_smtp_${creata.id}`,
  });
  if (e2) {
    /* Una casella senza password non serve a niente e confonde:
       meglio non lasciarla lì a metà. */
    await db.from("mm_smtp").delete().eq("id", creata.id);
    throw new Error(e2.message);
  }
  await db.from("mm_smtp").update({ segreto_id: sid }).eq("id", creata.id);
  return { id: creata.id };
}

async function smtpElimina(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo della casella");
  const { data } = await db.from("mm_smtp").select("segreto_id").eq("id", id).maybeSingle();
  const { error } = await db.from("mm_smtp").delete().eq("id", id);
  if (error) throw new Error(error.message);
  /* Il segreto se ne va con la casella: lasciarlo nel Vault
     vorrebbe dire accumulare password di caselle che non esistono. */
  if (data?.segreto_id) await db.rpc("mm_segreto_elimina", { p_id: data.segreto_id });
  return { eliminata: id };
}

async function smtpStato(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  const stato = String(d.stato ?? "");
  if (!id) throw new ErroreCliente("Manca l'identificativo della casella");
  if (!["attivo", "sospeso"].includes(stato)) throw new ErroreCliente("Stato non ammesso");
  const { error } = await db.from("mm_smtp").update({ stato }).eq("id", id);
  if (error) throw new Error(error.message);
  return { id, stato };
}

// ---------------- SMTP: parlare col server di posta ----------------

async function apriClient(casella: Record<string, unknown>, password: string) {
  const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
  return new SMTPClient({
    connection: {
      hostname: String(casella.host),
      port: Number(casella.porta),
      tls: !!casella.tls,
      auth: { username: String(casella.utente), password },
    },
  });
}

const intestazioneDa = (c: Record<string, unknown>) =>
  c.from_nome ? `${c.from_nome} <${c.from_email}>` : String(c.from_email);

/* Il consumo si registra sul tentativo, non sulla riuscita: se
   il fornitore ha contato la connessione, averla contata anche
   qui è l'unico modo perché il limite serva a qualcosa. */
async function registraInvio(c: Record<string, unknown>, quante = 1) {
  const stessoGiorno = c.giorno_contatore === oggi();
  await db.from("mm_smtp").update({
    inviate_oggi: (stessoGiorno ? Number(c.inviate_oggi ?? 0) : 0) + quante,
    giorno_contatore: oggi(),
    ultimo_uso: new Date().toISOString(),
  }).eq("id", c.id as string);
}

function quotaResidua(c: Record<string, unknown>) {
  const limite = Number(c.limite_giornaliero ?? 0);
  if (limite <= 0) return Infinity;
  return limite - (c.giorno_contatore === oggi() ? Number(c.inviate_oggi ?? 0) : 0);
}

async function smtpProva(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo della casella");
  const { casella, password } = await casellaConPassword(id);

  const adesso = new Date().toISOString();
  try {
    const client = await apriClient(casella, password);
    await client.send({
      from: intestazioneDa(casella),
      to: String(casella.from_email),
      subject: "QuotaFacile — prova della casella di invio",
      content:
        `La casella «${casella.nome}» funziona.\n\n` +
        `Server: ${casella.host}:${casella.porta} (${casella.tls ? "TLS dall'inizio" : "STARTTLS"})\n` +
        `Utente: ${casella.utente}\n` +
        `Prova eseguita il ${new Date().toLocaleString("it-IT")}.\n\n` +
        `Questo messaggio è partito dal Mail Marketing di QuotaFacile ed è arrivato ` +
        `a te stesso: se lo stai leggendo, il percorso è completo.`,
    });
    try { await client.close(); } catch { /* connessione già chiusa */ }
    await db.from("mm_smtp").update({
      stato: casella.stato === "sospeso" ? "sospeso" : "attivo",
      ultimo_test_il: adesso, ultimo_test_esito: "ok", ultimo_test_errore: null,
    }).eq("id", id);
    await registraInvio(casella);
    return { esito: "ok", destinatario: casella.from_email };
  } catch (e) {
    const messaggio = leggibile(e);
    await db.from("mm_smtp").update({
      stato: "errore", ultimo_test_il: adesso, ultimo_test_esito: "errore", ultimo_test_errore: messaggio,
    }).eq("id", id);
    throw new ErroreCliente(messaggio);
  }
}

/* Gli errori dei server di posta sono scritti per chi li ha
   programmati. Le tre cause vere si riconoscono, e dirle in
   italiano risparmia mezz'ora di tentativi. */
function leggibile(e: unknown): string {
  const g = e instanceof Error ? e.message : String(e);
  const b = g.toLowerCase();
  if (b.includes("535") || b.includes("authentication") || b.includes("invalid login"))
    return "Utente o password rifiutati dal server. Su Aruba l'utente è l'indirizzo completo della casella, non solo la parte prima della chiocciola.";
  if (b.includes("timeout") || b.includes("timed out"))
    return "Il server non ha risposto in tempo. Di solito è la porta sbagliata: 465 con TLS, 587 senza.";
  if (b.includes("certificate") || b.includes("tls") || b.includes("ssl"))
    return "Handshake TLS fallito: la porta e l'impostazione TLS non vanno d'accordo. La 465 vuole TLS acceso, la 587 spento.";
  if (b.includes("enotfound") || b.includes("dns") || b.includes("resolve"))
    return "Host non trovato: controlla il nome del server. Su Aruba è smtps.aruba.it.";
  return g.slice(0, 500);
}

async function smtpInvioRapido(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  const oggetto = testo(d.oggetto, 300);
  const corpo = testo(d.corpo, 40000);
  if (!id) throw new ErroreCliente("Manca l'identificativo della casella");
  if (!oggetto) throw new ErroreCliente("Serve un oggetto: senza, il messaggio parte già sospetto.");
  if (!corpo) throw new ErroreCliente("Il messaggio è vuoto.");

  const destinatari = String(d.destinatari ?? "")
    .split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const nonValidi = destinatari.filter((x) => !emailValida(x));
  if (destinatari.length === 0) throw new ErroreCliente("Indica almeno un destinatario.");
  if (nonValidi.length) throw new ErroreCliente(`Indirizzi non validi: ${nonValidi.join(", ")}`);

  /* La blacklist vale anche qui, e con lei le opposizioni
     registrate sui lead: un invio "rapido" che salta il controllo
     sarebbe la scorciatoia da cui esce il messaggio a chi aveva
     detto di no. Sono due elenchi perché chi si oppone non è
     sempre qualcuno che abbiamo già in archivio. */
  const [{ data: vietati }, { data: opposti }] = await Promise.all([
    db.from("mm_blacklist").select("email"),
    db.from("crm_lead").select("email").eq("no_contatto", true).not("email", "is", null),
  ]);
  const nero = new Set([
    ...(vietati ?? []).map((r: { email: string }) => r.email.toLowerCase()),
    ...(opposti ?? []).map((r: { email: string }) => r.email.toLowerCase()),
  ]);
  const bloccati = destinatari.filter((x) => nero.has(x));
  if (bloccati.length) {
    throw new ErroreCliente(
      `${bloccati.join(", ")} ${bloccati.length === 1 ? "è in blacklist" : "sono in blacklist"}: ` +
      `l'invio è rifiutato.`,
    );
  }

  const { casella, password } = await casellaConPassword(id);
  if (casella.stato === "sospeso") throw new ErroreCliente("La casella è in pausa. Riattivala per spedire.");
  const residua = quotaResidua(casella);
  if (destinatari.length > residua) {
    throw new ErroreCliente(
      `Limite giornaliero: restano ${residua === Infinity ? "infiniti" : residua} invii e i destinatari sono ${destinatari.length}.`,
    );
  }

  const testoFinale = casella.firma_attiva && casella.firma
    ? `${corpo}\n\n${casella.firma}`
    : corpo;

  const client = await apriClient(casella, password);
  const riusciti: string[] = [];
  const falliti: { a: string; errore: string }[] = [];

  for (const a of destinatari) {
    try {
      await client.send({
        from: intestazioneDa(casella),
        to: a,
        replyTo: (casella.rispondi_a as string) || undefined,
        subject: oggetto,
        content: testoFinale,
      });
      riusciti.push(a);
    } catch (e) {
      falliti.push({ a, errore: leggibile(e) });
    }
  }
  /* close() non restituisce sempre una promise, e se la
     connessione è già caduta solleva: in nessuno dei due casi
     deve far fallire un invio che è andato a buon fine. */
  try { await client.close(); } catch { /* connessione già chiusa */ }

  /* Il registro tiene traccia anche degli invii rapidi: "abbiamo
     scritto a tutti" deve restare una frase verificabile. */
  const righe = [
    ...riusciti.map((a) => ({
      mittente_id: casella.mittente_id, smtp_id: casella.id, destinatario: a,
      oggetto, corpo: testoFinale, stato: "inviata", inviata_il: new Date().toISOString(),
      meta: { origine: "invio_rapido" },
    })),
    ...falliti.map((f) => ({
      mittente_id: casella.mittente_id, smtp_id: casella.id, destinatario: f.a,
      oggetto, corpo: testoFinale, stato: "fallita", errore: f.errore,
      meta: { origine: "invio_rapido" },
    })),
  ];
  if (righe.length) await db.from("mm_email").insert(righe);
  if (riusciti.length) await registraInvio(casella, riusciti.length);

  if (riusciti.length === 0) {
    throw new ErroreCliente(falliti.map((f) => `${f.a}: ${f.errore}`).join(" · "));
  }
  return { riusciti, falliti };
}

// ---------------- SMTP: i record del dominio ----------------

/* SPF, DKIM e DMARC sono i tre documenti che dicono a chi riceve
   che questo dominio ha davvero autorizzato chi sta spedendo.
   Senza, la posta parte lo stesso e finisce nello spam: è la
   differenza fra "l'ho mandata" e "l'hanno letta". */

async function dns(nome: string, tipo: string): Promise<string[]> {
  try {
    const r = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(nome)}&type=${tipo}`,
      { headers: { accept: "application/dns-json" } },
    );
    const j = await r.json();
    if (!j.Answer) return [];
    return j.Answer.map((a: { data?: string }) =>
      String(a.data ?? "").replace(/^"|"$/g, "").replace(/" "/g, ""));
  } catch {
    return [];
  }
}

const dominioDi = (email: string) => {
  const i = email.indexOf("@");
  return (i >= 0 ? email.slice(i + 1) : email).trim().toLowerCase();
};

/* Ogni fornitore vuole essere citato nell'SPF con la sua
   formula: se manca la sua, il record c'è ma non copre chi
   spedisce davvero. */
function includeAtteso(host: string): string | null {
  const h = host.toLowerCase();
  if (h.includes("aruba")) return "_spf.aruba.it";
  if (h.includes("gmail") || h.includes("google")) return "_spf.google.com";
  if (h.includes("office365") || h.includes("outlook")) return "spf.protection.outlook.com";
  if (h.includes("sendgrid")) return "sendgrid.net";
  if (h.includes("brevo") || h.includes("sendinblue")) return "spf.brevo.com";
  if (h.includes("mailgun")) return "mailgun.org";
  if (h.includes("amazonaws")) return "amazonses.com";
  return null;
}

const SELETTORI: Record<string, string[]> = {
  aruba: ["default", "aruba", "a1"],
  google: ["google", "20230601"],
  gmail: ["google", "20230601"],
  office365: ["selector1", "selector2"],
  outlook: ["selector1", "selector2"],
  sendgrid: ["s1", "s2", "em"],
  brevo: ["mail", "brevo1", "brevo2"],
  mailgun: ["mailo", "k1", "smtp"],
};

function selettoriPer(host: string): string[] {
  const h = host.toLowerCase();
  for (const [k, v] of Object.entries(SELETTORI)) if (h.includes(k)) return v;
  return [];
}

async function smtpDns(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo della casella");
  const { data: c, error } = await db.from("mm_smtp").select(COLONNE_SMTP).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new ErroreCliente("Questa casella non esiste più.", 404);

  const dominio = dominioDi(String(c.from_email));
  if (!dominio) throw new ErroreCliente("L'indirizzo del mittente non ha un dominio leggibile.");

  // --- SPF ---
  const txt = await dns(dominio, "TXT");
  const spfRecord = txt.filter((r) => r.toLowerCase().startsWith("v=spf1"));
  const atteso = includeAtteso(String(c.host));
  let spf: string;
  if (spfRecord.length === 0) spf = "assente";
  else if (!atteso || spfRecord.some((r) => r.toLowerCase().includes(atteso.toLowerCase()))) spf = "ok";
  else spf = "avviso";

  // --- DKIM ---
  const daProvare = [...new Set([
    c.dkim_selettore as string,
    ...selettoriPer(String(c.host)),
    "default", "selector1", "google", "k1", "mail", "s1",
  ].filter(Boolean))];
  const provati: { selettore: string; trovato: boolean }[] = [];
  let dkim = "assente";
  let dkimSelettore: string | null = null;
  let dkimRecord: string | null = null;
  for (const s of daProvare) {
    const r = await dns(`${s}._domainkey.${dominio}`, "TXT");
    const trovato = r.find((x) => /v=dkim1|k=rsa|p=/i.test(x));
    provati.push({ selettore: s, trovato: !!trovato });
    if (trovato) { dkim = "ok"; dkimSelettore = s; dkimRecord = trovato; break; }
  }

  // --- DMARC ---
  const dmarcTxt = await dns(`_dmarc.${dominio}`, "TXT");
  const dmarcRecord = dmarcTxt.find((r) => r.toLowerCase().startsWith("v=dmarc1")) ?? null;
  const dmarc = !dmarcRecord ? "assente"
    : /p=\s*(quarantine|reject)/i.test(dmarcRecord) ? "ok" : "avviso";

  /* SPF e DKIM valgono 40 ciascuno perché sono quelli che i
     grandi provider guardano davvero; DMARC 20 perché senza gli
     altri due non serve a niente. */
  const punteggio =
    (spf === "ok" ? 40 : spf === "avviso" ? 20 : 0) +
    (dkim === "ok" ? 40 : 0) +
    (dmarc === "ok" ? 20 : dmarc === "avviso" ? 10 : 0);

  const esito = {
    dominio,
    verificato_il: new Date().toISOString(),
    spf: { stato: spf, record: spfRecord, atteso },
    dkim: { stato: dkim, selettore: dkimSelettore, record: dkimRecord, provati },
    dmarc: { stato: dmarc, record: dmarcRecord },
    punteggio,
    consigli: {
      spf: atteso ? `v=spf1 include:${atteso} ~all` : "v=spf1 a mx ~all",
      dkim: `Genera la chiave DKIM dal pannello di ${c.host} e pubblica il record TXT su <selettore>._domainkey.${dominio}`,
      dmarc: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${dominio}; pct=100`,
    },
  };

  await db.from("mm_smtp").update({
    spf_stato: spf, dkim_stato: dkim, dmarc_stato: dmarc,
    dkim_selettore: dkimSelettore ?? c.dkim_selettore ?? null,
    punteggio, dns_esito: esito, dns_verificato_il: esito.verificato_il,
  }).eq("id", id);

  return { esito };
}

// ---------------- Liste ----------------

/* Una lista è un punto di vista sui lead del CRM, non una copia.
   Su Lovable ogni lista aveva le proprie righe: la stessa azienda
   in tre liste erano tre record che invecchiavano ognuno per
   conto suo, e l'opposizione registrata su uno non fermava gli
   altri due. Qui il lead è uno, e le liste ci puntano. */

async function listaSalva(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  const nome = testo(d.nome, 120);
  if (!nome) throw new ErroreCliente("Dai un nome alla lista.");
  const riga = {
    nome,
    descrizione: testo(d.descrizione, 500),
    mittente_id: testo(d.mittente_id, 40),
  };
  if (id) {
    const { error } = await db.from("mm_liste").update(riga).eq("id", id);
    if (error) throw new Error(error.message);
    return { id };
  }
  const { data, error } = await db.from("mm_liste").insert(riga).select("id").single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}

async function listaElimina(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo della lista");
  const { error } = await db.from("mm_liste").delete().eq("id", id);
  if (error) throw new Error(error.message);
  /* I lead restano: erano già in archivio prima della lista e
     continuano a esserci dopo. Sparisce l'appartenenza. */
  return { eliminata: id };
}

/* Le colonne dei lead che servono al mail marketing. Non tutte:
   note e stato della trattativa sono lavoro della pipeline. */
const COLONNE_LEAD =
  "id,nome,categoria,citta,provincia,indirizzo,telefono,sito,email," +
  "valutazione,recensioni,fonte,raccolto_il,query_origine,no_contatto,no_contatto_motivo";

async function listaContenuto(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo della lista");

  const { data: dentro, error } = await db.from("mm_lista_lead")
    .select("lead_id,aggiunto_il").eq("lista_id", id)
    .order("aggiunto_il", { ascending: false });
  if (error) throw new Error(error.message);
  const ids = (dentro ?? []).map((r: { lead_id: string }) => r.lead_id);
  if (!ids.length) return { lead: [], altreListe: {} };

  const [{ data: lead }, { data: altrove }] = await Promise.all([
    db.from("crm_lead").select(COLONNE_LEAD).in("id", ids),
    /* In quante altre liste sta ognuno: non è un doppione da
       togliere — il lead è uno solo — ma sapere che scriverai
       due volte alla stessa azienda cambia cosa scrivi. */
    db.from("mm_lista_lead").select("lead_id,lista_id").in("lead_id", ids).neq("lista_id", id),
  ]);

  const altreListe: Record<string, string[]> = {};
  for (const r of (altrove ?? []) as { lead_id: string; lista_id: string }[]) {
    (altreListe[r.lead_id] ??= []).push(r.lista_id);
  }
  const quando = new Map((dentro ?? []).map((r: { lead_id: string; aggiunto_il: string }) => [r.lead_id, r.aggiunto_il]));
  const ordinati = (lead ?? [])
    .map((l: Record<string, unknown>) => ({ ...l, aggiunto_il: quando.get(l.id as string) }))
    .sort((a, b) => String(b.aggiunto_il).localeCompare(String(a.aggiunto_il)));

  return { lead: ordinati, altreListe };
}

async function listaAggiungi(d: Record<string, unknown>) {
  const lista = testo(d.lista_id, 40);
  if (!lista) throw new ErroreCliente("Manca la lista di destinazione");

  /* Si può indicare i lead per identificativo o per place_id:
     il Lead Finder ha in mano i secondi, la pipeline i primi. */
  const ids = Array.isArray(d.lead_ids) ? d.lead_ids.map(String).slice(0, 500) : [];
  const places = Array.isArray(d.place_ids) ? d.place_ids.map(String).slice(0, 500) : [];
  let daLegare = ids;

  if (places.length) {
    const { data, error } = await db.from("crm_lead").select("id").in("place_id", places);
    if (error) throw new Error(error.message);
    daLegare = [...new Set([...daLegare, ...(data ?? []).map((r: { id: string }) => r.id)])];
  }
  if (!daLegare.length) throw new ErroreCliente("Nessun lead da aggiungere.");

  const { error } = await db.from("mm_lista_lead")
    .upsert(daLegare.map((lead_id) => ({ lista_id: lista, lead_id })),
      { onConflict: "lista_id,lead_id", ignoreDuplicates: true });
  if (error) {
    if ((error as { code?: string }).code === "23503") {
      throw new ErroreCliente("La lista non esiste più, oppure uno dei lead è stato eliminato.");
    }
    throw new Error(error.message);
  }
  /* Quante ce ne sono davvero adesso, non quante ne ha scritte
     la riga sopra: con ignoreDuplicates il conteggio dell'upsert
     dipende da quante erano già lì, e non è quello che si vuole
     sapere. */
  const { count } = await db.from("mm_lista_lead")
    .select("lead_id", { count: "exact", head: true })
    .eq("lista_id", lista).in("lead_id", daLegare);
  return { aggiunti: count ?? daLegare.length, richiesti: daLegare.length };
}

async function listaTogli(d: Record<string, unknown>) {
  const lista = testo(d.lista_id, 40);
  const lead = testo(d.lead_id, 40);
  if (!lista || !lead) throw new ErroreCliente("Manca la lista o il lead");
  const { error } = await db.from("mm_lista_lead")
    .delete().eq("lista_id", lista).eq("lead_id", lead);
  if (error) throw new Error(error.message);
  /* Fuori dalla lista, non fuori dall'archivio: il lead resta,
     con la sua storia e la sua lavorazione. */
  return { tolto: lead };
}

// ---------------- Lead a mano e da file ----------------

/* Google Places non dà l'indirizzo email, e non tutte le aziende
   arrivano da una ricerca: queste due strade coprono il resto.
   La provenienza viene scritta comunque, perché «da dove avete
   il mio indirizzo» deve avere una risposta nel database. */

function leadDaCampi(r: Record<string, unknown>, fonte: string) {
  const nome = testo(r.nome, 200) || testo(r.email, 200);
  if (!nome) return null;
  const email = (testo(r.email, 200) || "").toLowerCase() || null;
  if (email && !emailValida(email)) return null;
  return {
    nome,
    email,
    categoria: testo(r.categoria, 60),
    citta: testo(r.citta, 120),
    provincia: testo(r.provincia, 10),
    indirizzo: testo(r.indirizzo, 300),
    telefono: testo(r.telefono, 60),
    sito: testo(r.sito, 300),
    fonte,
    query_origine: testo(r.origine, 300),
  };
}

async function leadAggiungi(d: Record<string, unknown>) {
  const lista = testo(d.lista_id, 40);
  const righe = Array.isArray(d.lead) ? d.lead : [d];
  const fonte = String(d.fonte) === "file" ? "file" : "manuale";

  const buone: Record<string, unknown>[] = [];
  let scartate = 0;
  for (const r of righe.slice(0, 1000)) {
    const riga = leadDaCampi(r as Record<string, unknown>, fonte);
    if (riga) buone.push(riga); else scartate++;
  }
  if (!buone.length) {
    throw new ErroreCliente(
      scartate
        ? `Nessuna riga utilizzabile: ${plurale(scartate, "riga è", "righe sono")} senza nome o con un indirizzo email non valido.`
        : "Serve almeno il nome dell'attività, oppure un indirizzo email.",
    );
  }

  /* Chi ha già quell'indirizzo in archivio non viene inserito una
     seconda volta: viene solo legato alla lista. Reimportare lo
     stesso file due volte è la cosa più facile che capiti, e
     senza questo controllo produrrebbe due schede della stessa
     azienda che da lì in poi invecchiano separate. */
  const indirizzi = [...new Set(buone.map((r) => r.email).filter(Boolean))] as string[];
  const { data: noti } = indirizzi.length
    ? await db.from("crm_lead").select("id,email").in("email", indirizzi)
    : { data: [] };
  const perEmail = new Map((noti ?? []).map((r: { id: string; email: string }) => [r.email.toLowerCase(), r.id]));

  const daInserire = buone.filter((r) => !r.email || !perEmail.has(String(r.email)));
  const gia = buone.length - daInserire.length;

  let nuovi: string[] = [];
  if (daInserire.length) {
    const { data, error } = await db.from("crm_lead").insert(daInserire).select("id");
    if (error) throw new Error(error.message);
    nuovi = (data ?? []).map((r: { id: string }) => r.id);
  }

  const daLegare = [...new Set([...nuovi, ...perEmail.values()])];
  if (lista && daLegare.length) {
    const { error: e2 } = await db.from("mm_lista_lead")
      .upsert(daLegare.map((lead_id) => ({ lista_id: lista, lead_id })),
        { onConflict: "lista_id,lead_id", ignoreDuplicates: true });
    if (e2) {
      if ((e2 as { code?: string }).code === "23503") {
        throw new ErroreCliente("La lista non esiste più.");
      }
      throw new Error(e2.message);
    }
  }
  return { inseriti: nuovi.length, gia, scartate };
}

const plurale = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti}`;

// ---------------- Campagne ----------------

/* Una campagna non spedisce: prepara. Genera un messaggio per
   ogni destinatario e lo lascia in bozza, dove si può leggere,
   correggere e semmai buttare. Il momento in cui qualcosa parte
   è sempre un clic separato, su email che qualcuno ha visto.

   Chi viene saltato, e perché, torna indietro contato: una
   campagna che dice «creati 40 messaggi» quando i lead erano 120
   nasconde le tre cose che contano — chi non ha l'indirizzo, chi
   si è opposto, chi abbiamo già contattato. */

const SEGNAPOSTO = /\{(\w+)\}/g;

function sostituisci(modello: string, v: Record<string, string>) {
  return modello.replace(SEGNAPOSTO, (intero, nome) =>
    v[nome] !== undefined && v[nome] !== "" ? v[nome] : intero);
}

async function campagnaSalva(d: Record<string, unknown>) {
  const nome = testo(d.nome, 120);
  const listaId = testo(d.lista_id, 40);
  const modelloId = testo(d.modello_id, 40);
  const smtpId = testo(d.smtp_id, 40);
  const pausa = Math.max(15, Math.min(3600, Number(d.pausa_secondi) || 60));

  if (!nome) throw new ErroreCliente("Dai un nome alla campagna: serve a ritrovarla nel registro.");
  if (!listaId) throw new ErroreCliente("Scegli la lista dei destinatari.");
  if (!modelloId) throw new ErroreCliente("Scegli il modello da cui partire.");

  const { data: modello } = await db.from("crm_email_modelli").select("*").eq("id", modelloId).maybeSingle();
  if (!modello) throw new ErroreCliente("Il modello indicato non esiste più.");

  const { data: dentro } = await db.from("mm_lista_lead").select("lead_id").eq("lista_id", listaId);
  const ids = (dentro ?? []).map((r: { lead_id: string }) => r.lead_id);
  if (!ids.length) throw new ErroreCliente("Questa lista è vuota.");

  const { data: lead } = await db.from("crm_lead").select(COLONNE_LEAD).in("id", ids);

  /* Tre motivi diversi per saltare qualcuno, contati separati
     perché si rimediano in modi diversi: l'indirizzo si cerca,
     l'opposizione no, il già-contattato è una scelta. */
  const [{ data: vietati }, { data: giaScritti }] = await Promise.all([
    db.from("mm_blacklist").select("email"),
    db.from("mm_email").select("destinatario").eq("stato", "inviata"),
  ]);
  const nero = new Set((vietati ?? []).map((r: { email: string }) => r.email.toLowerCase()));
  const contattati = new Set((giaScritti ?? []).map((r: { destinatario: string }) => r.destinatario.toLowerCase()));

  const saltati = { senzaEmail: 0, opposti: 0, inBlacklist: 0, giaContattati: 0 };
  const daScrivere: Record<string, unknown>[] = [];

  const mittenteId = testo(d.mittente_id, 40);
  let firma = "";
  if (mittenteId) {
    const { data } = await db.from("mm_mittenti").select("from_nome,etichetta").eq("id", mittenteId).maybeSingle();
    if (data) firma = String(data.from_nome || data.etichetta || "");
  }

  for (const l of (lead ?? []) as Record<string, unknown>[]) {
    const email = String(l.email ?? "").toLowerCase();
    if (!emailValida(email)) { saltati.senzaEmail++; continue; }
    if (l.no_contatto) { saltati.opposti++; continue; }
    if (nero.has(email)) { saltati.inBlacklist++; continue; }
    if (contattati.has(email)) { saltati.giaContattati++; continue; }

    const variabili: Record<string, string> = {
      azienda: String(l.nome ?? ""),
      citta: String(l.citta ?? ""),
      telefono: String(l.telefono ?? ""),
      mittente: firma,
    };
    daScrivere.push({
      mittente_id: mittenteId,
      smtp_id: smtpId,
      lead_id: l.id,
      modello_id: modelloId,
      destinatario: email,
      oggetto: sostituisci(String(modello.oggetto), variabili),
      corpo: sostituisci(String(modello.corpo), variabili),
      stato: "bozza",
      meta: { origine: "campagna" },
    });
  }

  if (!daScrivere.length) {
    throw new ErroreCliente(
      "Non è rimasto nessun destinatario: " +
      [
        saltati.senzaEmail ? `${saltati.senzaEmail} senza indirizzo` : null,
        saltati.opposti ? `${saltati.opposti} si sono opposti` : null,
        saltati.inBlacklist ? `${saltati.inBlacklist} in blacklist` : null,
        saltati.giaContattati ? `${saltati.giaContattati} già contattati` : null,
      ].filter(Boolean).join(", ") + ".",
    );
  }

  const { data: campagna, error } = await db.from("mm_campagne").insert({
    nome, mittente_id: mittenteId, lista_id: listaId, modello_id: modelloId,
    smtp_id: smtpId, pausa_secondi: pausa, stato: "in_revisione",
    note: testo(d.note, 500),
  }).select("id").single();
  if (error) throw new Error(error.message);

  const { error: e2 } = await db.from("mm_email")
    .insert(daScrivere.map((r) => ({ ...r, campagna_id: campagna.id })));
  if (e2) {
    await db.from("mm_campagne").delete().eq("id", campagna.id);
    throw new Error(e2.message);
  }

  return { id: campagna.id, creati: daScrivere.length, saltati };
}

async function campagnaElimina(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo della campagna");
  /* Le email già partite non spariscono con la campagna: sono
     fatti accaduti, e il registro deve poterli mostrare anche
     dopo. Solo quelle mai uscite se ne vanno. */
  await db.from("mm_email").update({ campagna_id: null })
    .eq("campagna_id", id).in("stato", ["inviata", "fallita"]);
  const { error } = await db.from("mm_campagne").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { eliminata: id };
}

// ---------------- Email Ready ----------------

const COLONNE_POSTA =
  "id,creata_il,mittente_id,smtp_id,campagna_id,lead_id,modello_id," +
  "destinatario,oggetto,corpo,stato,programmata_per,inviata_il,errore,modificata";

async function postaElenco(d: Record<string, unknown>) {
  let q = db.from("mm_email").select(COLONNE_POSTA)
    .order("creata_il", { ascending: false }).limit(500);

  const stato = testo(d.stato, 20);
  if (stato && stato !== "tutti") q = q.eq("stato", stato);
  const campagna = testo(d.campagna_id, 40);
  if (campagna) q = q.eq("campagna_id", campagna);
  const cerca = testo(d.cerca, 120);
  if (cerca) q = q.or(`destinatario.ilike.%${cerca}%,oggetto.ilike.%${cerca}%`);

  const [{ data, error }, { data: perStato }] = await Promise.all([
    q,
    db.from("mm_email").select("stato"),
  ]);
  if (error) throw new Error(error.message);

  const conteggi: Record<string, number> = {
    bozza: 0, pronta: 0, in_coda: 0, inviata: 0, fallita: 0, annullata: 0,
  };
  for (const r of (perStato ?? []) as { stato: string }[]) conteggi[r.stato] = (conteggi[r.stato] ?? 0) + 1;

  return { posta: data ?? [], conteggi };
}

async function postaSalva(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  const oggetto = testo(d.oggetto, 300);
  const corpo = testo(d.corpo, 40000);
  if (!id) throw new ErroreCliente("Manca l'identificativo del messaggio");
  if (!oggetto || !corpo) throw new ErroreCliente("Servono oggetto e testo.");

  const { data: prima } = await db.from("mm_email").select("stato").eq("id", id).maybeSingle();
  if (!prima) throw new ErroreCliente("Questo messaggio non esiste più.", 404);
  if (prima.stato === "inviata") {
    throw new ErroreCliente("Questo messaggio è già partito: il testo che è uscito non si riscrive.");
  }

  const { error } = await db.from("mm_email")
    .update({ oggetto, corpo, modificata: true }).eq("id", id);
  if (error) throw new Error(error.message);
  return { id };
}

async function postaStato(d: Record<string, unknown>) {
  const ids = Array.isArray(d.ids) ? d.ids.map(String).slice(0, 500) : [];
  const stato = String(d.stato ?? "");
  if (!ids.length) throw new ErroreCliente("Nessun messaggio selezionato.");
  if (!["bozza", "pronta", "annullata"].includes(stato)) {
    throw new ErroreCliente("Da qui si può solo rimettere in bozza, approvare o annullare.");
  }
  /* Quello che è già partito non torna indietro: cambiargli
     stato riscriverebbe la storia. */
  const { error, count } = await db.from("mm_email")
    .update({ stato, programmata_per: stato === "pronta" ? null : undefined }, { count: "exact" })
    .in("id", ids).not("stato", "in", "(inviata,fallita)");
  if (error) throw new Error(error.message);
  return { aggiornati: count ?? 0, richiesti: ids.length };
}

async function postaElimina(d: Record<string, unknown>) {
  const ids = Array.isArray(d.ids) ? d.ids.map(String).slice(0, 500) : [];
  if (!ids.length) throw new ErroreCliente("Nessun messaggio selezionato.");
  const { error, count } = await db.from("mm_email")
    .delete({ count: "exact" }).in("id", ids).neq("stato", "inviata");
  if (error) throw new Error(error.message);
  return { eliminati: count ?? 0, richiesti: ids.length };
}

async function postaProgramma(d: Record<string, unknown>) {
  const ids = Array.isArray(d.ids) ? d.ids.map(String).slice(0, 500) : [];
  const quando = testo(d.quando, 40);
  const smtpId = testo(d.smtp_id, 40);
  if (!ids.length) throw new ErroreCliente("Nessun messaggio selezionato.");
  if (!smtpId) throw new ErroreCliente("Scegli la casella da cui devono partire.");
  if (!quando) throw new ErroreCliente("Indica quando devono partire.");
  const data = new Date(quando);
  if (isNaN(data.getTime())) throw new ErroreCliente("La data non è leggibile.");
  if (data.getTime() <= Date.now()) {
    throw new ErroreCliente("L'orario è già passato: scegline uno futuro.");
  }

  const { error, count } = await db.from("mm_email").update({
    stato: "in_coda", programmata_per: data.toISOString(), smtp_id: smtpId, errore: null,
  }, { count: "exact" }).in("id", ids).in("stato", ["bozza", "pronta", "in_coda"]);
  if (error) throw new Error(error.message);
  return { programmati: count ?? 0, quando: data.toISOString() };
}

/* L'invio vero. Non manda tutto in una volta: una Edge Function
   ha un tempo massimo, e una casella condivisa ha una soglia
   oltre la quale il fornitore la sospende. Parte un blocco, e
   quanto resta torna indietro come numero, così chi guarda sa
   che deve premere ancora invece di credere di aver finito. */
const BLOCCO_MASSIMO = 20;
const TEMPO_MASSIMO = 100_000;

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postaInvia(d: Record<string, unknown>) {
  const ids = Array.isArray(d.ids) ? d.ids.map(String).slice(0, 500) : [];
  const smtpId = testo(d.smtp_id, 40);
  const pausa = Math.max(0, Math.min(300, Number(d.pausa_secondi ?? 5) || 0));
  if (!ids.length) throw new ErroreCliente("Nessun messaggio selezionato.");
  if (!smtpId) throw new ErroreCliente("Scegli la casella da cui devono partire.");

  const { data: righe, error } = await db.from("mm_email")
    .select("id,destinatario,oggetto,corpo,lead_id")
    .in("id", ids).in("stato", ["pronta", "in_coda"]);
  if (error) throw new Error(error.message);
  if (!righe?.length) {
    throw new ErroreCliente("Nessuno dei messaggi scelti è approvato: da «bozza» vanno prima messi in «pronta».");
  }

  /* I controlli si rifanno adesso, non ci si fida di quelli fatti
     alla generazione: fra allora e ora qualcuno può essersi
     opposto, ed è proprio il caso in cui non deve partire. */
  const [{ data: vietati }, { data: opposti }] = await Promise.all([
    db.from("mm_blacklist").select("email"),
    db.from("crm_lead").select("email").eq("no_contatto", true).not("email", "is", null),
  ]);
  const nero = new Set([
    ...(vietati ?? []).map((r: { email: string }) => r.email.toLowerCase()),
    ...(opposti ?? []).map((r: { email: string }) => r.email.toLowerCase()),
  ]);

  const bloccati = righe.filter((r) => nero.has(r.destinatario.toLowerCase()));
  if (bloccati.length) {
    await db.from("mm_email").update({
      stato: "annullata",
      errore: "Il destinatario si è opposto o è in blacklist: l'invio è stato rifiutato.",
    }).in("id", bloccati.map((r) => r.id));
  }
  const ammessi = righe.filter((r) => !nero.has(r.destinatario.toLowerCase()));
  if (!ammessi.length) {
    throw new ErroreCliente(
      `${plurale(bloccati.length, "messaggio era diretto", "messaggi erano diretti")} a chi si è opposto: non è partito niente.`,
    );
  }

  const { casella, password } = await casellaConPassword(smtpId);
  if (casella.stato === "sospeso") throw new ErroreCliente("La casella è in pausa. Riattivala per spedire.");
  const residua = quotaResidua(casella);
  if (residua <= 0) {
    throw new ErroreCliente(`La casella «${casella.nome}» ha già raggiunto il limite di oggi. Riprova domani.`);
  }

  const blocco = ammessi.slice(0, Math.min(BLOCCO_MASSIMO, residua));
  const client = await apriClient(casella, password);
  const inizio = Date.now();
  let partite = 0, fallite = 0, fermato = false;

  for (const [i, m] of blocco.entries()) {
    if (Date.now() - inizio > TEMPO_MASSIMO) { fermato = true; break; }
    const testoFinale = casella.firma_attiva && casella.firma
      ? `${m.corpo}\n\n${casella.firma}`
      : m.corpo;
    try {
      await client.send({
        from: intestazioneDa(casella),
        to: m.destinatario,
        replyTo: (casella.rispondi_a as string) || undefined,
        subject: m.oggetto,
        content: testoFinale,
      });
      await db.from("mm_email").update({
        stato: "inviata", inviata_il: new Date().toISOString(), errore: null, smtp_id: smtpId,
      }).eq("id", m.id);
      partite++;
    } catch (e) {
      await db.from("mm_email").update({
        stato: "fallita", errore: leggibile(e), smtp_id: smtpId,
      }).eq("id", m.id);
      fallite++;
    }
    /* La pausa vale fra un messaggio e l'altro, non dopo
       l'ultimo: aspettare a vuoto allunga solo la richiesta. */
    if (pausa && i < blocco.length - 1) await attendi(pausa * 1000);
  }

  try { await client.close(); } catch { /* connessione già chiusa */ }
  if (partite) await registraInvio(casella, partite);

  const rimasti = ammessi.length - partite - fallite;
  return {
    partite, fallite, rimasti, fermato,
    bloccati: bloccati.length,
    limite: residua < ammessi.length ? residua : null,
  };
}

// ---------------- La coda che parte da sola ----------------

/* pg_cron chiama questa azione a intervalli regolari. Manda
   pochi messaggi per giro, non tutti: cinque al minuto sono un
   ritmo che somiglia a una persona che scrive, mentre duecento
   in tre minuti sono un ritmo che somiglia a uno spam — e i
   fornitori li distinguono esattamente così.

   Ogni giro registra cosa ha fatto in mm_coda_giri, perché «il
   cron gira?» deve avere una risposta guardando il database, non
   una supposizione. */

const PER_GIRO = 5;
const PAUSA_CODA = 3;

async function codaScarica() {
  const adesso = new Date().toISOString();

  /* Prima le sequenze, poi la coda. In quest'ordine un messaggio
     che una sequenza ha appena maturato parte nello stesso giro
     invece che al prossimo, e passa comunque dagli stessi
     controlli: le sequenze mettono in coda, non spediscono. */
  let seq = { esaminati: 0, messi: 0, fermati: 0, finiti: 0 };
  const problemi: string[] = [];
  try {
    seq = await sequenzeAvanza();
  } catch (e) {
    /* Le sequenze che si inceppano non devono bloccare la posta
       già approvata: quella è indipendente e deve partire. */
    problemi.push(`Sequenze non avanzate: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
  }
  if (seq.messi || seq.fermati || seq.finiti) {
    problemi.push(
      "Sequenze: " + [
        seq.messi ? `${plurale(seq.messi, "messaggio in coda", "messaggi in coda")}` : null,
        seq.fermati ? `${plurale(seq.fermati, "iscritto fermato", "iscritti fermati")}` : null,
        seq.finiti ? `${plurale(seq.finiti, "arrivato in fondo", "arrivati in fondo")}` : null,
      ].filter(Boolean).join(", "),
    );
  }

  const { data: dovute, error } = await db.from("mm_email")
    .select("id,destinatario,oggetto,corpo,smtp_id")
    .eq("stato", "in_coda")
    .not("smtp_id", "is", null)
    .lte("programmata_per", adesso)
    .order("programmata_per")
    .limit(PER_GIRO);
  if (error) throw new Error(error.message);

  const { count: inAttesa } = await db.from("mm_email")
    .select("id", { count: "exact", head: true })
    .eq("stato", "in_coda").lte("programmata_per", adesso);

  const nota = () => (problemi.length ? problemi.join(" · ").slice(0, 500) : null);

  if (!dovute?.length) {
    await db.from("mm_coda_giri").insert({
      trovati: 0, partite: 0, fallite: 0, in_attesa: inAttesa ?? 0, note: nota(),
    });
    return { trovati: 0, partite: 0, fallite: 0, inAttesa: inAttesa ?? 0, sequenze: seq, problemi };
  }

  /* Le stesse due liste di sempre, controllate adesso: una
     programmazione fatta ieri non sa di un'opposizione arrivata
     stanotte. */
  const [{ data: vietati }, { data: opposti }] = await Promise.all([
    db.from("mm_blacklist").select("email"),
    db.from("crm_lead").select("email").eq("no_contatto", true).not("email", "is", null),
  ]);
  const nero = new Set([
    ...(vietati ?? []).map((r: { email: string }) => r.email.toLowerCase()),
    ...(opposti ?? []).map((r: { email: string }) => r.email.toLowerCase()),
  ]);

  const bloccati = dovute.filter((m) => nero.has(m.destinatario.toLowerCase()));
  if (bloccati.length) {
    await db.from("mm_email").update({
      stato: "annullata",
      errore: "Il destinatario si è opposto o è in blacklist: l'invio è stato rifiutato.",
    }).in("id", bloccati.map((m) => m.id));
  }
  const ammessi = dovute.filter((m) => !nero.has(m.destinatario.toLowerCase()));

  /* Raggruppate per casella: aprire e chiudere la connessione una
     volta per messaggio è il modo più veloce per farsi prendere
     per un attacco. */
  const perCasella = new Map<string, typeof ammessi>();
  for (const m of ammessi) {
    const k = String(m.smtp_id);
    if (!perCasella.has(k)) perCasella.set(k, []);
    perCasella.get(k)!.push(m);
  }

  let partite = 0, fallite = 0;

  for (const [smtpId, gruppo] of perCasella) {
    let casella, password;
    try {
      ({ casella, password } = await casellaConPassword(smtpId));
    } catch (e) {
      /* Una casella che non si apre non deve far fallire il giro
         intero: gli altri messaggi hanno altre caselle.

         E soprattutto non deve bruciare i messaggi. Se manca la
         password, la casella è da configurare, non rotta: segnare
         "fallita" vorrebbe dire che quando la password arriva le
         email non partono più comunque, perché nessuno le
         rimetterà in coda a mano. Restano dove sono, come per una
         casella in pausa. L'unico caso senza ritorno è la casella
         cancellata: lì il messaggio non ha più da dove partire. */
      const m = e instanceof Error ? e.message : String(e);
      problemi.push(m);
      if (e instanceof ErroreCliente && e.status === 404) {
        await db.from("mm_email").update({ stato: "fallita", errore: m })
          .in("id", gruppo.map((x) => x.id));
        fallite += gruppo.length;
      }
      continue;
    }

    if (casella.stato === "sospeso") {
      problemi.push(`La casella «${casella.nome}» è in pausa: i suoi messaggi restano in coda.`);
      continue;
    }
    const residua = quotaResidua(casella);
    if (residua <= 0) {
      problemi.push(`La casella «${casella.nome}» ha esaurito il limite di oggi: i suoi messaggi restano in coda.`);
      continue;
    }

    const daMandare = gruppo.slice(0, residua);
    const client = await apriClient(casella, password);
    let dallaCasella = 0;

    for (const [i, m] of daMandare.entries()) {
      const testoFinale = casella.firma_attiva && casella.firma
        ? `${m.corpo}\n\n${casella.firma}`
        : m.corpo;
      try {
        await client.send({
          from: intestazioneDa(casella),
          to: m.destinatario,
          replyTo: (casella.rispondi_a as string) || undefined,
          subject: m.oggetto,
          content: testoFinale,
        });
        await db.from("mm_email").update({
          stato: "inviata", inviata_il: new Date().toISOString(), errore: null,
        }).eq("id", m.id);
        partite++; dallaCasella++;
      } catch (e) {
        await db.from("mm_email").update({ stato: "fallita", errore: leggibile(e) }).eq("id", m.id);
        fallite++;
      }
      if (i < daMandare.length - 1) await attendi(PAUSA_CODA * 1000);
    }

    try { await client.close(); } catch { /* connessione già chiusa */ }
    if (dallaCasella) await registraInvio(casella, dallaCasella);
  }

  const restano = Math.max(0, (inAttesa ?? 0) - partite - fallite - bloccati.length);
  await db.from("mm_coda_giri").insert({
    trovati: dovute.length, partite, fallite, in_attesa: restano, note: nota(),
  });

  return {
    trovati: dovute.length, partite, fallite, bloccati: bloccati.length,
    inAttesa: restano, sequenze: seq, problemi,
  };
}

// ---------------- Send Log ----------------

/* Il registro di cosa è partito e cosa no. Legge due elenchi
   perché ce ne sono due: le email del mail marketing e quelle
   che il CRM mandava dalla sezione Posta prima che questo modulo
   esistesse. Fonderle in una tabella sola avrebbe voluto dire
   riscrivere righe che raccontano invii già avvenuti; qui si
   leggono insieme e si vede da dove viene ognuna. */

async function registro(d: Record<string, unknown>) {
  const cerca = testo(d.cerca, 120);
  const giorni = Math.max(1, Math.min(365, Number(d.giorni) || 30));
  const da = new Date(Date.now() - giorni * 86400000).toISOString();

  let q = db.from("mm_email")
    .select("id,destinatario,oggetto,corpo,stato,inviata_il,creata_il,errore,campagna_id,sequenza_id,smtp_id")
    .in("stato", ["inviata", "fallita"])
    .gte("creata_il", da)
    .order("creata_il", { ascending: false }).limit(500);
  if (cerca) q = q.or(`destinatario.ilike.%${cerca}%,oggetto.ilike.%${cerca}%`);

  let q2 = db.from("crm_email_inviate")
    .select("id,destinatario,oggetto,corpo,esito,errore,inviata_il")
    .gte("inviata_il", da)
    .order("inviata_il", { ascending: false }).limit(200);
  if (cerca) q2 = q2.or(`destinatario.ilike.%${cerca}%,oggetto.ilike.%${cerca}%`);

  const [nuove, vecchie, giri] = await Promise.all([
    q, q2,
    db.from("mm_coda_giri").select("*").order("quando", { ascending: false }).limit(20),
  ]);
  if (nuove.error) throw new Error(nuove.error.message);

  const righe = [
    ...(nuove.data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id, destinatario: r.destinatario, oggetto: r.oggetto, corpo: r.corpo,
      esito: r.stato === "inviata" ? "inviata" : "fallita",
      quando: r.inviata_il ?? r.creata_il, errore: r.errore,
      origine: r.sequenza_id ? "sequenza" : "mail_marketing",
      campagna_id: r.campagna_id, sequenza_id: r.sequenza_id,
    })),
    ...(vecchie.data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id, destinatario: r.destinatario, oggetto: r.oggetto, corpo: r.corpo,
      esito: r.esito, quando: r.inviata_il, errore: r.errore,
      origine: "crm", campagna_id: null, sequenza_id: null,
    })),
  ].sort((a, b) => String(b.quando).localeCompare(String(a.quando)));

  const inviate = righe.filter((r) => r.esito === "inviata").length;
  const fallite = righe.length - inviate;

  /* L'ultimo giro del cron e quando è stato: «la coda parte?» si
     risponde guardando qui, non tirando a indovinare. */
  const ultimo = (giri.data ?? [])[0] ?? null;

  return {
    righe, giorni,
    numeri: { inviate, fallite, totale: righe.length },
    giri: giri.data ?? [],
    coda: ultimo
      ? { ultimoGiro: ultimo.quando, inAttesa: ultimo.in_attesa, nota: ultimo.note }
      : null,
  };
}

// ---------------- Blacklist & Compliance ----------------

/* Chi non va contattato. Le fonti sono due e restano due:
   crm_lead.no_contatto è l'opposizione di qualcuno che abbiamo
   in archivio, mm_blacklist è quella di tutti gli altri — chi
   risponde NO da un indirizzo diverso, chi scrive per un
   collega, chi chiede la cancellazione prima ancora di essere
   schedato. Unirle in una tabella sola vorrebbe dire inventare
   un lead per ogni opposizione, cioè schedare qualcuno perché ha
   chiesto di non essere schedato.

   Qui si leggono insieme, perché la domanda «a chi non posso
   scrivere» è una sola. */

async function blacklistElenco(d: Record<string, unknown>) {
  const cerca = (testo(d.cerca, 120) || "").toLowerCase();

  const [{ data: nero, error }, { data: opposti }, { data: inCoda }] = await Promise.all([
    db.from("mm_blacklist").select("*").order("aggiunta_il", { ascending: false }).limit(2000),
    db.from("crm_lead").select("id,nome,email,no_contatto_il,no_contatto_motivo,citta")
      .eq("no_contatto", true).order("no_contatto_il", { ascending: false }).limit(1000),
    /* Quanti messaggi mai partiti sono diretti a qualcuno che ora
       è nell'elenco: è il numero che dice se l'opposizione sta
       davvero mordendo o è solo scritta da qualche parte. */
    db.from("mm_email").select("destinatario").in("stato", ["bozza", "pronta", "in_coda"]),
  ]);
  if (error) throw new Error(error.message);

  const vietati = new Set([
    ...(nero ?? []).map((r: { email: string }) => r.email.toLowerCase()),
    ...(opposti ?? []).map((r: { email: string | null }) => (r.email ?? "").toLowerCase()).filter(Boolean),
  ]);
  const fermati = (inCoda ?? [])
    .filter((r: { destinatario: string }) => vietati.has(r.destinatario.toLowerCase())).length;

  const filtra = <T extends { email?: string | null; nome?: string }>(righe: T[]) =>
    !cerca ? righe : righe.filter((r) =>
      (r.email ?? "").toLowerCase().includes(cerca) || (r.nome ?? "").toLowerCase().includes(cerca));

  return {
    blacklist: filtra(nero ?? []),
    opposti: filtra(opposti ?? []),
    numeri: {
      blacklist: (nero ?? []).length,
      opposti: (opposti ?? []).length,
      indirizzi: vietati.size,
      fermati,
    },
  };
}

const ORIGINI_NERE = ["manuale", "risposta", "bounce", "reclamo"];

async function blacklistAggiungi(d: Record<string, unknown>) {
  const origine = ORIGINI_NERE.includes(String(d.origine)) ? String(d.origine) : "manuale";
  const motivo = testo(d.motivo, 300);

  /* Si incolla un elenco, non un indirizzo per volta: quando
     arriva una lista di cancellazioni arriva tutta insieme. */
  const grezzi = String(d.indirizzi ?? d.email ?? "")
    .split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const indirizzi = [...new Set(grezzi)];
  const nonValidi = indirizzi.filter((x) => !emailValida(x));
  const buoni = indirizzi.filter((x) => emailValida(x));

  if (!indirizzi.length) throw new ErroreCliente("Nessun indirizzo da aggiungere.");
  if (!buoni.length) {
    throw new ErroreCliente(
      `${nonValidi.length === 1 ? "L'indirizzo non è valido" : "Nessuno degli indirizzi è valido"}: ${nonValidi.join(", ")}`,
    );
  }

  const { data: gia } = await db.from("mm_blacklist").select("email").in("email", buoni);
  const noti = new Set((gia ?? []).map((r: { email: string }) => r.email.toLowerCase()));
  const nuovi = buoni.filter((x) => !noti.has(x));

  if (nuovi.length) {
    const { error } = await db.from("mm_blacklist")
      .insert(nuovi.map((email) => ({ email, motivo, origine })));
    if (error) throw new Error(error.message);
  }

  /* Un divieto che vale solo da domani non è un divieto. Quello
     che era già pronto o già in coda per quell'indirizzo viene
     annullato adesso, con scritto perché: al prossimo giro la
     coda lo ricontrollerebbe comunque, ma «annullata» qui e
     subito è la differenza fra un sistema che obbedisce e uno
     che obbedisce quando gli capita. */
  const { count } = await db.from("mm_email").update({
    stato: "annullata",
    errore: "Il destinatario è stato messo in blacklist: l'invio è stato rifiutato.",
  }, { count: "exact" }).in("destinatario", buoni).in("stato", ["bozza", "pronta", "in_coda"]);

  /* Se l'indirizzo corrisponde a un lead, l'opposizione va
     scritta anche lì: le due fonti devono raccontare la stessa
     cosa, e chi apre la scheda del lead deve vederla. */
  const { data: leadTocc } = await db.from("crm_lead").select("id").in("email", buoni).eq("no_contatto", false);
  if (leadTocc?.length) {
    await db.from("crm_lead").update({
      no_contatto: true,
      no_contatto_il: new Date().toISOString(),
      no_contatto_motivo: motivo || `Aggiunto alla blacklist (${origine})`,
    }).in("id", leadTocc.map((r: { id: string }) => r.id));
  }

  return {
    aggiunti: nuovi.length,
    gia: buoni.length - nuovi.length,
    nonValidi,
    annullate: count ?? 0,
    leadSegnati: leadTocc?.length ?? 0,
  };
}

async function blacklistTogli(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo.");
  const { data: riga } = await db.from("mm_blacklist").select("email").eq("id", id).maybeSingle();
  if (!riga) throw new ErroreCliente("Questo indirizzo non è più in elenco.", 404);
  const { error } = await db.from("mm_blacklist").delete().eq("id", id);
  if (error) throw new Error(error.message);
  /* Il lead resta opposto: togliere l'indirizzo da qui non
     revoca l'opposizione registrata sulla sua scheda. La revoca
     la fa chi l'ha espressa, e si fa da lì. */
  return { tolto: riga.email };
}

// ---------------- Automazioni ----------------

/* Una sequenza è un seguito programmato: il primo messaggio,
   poi un secondo dopo N giorni a chi non ha dato segno, poi
   basta. La parte che conta non è mandare il secondo: è non
   mandarlo.

   COME SI CAPISCE CHE HANNO RISPOSTO
   Non leggendo la posta in arrivo. Per farlo servirebbe tenere
   una connessione IMAP aperta sulla casella e interpretare i
   messaggi che arrivano, e un errore lì vorrebbe dire o seguiti
   mandati a chi aveva già risposto, o seguiti mai mandati.
   Il segnale che questo modulo usa è quello che una persona
   registra davvero: lo stato del lead nella pipeline del CRM.
   Appena esce da «contattato» — trattativa, cliente, scartato —
   la sequenza si ferma. Insieme a questo si fermano da sole le
   opposizioni, la blacklist e gli indirizzi non validi. */

const SEQ_PER_GIRO = 20;
const STATI_RISPOSTO = ["in_trattativa", "cliente", "scartato"];

const COLONNE_SEQ = "id,creata_il,nome,attiva,mittente_id,smtp_id,note";

async function sequenzaElenco() {
  const [{ data: seq, error }, { data: passi }, { data: iscritti }] = await Promise.all([
    db.from("mm_sequenze").select(COLONNE_SEQ).order("creata_il", { ascending: false }),
    db.from("mm_sequenze_passi").select("*").order("ordine"),
    db.from("mm_sequenze_iscritti")
      .select("id,sequenza_id,lead_id,stato,passo_fatto,prossimo_il,entrato_il,fermato_motivo,fermato_il")
      .order("prossimo_il"),
  ]);
  if (error) throw new Error(error.message);

  /* I nomi dei lead iscritti: un elenco di identificativi non
     dice a chi stiamo scrivendo. */
  const ids = [...new Set((iscritti ?? []).map((r: { lead_id: string }) => r.lead_id))];
  const { data: lead } = ids.length
    ? await db.from("crm_lead").select("id,nome,email,citta,stato,no_contatto").in("id", ids)
    : { data: [] };
  const perLead = new Map((lead ?? []).map((l: { id: string }) => [l.id, l]));

  const perSeq = new Map<string, { attivi: number; fermati: number; finiti: number }>();
  for (const r of (iscritti ?? []) as { sequenza_id: string; stato: string }[]) {
    const c = perSeq.get(r.sequenza_id) ?? { attivi: 0, fermati: 0, finiti: 0 };
    if (r.stato === "attivo") c.attivi++;
    else if (r.stato === "fermato") c.fermati++;
    else c.finiti++;
    perSeq.set(r.sequenza_id, c);
  }

  return {
    sequenze: (seq ?? []).map((s: { id: string }) => ({
      ...s,
      passi: (passi ?? []).filter((p: { sequenza_id: string }) => p.sequenza_id === s.id),
      conteggi: perSeq.get(s.id) ?? { attivi: 0, fermati: 0, finiti: 0 },
    })),
    iscritti: (iscritti ?? []).map((r: { lead_id: string }) => ({ ...r, lead: perLead.get(r.lead_id) ?? null })),
  };
}

async function sequenzaSalva(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  const nome = testo(d.nome, 120);
  if (!nome) throw new ErroreCliente("Dai un nome alla sequenza.");

  const grezzi = Array.isArray(d.passi) ? d.passi : [];
  if (!grezzi.length) throw new ErroreCliente("Una sequenza senza passi non manda niente: aggiungine almeno uno.");
  if (grezzi.length > 10) throw new ErroreCliente("Dieci passi sono già tanti: oltre, è insistenza.");

  const passi = grezzi.slice(0, 10).map((p, i) => {
    const r = p as Record<string, unknown>;
    return {
      ordine: i + 1,
      /* Il primo passo parte subito: aspettare prima del primo
         messaggio vorrebbe dire iscrivere qualcuno a niente. */
      dopo_giorni: i === 0 ? 0 : Math.max(1, Math.min(365, Number(r.dopo_giorni) || 3)),
      modello_id: testo(r.modello_id, 40),
      oggetto: testo(r.oggetto, 300),
      corpo: testo(r.corpo, 40000),
    };
  });

  for (const p of passi) {
    if (!p.modello_id && (!p.oggetto || !p.corpo)) {
      throw new ErroreCliente(
        `Il passo ${p.ordine} non ha né un modello né un testo scritto a mano: non saprei cosa mandare.`,
      );
    }
  }

  const riga: Record<string, unknown> = {
    nome,
    mittente_id: testo(d.mittente_id, 40),
    smtp_id: testo(d.smtp_id, 40),
    note: testo(d.note, 500),
  };

  let seqId = id;
  if (id) {
    const { error } = await db.from("mm_sequenze").update(riga).eq("id", id);
    if (error) throw new Error(error.message);
    /* I passi si riscrivono per intero: tenerne traccia in
       differenza vorrebbe dire indovinare quale riga era quale
       dopo che qualcuno ne ha spostata una. Le email già create
       da questa sequenza non cambiano: sono già partite o sono
       in coda col testo che avevano. */
    await db.from("mm_sequenze_passi").delete().eq("sequenza_id", id);
  } else {
    const { data, error } = await db.from("mm_sequenze").insert(riga).select("id").single();
    if (error) throw new Error(error.message);
    seqId = data.id;
  }

  const { error: e2 } = await db.from("mm_sequenze_passi")
    .insert(passi.map((p) => ({ ...p, sequenza_id: seqId })));
  if (e2) {
    if (!id) await db.from("mm_sequenze").delete().eq("id", seqId as string);
    throw new Error(e2.message);
  }
  return { id: seqId, passi: passi.length };
}

async function sequenzaElimina(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo della sequenza.");
  /* Le email già create restano, come per le campagne: sono
     fatti accaduti e il registro deve poterli mostrare. */
  await db.from("mm_email").update({ sequenza_id: null })
    .eq("sequenza_id", id).in("stato", ["inviata", "fallita"]);
  const { error } = await db.from("mm_sequenze").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { eliminata: id };
}

async function sequenzaAttiva(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  const attiva = d.attiva !== false;
  if (!id) throw new ErroreCliente("Manca l'identificativo della sequenza.");

  if (attiva) {
    /* Accendere una sequenza senza casella vuol dire accumulare
       messaggi che non hanno da dove uscire: meglio dirlo ora. */
    const { data: s } = await db.from("mm_sequenze").select("smtp_id").eq("id", id).maybeSingle();
    if (!s) throw new ErroreCliente("Questa sequenza non esiste più.", 404);
    if (!s.smtp_id) throw new ErroreCliente("Scegli prima la casella da cui devono partire i messaggi.");
    const { count } = await db.from("mm_sequenze_passi")
      .select("id", { count: "exact", head: true }).eq("sequenza_id", id);
    if (!count) throw new ErroreCliente("Questa sequenza non ha passi: non manderebbe niente.");
  }

  const { error } = await db.from("mm_sequenze").update({ attiva }).eq("id", id);
  if (error) throw new Error(error.message);
  return { id, attiva };
}

async function sequenzaIscrivi(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  const listaId = testo(d.lista_id, 40);
  if (!id) throw new ErroreCliente("Manca la sequenza.");
  if (!listaId) throw new ErroreCliente("Scegli la lista da iscrivere.");

  const { data: dentro } = await db.from("mm_lista_lead").select("lead_id").eq("lista_id", listaId);
  const ids = (dentro ?? []).map((r: { lead_id: string }) => r.lead_id);
  if (!ids.length) throw new ErroreCliente("Questa lista è vuota.");

  const { data: lead } = await db.from("crm_lead")
    .select("id,email,no_contatto,stato").in("id", ids);
  const { data: vietati } = await db.from("mm_blacklist").select("email");
  const nero = new Set((vietati ?? []).map((r: { email: string }) => r.email.toLowerCase()));

  /* Gli stessi motivi di sempre per saltare qualcuno, contati
     separati: sono le tre risposte a «perché sono entrati in
     meno di quanti ne avevo». */
  const saltati = { senzaEmail: 0, opposti: 0, inBlacklist: 0, giaRisposto: 0 };
  const buoni: string[] = [];
  for (const l of (lead ?? []) as Record<string, unknown>[]) {
    const email = String(l.email ?? "").toLowerCase();
    if (!emailValida(email)) { saltati.senzaEmail++; continue; }
    if (l.no_contatto) { saltati.opposti++; continue; }
    if (nero.has(email)) { saltati.inBlacklist++; continue; }
    if (STATI_RISPOSTO.includes(String(l.stato))) { saltati.giaRisposto++; continue; }
    buoni.push(String(l.id));
  }

  if (!buoni.length) {
    throw new ErroreCliente(
      "Non è rimasto nessuno da iscrivere: " +
      [
        saltati.senzaEmail ? `${saltati.senzaEmail} senza indirizzo` : null,
        saltati.opposti ? `${saltati.opposti} si sono opposti` : null,
        saltati.inBlacklist ? `${saltati.inBlacklist} in blacklist` : null,
        saltati.giaRisposto ? `${saltati.giaRisposto} già oltre il primo contatto` : null,
      ].filter(Boolean).join(", ") + ".",
    );
  }

  /* ignoreDuplicates: chi è già dentro resta dov'è, col suo
     passo. Reiscriverlo lo rimetterebbe all'inizio, cioè gli
     riscriverebbe il primo messaggio una seconda volta. */
  const { error } = await db.from("mm_sequenze_iscritti")
    .upsert(buoni.map((lead_id) => ({ sequenza_id: id, lead_id })),
      { onConflict: "sequenza_id,lead_id", ignoreDuplicates: true });
  if (error) {
    if ((error as { code?: string }).code === "23503") {
      throw new ErroreCliente("La sequenza non esiste più.");
    }
    throw new Error(error.message);
  }

  const { count } = await db.from("mm_sequenze_iscritti")
    .select("id", { count: "exact", head: true })
    .eq("sequenza_id", id).in("lead_id", buoni);
  return { iscritti: count ?? buoni.length, candidati: buoni.length, saltati };
}

async function sequenzaFerma(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'iscritto.");
  const { error } = await db.from("mm_sequenze_iscritti").update({
    stato: "fermato",
    fermato_motivo: testo(d.motivo, 200) || "Fermato a mano",
    fermato_il: new Date().toISOString(),
  }).eq("id", id).eq("stato", "attivo");
  if (error) throw new Error(error.message);
  return { fermato: id };
}

/* Il giro delle sequenze, chiamato dallo stesso cron della coda.
   Non spedisce: mette in coda. Così i messaggi di una sequenza
   passano dagli stessi controlli e dallo stesso ritmo di tutti
   gli altri, invece di avere una porta di servizio. */

async function sequenzeAvanza() {
  const adesso = new Date().toISOString();

  const { data: attive } = await db.from("mm_sequenze")
    .select(`${COLONNE_SEQ}`).eq("attiva", true);
  if (!attive?.length) return { esaminati: 0, messi: 0, fermati: 0, finiti: 0 };

  const idSeq = attive.map((s: { id: string }) => s.id);
  const { data: dovuti } = await db.from("mm_sequenze_iscritti")
    .select("id,sequenza_id,lead_id,passo_fatto")
    .eq("stato", "attivo").in("sequenza_id", idSeq)
    .lte("prossimo_il", adesso)
    .order("prossimo_il").limit(SEQ_PER_GIRO);
  if (!dovuti?.length) return { esaminati: 0, messi: 0, fermati: 0, finiti: 0 };

  const [{ data: passi }, { data: lead }, { data: vietati }] = await Promise.all([
    db.from("mm_sequenze_passi").select("*").in("sequenza_id", idSeq).order("ordine"),
    db.from("crm_lead").select("id,nome,email,citta,telefono,no_contatto,stato")
      .in("id", dovuti.map((r: { lead_id: string }) => r.lead_id)),
    db.from("mm_blacklist").select("email"),
  ]);
  const nero = new Set((vietati ?? []).map((r: { email: string }) => r.email.toLowerCase()));
  const perLead = new Map((lead ?? []).map((l: { id: string }) => [l.id, l as Record<string, unknown>]));
  const perSeq = new Map(attive.map((s: { id: string }) => [s.id, s as Record<string, unknown>]));

  /* I modelli citati dai passi, presi una volta sola invece che
     una per iscritto. */
  const idModelli = [...new Set((passi ?? [])
    .map((p: { modello_id: string | null }) => p.modello_id).filter(Boolean))] as string[];
  const { data: modelli } = idModelli.length
    ? await db.from("crm_email_modelli").select("id,oggetto,corpo").in("id", idModelli)
    : { data: [] };
  const perModello = new Map((modelli ?? []).map((m: { id: string }) => [m.id, m as Record<string, unknown>]));

  const daCreare: Record<string, unknown>[] = [];
  const fermare: { id: string; motivo: string }[] = [];
  const finire: string[] = [];
  const avanzare: { id: string; passo: number; prossimo: string }[] = [];

  for (const r of dovuti as Record<string, unknown>[]) {
    const seq = perSeq.get(String(r.sequenza_id));
    const l = perLead.get(String(r.lead_id));
    if (!seq || !l) { fermare.push({ id: String(r.id), motivo: "Il lead o la sequenza non esistono più" }); continue; }

    const email = String(l.email ?? "").toLowerCase();
    if (!emailValida(email)) { fermare.push({ id: String(r.id), motivo: "Il lead non ha un indirizzo valido" }); continue; }
    if (l.no_contatto) { fermare.push({ id: String(r.id), motivo: "Si è opposto a ricevere comunicazioni" }); continue; }
    if (nero.has(email)) { fermare.push({ id: String(r.id), motivo: "L'indirizzo è in blacklist" }); continue; }
    if (STATI_RISPOSTO.includes(String(l.stato))) {
      fermare.push({ id: String(r.id), motivo: `Il lead è passato a «${l.stato}»: il seguito non serve più` });
      continue;
    }

    const dellaSeq = (passi ?? []).filter((p: { sequenza_id: string }) => p.sequenza_id === r.sequenza_id);
    const prossimo = dellaSeq.find((p: { ordine: number }) => p.ordine === Number(r.passo_fatto) + 1);
    if (!prossimo) { finire.push(String(r.id)); continue; }

    const modello = prossimo.modello_id ? perModello.get(prossimo.modello_id) : null;
    const oggetto = prossimo.oggetto || String(modello?.oggetto ?? "");
    const corpo = prossimo.corpo || String(modello?.corpo ?? "");
    if (!oggetto || !corpo) {
      fermare.push({ id: String(r.id), motivo: `Il passo ${prossimo.ordine} non ha più un testo da mandare` });
      continue;
    }

    const variabili: Record<string, string> = {
      azienda: String(l.nome ?? ""),
      citta: String(l.citta ?? ""),
      telefono: String(l.telefono ?? ""),
      mittente: String(seq.nome ?? ""),
    };
    daCreare.push({
      mittente_id: seq.mittente_id,
      smtp_id: seq.smtp_id,
      lead_id: l.id,
      modello_id: prossimo.modello_id,
      sequenza_id: seq.id,
      destinatario: email,
      oggetto: sostituisci(oggetto, variabili),
      corpo: sostituisci(corpo, variabili),
      stato: "in_coda",
      programmata_per: adesso,
      meta: { origine: "sequenza", passo: prossimo.ordine, sequenza: seq.nome },
    });

    /* Quando tocca al passo dopo. Se non ce n'è uno, questo era
       l'ultimo: la data non serve più ma va scritta comunque,
       perché la colonna non ammette il vuoto. */
    const dopo = dellaSeq.find((p: { ordine: number }) => p.ordine === prossimo.ordine + 1);
    const attesa = dopo ? Number(dopo.dopo_giorni ?? 0) : 0;
    avanzare.push({
      id: String(r.id),
      passo: prossimo.ordine,
      prossimo: new Date(Date.now() + attesa * 86400000).toISOString(),
    });
  }

  if (daCreare.length) {
    const { error } = await db.from("mm_email").insert(daCreare);
    if (error) throw new Error(error.message);
  }
  for (const f of fermare) {
    await db.from("mm_sequenze_iscritti").update({
      stato: "fermato", fermato_motivo: f.motivo, fermato_il: adesso,
    }).eq("id", f.id);
  }
  if (finire.length) {
    await db.from("mm_sequenze_iscritti").update({ stato: "finito" }).in("id", finire);
  }
  for (const a of avanzare) {
    await db.from("mm_sequenze_iscritti")
      .update({ passo_fatto: a.passo, prossimo_il: a.prossimo }).eq("id", a.id);
  }

  return {
    esaminati: dovuti.length,
    messi: daCreare.length,
    fermati: fermare.length,
    finiti: finire.length,
  };
}

// ---------------- Email AI Writer ----------------

/* Scrive la bozza di un messaggio a partire da quello che si sa
   dell'azienda destinataria. Tre cose valgono la pena di essere
   dette qui, perché non sono ovvie guardando l'interfaccia:
   1. il testo prodotto è una bozza da leggere, non qualcosa che
      parte da solo: nessuna azione di questo modulo spedisce
      quello che il modello ha appena scritto;
   2. i dati dell'azienda destinataria (nome, categoria, città,
      sito) escono dal database e arrivano al fornitore del
      modello: è un trattamento in più, e va dichiarato;
   3. ogni generazione costa. Il costo esatto della chiamata
      torna indietro con la risposta, così non è una voce che si
      scopre a fine mese. */

const MODELLO_AI = "claude-opus-5";
/* Tariffe per milione di token del modello sopra. Se cambia il
   modello vanno cambiate anche queste: un costo mostrato e
   sbagliato è peggio di un costo non mostrato. */
const COSTO_INGRESSO = 5;
const COSTO_USCITA = 25;

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

async function aiScrivi(d: Record<string, unknown>) {
  const apiKey = chiaveAi();

  const scopo = SCOPI[String(d.scopo)] ? String(d.scopo) : "presentazione";
  const tono = TONI[String(d.tono)] ? String(d.tono) : "cordiale";
  const istruzioni = testo(d.istruzioni, 1000);

  let lead: Record<string, unknown> | null = null;
  const leadId = testo(d.lead_id, 40);
  if (leadId) {
    const { data } = await db.from("crm_lead").select(COLONNE_LEAD).eq("id", leadId).maybeSingle();
    if (!data) throw new ErroreCliente("Il lead indicato non esiste più.");
    /* Chi si è opposto non riceve messaggi, quindi non ha senso
       nemmeno scriverne uno: fermarsi qui evita di pagare una
       generazione che non si potrà usare. */
    if (data.no_contatto) {
      throw new ErroreCliente(`${data.nome} si è opposto a ricevere comunicazioni: non c'è niente da scrivere.`);
    }
    lead = data;
  }

  const mittenteId = testo(d.mittente_id, 40);
  let firma = "QuotaFacile";
  if (mittenteId) {
    const { data } = await db.from("mm_mittenti").select("etichetta,from_nome").eq("id", mittenteId).maybeSingle();
    if (data) firma = String(data.from_nome || data.etichetta);
  }

  const scheda = lead
    ? [
      `Nome: ${lead.nome}`,
      lead.categoria ? `Settore: ${lead.categoria}` : null,
      lead.citta ? `Città: ${lead.citta}${lead.provincia ? ` (${lead.provincia})` : ""}` : null,
      lead.sito ? `Sito: ${lead.sito}` : null,
      lead.valutazione ? `Valutazione Google: ${lead.valutazione} su ${lead.recensioni ?? 0} recensioni` : null,
    ].filter(Boolean).join("\n")
    : "Nessun destinatario specifico: scrivi un testo che vada bene per più aziende, usando i segnaposto.";

  const sistema =
    `Scrivi email commerciali in italiano per ${firma}, che mette in contatto aziende con intermediari ` +
    `assicurativi iscritti al RUI.\n\n` +
    `Regole non negoziabili:\n` +
    `- Sotto le 130 parole. Chi le riceve non ha tempo.\n` +
    `- Niente superlativi, niente "leader di mercato", niente promesse di risparmio con numeri inventati.\n` +
    `- Una sola domanda alla fine, concreta e facile da rispondere.\n` +
    `- Non dare per scontato di sapere cose che non ti ho detto: se non conosci il fatturato, i dipendenti ` +
    `o le polizze che hanno, non nominarli.\n` +
    `- Non promettere sconti, percentuali o cifre.\n` +
    `- Niente oggetto sensazionalistico e niente punti esclamativi nell'oggetto.\n` +
    `- Se ti servono dati che non hai, usa i segnaposto {azienda}, {citta}, {telefono}, {mittente}: ` +
    `verranno sostituiti al momento dell'invio.\n\n` +
    `Rispondi esattamente in questo formato, senza aggiungere altro:\n` +
    `Oggetto: <l'oggetto su una riga sola>\n` +
    `<riga vuota>\n` +
    `<il testo del messaggio, senza firma: la firma la aggiunge il sistema>`;

  const richiesta =
    `Scopo del messaggio: ${SCOPI[scopo]}.\n` +
    `Tono: ${TONI[tono]}.\n\n` +
    `Azienda destinataria:\n${scheda}\n` +
    (istruzioni ? `\nIndicazioni aggiuntive di chi firma: ${istruzioni}\n` : "");

  const { default: Anthropic } = await import("npm:@anthropic-ai/sdk");
  const claude = new Anthropic({ apiKey });

  let risposta;
  try {
    risposta = await claude.beta.messages.create({
      model: MODELLO_AI,
      max_tokens: 2000,
      /* Un'email di centotrenta parole non è un problema difficile:
         allo sforzo minimo costa meno e non scrive peggio. */
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: sistema,
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

  /* Il modello può rifiutarsi: la risposta arriva comunque con
     stato 200, e leggerne il contenuto senza guardare prima il
     motivo darebbe una bozza vuota senza spiegazione. */
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

  /* Il formato chiesto è "Oggetto: …" sulla prima riga. Se per
     qualche motivo non arriva così, il testo non si butta: si
     mette tutto nel corpo e l'oggetto resta da scrivere, che è
     visibile invece di essere sbagliato in silenzio. */
  const righe = testoIntero.split("\n");
  const prima = righe[0]?.trim() ?? "";
  const conOggetto = /^oggetto\s*:/i.test(prima);
  const oggetto = conOggetto ? prima.replace(/^oggetto\s*:\s*/i, "").trim() : "";
  const corpo = (conOggetto ? righe.slice(1).join("\n") : testoIntero).trim();

  const uso = risposta.usage;
  const costo =
    (uso.input_tokens / 1_000_000) * COSTO_INGRESSO +
    (uso.output_tokens / 1_000_000) * COSTO_USCITA;

  return {
    oggetto,
    corpo,
    modello: MODELLO_AI,
    costo: Number(costo.toFixed(5)),
    token: { ingresso: uso.input_tokens, uscita: uso.output_tokens },
  };
}

const AZIONI: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
  panoramica: () => panoramica(),
  "lista-salva": listaSalva,
  "lista-elimina": listaElimina,
  "lista-contenuto": listaContenuto,
  "lista-aggiungi": listaAggiungi,
  "lista-togli": listaTogli,
  "lead-aggiungi": leadAggiungi,
  "ai-scrivi": aiScrivi,
  "campagna-salva": campagnaSalva,
  "campagna-elimina": campagnaElimina,
  "posta-elenco": postaElenco,
  "posta-salva": postaSalva,
  "posta-stato": postaStato,
  "posta-elimina": postaElimina,
  "posta-programma": postaProgramma,
  "posta-invia": postaInvia,
  "coda-scarica": () => codaScarica(),
  registro,
  "blacklist-elenco": blacklistElenco,
  "blacklist-aggiungi": blacklistAggiungi,
  "blacklist-togli": blacklistTogli,
  "sequenza-elenco": () => sequenzaElenco(),
  "sequenza-salva": sequenzaSalva,
  "sequenza-elimina": sequenzaElimina,
  "sequenza-attiva": sequenzaAttiva,
  "sequenza-iscrivi": sequenzaIscrivi,
  "sequenza-ferma": sequenzaFerma,
  "smtp-salva": smtpSalva,
  "smtp-elimina": smtpElimina,
  "smtp-stato": smtpStato,
  "smtp-prova": smtpProva,
  "smtp-dns": smtpDns,
  "smtp-invio-rapido": smtpInvioRapido,
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
  const ammesso = !!fornita && uguali(await impronta(fornita), atteso);

  /* Il cron non ha la chiave di amministrazione: ha la sua, che
     vale solo per svuotare la coda. Il corpo si legge una volta
     sola, quindi l'azione va decisa prima di rifiutare. */
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return rispondi({ ok: false, errore: "Richiesta illeggibile" }, 400);
  }
  const nome = String(body?.azione ?? "");

  if (!ammesso) {
    const perCoda = req.headers.get("x-qf-coda");
    const attesaCoda = await improntaCodaAttesa();
    const codaOk = nome === "coda-scarica" && !!perCoda && !!attesaCoda &&
      uguali(await impronta(perCoda), attesaCoda);
    if (!codaOk) {
      return rispondi({ ok: false, errore: "Chiave di amministrazione errata" }, 401);
    }
  }

  try {
    const azione = AZIONI[nome];
    if (!azione) return rispondi({ ok: false, errore: "Azione non riconosciuta" }, 400);
    return rispondi({ ok: true, ...(await azione(body.dati ?? {}) as object) });
  } catch (e) {
    if (e instanceof ErroreCliente) return rispondi({ ok: false, errore: e.message }, e.status);
    console.error("[qf-mm]", e);
    return rispondi({ ok: false, errore: e instanceof Error ? e.message : "Errore imprevisto" }, 500);
  }
});
