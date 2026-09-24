// ============================================================
// QuotaFacile — Account e abbonamenti degli intermediari
// ------------------------------------------------------------
// Tre cose che devono stare insieme, e stanno qui perché
// separarle vorrebbe dire tenere allineati tre posti:
//
//   1. la registrazione di un intermediario (utenza + profilo);
//   2. l'avvio dell'abbonamento su Stripe;
//   3. il webhook che riporta indietro cosa ha deciso Stripe.
//
// PERCHÉ IL PROFILO LO CREA QUESTA FUNZIONE E NON IL BROWSER
// Su pro_profili il permesso di INSERT non è concesso a nessuno.
// Non è eccesso di zelo: proteggere le colonne in UPDATE e
// lasciare libero l'INSERT non protegge niente, perché chi si
// inserisce da solo si inserisce già verificato e con i punti che
// preferisce. La riga nasce qui, con il ruolo di servizio, con
// stato_verifica "in_attesa" e punti a zero, e da lì in poi
// l'interessato può cambiare solo le colonne che lo riguardano.
//
// PERCHÉ NON C'È L'SDK DI STRIPE
// Servono quattro chiamate HTTP e una verifica di firma. L'SDK
// porterebbe dentro un pacchetto intero per fare quello che fa
// fetch con un corpo urlencoded, e una dipendenza in più su una
// funzione che maneggia pagamenti è una superficie in più da
// tenere aggiornata.
//
// LA PROVA DI 30 GIORNI
// Non è un prodotto a 0 €: è trial_period_days sul prezzo vero.
// Un prodotto a zero euro non si trasforma in un abbonamento
// pagante — al trentunesimo giorno qualcuno dovrebbe accorgersene
// e fare qualcosa a mano. Con la prova sul prezzo vero la carta
// viene raccolta subito, non viene addebitato nulla per trenta
// giorni, e alla scadenza Stripe addebita da solo.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const rispondi = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });

const testo = (v: unknown, max = 300) =>
  v === undefined || v === null ? null : String(v).trim().slice(0, max) || null;

const emailValida = (v: string | null) =>
  !!v && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v);

class ErroreCliente extends Error {
  constructor(msg: string, readonly status = 400) { super(msg); }
}

// ---------------- Stripe, senza SDK ----------------

const CHIAVE_STRIPE = () => {
  const k = Deno.env.get("STRIPE_SECRET_KEY");
  if (!k) {
    throw new ErroreCliente(
      "I pagamenti non sono attivi: manca il segreto STRIPE_SECRET_KEY fra " +
      "quelli del progetto Supabase.", 503);
  }
  return k;
};

/* I prezzi non sono segreti — compaiono in qualunque integrazione
   lato browser — e stare qui li rende leggibili insieme al codice
   che li usa. L'ambiente può scavalcarli, per poterli cambiare
   senza ripubblicare la funzione. */
const PREZZI: Record<string, string> = {
  base: Deno.env.get("QF_STRIPE_PREZZO_BASE") || "price_1UJJGvBTHplTkScIbxJ163U1",
  pro: Deno.env.get("QF_STRIPE_PREZZO_PRO") || "price_1UJJUFBTHplTkScIwyzj1aZB",
};

const GIORNI_PROVA = Number(Deno.env.get("QF_STRIPE_GIORNI_PROVA") || 30);

/* Stripe parla urlencoded, anche per gli oggetti annidati:
   subscription_data[metadata][profilo_id]=... Scriverlo a mano
   ogni volta è il modo di sbagliare una parentesi e non capire
   perché il campo non arriva. */
function form(oggetto: Record<string, unknown>, prefisso = ""): string[] {
  const parti: string[] = [];
  for (const [k, v] of Object.entries(oggetto)) {
    if (v === undefined || v === null) continue;
    const chiave = prefisso ? `${prefisso}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) {
      parti.push(...form(v as Record<string, unknown>, chiave));
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => {
        if (typeof x === "object") parti.push(...form(x as Record<string, unknown>, `${chiave}[${i}]`));
        else parti.push(`${encodeURIComponent(`${chiave}[${i}]`)}=${encodeURIComponent(String(x))}`);
      });
    } else {
      parti.push(`${encodeURIComponent(chiave)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parti;
}

async function stripe(percorso: string, corpo?: Record<string, unknown>, metodo = "POST") {
  const r = await fetch("https://api.stripe.com/v1/" + percorso, {
    method: corpo ? metodo : "GET",
    headers: {
      Authorization: "Bearer " + CHIAVE_STRIPE(),
      ...(corpo ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: corpo ? form(corpo).join("&") : undefined,
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const m = j?.error?.message || "Stripe ha risposto con un errore (" + r.status + ").";
    console.error("[qf-pro] stripe", percorso, m);
    throw new ErroreCliente(m, r.status === 402 ? 402 : 502);
  }
  return j;
}

// ---------------- Chi sta chiedendo ----------------
// Il browser manda il proprio token: la funzione non si fida del
// corpo della richiesta per sapere chi è: se l'identità arrivasse
// da un campo JSON, chiunque potrebbe pagare per conto d'altri —
// o peggio, farsi assegnare l'abbonamento di qualcun altro.

async function profiloDiChiChiede(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new ErroreCliente("Serve l'accesso", 401);

  const comeLui = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await comeLui.auth.getUser();
  if (!u?.user) throw new ErroreCliente("Sessione non valida: rientra", 401);

  const { data: p, error } = await db.from("pro_profili")
    .select("id, nome, email, stripe_cliente_id")
    .eq("utente_id", u.user.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) throw new ErroreCliente("Questa utenza non ha un profilo professionista", 404);
  return p;
}

// ---------------- Registrazione ----------------

const RUI_SEZIONI = ["A", "B", "C", "D", "E", "F"];

async function registrati(d: Record<string, unknown>) {
  const email = testo(d.email, 200)?.toLowerCase() ?? null;
  const password = testo(d.password, 200);
  const nome = testo(d.nome, 200);

  if (!emailValida(email)) throw new ErroreCliente("Serve un indirizzo email valido");
  if (!password || password.length < 10) {
    throw new ErroreCliente("La password deve essere lunga almeno 10 caratteri");
  }
  if (!nome || nome.length < 3) throw new ErroreCliente("Serve nome e cognome");

  const sezione = testo(d.ruiSezione, 2)?.toUpperCase() ?? null;
  if (sezione && !RUI_SEZIONI.includes(sezione)) {
    throw new ErroreCliente("Sezione RUI non valida");
  }

  /* Questa è l'unica porta del sito che crea un'utenza vera senza
     che nessuno abbia dato il permesso, ed è aperta per forza:
     un intermediario deve potersi iscrivere da solo. Un tetto
     orario non impedisce a una persona di registrarsi e ferma uno
     script che ne registra mille — che è tutto quello che serve
     oggi, con il primo iscritto ancora da arrivare. */
  const unOraFa = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("pro_profili")
    .select("id", { count: "exact", head: true }).gte("creato_il", unOraFa);
  if ((count ?? 0) >= 20) {
    throw new ErroreCliente(
      "Troppe registrazioni nell'ultima ora. Riprova più tardi, oppure scrivici.", 429);
  }

  const { data: utente, error: errAuth } = await db.auth.admin.createUser({
    email: email!,
    password,
    // L'indirizzo non è ancora confermato da nessuno: il profilo
    // però non compare in vetrina finché la redazione non riscontra
    // il numero RUI sul registro pubblico, quindi una registrazione
    // con l'email di un altro non produce una scheda pubblica.
    email_confirm: true,
    user_metadata: { nome, tipo: "intermediario" },
  });
  if (errAuth) {
    throw new ErroreCliente(
      /already|registered/i.test(errAuth.message)
        ? "Esiste già un'utenza con questa email"
        : errAuth.message);
  }

  const { data: profilo, error } = await db.from("pro_profili").insert({
    utente_id: utente.user.id,
    nome,
    email,
    ruolo: testo(d.ruolo, 80),
    azienda: testo(d.azienda, 200),
    rui_numero: testo(d.rui, 40),
    rui_sezione: sezione,
    citta: testo(d.citta, 120),
    telefono: testo(d.telefono, 60),
    bio: testo(d.bio, 2000),
    specializzazioni: Array.isArray(d.spec)
      ? (d.spec as unknown[]).map((x) => String(x).slice(0, 40)).slice(0, 12)
      : null,
  }).select("id").single();

  if (error) {
    // Un'utenza senza profilo è un account che non apre niente e
    // che nessuno può ricreare: meglio toglierla che lasciarla.
    await db.auth.admin.deleteUser(utente.user.id);
    throw new Error("Profilo non creato: registrazione annullata. " + error.message);
  }

  return { creato: true, profiloId: profilo.id };
}

// ---------------- Abbonamento ----------------

async function clienteStripe(p: { id: string; nome: string; email: string; stripe_cliente_id: string | null }) {
  if (p.stripe_cliente_id) return p.stripe_cliente_id;

  const c = await stripe("customers", {
    email: p.email,
    name: p.nome,
    metadata: { profilo_id: p.id, progetto: "quotafacile" },
  });
  await db.from("pro_profili").update({ stripe_cliente_id: c.id }).eq("id", p.id);
  return c.id as string;
}

async function checkout(d: Record<string, unknown>, req: Request) {
  const piano = String(d.piano ?? "");
  const prezzo = PREZZI[piano];
  if (!prezzo) throw new ErroreCliente("Piano non riconosciuto");

  const p = await profiloDiChiChiede(req);

  // Un secondo abbonamento sullo stesso profilo vuol dire due
  // addebiti al mese per la stessa cosa. Si manda al portale, dove
  // si cambia piano invece di sottoscriverne un altro.
  const { data: gia } = await db.from("pro_abbonamenti")
    .select("id").eq("profilo_id", p.id)
    .in("stato", ["trialing", "active", "past_due"]).maybeSingle();
  if (gia) {
    throw new ErroreCliente(
      "Hai già un abbonamento attivo. Per cambiare piano o carta usa la gestione abbonamento.");
  }

  const ritorno = testo(d.ritorno, 300) || "https://www.quotafacile.net/";
  const cliente = await clienteStripe(p);

  const sessione = await stripe("checkout/sessions", {
    mode: "subscription",
    customer: cliente,
    line_items: [{ price: prezzo, quantity: 1 }],
    // Con una prova gratuita Stripe non chiederebbe la carta:
    // così invece la chiede subito, e al trentunesimo giorno
    // l'addebito parte senza che nessuno debba fare niente.
    payment_method_collection: "always",
    subscription_data: {
      trial_period_days: GIORNI_PROVA,
      metadata: { profilo_id: p.id, piano },
    },
    // L'IVA è esclusa dal prezzo: va calcolata, non incorporata.
    automatic_tax: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    tax_id_collection: { enabled: true },
    locale: "it",
    metadata: { profilo_id: p.id, piano },
    success_url: ritorno + "#/area-pro?abbonamento=fatto",
    cancel_url: ritorno + "#/area-pro?abbonamento=annullato",
  });

  return { url: sessione.url };
}

// Il portale di Stripe: da lì si cambia carta, si cambia piano e
// si disdice. Averlo non è una gentilezza — è il modo di non
// costruire tre schermate che farebbero peggio la stessa cosa, e
// di non essere noi a stare in mezzo fra chi paga e la disdetta.
async function portale(d: Record<string, unknown>, req: Request) {
  const p = await profiloDiChiChiede(req);
  if (!p.stripe_cliente_id) throw new ErroreCliente("Non risulta nessun abbonamento da gestire", 404);
  const ritorno = testo(d.ritorno, 300) || "https://www.quotafacile.net/";
  const s = await stripe("billing_portal/sessions", {
    customer: p.stripe_cliente_id,
    return_url: ritorno + "#/area-pro",
  });
  return { url: s.url };
}

// ---------------- Il webhook ----------------
//
// La firma si verifica a mano perché è poco più di un HMAC, e
// perché il corpo va letto grezzo: qualunque passaggio che lo
// riscriva — anche solo JSON.parse e JSON.stringify — cambia i
// byte e fa fallire il confronto.
//
// Senza questa verifica l'endpoint è una porta aperta: chiunque
// conosca l'indirizzo potrebbe mandare "subscription.updated,
// stato active" e regalarsi un abbonamento.

async function firmaValida(corpo: string, intestazione: string | null, segreto: string) {
  if (!intestazione) return false;
  const parti = Object.fromEntries(
    intestazione.split(",").map((x) => x.trim().split("=") as [string, string]));
  const t = parti.t;
  const atteso = parti.v1;
  if (!t || !atteso) return false;

  // Oltre cinque minuti si rifiuta: un evento vero non arriva così
  // tardi, e uno copiato da un log non deve poter essere rigiocato.
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;

  const chiave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(segreto),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign(
    "HMAC", chiave, new TextEncoder().encode(`${t}.${corpo}`));
  const calcolato = [...new Uint8Array(firma)]
    .map((x) => x.toString(16).padStart(2, "0")).join("");

  if (calcolato.length !== atteso.length) return false;
  let diff = 0;
  for (let i = 0; i < calcolato.length; i++) diff |= calcolato.charCodeAt(i) ^ atteso.charCodeAt(i);
  return diff === 0;
}

const STATI = ["trialing", "active", "past_due", "unpaid",
               "canceled", "incomplete", "incomplete_expired", "paused"];

async function salvaAbbonamento(sub: Record<string, unknown>) {
  const meta = (sub.metadata ?? {}) as Record<string, string>;
  let profiloId = meta.profilo_id || null;

  // Un abbonamento creato dal pannello di Stripe non porta il
  // profilo nei metadati: si risale dal cliente.
  if (!profiloId && sub.customer) {
    const { data } = await db.from("pro_profili")
      .select("id").eq("stripe_cliente_id", String(sub.customer)).maybeSingle();
    profiloId = data?.id ?? null;
  }
  if (!profiloId) {
    console.warn("[qf-pro] abbonamento senza profilo:", sub.id);
    return;
  }

  const stato = String(sub.status ?? "");
  if (!STATI.includes(stato)) {
    console.warn("[qf-pro] stato sconosciuto:", stato);
    return;
  }

  const voce = (sub.items as { data?: { price?: { id?: string } }[] })?.data?.[0];
  const fine = sub.current_period_end
    ? new Date(Number(sub.current_period_end) * 1000).toISOString()
    : null;

  const { error } = await db.from("pro_abbonamenti").upsert({
    profilo_id: profiloId,
    stripe_customer_id: String(sub.customer ?? ""),
    stripe_subscription_id: String(sub.id ?? ""),
    stripe_price_id: voce?.price?.id ?? "",
    stato,
    periodo_fine: fine,
    annulla_a_fine_periodo: sub.cancel_at_period_end === true,
    aggiornato_il: new Date().toISOString(),
  }, { onConflict: "stripe_subscription_id" });
  if (error) throw new Error(error.message);

  /* Il riassunto pubblicabile.
     pro_abbonamenti non è leggibile da fuori e non deve
     diventarlo: contiene identificativi Stripe e date di
     pagamento. Ma la vetrina è pubblica e deve poter ordinare i
     profili, e il badge deve poter comparire. Quindi lo stato si
     riassume in due colonne del profilo — "è in evidenza" e
     "quale piano" — e non esce nient'altro.

     Il piano si legge dai metadati, e in mancanza dal prezzo: un
     abbonamento creato a mano dal pannello di Stripe non porta
     metadati, ma il prezzo ce l'ha sempre. */
  const attivo = stato === "trialing" || stato === "active";
  const idPrezzo = voce?.price?.id;
  const piano = (meta.piano === "base" || meta.piano === "pro") ? meta.piano
    : idPrezzo === PREZZI.pro ? "pro"
    : idPrezzo === PREZZI.base ? "base"
    : null;

  await db.from("pro_profili")
    .update({ in_evidenza: attivo, piano: attivo ? piano : null })
    .eq("id", profiloId);
}

async function webhook(req: Request) {
  const segreto = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!segreto) {
    return rispondi({ ok: false, errore: "Manca STRIPE_WEBHOOK_SECRET" }, 503);
  }

  const corpo = await req.text();
  if (!await firmaValida(corpo, req.headers.get("Stripe-Signature"), segreto)) {
    return rispondi({ ok: false, errore: "Firma non valida" }, 400);
  }

  const evento = JSON.parse(corpo);

  /* Stripe riconsegna un evento finché non riceve una conferma, e
     lo riconsegna anche dopo averla ricevuta se la risposta si
     perde per strada. La riga qui è la memoria di cosa è già
     stato lavorato: la chiave primaria fa il resto. */
  const { error: errDoppione } = await db.from("pro_eventi_stripe")
    .insert({ id: evento.id, tipo: evento.type });
  if (errDoppione) {
    if (errDoppione.code === "23505") return rispondi({ ok: true, gia: true });
    throw new Error(errDoppione.message);
  }

  try {
    const t = String(evento.type);
    if (t === "checkout.session.completed") {
      const s = evento.data.object;
      if (s.subscription) {
        const sub = await stripe("subscriptions/" + s.subscription);
        await salvaAbbonamento(sub);
      }
    } else if (t.startsWith("customer.subscription.")) {
      await salvaAbbonamento(evento.data.object);
    }
  } catch (e) {
    /* Se la lavorazione fallisce, la riga dell'evento va tolta:
       altrimenti Stripe riprova e noi lo scartiamo come doppione,
       cioè lo perdiamo per sempre. */
    await db.from("pro_eventi_stripe").delete().eq("id", evento.id);
    throw e;
  }

  return rispondi({ ok: true });
}

// ---------------- Instradamento ----------------

const AZIONI: Record<string, (d: Record<string, unknown>, req: Request) => Promise<unknown>> = {
  registrati: (d) => registrati(d),
  checkout,
  portale,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return rispondi({ ok: false, errore: "Metodo non consentito" }, 405);

  try {
    if (new URL(req.url).pathname.endsWith("/webhook")) return await webhook(req);

    const body = await req.json();
    const azione = AZIONI[String(body?.azione ?? "")];
    if (!azione) return rispondi({ ok: false, errore: "Azione non riconosciuta" }, 400);
    return rispondi({ ok: true, ...(await azione(body.dati ?? {}, req) as object) });
  } catch (e) {
    if (e instanceof ErroreCliente) {
      return rispondi({ ok: false, errore: e.message, configurazione: e.status === 503 }, e.status);
    }
    console.error("[qf-pro]", e);
    return rispondi({ ok: false, errore: e instanceof Error ? e.message : "Errore imprevisto" }, 500);
  }
});
