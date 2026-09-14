// ============================================================
// QuotaFacile — Magazine
// ------------------------------------------------------------
// GET   letture pubbliche: elenco degli articoli pubblicati,
//       oppure un singolo articolo con i suoi correlati.
// POST  scrittura, dietro la chiave x-qf-admin verificata qui.
//
// La struttura viene dal progetto "Lori CRM — Landing Page", che
// girava su Lovable con Supabase Auth e il gateway AI di
// Lovable. Qui non c'è né l'uno né l'altro, di proposito:
//
//  - l'autenticazione è quella che il sito ha già. Aggiungere
//    Supabase Auth solo per il Magazine vorrebbe dire avere due
//    porte da difendere invece di una;
//  - la generazione AI, se e quando servirà, parlerà con
//    Anthropic direttamente. Dipendere da ai.gateway.lovable.dev
//    significa che spegnere Lovable spegne il Magazine, ed è
//    esattamente quello che stiamo evitando.
//
// Il corpo dell'articolo è HTML, e viene ripulito qui e non nel
// browser: una pulizia fatta lato client la salta chiunque parli
// direttamente con questa funzione.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qf-admin",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

class ErroreCliente extends Error {
  constructor(msg: string, readonly status = 400) { super(msg); }
}

const rispondi = (corpo: unknown, status = 200, cache = false) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
      // Il Magazine cambia quando si pubblica, cioè di rado:
      // un minuto di cache toglie al database la gran parte
      // delle letture senza che nessuno se ne accorga.
      ...(cache ? { "Cache-Control": "public, max-age=60" } : {}),
    },
  });

const testo = (v: unknown, max = 5000) =>
  v === undefined || v === null ? null : String(v).trim().slice(0, max) || null;

// ---------------- Accesso ----------------
// Stesso meccanismo di qf-admin: la chiave non sta nel sito né
// nel repository, arriva nell'intestazione e viene confrontata
// qui contro la sua impronta.

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

// ---------------- La copertina ----------------
// Portata da Lori quasi com'era. Serve perché un URL incollato
// da Cloudinary arriva quasi sempre sporco: dentro un attributo
// src, fra virgolette, con &amp; al posto di &, senza schema.
// Meglio ripulirlo che rifiutarlo e far ricominciare da capo.
function ripuliscePortata(value?: string | null): string | null {
  if (!value) return null;
  let url = String(value).trim().replace(/&amp;/g, "&");
  const trovato = url.match(/https?:\/\/[^\s'"<>)]*/i) ?? url.match(/\/\/res\.cloudinary\.com\/[^\s'"<>)]*/i);
  if (trovato) url = trovato[0];
  url = url.replace(/^['"<]+|['">]+$/g, "");
  if (!url) return null;
  if (url.startsWith("//")) url = `https:${url}`;
  url = url.replace(/^http:\/\/res\.cloudinary\.com\//i, "https://res.cloudinary.com/");
  if (!/^https?:\/\//i.test(url)) return null;
  // http semplice su una pagina servita in https viene bloccato
  // dal browser: tanto vale dirlo subito invece di salvare un
  // indirizzo che non si vedrà mai.
  if (/^http:\/\//i.test(url)) throw new ErroreCliente("La copertina deve essere su https://");
  return url.replace(/\s+/g, "%20").slice(0, 2000);
}

// ---------------- La pulizia dell'HTML ----------------
//
// Lori toglieva i tag pericolosi da un elenco. Un elenco di cose
// vietate però è sempre in ritardo: basta un tag che a nessuno
// era venuto in mente. Qui è il contrario — passa solo quello
// che è nell'elenco dei permessi, e tutto il resto viene tolto.
//
// Sui titoli c'è una regola in più: <h1> non passa mai, perché
// l'h1 della pagina è il titolo dell'articolo e averne due
// confonde sia i motori sia chi legge con uno screen reader. E
// non si scende sotto <h4>: oltre quel livello la gerarchia non
// la segue più nessuno.

const TAG_AMMESSI = new Set([
  "p", "br", "strong", "em", "b", "i", "u", "s",
  "h2", "h3", "h4",
  "ul", "ol", "li",
  "a", "img", "blockquote", "figure", "figcaption",
  "table", "thead", "tbody", "tr", "th", "td",
  "code", "pre", "hr", "small", "sup", "sub",
]);

const ATTRIBUTI_AMMESSI: Record<string, Set<string>> = {
  a: new Set(["href", "title", "rel", "target"]),
  img: new Set(["src", "alt", "width", "height", "loading"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  td: new Set(["colspan", "rowspan"]),
};

// Lo schema di un indirizzo va guardato come lo guarda il
// browser, non come è scritto. Il browser decodifica le entità
// e ignora tabulazioni e a capo prima dei due punti, quindi
//   href="&#106;avascript:alert(1)"
//   href="java&#9;script:alert(1)"
// sono due modi di scrivere javascript: che un controllo sulla
// stringa così com'è non riconosce. Si normalizza per decidere,
// e si restituisce l'originale: se la forma decodificata è
// innocua lo è anche quella di partenza, ed evitiamo di
// riscrivere un indirizzo che magari conteneva &amp; per un
// motivo suo.
const ENTITA: Record<string, string> = {
  colon: ":", tab: "\t", newline: "\n", lpar: "(", rpar: ")", sol: "/", quot: '"', apos: "'",
};

// Gli spazi, le tabulazioni, gli a capo e i caratteri di
// controllo si tolgono confrontando i punti di codice invece che
// con una classe di caratteri: una classe piena di sequenze
// \u00NN non sopravvive a ogni passaggio fra strumenti, e una
// regex mezza decodificata smette di funzionare in silenzio.
function senzaSpaziEControlli(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c <= 32) continue;               // spazio, tab, a capo, controlli
    if (c === 160) continue;             // spazio unificatore
    if (c === 8232 || c === 8233) continue;  // separatori di riga e paragrafo
    if (c === 65279) continue;           // marcatore d'ordine dei byte
    out += ch;
  }
  return out;
}

function comeLoLeggeIlBrowser(v: string): string {
  const decodificato = v
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);?/gi, (intero, n) => ENTITA[String(n).toLowerCase()] ?? intero);
  return senzaSpaziEControlli(decodificato).toLowerCase();
}

function indirizzoSicuro(v: string, perImmagine: boolean): string | null {
  const u = v.trim();
  const letto = comeLoLeggeIlBrowser(u);
  if (/^(javascript|vbscript|file|blob):/.test(letto)) return null;
  if (/^data:/.test(letto)) {
    // Un data: dentro un href è un modo classico di far eseguire
    // qualcosa; dentro un'immagine è solo un file incorporato.
    return perImmagine && /^data:image\/(png|jpe?g|gif|webp|avif);/.test(letto) ? u : null;
  }
  return u;
}

function ripulisceHtml(html: string): string {
  let h = String(html);

  // Via per intero, contenuto compreso: di questi tag non
  // interessa nemmeno il testo dentro.
  h = h.replace(/<(script|style|iframe|object|embed|form|noscript|template|svg|math)[\s\S]*?<\/\1\s*>/gi, "");
  h = h.replace(/<!--[\s\S]*?-->/g, "");

  // I titoli, prima di tutto il resto.
  h = h.replace(/<h1(\s[^>]*)?>/gi, "<h2>").replace(/<\/h1\s*>/gi, "</h2>");
  h = h.replace(/<h([56])(\s[^>]*)?>/gi, "<h4>").replace(/<\/h[56]\s*>/gi, "</h4>");

  // Gli attributi si leggono consumando per intero le stringhe
  // fra virgolette, non fermandosi al primo ">". Fermarsi al
  // primo ">" è il difetto classico dei sanitizzatori scritti
  // con le espressioni regolari: basta scrivere
  //   <a href="data:text/html,<script>">
  // perché il tag risulti chiuso dove non lo è, l'attributo
  // pericoloso non venga nemmeno esaminato, e quello che resta
  // finisca nella pagina mezzo smontato.
  h = h.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/g, (intero, nome: string, attr: string) => {
    const tag = nome.toLowerCase();
    if (!TAG_AMMESSI.has(tag)) return "";
    if (intero.startsWith("</")) return `</${tag}>`;

    const ammessi = ATTRIBUTI_AMMESSI[tag];
    if (!ammessi) return `<${tag}>`;

    const tenuti: string[] = [];
    const re = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(attr))) {
      const chiave = m[1].toLowerCase();
      if (!ammessi.has(chiave)) continue;
      let valore = (m[2] ?? m[3] ?? m[4] ?? "").trim();
      if (chiave === "href" || chiave === "src") {
        const sicuro = indirizzoSicuro(valore, tag === "img");
        if (sicuro === null) continue;
        valore = sicuro;
      }
      tenuti.push(`${chiave}="${valore.replace(/"/g, "&quot;")}"`);
    }

    // Un link che esce dal sito si apre dove vuole, ma senza
    // lasciare alla pagina di destinazione un riferimento alla
    // nostra: rel="noopener" non è un dettaglio.
    if (tag === "a") {
      const href = tenuti.find((t) => t.startsWith("href="));
      if (href && /href="https?:\/\//i.test(href) && !href.includes("quotafacile.net")) {
        if (!tenuti.some((t) => t.startsWith("rel="))) tenuti.push('rel="noopener"');
      }
    }
    // Le immagini dentro l'articolo sono sotto la piega: caricarle
    // subito rallenta la comparsa del testo, che è la cosa che
    // il lettore sta aspettando.
    if (tag === "img" && !tenuti.some((t) => t.startsWith("loading="))) {
      tenuti.push('loading="lazy"');
    }

    return tenuti.length ? `<${tag} ${tenuti.join(" ")}>` : `<${tag}>`;
  });

  return h.trim();
}

const soloTesto = (html: string) => String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const contaParole = (html: string) => { const t = soloTesto(html); return t ? t.split(" ").length : 0; };

// ---------------- Letture pubbliche ----------------

const CAMPI_ELENCO =
  "id, slug, tipo, titolo, apertura, meta_description, cover_url, cover_alt, firma, pubblicato_il, categoria_id, pillar_id";
const CAMPI_ARTICOLO = CAMPI_ELENCO + ", corpo, keyword, aggiornato_il";

async function elencoPubblico() {
  const [articoli, categorie] = await Promise.all([
    db.from("mag_articoli").select(CAMPI_ELENCO)
      .eq("stato", "pubblicato")
      .order("pubblicato_il", { ascending: false })
      .limit(300),
    db.from("mag_categorie").select("id, nome, slug, ordine").order("ordine"),
  ]);
  if (articoli.error) throw new Error(articoli.error.message);
  return { articoli: articoli.data ?? [], categorie: categorie.data ?? [] };
}

async function articoloPubblico(slug: string) {
  const { data: articolo, error } = await db.from("mag_articoli")
    .select(CAMPI_ARTICOLO).eq("slug", slug).eq("stato", "pubblicato").maybeSingle();
  if (error) throw new Error(error.message);
  if (!articolo) return { articolo: null, correlati: [] };

  // I correlati non sono "gli ultimi tre": sono quelli legati
  // davvero. Un cluster mostra il suo pillar e i fratelli; un
  // pillar mostra i propri cluster. È il senso di avere quel
  // legame nel database invece che scritto a mano nel testo.
  const a = articolo as Record<string, unknown>;
  const radice = (a.tipo === "pillar" ? a.id : a.pillar_id) as string | null;

  let correlati: unknown[] = [];
  if (radice) {
    const { data } = await db.from("mag_articoli").select(CAMPI_ELENCO)
      .eq("stato", "pubblicato")
      .or(`id.eq.${radice},pillar_id.eq.${radice}`)
      .neq("id", a.id as string)
      .order("tipo")
      .limit(6);
    correlati = data ?? [];
  }
  if (correlati.length === 0) {
    const { data } = await db.from("mag_articoli").select(CAMPI_ELENCO)
      .eq("stato", "pubblicato").neq("id", a.id as string)
      .order("pubblicato_il", { ascending: false }).limit(3);
    correlati = data ?? [];
  }
  return { articolo, correlati };
}

// ---------------- Scrittura (area riservata) ----------------

async function elencoAdmin() {
  const [articoli, categorie] = await Promise.all([
    db.from("mag_articoli")
      .select("id, slug, tipo, pillar_id, categoria_id, titolo, keyword, stato, cover_url, pubblicato_il, creato_il, aggiornato_il, corpo")
      .order("creato_il", { ascending: false }).limit(500),
    db.from("mag_categorie").select("id, nome, slug, ordine").order("ordine"),
  ]);
  if (articoli.error) throw new Error(articoli.error.message);
  // Il conteggio parole lo fa il server: è l'unico posto dove il
  // corpo c'è già, e mandarlo tutto al browser per contarlo lì
  // vorrebbe dire spedire mezzo megabyte per mostrare un numero.
  const righe = (articoli.data ?? []).map((r: Record<string, unknown>) => {
    const { corpo, ...resto } = r;
    return { ...resto, parole: contaParole(String(corpo ?? "")) };
  });
  return { articoli: righe, categorie: categorie.data ?? [] };
}

async function leggiAdmin(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo dell'articolo");
  const { data, error } = await db.from("mag_articoli").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ErroreCliente("Articolo non trovato", 404);
  return { articolo: data };
}

const STATI = ["bozza", "pubblicato", "ritirato"];

async function salva(d: Record<string, unknown>) {
  const titolo = testo(d.titolo, 200);
  const apertura = testo(d.apertura, 20000);
  const corpo = testo(d.corpo, 200000);
  const categoria = testo(d.categoria_id, 40);
  if (!titolo || titolo.length < 5) throw new ErroreCliente("Il titolo è troppo breve");
  if (!apertura) throw new ErroreCliente("Manca l'apertura");
  if (!corpo) throw new ErroreCliente("Manca il corpo dell'articolo");
  if (!categoria) throw new ErroreCliente("Manca la categoria");

  const stato = String(d.stato ?? "bozza");
  if (!STATI.includes(stato)) throw new ErroreCliente("Stato non valido");

  const tipo = String(d.tipo ?? "cluster");
  if (tipo !== "pillar" && tipo !== "cluster") throw new ErroreCliente("Tipo non valido");
  const pillar = tipo === "pillar" ? null : testo(d.pillar_id, 40);

  const cover = ripuliscePortata(testo(d.cover_url, 2000));
  const alt = testo(d.cover_alt, 200);
  if (cover && !alt) {
    throw new ErroreCliente(
      "La copertina ha bisogno di una descrizione (alt): senza, l'immagine non dice niente a chi non la vede.");
  }

  const riga = {
    titolo,
    apertura,
    corpo: ripulisceHtml(corpo),
    meta_description: testo(d.meta_description, 300),
    keyword: testo(d.keyword, 200),
    firma: testo(d.firma, 60) ?? "Redazione QuotaFacile",
    cover_url: cover,
    cover_alt: alt,
    categoria_id: categoria,
    tipo,
    pillar_id: pillar,
    stato,
  };

  const id = testo(d.id, 40);
  if (id) {
    const { data, error } = await db.from("mag_articoli").update(riga).eq("id", id)
      .select("id, slug, stato").single();
    if (error) throw new Error(error.message);
    return { articolo: data };
  }
  const { data, error } = await db.from("mag_articoli").insert(riga)
    .select("id, slug, stato").single();
  if (error) throw new Error(error.message);
  return { articolo: data };
}

async function cambiaStato(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  const stato = String(d.stato ?? "");
  if (!id) throw new ErroreCliente("Manca l'identificativo dell'articolo");
  if (!STATI.includes(stato)) throw new ErroreCliente("Stato non valido");
  const { data, error } = await db.from("mag_articoli").update({ stato }).eq("id", id)
    .select("id, slug, stato, pubblicato_il").single();
  if (error) throw new Error(error.message);
  return { articolo: data };
}

async function elimina(d: Record<string, unknown>) {
  const id = testo(d.id, 40);
  if (!id) throw new ErroreCliente("Manca l'identificativo dell'articolo");
  // Un articolo già pubblicato ha un indirizzo che qualcuno può
  // aver salvato o linkato. Cancellarlo lascia un 404 dove prima
  // c'era una pagina: si ritira, e l'indirizzo resta nostro.
  const { data: esistente } = await db.from("mag_articoli").select("stato, slug").eq("id", id).maybeSingle();
  if (esistente && esistente.slug) {
    throw new ErroreCliente(
      "Questo articolo è già stato pubblicato una volta e ha un indirizzo pubblico: ritiralo invece di cancellarlo.");
  }
  const { error } = await db.from("mag_articoli").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { eliminato: true };
}

async function nuovaCategoria(d: Record<string, unknown>) {
  const nome = testo(d.nome, 50);
  if (!nome || nome.length < 2) throw new ErroreCliente("Nome della categoria troppo breve");
  // Stessa ragione: i segni diacritici si tolgono per punto di
  // codice, non con una classe scritta a mano.
  const senzaAccenti = [...nome.toLowerCase().normalize("NFD")]
    .filter((ch) => { const c = ch.codePointAt(0)!; return c < 0x300 || c > 0x36f; })
    .join("");
  const slug = senzaAccenti
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  if (!slug) throw new ErroreCliente("Nome della categoria non valido");
  const { data, error } = await db.from("mag_categorie")
    .insert({ nome, slug, ordine: 99 }).select("id, nome, slug").single();
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new ErroreCliente("Categoria già esistente", 409);
    throw new Error(error.message);
  }
  return { categoria: data };
}

const AZIONI: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
  elenco: elencoAdmin,
  leggi: leggiAdmin,
  salva,
  stato: cambiaStato,
  elimina,
  categoria: nuovaCategoria,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    if (req.method === "GET") {
      const slug = new URL(req.url).searchParams.get("slug");
      const dati = slug ? await articoloPubblico(slug) : await elencoPubblico();
      return rispondi({ ok: true, ...dati }, 200, true);
    }

    if (req.method === "POST") {
      const atteso = await improntaAttesa();
      if (!atteso) {
        return rispondi({
          ok: false,
          errore: "Magazine non attivo: non risulta configurata alcuna chiave di amministrazione.",
          configurazioneMancante: true,
        }, 503);
      }
      const fornita = req.headers.get("x-qf-admin");
      if (!fornita || !uguali(await impronta(fornita), atteso)) {
        return rispondi({ ok: false, errore: "Chiave di amministrazione errata" }, 401);
      }

      const body = await req.json();
      const azione = AZIONI[String(body?.azione ?? "")];
      if (!azione) throw new ErroreCliente("Azione non riconosciuta");
      return rispondi({ ok: true, ...(await azione(body.dati ?? {}) as object) });
    }

    return rispondi({ ok: false, errore: "Metodo non consentito" }, 405);
  } catch (e) {
    if (e instanceof ErroreCliente) return rispondi({ ok: false, errore: e.message }, e.status);
    console.error("[qf-magazine]", e);
    return rispondi({ ok: false, errore: "Errore nel servizio del Magazine" }, 500);
  }
});
