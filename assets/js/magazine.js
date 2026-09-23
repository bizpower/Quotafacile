/* ============================================================
   QuotaFacile — Magazine
   ------------------------------------------------------------
   Rotta: #/admin/crm/magazine[/nuovo|/<id>]

   È la sezione che stava nell'area riservata di "Lori CRM —
   Landing Page" su Lovable, portata qui. Là era React con
   TipTap, shadcn e Tailwind; qui è lo stesso HTML che scrive il
   resto del sito, perché QuotaFacile non ha un passo di build e
   introdurlo per una sezione sola vorrebbe dire cambiare come si
   pubblica tutto il resto.

   Due scelte che cambiano rispetto a Lori, e il motivo:

   - il corpo si scrive in Markdown e non in un editor visuale.
     Un editor visuale è un pacchetto da centinaia di kilobyte e
     produce HTML che nessuno ha scritto; il Markdown lo si
     rilegge, si confronta in una diff e si incolla da qualunque
     parte. La conversione avviene qui e la ripulitura sul
     server, che è l'unico posto dove non la si può saltare.

   - non c'è nessun generatore AI collegato al gateway di
     Lovable. Se servirà, parlerà con Anthropic dalla Edge
     Function: dipendere da ai.gateway.lovable.dev significa che
     spegnere Lovable spegne il Magazine.
   ============================================================ */
"use strict";

(function () {

  const API = "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-magazine";

  const QF = () => window.QF;
  const esc = s => window.QF.esc(s);
  const chiave = () => window.QF_ADMIN?.chiave() || "";

  let dati = null;          // { articoli, categorie }
  let fase = "vuoto";       // vuoto | caricamento | pronto | errore
  let avviso = null;
  let aperto = null;        // l'articolo in modifica, così com'è sul server
  let salvando = false;
  let anteprima = false;
  /* Quale articolo stava sullo schermo l'ultima volta. L'anteprima
     è uno stato del modulo, non dell'articolo: senza questo,
     lasciarla accesa e aprire un altro articolo mostrava il
     riquadro dell'anteprima al posto dell'editor — e su un
     articolo nuovo quel riquadro è vuoto, quindi sembrava che la
     pagina non funzionasse. */
  let ultimoAperto = null;

  const D = () => dati || { articoli: [], categorie: [] };

  /* ---------------- Il servizio ---------------- */

  async function chiama(azione, d) {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), 20000);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qf-admin": chiave() },
        body: JSON.stringify({ azione, dati: d || {} }),
        signal: stop.signal
      });
      const esito = await r.json().catch(() => ({}));
      if (!r.ok || esito.ok !== true) {
        return { ok: false, errore: esito.errore || `Errore ${r.status}` };
      }
      return esito;
    } catch (e) {
      return { ok: false, errore: e.name === "AbortError" ? "Tempo scaduto" : "Servizio non raggiungibile" };
    } finally {
      clearTimeout(t);
    }
  }

  async function carica() {
    if (fase === "caricamento") return;
    fase = "caricamento"; avviso = null; QF().render();
    const esito = await chiama("elenco");
    if (esito.ok) { dati = { articoli: esito.articoli, categorie: esito.categorie }; fase = "pronto"; }
    else { fase = "errore"; avviso = esito.errore; }
    QF().render();
  }

  function dimentica() {
    dati = null; fase = "vuoto"; aperto = null;
    anteprima = false; ultimoAperto = null; salvando = false;
  }

  /* ---------------- Markdown per articoli ----------------

     admin.js ha già un mdToHtml, ma è tarato sulle risposte
     brevi delle guide: "## " diventa <h4> e i link non esistono.
     Un pillar da cinquemila parole ha bisogno di tre livelli di
     titolo, di link interni e di citazioni. Estendere quello
     cambierebbe come si vedono le guide già pubblicate, e non è
     quello che si sta facendo qui.

     Le righe che cominciano con un tag di blocco passano come
     sono: chi ha già l'HTML non deve riscriverlo in Markdown per
     poi rifarlo diventare HTML. */

  const BLOCCO = /^<\/?(p|h2|h3|h4|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|figure|figcaption|img|hr|pre)\b/i;

  function inline(s) {
    return esc(s)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, testo, url) =>
        /^(https?:|\/|#)/i.test(url) ? `<a href="${url}">${testo}</a>` : m)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+?)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+?)`/g, "<code>$1</code>");
  }

  function mdArticolo(txt) {
    const righe = String(txt || "").replace(/\r/g, "").split("\n");
    let out = "", lista = null, citazione = false;
    const chiudiLista = () => { if (lista) { out += `</${lista}>`; lista = null; } };
    const chiudiCitazione = () => { if (citazione) { out += "</blockquote>"; citazione = false; } };
    const chiudiTutto = () => { chiudiLista(); chiudiCitazione(); };

    for (const r of righe) {
      const t = r.trim();
      if (!t) { chiudiTutto(); continue; }

      if (BLOCCO.test(t)) { chiudiTutto(); out += t; continue; }

      if (t === "---" || t === "***") { chiudiTutto(); out += "<hr>"; continue; }
      if (t.startsWith("#### ")) { chiudiTutto(); out += `<h4>${inline(t.slice(5))}</h4>`; continue; }
      if (t.startsWith("### ")) { chiudiTutto(); out += `<h3>${inline(t.slice(4))}</h3>`; continue; }
      if (t.startsWith("## ")) { chiudiTutto(); out += `<h2>${inline(t.slice(3))}</h2>`; continue; }
      /* "# " non produce un h1: l'h1 della pagina è il titolo
         dell'articolo, e un secondo h1 nel corpo confonde i
         motori e chi legge con uno screen reader. */
      if (t.startsWith("# ")) { chiudiTutto(); out += `<h2>${inline(t.slice(2))}</h2>`; continue; }

      if (t.startsWith("> ")) {
        chiudiLista();
        if (!citazione) { out += "<blockquote>"; citazione = true; }
        out += `<p>${inline(t.slice(2))}</p>`;
        continue;
      }
      chiudiCitazione();

      if (/^[-*]\s+/.test(t)) {
        if (lista !== "ul") { chiudiLista(); out += "<ul>"; lista = "ul"; }
        out += `<li>${inline(t.replace(/^[-*]\s+/, ""))}</li>`;
        continue;
      }
      if (/^\d+[.)]\s+/.test(t)) {
        if (lista !== "ol") { chiudiLista(); out += "<ol>"; lista = "ol"; }
        out += `<li>${inline(t.replace(/^\d+[.)]\s+/, ""))}</li>`;
        continue;
      }
      chiudiLista();
      out += `<p>${inline(t)}</p>`;
    }
    chiudiTutto();
    return out;
  }

  const parole = t => {
    const s = String(t || "").replace(/<[^>]+>/g, " ").replace(/[#*>`[\]()]/g, " ").replace(/\s+/g, " ").trim();
    return s ? s.split(" ").length : 0;
  };

  /* Dall'HTML salvato si torna a qualcosa di modificabile. Non è
     una conversione perfetta e non deve esserlo: serve a
     riaprire un articolo senza trovarsi davanti un muro di tag. */
  function htmlAMd(html) {
    let t = String(html || "");
    t = t.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
    t = t.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
    t = t.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n");
    t = t.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
    t = t.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");
    t = t.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
      (m, c) => "\n" + c.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "> $1\n") + "\n");
    t = t.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n");
    t = t.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
    t = t.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*");
    t = t.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
    t = t.replace(/<hr\s*\/?>/gi, "\n---\n");
    t = t.replace(/<br\s*\/?>/gi, "\n");
    /* Quello che resta è HTML che il Markdown non sa
       rappresentare — tabelle, immagini, figure. Si lascia
       intatto: il convertitore lo rimanderà indietro com'è. */
    return t.replace(/\n{3,}/g, "\n\n").trim();
  }

  /* ---------------- Elenco ---------------- */

  const DATA = s => s ? new Date(s).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const PILLOLA = {
    bozza:      ["mag-bozza", "Bozza"],
    pubblicato: ["mag-online", "Pubblicato"],
    ritirato:   ["mag-ritirato", "Ritirato"]
  };

  function elencoView() {
    const arts = D().articoli;
    const cat = new Map(D().categorie.map(c => [c.id, c.nome]));
    const pillar = arts.filter(a => a.tipo === "pillar");

    const riga = a => {
      const [cls, testo] = PILLOLA[a.stato] || PILLOLA.bozza;
      const padre = a.pillar_id ? arts.find(x => x.id === a.pillar_id) : null;
      return `
      <tr>
        <td>
          <a class="mag-titolo" href="#/admin/crm/magazine/${esc(a.id)}">${esc(a.titolo)}</a>
          <span class="mag-sotto">
            ${a.tipo === "pillar" ? "◆ pillar" : padre ? `└ cluster di «${esc(padre.titolo.slice(0, 40))}»` : "cluster senza pillar"}
            · ${esc(cat.get(a.categoria_id) || "—")}
            ${a.keyword ? ` · <em>${esc(a.keyword)}</em>` : ""}
          </span>
        </td>
        <td class="mag-num">${a.parole ? a.parole.toLocaleString("it-IT") : "—"}</td>
        <td><span class="mag-stato ${cls}">${testo}</span></td>
        <td class="mag-num">${DATA(a.pubblicato_il || a.creato_il)}</td>
        <td class="mag-azioni">
          ${a.stato === "pubblicato" && a.slug
            ? `<a class="btn btn-ghost btn-sm" href="#/magazine/${esc(a.slug)}" title="Vedi la pagina pubblica">↗</a>`
            : ""}
          <a class="btn btn-outline btn-sm" href="#/admin/crm/magazine/${esc(a.id)}">Apri</a>
        </td>
      </tr>`;
    };

    const conteggi = {
      pubblicati: arts.filter(a => a.stato === "pubblicato").length,
      bozze: arts.filter(a => a.stato === "bozza").length,
      parole: arts.reduce((s, a) => s + (a.parole || 0), 0)
    };

    return `
    <div class="mag-riepilogo">
      <div class="card mag-riq"><span class="mag-riq-n">${conteggi.pubblicati}</span><span>pubblicati</span></div>
      <div class="card mag-riq"><span class="mag-riq-n">${conteggi.bozze}</span><span>in bozza</span></div>
      <div class="card mag-riq"><span class="mag-riq-n">${pillar.length}</span><span>pillar</span></div>
      <div class="card mag-riq"><span class="mag-riq-n">${conteggi.parole.toLocaleString("it-IT")}</span><span>parole scritte</span></div>
    </div>

    ${arts.length === 0 ? `
      <div class="card">
        <h3 style="margin-top:0">Nessun articolo, ancora</h3>
        <p class="muted">Il primo articolo di un argomento conviene che sia il <strong>pillar</strong>: quello lungo,
        che copre il tema per intero. I cluster vengono dopo e gli si agganciano — così i link fra loro
        li costruisce il sito, e non vanno riscritti a mano ogni volta.</p>
        <a class="btn btn-primary" href="#/admin/crm/magazine/nuovo">Scrivi il primo articolo</a>
      </div>`
    : `
      <div class="card" style="padding:0;overflow:hidden">
        <div class="mag-tabella-cornice">
          <table class="mag-tabella">
            <thead>
              <tr><th>Articolo</th><th class="mag-num">Parole</th><th>Stato</th><th class="mag-num">Data</th><th></th></tr>
            </thead>
            <tbody>${arts.map(riga).join("")}</tbody>
          </table>
        </div>
      </div>`}`;
  }

  /* ---------------- Editor ---------------- */

  function editorView(nuovo) {
    const a = nuovo ? {} : (aperto || {});
    const cats = D().categorie;
    const pillars = D().articoli.filter(x => x.tipo === "pillar" && x.id !== a.id);
    const corpoMd = a.corpo ? htmlAMd(a.corpo) : "";
    const pubblicato = a.stato === "pubblicato";

    return `
    <form id="mag-form" class="mag-editor">
      <div class="mag-colonna">
        <div class="field">
          <label for="mag-titolo">Titolo <span class="muted" id="mag-len-t">(0/60 ottimale)</span></label>
          <input id="mag-titolo" required maxlength="200" value="${esc(a.titolo || "")}"
                 placeholder="La domanda a cui l'articolo risponde, con la keyword all'inizio">
        </div>

        <div class="field">
          <label for="mag-apertura">Apertura</label>
          <textarea id="mag-apertura" required rows="3"
            placeholder="Due righe che dicono cosa troverà chi legge. Niente «in questo articolo vedremo».">${esc(a.apertura || "")}</textarea>
        </div>

        <div class="field">
          <div class="mag-corpo-testa">
            <label for="mag-corpo">Corpo <span class="muted" id="mag-parole">(0 parole)</span></label>
            <button type="button" class="btn btn-ghost btn-sm" id="mag-anteprima">
              ${anteprima ? "Torna a scrivere" : "Anteprima"}
            </button>
          </div>
          ${anteprima ? "" : `
            <div class="mag-barra" role="toolbar" aria-label="Formattazione del corpo">
              ${[
                ["h2", "H2", "Titolo di sezione"],
                ["h3", "H3", "Sottotitolo"],
                ["h4", "H4", "Livello più profondo"],
                ["b", "B", "Grassetto"],
                ["i", "I", "Corsivo"],
                ["link", "🔗", "Collegamento"],
                ["ul", "• Elenco", "Elenco puntato"],
                ["ol", "1. Elenco", "Elenco numerato"],
                ["quote", "❝", "Citazione"],
                ["tab", "▦", "Tabella"]
              ].map(([k, l, t]) =>
                `<button type="button" class="mag-barra-b" data-mag-fmt="${k}" title="${esc(t)}">${esc(l)}</button>`).join("")}
            </div>`}
          ${anteprima
            ? `<div class="mag-preview prosa" id="mag-preview"></div>`
            : `<textarea id="mag-corpo" required rows="26" spellcheck="true"
                 placeholder="## Un titolo di sezione
Testo normale. **Grassetto**, *corsivo*, [link](https://…).

### Un sottotitolo
- un elenco
- un altro punto

#### Il livello più profondo che usiamo
> Una citazione o una nota a margine.">${esc(corpoMd)}</textarea>`}
          <p class="privacy-hint">Markdown: <code>##</code> <code>###</code> <code>####</code> per i titoli —
          mai <code>#</code>, l'H1 è il titolo qui sopra. L'HTML incollato passa com'è.
          Quello che salvi viene ripulito dal server: sopravvive solo ciò che è permesso.</p>
        </div>
      </div>

      <aside class="mag-fianco">
        <div class="card">
          <div class="field">
            <label for="mag-tipo">Tipo</label>
            <select id="mag-tipo">
              <option value="cluster" ${a.tipo !== "pillar" ? "selected" : ""}>Cluster — approfondisce un lato</option>
              <option value="pillar" ${a.tipo === "pillar" ? "selected" : ""}>Pillar — copre tutto l'argomento</option>
            </select>
          </div>

          <div class="field" id="mag-campo-pillar" style="margin-top:.6rem;${a.tipo === "pillar" ? "display:none" : ""}">
            <label for="mag-pillar">Pillar di riferimento</label>
            <select id="mag-pillar">
              <option value="">— nessuno —</option>
              ${pillars.map(p => `<option value="${esc(p.id)}" ${a.pillar_id === p.id ? "selected" : ""}>${esc(p.titolo)}</option>`).join("")}
            </select>
            <p class="privacy-hint">Da qui il sito costruisce i link fra pillar e cluster da solo.</p>
          </div>

          <div class="field" style="margin-top:.6rem">
            <label for="mag-categoria">Categoria</label>
            <select id="mag-categoria" required>
              ${cats.map(c => `<option value="${esc(c.id)}" ${a.categoria_id === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}
            </select>
          </div>

          <div class="field" style="margin-top:.6rem">
            <label for="mag-keyword">Keyword target</label>
            <input id="mag-keyword" maxlength="200" value="${esc(a.keyword || "")}" placeholder="es. polizza catastrofale obbligatoria">
          </div>
        </div>

        <div class="card">
          <div class="field">
            <label for="mag-meta">Meta description <span class="muted" id="mag-len-m">(0/155)</span></label>
            <textarea id="mag-meta" rows="3" maxlength="300"
              placeholder="La risposta in una frase, più il motivo per aprire.">${esc(a.meta_description || "")}</textarea>
          </div>

          <div class="field" style="margin-top:.6rem">
            <label for="mag-cover">Copertina (URL)</label>
            <input id="mag-cover" maxlength="2000" value="${esc(a.cover_url || "")}"
                   placeholder="https://res.cloudinary.com/…">
            <div id="mag-cover-anteprima" class="mag-cover-anteprima" hidden></div>
          </div>

          <div class="field" style="margin-top:.6rem">
            <label for="mag-alt">Descrizione della copertina</label>
            <input id="mag-alt" maxlength="200" value="${esc(a.cover_alt || "")}"
                   placeholder="Cosa si vede nell'immagine">
            <p class="privacy-hint">Obbligatoria se c'è una copertina: è quello che sente chi non vede
            l'immagine, ed è anche l'unica cosa che un motore legge di un file JPEG.</p>
          </div>

          <div class="field" style="margin-top:.6rem">
            <label for="mag-firma">Firma</label>
            <input id="mag-firma" maxlength="60" value="${esc(a.firma || "Redazione QuotaFacile")}">
          </div>

          ${a.slug ? `
          <table class="admin-kv" style="margin-top:.8rem">
            <tr><th>Indirizzo</th><td><code>/magazine/${esc(a.slug)}/</code></td></tr>
          </table>
          <p class="privacy-hint">Assegnato alla prima pubblicazione e non più modificabile: cambiarlo
          romperebbe i link già condivisi e quello che i motori hanno indicizzato.</p>`
          : `
          <div class="field" style="margin-top:.6rem">
            <label for="mag-slug">Indirizzo della pagina</label>
            <div class="mag-slug-riga">
              <span class="mag-slug-fisso">/magazine/</span>
              <input id="mag-slug" maxlength="70" value="${esc(a.slug || "")}"
                     placeholder="si-compila-dal-titolo" spellcheck="false">
              <span class="mag-slug-fisso">/</span>
            </div>
            <p class="privacy-hint">Si propone dal titolo mentre scrivi. Puoi accorciarlo — un indirizzo
            che finisce su una preposizione si legge male — ma solo adesso: alla pubblicazione si fissa
            e non si tocca più.</p>
          </div>`}
        </div>

        <div class="card">
          <h4 class="mag-serp-titolo">Come appare su Google</h4>
          <div class="mag-serp" id="mag-serp">
            <span class="mag-serp-sito">www.quotafacile.net &rsaquo; magazine &rsaquo; <span id="mag-serp-slug"></span></span>
            <span class="mag-serp-t" id="mag-serp-t"></span>
            <span class="mag-serp-d" id="mag-serp-d"></span>
          </div>
          <p class="privacy-hint">Anteprima indicativa: Google riscrive titolo e descrizione quando
          ritiene che un'altra parte della pagina risponda meglio alla domanda. Serve a vedere dove
          taglia, non a garantire cosa mostrerà.</p>
        </div>

        <div class="mag-bottoni">
          <button type="button" class="btn btn-primary" data-mag-salva="pubblicato" ${salvando ? "disabled" : ""}>
            ${pubblicato ? "Aggiorna la pagina pubblica" : "Pubblica"}
          </button>
          <button type="button" class="btn btn-outline" data-mag-salva="bozza" ${salvando ? "disabled" : ""}>
            ${pubblicato ? "Salva e torna in bozza" : "Salva la bozza"}
          </button>
          ${pubblicato ? `
            <button type="button" class="btn btn-ghost btn-sm" data-mag-stato="ritirato">Ritira dal sito</button>` : ""}
          ${a.id && !a.slug ? `
            <button type="button" class="btn btn-ghost btn-sm" data-mag-elimina="${esc(a.id)}">Elimina</button>` : ""}
        </div>

        ${pubblicato ? `
        <p class="privacy-hint">La pagina pubblica compare online alla prossima pubblicazione del sito:
        è il deploy a scrivere il file, la sitemap e i dati strutturati.</p>` : ""}
      </aside>
    </form>`;
  }

  /* ---------------- La pagina ---------------- */

  function view(parti) {
    const p = Array.isArray(parti) ? parti.filter(Boolean) : [];
    const sub = p[0] || null;
    if (sub !== ultimoAperto) { anteprima = false; ultimoAperto = sub; }
    const nuovo = sub === "nuovo";
    const inEditor = nuovo || (sub && sub !== "nuovo");

    const testa = titolo => `
      <div class="admin-top">
        <div>
          <a class="crm-indietro" href="${inEditor ? "#/admin/crm/magazine" : "#/admin/crm"}">
            ← ${inEditor ? "Magazine" : "CRM"}</a>
          <span class="eyebrow">Magazine</span>
          <h2 style="margin:.1rem 0 0">${esc(titolo)}</h2>
        </div>
        <div style="display:flex;gap:.5rem">
          ${inEditor ? "" : `<a class="btn btn-primary btn-sm" href="#/admin/crm/magazine/nuovo">+ Nuovo articolo</a>`}
          <button class="btn btn-ghost btn-sm" id="mag-ricarica">↻ Aggiorna</button>
        </div>
      </div>`;

    if (fase !== "pronto") {
      return `
        ${testa("Articoli")}
        ${fase === "errore" ? `
          <div class="legal-warning" role="alert">
            <strong>Magazine non disponibile.</strong> ${esc(avviso || "")}
            <br><button class="btn btn-outline btn-sm" style="margin-top:.6rem" id="mag-riprova">Riprova</button>
          </div>`
        : `<div class="card"><p class="muted">Caricamento degli articoli…</p></div>`}`;
    }

    if (nuovo) return testa("Nuovo articolo") + editorView(true);

    if (sub) {
      /* L'articolo aperto si legge dal server e non dall'elenco:
         l'elenco non porta il corpo, che è la cosa per cui si è
         aperta questa pagina. */
      if (!aperto || aperto.id !== sub) {
        chiama("leggi", { id: sub }).then(e => {
          if (e.ok) { aperto = e.articolo; QF().render(); }
          else { avviso = e.errore; fase = "errore"; QF().render(); }
        });
        return testa("Articolo") + `<div class="card"><p class="muted">Apertura dell'articolo…</p></div>`;
      }
      return testa(aperto.titolo || "Articolo") + editorView(false);
    }

    return testa("Articoli") + elencoView();
  }

  /* ---------------- Eventi ---------------- */

  function leggiForm() {
    const $ = s => document.querySelector(s);
    const corpo = $("#mag-corpo");
    return {
      id: aperto && aperto.id ? aperto.id : null,
      titolo: $("#mag-titolo")?.value.trim() || "",
      apertura: $("#mag-apertura")?.value.trim() || "",
      /* In anteprima la textarea non è nel documento: si tiene
         quello che c'era, altrimenti premere "Pubblica" mentre si
         guarda l'anteprima svuoterebbe l'articolo. */
      corpo: corpo ? mdArticolo(corpo.value) : (aperto?.corpo || ""),
      meta_description: $("#mag-meta")?.value.trim() || null,
      keyword: $("#mag-keyword")?.value.trim() || null,
      firma: $("#mag-firma")?.value.trim() || "Redazione QuotaFacile",
      cover_url: $("#mag-cover")?.value.trim() || null,
      cover_alt: $("#mag-alt")?.value.trim() || null,
      categoria_id: $("#mag-categoria")?.value || null,
      tipo: $("#mag-tipo")?.value || "cluster",
      pillar_id: $("#mag-pillar")?.value || null,
      /* Solo finché l'articolo non ha un indirizzo: dopo il campo
         non c'è, e il server scarterebbe comunque quello che
         arrivasse. */
      slug: $("#mag-slug")?.value.trim() || null
    };
  }

  /* La stessa regola del server, ripetuta qui per far vedere
     subito cosa diventerà l'indirizzo. Il server non si fida di
     questa: la riapplica. */
  const slugDa = s => [...String(s || "").toLowerCase().normalize("NFD")]
    .filter(ch => { const c = ch.codePointAt(0); return c < 0x300 || c > 0x36f; })
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");

  async function salva(stato) {
    if (salvando) return;
    const d = leggiForm();
    if (!d.titolo || d.titolo.length < 5) { QF().toast("Manca il titolo."); return; }
    if (!d.apertura) { QF().toast("Manca l'apertura."); return; }
    if (!d.corpo) { QF().toast("Il corpo dell'articolo è vuoto."); return; }
    d.stato = stato;

    salvando = true; QF().render();
    const esito = await chiama("salva", d);
    salvando = false;

    if (!esito.ok) { QF().toast(esito.errore); QF().render(); return; }
    QF().toast(stato === "pubblicato" ? "Pubblicato." : "Bozza salvata.");
    aperto = null;
    dati = null; fase = "vuoto";
    location.hash = "#/admin/crm/magazine/" + esito.articolo.id;
  }

  function bind() {
    const $ = s => document.querySelector(s);

    if (fase === "vuoto") { carica(); return; }
    $("#mag-ricarica")?.addEventListener("click", () => { aperto = null; carica(); });
    $("#mag-riprova")?.addEventListener("click", carica);

    /* ---- editor ---- */
    const titolo = $("#mag-titolo");
    const meta = $("#mag-meta");
    const corpo = $("#mag-corpo");
    const cover = $("#mag-cover");

    const contatore = (campo, spia, buono) => {
      if (!campo || !spia) return;
      const aggiorna = () => {
        const n = campo.value.length;
        spia.textContent = `(${n}/${buono}${n > buono ? " — lungo" : ""})`;
        spia.classList.toggle("mag-lungo", n > buono);
      };
      campo.addEventListener("input", aggiorna);
      aggiorna();
    };
    contatore(titolo, $("#mag-len-t"), 60);
    contatore(meta, $("#mag-len-m"), 155);

    /* ---- l'indirizzo e l'anteprima Google ---- */
    const slug = $("#mag-slug");
    const apertura = $("#mag-apertura");

    /* Lo slug si propone dal titolo finché nessuno lo ha toccato.
       Da quel momento in poi resta quello scritto a mano: un campo
       che si riscrive da solo mentre lo si sta compilando è il
       modo più rapido di far perdere fiducia a chi lo usa. */
    let slugAMano = !!(slug && slug.value);
    slug?.addEventListener("input", () => {
      slugAMano = true;
      aggiornaSerp();
    });

    const serpT = $("#mag-serp-t");
    const serpD = $("#mag-serp-d");
    const serpS = $("#mag-serp-slug");

    /* Google taglia intorno ai 60 caratteri nel titolo e ai 155
       nella descrizione, sull'ultima parola intera. Qui si mostra
       lo stesso taglio: vedere dove cade è l'unico modo di
       scrivere un titolo che non finisce a metà. */
    const taglia = (s, max) => {
      const t = String(s || "").trim();
      if (t.length <= max) return t;
      const i = t.lastIndexOf(" ", max);
      return t.slice(0, i > max * 0.6 ? i : max).trim() + " …";
    };

    function aggiornaSerp() {
      if (!serpT) return;
      if (slug && !slugAMano) slug.value = slugDa(titolo?.value || "");
      const s = slug ? slug.value : (aperto?.slug || "");
      if (serpS) serpS.textContent = s || "…";
      serpT.textContent = taglia(titolo?.value, 60) || "Titolo dell'articolo";
      const d = (meta?.value || "").trim() || (apertura?.value || "").trim();
      serpD.textContent = taglia(d, 155) || "Senza meta description Google prende una frase dal testo, e non sempre quella giusta.";
      serpD.classList.toggle("mag-serp-vuota", !(meta?.value || "").trim());
    }

    [titolo, meta, apertura].forEach(c => c?.addEventListener("input", aggiornaSerp));
    aggiornaSerp();

    /* ---- la barra del corpo ---- */
    /* Inserisce Markdown attorno alla selezione. Non è un editor
       visuale e non vuole esserlo: il corpo resta testo che si
       può leggere, incollare altrove e mettere sotto controllo di
       versione. I pulsanti servono a non doversi ricordare la
       sintassi, non a nasconderla. */
    const AVVOLGI = {
      b: ["**", "**", "testo in grassetto"],
      i: ["*", "*", "testo in corsivo"],
      link: ["[", "](https://)", "testo del link"]
    };
    const PREFISSI = {
      h2: ["## ", "Titolo di sezione"],
      h3: ["### ", "Sottotitolo"],
      h4: ["#### ", "Livello più profondo"],
      ul: ["- ", "voce dell'elenco"],
      ol: ["1. ", "prima voce"],
      quote: ["> ", "la citazione"]
    };
    const TABELLA = "\n| Colonna | Colonna |\n| --- | --- |\n| valore | valore |\n";

    document.querySelectorAll("[data-mag-fmt]").forEach(b =>
      b.addEventListener("click", () => {
        const c = $("#mag-corpo");
        if (!c) return;
        const da = c.selectionStart, a = c.selectionEnd;
        const sel = c.value.slice(da, a);
        const k = b.dataset.magFmt;
        let testo, fuocoDa, fuocoA;

        if (k === "tab") {
          testo = TABELLA;
          fuocoDa = da + testo.length; fuocoA = fuocoDa;
        } else if (AVVOLGI[k]) {
          const [pre, post, segnaposto] = AVVOLGI[k];
          const dentro = sel || segnaposto;
          testo = pre + dentro + post;
          fuocoDa = da + pre.length; fuocoA = fuocoDa + dentro.length;
        } else {
          const [pre, segnaposto] = PREFISSI[k];
          /* Su più righe il prefisso va su ognuna: selezionare tre
             righe e premere "elenco" deve fare un elenco di tre
             voci, non una voce sola con dentro tre righe. */
          const righe = (sel || segnaposto).split("\n");
          testo = righe.map(r => pre + r).join("\n");
          const aCapo = da > 0 && c.value[da - 1] !== "\n" ? "\n" : "";
          testo = aCapo + testo;
          fuocoDa = da + aCapo.length + pre.length;
          fuocoA = da + testo.length;
        }

        c.setRangeText(testo, da, a, "end");
        c.focus();
        c.setSelectionRange(fuocoDa, fuocoA);
        c.dispatchEvent(new Event("input", { bubbles: true }));
      }));

    if (corpo) {
      const spia = $("#mag-parole");
      const conta = () => { if (spia) spia.textContent = `(${parole(corpo.value).toLocaleString("it-IT")} parole)`; };
      corpo.addEventListener("input", conta);
      conta();
      /* Il tabulatore dentro un'area di testo deve spostare il
         fuoco, non inserire un tabulatore: è l'unico modo di
         uscire da un campo alto ventisei righe usando la
         tastiera. Resta com'è di serie, di proposito. */
    }

    const preview = $("#mag-preview");
    if (preview && aperto) preview.innerHTML = aperto.corpo || "";

    $("#mag-anteprima")?.addEventListener("click", () => {
      /* Passando all'anteprima il testo va conservato: la
         textarea sta per sparire dal documento. */
      if (!anteprima && corpo && aperto) aperto = { ...aperto, corpo: mdArticolo(corpo.value) };
      else if (!anteprima && corpo) aperto = { ...leggiForm(), corpo: mdArticolo(corpo.value) };
      anteprima = !anteprima;
      QF().render();
    });

    const tipo = $("#mag-tipo");
    tipo?.addEventListener("change", () => {
      const campo = $("#mag-campo-pillar");
      if (campo) campo.style.display = tipo.value === "pillar" ? "none" : "";
    });

    if (cover) {
      const box = $("#mag-cover-anteprima");
      const mostra = () => {
        const u = cover.value.trim();
        if (!box) return;
        if (!/^https:\/\//i.test(u)) { box.hidden = true; box.innerHTML = ""; return; }
        box.hidden = false;
        box.innerHTML = `<img src="${esc(u)}" alt="Anteprima della copertina">
          <span class="mag-cover-nota">Verifico…</span>`;
        const img = box.querySelector("img");
        const nota = box.querySelector(".mag-cover-nota");
        img.onload = () => { nota.textContent = `${img.naturalWidth}×${img.naturalHeight}`; nota.className = "mag-cover-nota ok"; };
        img.onerror = () => {
          nota.textContent = "Non si carica — controlla il link";
          nota.className = "mag-cover-nota ko";
          img.remove();
        };
      };
      cover.addEventListener("change", mostra);
      mostra();
    }

    document.querySelectorAll("[data-mag-salva]").forEach(b =>
      b.addEventListener("click", () => salva(b.dataset.magSalva)));

    document.querySelectorAll("[data-mag-stato]").forEach(b =>
      b.addEventListener("click", async () => {
        if (!aperto) return;
        const esito = await chiama("stato", { id: aperto.id, stato: b.dataset.magStato });
        if (!esito.ok) { QF().toast(esito.errore); return; }
        QF().toast("Articolo ritirato dal sito.");
        aperto = null; dati = null; fase = "vuoto";
        location.hash = "#/admin/crm/magazine";
      }));

    document.querySelectorAll("[data-mag-elimina]").forEach(b =>
      b.addEventListener("click", async () => {
        if (!confirm("Eliminare questa bozza? Non si recupera.")) return;
        const esito = await chiama("elimina", { id: b.dataset.magElimina });
        if (!esito.ok) { QF().toast(esito.errore); return; }
        QF().toast("Bozza eliminata.");
        aperto = null; dati = null; fase = "vuoto";
        location.hash = "#/admin/crm/magazine";
      }));
  }

  window.QF_MAGAZINE = { view, bind, dimentica, mdArticolo, htmlAMd };
})();
