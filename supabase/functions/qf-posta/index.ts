// ============================================================
// QuotaFacile — La posta in arrivo
// ------------------------------------------------------------
// PERCHÉ ESISTE, DOPO CHE PER MESI ABBIAMO SCRITTO CHE NON SI
// POTEVA FARE
//
// In qf-mail c'è scritto: «leggere la posta richiede IMAP, cioè
// una connessione lunga a un server di posta, e le Edge Function
// sono fatte per rispondere in fretta e spegnersi». La prima
// metà è vera, la conclusione no.
//
// IMAP ha due modi di lavorare. Uno è IDLE: la connessione resta
// aperta e il server avvisa quando arriva posta — e quello, qui,
// davvero non si può fare. L'altro è guardare: ci si collega, si
// chiede cosa è arrivato, si chiude. Dura qualche secondo ed è
// esattamente la forma che l'invio ha già, visto che denomailer
// apre un socket TLS allo stesso modo e funziona.
//
// La frase vecchia confondeva «non si può tenere aperta» con
// «non si può leggere». Sono due cose diverse, e per mesi la
// seconda non è stata fatta per un motivo che valeva solo per la
// prima.
//
// NON SI SALVA NIENTE
//
// Questa funzione non scrive una riga di posta in archivio: si
// collega, legge, risponde e dimentica. Non è pigrizia, è la
// scelta giusta per due ragioni.
//
// La prima è di sostanza: la casella è già l'archivio. Copiarne
// il contenuto in un database vuol dire avere due verità che da
// quel momento divergono — cancelli un'email in Gmail e qui
// resta.
//
// La seconda è che il corpo di un'email in arrivo contiene dati
// personali di chi l'ha scritta, e conservarli altrove sarebbe
// un trattamento in più, da dichiarare nell'informativa. Leggere
// e mostrare senza conservare non lo è: è la stessa cosa che fa
// un client di posta.
//
// IL CLIENT È SCRITTO A MANO, E NON È VANITÀ
//
// Serve un sesto di IMAP: LOGIN, SELECT, SEARCH, FETCH dei soli
// header, LOGOUT. Portare dentro una libreria npm su una
// funzione che maneggia le credenziali della casella vuol dire
// aggiungere una superficie che non controllo per risparmiare
// duecento righe che so leggere. Il dialogo con il server viene
// registrato — senza la password — così quando qualcosa non va
// si legge cosa ha risposto davvero invece di indovinare.
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

const testo = (v: unknown, max = 300) =>
  v === undefined || v === null ? null : String(v).trim().slice(0, max) || null;

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

async function improntaAttesa(): Promise<string | null> {
  const { data } = await db.from("impostazioni_admin")
    .select("token_hash").eq("id", 1).maybeSingle();
  return data?.token_hash ?? null;
}

// ---------------- La casella ----------------

/* L'indirizzo IMAP non si chiede: si ricava da quello SMTP già
   configurato. Chi ha scritto smtp.gmail.com non deve scoprire
   che esiste anche imap.gmail.com, e soprattutto non deve poterlo
   scrivere sbagliato. Per i fornitori fuori elenco si tenta la
   regola generale (smtp → imap), che copre quasi tutti; se non
   basta, QF_IMAP_HOST ha l'ultima parola. */
const IMAP_NOTI: Record<string, string> = {
  "smtp.gmail.com": "imap.gmail.com",
  "smtps.aruba.it": "imaps.aruba.it",
  "smtp.aruba.it": "imaps.aruba.it",
  "smtp.office365.com": "outlook.office365.com",
  "smtp-mail.outlook.com": "outlook.office365.com",
  "smtp.libero.it": "imapmail.libero.it",
  "authsmtp.securemail.pro": "imap.securemail.pro",
};

function imapDi(smtpHost: string): string {
  const scavalco = Deno.env.get("QF_IMAP_HOST");
  if (scavalco) return scavalco;
  const h = String(smtpHost || "").toLowerCase().trim();
  return IMAP_NOTI[h] || h.replace(/^smtps?[.-]?/, "imap.").replace(/^imap\.imap\./, "imap.");
}

const COLONNE_SMTP =
  "id,nome,host,porta,utente,from_email,from_nome,stato,segreto_id";

async function casellaDa(id: string | null) {
  const q = db.from("mm_smtp").select(COLONNE_SMTP).eq("stato", "attivo");
  const { data, error } = id ? await q.eq("id", id).maybeSingle() : await q.order("creato_il").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ErroreCliente("Nessuna casella di invio attiva: configurala in SMTP & Sending.", 503);
  if (!data.segreto_id) throw new ErroreCliente(`La casella «${data.nome}» non ha una password salvata.`, 503);

  const { data: pwd, error: e2 } = await db.rpc("mm_segreto_leggi", { p_id: data.segreto_id });
  if (e2) throw new Error(e2.message);
  if (!pwd) throw new ErroreCliente("La password della casella non è leggibile dal vault.", 503);
  return { casella: data as Record<string, unknown>, password: String(pwd) };
}

// ---------------- Un client IMAP, quel tanto che basta ----------------

const DEC = new TextDecoder();
const ENC = new TextEncoder();

class Imap {
  private conn: Deno.TlsConn | null = null;
  private avanzo = new Uint8Array(0);
  private tag = 0;
  /* Il dialogo, per i log. La riga del LOGIN non ci finisce mai:
     è l'unica che contiene la password. */
  readonly dialogo: string[] = [];

  async apri(host: string, porta = 993) {
    this.conn = await Deno.connectTls({ hostname: host, port: porta });
    const saluto = await this.riga();
    this.dialogo.push("S: " + saluto);
    if (!/^\* OK/i.test(saluto)) throw new ErroreCliente(`Il server IMAP non ha salutato: ${saluto}`, 502);
  }

  chiudi() {
    try { this.conn?.close(); } catch { /* già chiusa */ }
    this.conn = null;
  }

  private async altriByte(): Promise<boolean> {
    const b = new Uint8Array(16384);
    const n = await this.conn!.read(b);
    if (n === null) return false;
    const unito = new Uint8Array(this.avanzo.length + n);
    unito.set(this.avanzo); unito.set(b.subarray(0, n), this.avanzo.length);
    this.avanzo = unito;
    return true;
  }

  /* Una riga, cioè fino al CRLF. IMAP manda righe di testo e, per
     i contenuti, "letterali": una riga che finisce con {123} dice
     che i 123 byte successivi sono dati grezzi e non vanno letti
     a righe. Chi ignora questa regola si ritrova un messaggio
     tagliato a metà alla prima email con un a capo dentro. */
  private async riga(): Promise<string> {
    for (;;) {
      const i = this.avanzo.indexOf(13);
      if (i >= 0 && this.avanzo[i + 1] === 10) {
        const r = DEC.decode(this.avanzo.subarray(0, i));
        this.avanzo = this.avanzo.subarray(i + 2);
        return r;
      }
      if (!await this.altriByte()) {
        const r = DEC.decode(this.avanzo);
        this.avanzo = new Uint8Array(0);
        return r;
      }
    }
  }

  private async byte(n: number): Promise<string> {
    while (this.avanzo.length < n) {
      if (!await this.altriByte()) break;
    }
    const r = DEC.decode(this.avanzo.subarray(0, n));
    this.avanzo = this.avanzo.subarray(Math.min(n, this.avanzo.length));
    return r;
  }

  /* Manda un comando e raccoglie tutto fino alla riga che riporta
     il suo tag. `riservato` tiene la riga fuori dal registro. */
  async comando(testoComando: string, riservato = false): Promise<{ righe: string[]; esito: string }> {
    const t = "q" + (++this.tag);
    this.dialogo.push("C: " + (riservato ? `${t} ${testoComando.split(" ")[0]} ***` : `${t} ${testoComando}`));
    await this.conn!.write(ENC.encode(`${t} ${testoComando}\r\n`));

    const righe: string[] = [];
    for (;;) {
      let r = await this.riga();
      /* Un letterale: si legge il blocco e lo si attacca alla
         riga, poi si continua con la coda della stessa riga. */
      const lett = r.match(/\{(\d+)\}$/);
      if (lett) {
        const blocco = await this.byte(Number(lett[1]));
        r = r.replace(/\{\d+\}$/, "") + blocco + await this.riga();
      }
      if (r.startsWith(t + " ")) {
        const esito = r.slice(t.length + 1);
        this.dialogo.push("S: " + esito.slice(0, 200));
        if (!/^OK/i.test(esito)) throw new ErroreCliente(leggibile(testoComando, esito), 502);
        return { righe, esito };
      }
      righe.push(r);
      if (righe.length > 5000) throw new ErroreCliente("Il server ha mandato troppe righe: interrotto.", 502);
    }
  }
}

/* Il messaggio del server tradotto in cosa fare. Gli stessi tre
   casi che contano, come per l'SMTP: credenziali, IMAP spento,
   tutto il resto riportato parola per parola. */
function leggibile(comando: string, risposta: string): string {
  const b = risposta.toLowerCase();
  if (comando.startsWith("LOGIN")) {
    if (b.includes("web login required") || b.includes("application-specific")) {
      return "Google ha rifiutato le credenziali IMAP. Serve la stessa password per le app usata " +
        "per l'invio, e l'accesso IMAP dev'essere acceso in Gmail → Impostazioni → " +
        "Inoltro e POP/IMAP. Risposta del server: " + risposta;
    }
    if (b.includes("authenticationfailed") || b.includes("invalid credentials") || b.includes("auth")) {
      return "Credenziali IMAP rifiutate. È la stessa password per le app dell'invio: se l'invio " +
        "funziona e questo no, di solito è l'accesso IMAP spento nelle impostazioni della casella. " +
        "Risposta del server: " + risposta;
    }
  }
  return `Il server IMAP ha risposto: ${risposta}`;
}

// ---------------- Leggere ----------------

/* Da "=?UTF-8?B?...?=" a testo leggibile. Gli oggetti delle email
   italiane sono quasi sempre codificati così, e senza questo
   l'elenco mostrerebbe una fila di stringhe illeggibili. */
function decodificaParole(s: string): string {
  return s.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, charset, tipo, dati) => {
    try {
      let byte: Uint8Array;
      if (tipo.toLowerCase() === "b") {
        const bin = atob(dati);
        byte = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      } else {
        const t = String(dati).replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (__, h) => String.fromCharCode(parseInt(h, 16)));
        byte = Uint8Array.from(t, (c) => c.charCodeAt(0));
      }
      return new TextDecoder(String(charset).toLowerCase()).decode(byte);
    } catch { return dati; }
  }).replace(/\?=\s*=\?/g, "");
}

function intestazione(blocco: string, nome: string): string {
  /* Le intestazioni possono andare a capo e continuare con uno
     spazio: si ricompongono prima di cercare. */
  const piatto = blocco.replace(/\r?\n[ \t]+/g, " ");
  const m = piatto.match(new RegExp("^" + nome + ":\\s*(.*)$", "im"));
  return m ? decodificaParole(m[1].trim()) : "";
}

const soloIndirizzo = (da: string) => {
  const m = da.match(/<([^>]+)>/);
  return (m ? m[1] : da).trim().toLowerCase();
};

const MESI = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function leggi(d: Record<string, unknown>) {
  const giorni = Math.max(1, Math.min(90, Number(d.giorni ?? 14) || 14));
  const quante = Math.max(1, Math.min(100, Number(d.quante ?? 40) || 40));
  const { casella, password } = await casellaDa(testo(d.smtp_id, 40));

  const host = imapDi(String(casella.host ?? ""));
  const utente = String(casella.utente || casella.from_email || "");
  const im = new Imap();

  try {
    await im.apri(host);
    await im.comando(`LOGIN "${utente.replace(/"/g, '\\"')}" "${password.replace(/"/g, '\\"')}"`, true);
    await im.comando("SELECT INBOX");

    const da = new Date(Date.now() - giorni * 86400000);
    const dal = `${String(da.getDate()).padStart(2, "0")}-${MESI[da.getMonth()]}-${da.getFullYear()}`;
    const { righe: cerca } = await im.comando(`UID SEARCH SINCE ${dal}`);

    const uid = (cerca.join(" ").match(/\*\s*SEARCH([\d\s]*)/i)?.[1] || "")
      .trim().split(/\s+/).filter(Boolean).map(Number).filter((n) => n > 0);
    if (!uid.length) {
      im.chiudi();
      return { messaggi: [], guardati: 0, giorni, casella: casella.from_email, host };
    }

    /* I più recenti per primi, e non tutti: una casella con mille
       email non deve diventare mille righe da scaricare. */
    const scelti = uid.sort((a, b) => b - a).slice(0, quante);

    const { righe } = await im.comando(
      `UID FETCH ${scelti.join(",")} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID IN-REPLY-TO)] BODY.PEEK[TEXT]<0.1200>)`,
    );
    im.chiudi();

    /* Le risposte del FETCH arrivano una dietro l'altra: si taglia
       sul marcatore di inizio, che è l'unico punto affidabile. */
    const pezzi = righe.join("\n").split(/\*\s+\d+\s+FETCH\s*\(/i).slice(1);
    const messaggi = pezzi.map((p) => {
      const u = Number(p.match(/UID\s+(\d+)/i)?.[1] || 0);
      const corpoGrezzo = p.split(/BODY\[TEXT\][^\n]*/i)[1] || "";
      const anteprima = corpoGrezzo
        .replace(/=\r?\n/g, "")
        .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\)\s*$/, "")
        .trim().slice(0, 400);
      const da = intestazione(p, "From");
      return {
        uid: u,
        da,
        email: soloIndirizzo(da),
        oggetto: intestazione(p, "Subject") || "(senza oggetto)",
        quando: intestazione(p, "Date"),
        in_risposta_a: intestazione(p, "In-Reply-To"),
        anteprima,
      };
    }).filter((m) => m.email);

    /* CHI HA RISPOSTO A UNA NOSTRA CAMPAGNA, E CHI STA DICENDO NO
       Il confronto è sull'indirizzo, non sugli header di
       conversazione: molti client rispondono senza In-Reply-To, e
       un abbinamento che funziona solo con i client educati non
       serve a niente.
       Il «NO» si segnala e non si registra: l'opposizione la
       scrive una persona dopo averla letta. Un automatismo che
       sbaglia a leggere blocca per sempre un'azienda che voleva
       dire altro. */
    const indirizzi = [...new Set(messaggi.map((m) => m.email))];
    const { data: nostre } = await db.from("mm_email")
      .select("destinatario,oggetto,inviata_il,lead_id")
      .in("destinatario", indirizzi).eq("stato", "inviata")
      .order("inviata_il", { ascending: false });

    const perIndirizzo = new Map<string, { oggetto: string; inviata_il: string; lead_id: string | null }>();
    for (const r of (nostre ?? []) as Record<string, string>[]) {
      if (!perIndirizzo.has(r.destinatario)) {
        perIndirizzo.set(r.destinatario, { oggetto: r.oggetto, inviata_il: r.inviata_il, lead_id: r.lead_id ?? null });
      }
    }

    const conMarcatori = messaggi.map((m) => {
      const nostra = perIndirizzo.get(m.email) || null;
      const testoBreve = `${m.oggetto} ${m.anteprima}`.trim();
      const pareNo = /^\s*(no|no grazie|non sono interessat|non mi interessa|cancellat|rimuovet|unsubscribe)/i
        .test(m.anteprima.trim()) || /^\s*no\s*$/i.test(m.oggetto.trim());
      return {
        ...m,
        risposta_a_campagna: !!nostra,
        nostra_email: nostra ? { oggetto: nostra.oggetto, inviata_il: nostra.inviata_il } : null,
        lead_id: nostra?.lead_id ?? null,
        pare_opposizione: !!nostra && pareNo,
        _n: testoBreve.length,
      };
    });

    /* Prima le risposte alle nostre campagne, e fra quelle prima
       chi sembra opporsi: è l'unica che ha una scadenza. */
    conMarcatori.sort((a, b) =>
      Number(b.pare_opposizione) - Number(a.pare_opposizione) ||
      Number(b.risposta_a_campagna) - Number(a.risposta_a_campagna) ||
      b.uid - a.uid);

    return {
      messaggi: conMarcatori.map(({ _n, ...m }) => m),
      guardati: uid.length,
      giorni,
      casella: casella.from_email,
      host,
    };
  } catch (e) {
    im.chiudi();
    console.error("[qf-posta] lettura fallita su", host, "- dialogo:", im.dialogo.join(" | "));
    throw e;
  }
}

/* La prova: si collega, entra, apre la posta e dice quante ce ne
   sono. Non scarica niente. Serve a sapere se le credenziali e
   l'accesso IMAP vanno, prima di scoprirlo mentre si cerca una
   risposta. */
async function prova(d: Record<string, unknown>) {
  const { casella, password } = await casellaDa(testo(d.smtp_id, 40));
  const host = imapDi(String(casella.host ?? ""));
  const utente = String(casella.utente || casella.from_email || "");
  const im = new Imap();
  try {
    await im.apri(host);
    await im.comando(`LOGIN "${utente.replace(/"/g, '\\"')}" "${password.replace(/"/g, '\\"')}"`, true);
    const { righe } = await im.comando("SELECT INBOX");
    im.chiudi();
    const quante = Number(righe.join(" ").match(/\*\s*(\d+)\s+EXISTS/i)?.[1] || 0);
    return { ok: true, host, utente, messaggi: quante, dialogo: im.dialogo };
  } catch (e) {
    im.chiudi();
    console.error("[qf-posta] prova fallita su", host, "- dialogo:", im.dialogo.join(" | "));
    throw e;
  }
}

// ---------------- Instradamento ----------------

const AZIONI: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
  leggi,
  prova,
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
      console.warn("[qf-posta] rifiutata:", e.status, "-", e.message);
      return rispondi({ ok: false, errore: e.message, configurazione: e.status === 503 }, e.status);
    }
    console.error("[qf-posta]", e);
    return rispondi({ ok: false, errore: e instanceof Error ? e.message : "Errore imprevisto" }, 500);
  }
});
