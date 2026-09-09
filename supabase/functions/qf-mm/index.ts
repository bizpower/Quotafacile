// ============================================================
// QuotaFacile — Mail Marketing
// ------------------------------------------------------------
// Il modulo che su Lovable stava nel progetto Bizpower, portato
// dentro QuotaFacile. Undici sezioni; questa funzione le serve
// tutte, una azione per volta.
//
// Costruite finora: la Dashboard, le caselle di invio, le liste
// di lead, la scrittura assistita.
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
    db.from("mm_campagne").select("*").order("creata_il", { ascending: false }).limit(50),
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
    campagne: campagne.data ?? [],
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
    console.error("[qf-mm]", e);
    return rispondi({ ok: false, errore: e instanceof Error ? e.message : "Errore imprevisto" }, 500);
  }
});
