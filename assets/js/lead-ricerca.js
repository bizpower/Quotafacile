/* ============================================================
   QuotaFacile — Il modulo di ricerca dei lead, uno per due
   ------------------------------------------------------------
   PERCHÉ ESISTE QUESTO FILE

   La ricerca su Google Places si usa da due schermate: «Lead
   locali» nel CRM e «Lead Finder» nel mail marketing. Erano due
   moduli scritti separatamente, e sono divergiti esattamente come
   diverge sempre il codice copiato:

     - nel CRM provincia e comune sono tendine costruite
       sull'anagrafe dei comuni, nel mail marketing erano due
       caselle di testo libero — quindi «Monza» con provincia
       «MI» partiva centrata nel posto sbagliato senza dirlo;
     - nel CRM il comune è facoltativo e senza comune la ricerca
       parte dal centro della provincia; nel mail marketing la
       ricerca per provincia veniva rifiutata con un avviso e non
       chiamava nemmeno il server;
     - il filtro «solo con email pubblica» esisteva solo nel CRM,
       ed è il filtro scritto proprio per il mail marketing.

   La correzione del secondo punto era stata fatta una volta, nel
   CRM, e l'altra copia è rimasta indietro per settimane. Questo
   file è il rimedio alla causa, non al sintomo: il lato
   dell'ingresso — dove si cerca, cosa si cerca, con quali filtri
   — vive qui e basta. Il lato dell'uscita no: cosa si fa dei
   risultati è diverso di proposito, perché nel CRM si salva in
   archivio e nel mail marketing si salva in una lista.

   COME LO USANO LE DUE SCHERMATE

     const R = QF_RICERCA.stato({ soloConEmail: true });   // una volta
     ...
     QF_RICERCA.moduloHtml(R)                              // nel render
     QF_RICERCA.lega(R, async (dati) => { ... });          // nel bind

   Il modulo disegna il form, legge i campi, valida e compone la
   richiesta; la funzione passata a lega() riceve i dati già
   pronti e decide cosa farne. L'attesa e il bottone disabilitato
   li gestisce il modulo, così le due schermate si comportano allo
   stesso modo anche mentre aspettano.

   Si registra su window alla fine di sé stesso e non cerca
   nessuno al caricamento: è la stessa regola degli altri file
   dell'area riservata, che arrivano in parallelo.
   ============================================================ */
"use strict";

(function () {
  const QF = () => window.QF;
  const esc = s => window.QF.esc(s);

  /* Le venti categorie. Le chiavi sono quelle che il server
     conosce: cambiarle qui senza cambiarle in qf-lead vuol dire
     una ricerca che torna vuota senza spiegazione. */
  const CATEGORIE = {
    ristorazione: "Ristoranti e pizzerie", bar: "Bar e caffetterie",
    hotel: "Hotel e B&B", cantine: "Cantine e aziende vinicole",
    enoteche: "Enoteche", agriturismi: "Agriturismi",
    officine: "Officine e autoriparazioni", concessionarie: "Concessionarie auto",
    edilizia: "Imprese edili", impiantisti: "Impiantisti",
    studi: "Commercialisti e consulenti", avvocati: "Studi legali",
    medici: "Studi medici e dentisti", palestre: "Palestre e centri fitness",
    parrucchieri: "Parrucchieri ed estetica", negozi: "Negozi al dettaglio",
    supermercati: "Supermercati e alimentari", trasporti: "Trasporti e logistica",
    agenzie_immobiliari: "Agenzie immobiliari", assicurazioni: "Agenzie assicurative"
  };

  const RAGGI = [
    [500, "500 m"], [1000, "1 km"], [2000, "2 km"], [5000, "5 km"], [10000, "10 km"]
  ];

  /* L'anagrafe dei comuni: 190 KB che non servono a chi legge una
     guida sulle polizze. Si carica quando serve davvero, cioè la
     prima volta che si apre la ricerca precisa, e una volta sola.
     Se non arriva, i campi tornano a essere di testo libero
     invece di lasciare tre tendine vuote. */
  const geo = { dati: null, inCorso: false, fallita: false };

  function caricaGeo() {
    if (geo.dati || geo.inCorso || geo.fallita) return;
    geo.inCorso = true;
    fetch((QF().base || "/") + "assets/data/comuni.json")
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(d => { geo.dati = d; })
      .catch(() => { geo.fallita = true; })
      .finally(() => { geo.inCorso = false; QF().render(); });
  }

  /* La provincia è la chiave di tutto: la sigla è quella che il
     server riceve, ed è anche quella con cui si trovano i comuni.
     La regione serve solo ad accorciare la tendina delle
     province, quindi se manca non blocca niente. */
  const provinceDi = regione => {
    if (!geo.dati) return [];
    if (regione && geo.dati.regioni[regione]) return geo.dati.regioni[regione];
    return Object.keys(geo.dati.province)
      .sort((a, b) => geo.dati.province[a].nome.localeCompare(geo.dati.province[b].nome, "it"));
  };
  const comuniDi = sigla => (geo.dati && geo.dati.comuni[sigla]) || [];

  /* Lo stato lo tiene ogni schermata, con la stessa forma:
     { modalita, campi: { zona, via, citta, provincia, cap, regione },
       categorie, raggio, soloQualita, soloConEmail, inCorso }

     Non lo costruisce questo modulo di proposito. I due valori
     iniziali che cambiano — soloConEmail acceso nel mail
     marketing e spento nel CRM — sono una scelta per schermata,
     non un dettaglio da nascondere dietro un parametro: nel mail
     marketing le liste servono a mandare email, nel CRM si
     esplora una zona per capire chi c'è. Il resto, cioè il
     comportamento, vive qui. */

  /* ---------------- Il disegno ---------------- */

  /* I tre menu a tendina della ricerca precisa.

     Prima erano campi di testo, e il testo libero qui è una
     trappola silenziosa: «Reggio Emilia» invece di «Reggio
     nell'Emilia», o una sigla di provincia che non esiste,
     centrano la ricerca da un'altra parte senza dire niente. Si
     scopre dai risultati sbagliati, quando si è già consumata una
     chiamata a Google.

     Regione → Provincia → Comune: ogni tendina restringe la
     successiva, così la terza ha al massimo trecento voci invece
     di ottomila. La regione è facoltativa e serve solo ad
     accorciare l'elenco delle province. */
  function zoneHtml(R) {
    if (geo.fallita) {
      return `
        <div class="legal-warning" style="margin-bottom:.7rem">
          L'elenco dei comuni non si è caricato: i campi qui sotto restano liberi.
          Scrivi il nome del comune come lo scrive l'anagrafe.
        </div>
        <div class="grid-2" style="gap:.6rem">
          <div class="field"><label for="ld-citta">Città *</label>
            <input id="ld-citta" required value="${esc(R.campi.citta)}" placeholder="Milano"></div>
          <div class="field"><label for="ld-prov">Provincia</label>
            <input id="ld-prov" maxlength="2" value="${esc(R.campi.provincia)}" placeholder="MI"
                   style="text-transform:uppercase"></div>
        </div>
        <div class="grid-2" style="gap:.6rem;margin-top:.6rem">
          <div class="field"><label for="ld-via">Via e civico</label>
            <input id="ld-via" value="${esc(R.campi.via)}" placeholder="Corso Lodi 10"></div>
          <div class="field"><label for="ld-cap">CAP</label>
            <input id="ld-cap" value="${esc(R.campi.cap)}" placeholder="20139"></div>
        </div>`;
    }

    if (!geo.dati) {
      return `<p class="muted" style="margin:.4rem 0 .8rem">Carico l'elenco dei comuni…</p>`;
    }

    const prov = provinceDi(R.campi.regione);
    /* Niente scelta di ripiego.
       Prima, se la provincia non era fra quelle della regione, si
       prendeva la prima in ordine alfabetico — e lo stesso per il
       comune. Scegliendo «Lombardia» ti ritrovavi in provincia di
       Bergamo, scegliendo «Monza e della Brianza» ti ritrovavi ad
       Agrate Brianza: mai detto da nessuno, mai scritto da
       nessuna parte, e la ricerca partiva centrata lì.
       Una tendina che sceglie al posto tuo e non te lo dice è
       peggio di una vuota: la seconda si nota. */
    const sigla = prov.includes(R.campi.provincia) ? R.campi.provincia : "";
    const elenco = comuniDi(sigla);
    const citta = elenco.some(c => c[0] === R.campi.citta) ? R.campi.citta : "";
    /* Il CAP mostrato: quello scritto a mano se c'è, altrimenti
       quello del comune selezionato quando ne ha uno solo. Si
       calcola qui e non si scrive nello stato, perché questa
       funzione disegna e basta. */
    const capMostrato = R.campi.cap || (elenco.find(c => c[0] === citta) || [])[1] || "";

    return `
      <div class="grid-3" style="gap:.6rem">
        <div class="field"><label for="ld-regione">Regione</label>
          <select id="ld-regione">
            <option value="">Tutte le regioni</option>
            ${Object.keys(geo.dati.regioni).map(r =>
              `<option value="${esc(r)}" ${R.campi.regione === r ? "selected" : ""}>${esc(r)}</option>`).join("")}
          </select></div>
        <div class="field"><label for="ld-prov">Provincia *</label>
          <select id="ld-prov" required>
            <option value="">— scegli la provincia —</option>
            ${prov.map(s =>
              `<option value="${esc(s)}" ${sigla === s ? "selected" : ""}>${esc(geo.dati.province[s].nome)} (${esc(s)})</option>`).join("")}
          </select></div>
        <div class="field"><label for="ld-citta">Comune</label>
          <select id="ld-citta" ${sigla ? "" : "disabled"}>
            <option value="">— nessuno —</option>
            ${elenco.map(([n]) =>
              `<option value="${esc(n)}" ${citta === n ? "selected" : ""}>${esc(n)}</option>`).join("")}
          </select>
          <p class="privacy-hint">${
            !sigla ? "Scegli prima la provincia."
            : citta ? `${elenco.length} comuni in questa provincia. Scrivi le prime lettere per arrivarci.`
            : `Senza comune la ricerca parte dal centro della provincia, con lo stesso raggio: per coprirla tutta servono più ricerche. ${elenco.length} comuni fra cui scegliere.`
          }</p>
        </div>
      </div>
      <div class="grid-2" style="gap:.6rem;margin-top:.6rem">
        <div class="field"><label for="ld-via">Via e civico <span class="muted">(facoltativo)</span></label>
          <input id="ld-via" value="${esc(R.campi.via)}" placeholder="Corso Lodi 10"></div>
        <div class="field"><label for="ld-cap">CAP <span class="muted">(facoltativo)</span></label>
          <input id="ld-cap" inputmode="numeric" maxlength="5" value="${esc(capMostrato)}" placeholder="20139">
          <p class="privacy-hint">Si compila da solo per i comuni che ne hanno uno solo; per le città grandi scegli tu la zona.</p>
        </div>
      </div>`;
  }

  /* Il modulo intero, form compreso. Le due schermate lo mettono
     dentro la propria scheda con la propria intestazione: quello
     che c'è qui dentro è identico, ed è il punto. */
  function moduloHtml(R) {
    const precisa = R.modalita === "precisa";
    return `
      <div class="filterbar" style="margin:.9rem 0 .6rem">
        <button class="chip ${!precisa ? "active" : ""}" data-lead-modalita="rapida">Ricerca rapida</button>
        <button class="chip ${precisa ? "active" : ""}" data-lead-modalita="precisa">Ricerca precisa</button>
      </div>

      <form id="lead-form">
        ${precisa ? zoneHtml(R) : `
          <div class="field"><label for="ld-zona">Zona *</label>
            <input id="ld-zona" required value="${esc(R.campi.zona)}" placeholder="Opera, Milano — oppure un CAP, un quartiere, una via">
            <p class="privacy-hint">Più è precisa la zona, più i risultati sono nel posto giusto: «Milano» centra il cerchio in Duomo.</p>
          </div>`}

        <div class="field" style="margin-top:.8rem">
          <label>Categorie <span class="muted">(fino a 4)</span></label>
          <div class="lead-categorie">
            ${Object.entries(CATEGORIE).map(([k, v]) => `
              <button type="button" class="chip ${R.categorie.includes(k) ? "active" : ""}" data-lead-cat="${k}">${v}</button>`).join("")}
          </div>
        </div>

        <div class="grid-2" style="gap:.6rem;margin-top:.8rem">
          <div class="field"><label for="ld-raggio">Raggio</label>
            <select id="ld-raggio">
              ${RAGGI.map(([v, t]) =>
                `<option value="${v}" ${R.raggio === v ? "selected" : ""}>${t}</option>`).join("")}
            </select></div>
          <div class="field" style="justify-content:flex-end">
            <label class="checkline" style="margin-top:1.6rem">
              <input type="checkbox" id="ld-qualita" ${R.soloQualita ? "checked" : ""}>
              <span>Solo attività con valutazione ≥ 3,5 e almeno 5 recensioni</span>
            </label>
            <label class="checkline" style="margin-top:.5rem">
              <input type="checkbox" id="ld-email" ${R.soloConEmail ? "checked" : ""}>
              <span>Solo con email pubblica <em class="muted" style="font-style:normal">— pronti per il mail marketing</em></span>
            </label>
          </div>
        </div>

        <button class="btn btn-primary" style="margin-top:.9rem" type="submit" ${R.inCorso ? "disabled" : ""}>
          ${R.inCorso ? "Ricerca in corso…" : "Cerca"}
        </button>
      </form>`;
  }

  /* ---------------- La lettura e la validazione ---------------- */

  /* I campi si rileggono prima di ogni ridisegno: il render
     ricostruisce il modulo da capo, e quello che si è già scritto
     non deve sparire perché si è toccata una categoria. */
  function leggi(R) {
    const g = id => document.querySelector(id)?.value;
    if (R.modalita === "precisa") {
      R.campi.via = g("#ld-via") ?? R.campi.via;
      R.campi.cap = g("#ld-cap") ?? R.campi.cap;
      R.campi.citta = g("#ld-citta") ?? R.campi.citta;
      R.campi.provincia = (g("#ld-prov") ?? R.campi.provincia).toUpperCase();
      R.campi.regione = g("#ld-regione") ?? R.campi.regione;
    } else {
      R.campi.zona = g("#ld-zona") ?? R.campi.zona;
    }
    const raggio = g("#ld-raggio");
    if (raggio) R.raggio = Number(raggio);
    const q = document.querySelector("#ld-qualita");
    if (q) R.soloQualita = q.checked;
    const em = document.querySelector("#ld-email");
    if (em) R.soloConEmail = em.checked;
  }

  /* Quello che parte verso il server, oppure il motivo per cui
     non parte. Ritorna { dati } o { errore }: la validazione sta
     qui e non nelle due schermate, perché era proprio lì che le
     due copie si comportavano in modo diverso. */
  function richiesta(R, extra) {
    if (!R.categorie.length) return { errore: "Scegli almeno una categoria." };

    if (R.modalita !== "precisa") {
      if (!String(R.campi.zona || "").trim()) return { errore: "Indica la zona dove cercare." };
      return {
        dati: Object.assign({
          modalita: R.modalita,
          zona: R.campi.zona,
          categorie: R.categorie, raggio: R.raggio,
          soloQualita: R.soloQualita, soloConEmail: R.soloConEmail
        }, extra || {})
      };
    }

    /* SENZA COMUNE SI CERCA DALLA PROVINCIA, NON SI RIFIUTA.
       Il server comporrebbe «(MB), Italia», che non è il centro
       di niente: Google risponderebbe con un punto a caso o con
       un errore. Al suo posto si manda il nome della provincia,
       che è esattamente quello che l'etichetta promette — «la
       ricerca parte dal centro della provincia». */
    const nomeProvincia = geo.dati?.province?.[R.campi.provincia]?.nome || "";
    const citta = R.campi.citta || nomeProvincia;

    if (!citta) {
      /* Nessun comune, e nemmeno il nome della provincia: succede
         solo se l'anagrafe dei comuni non si è caricata e il
         campo è rimasto vuoto. Meglio dirlo che mandare al
         geocoding una sigla fra parentesi. */
      return {
        errore: R.campi.provincia
          ? "Scrivi il comune: senza l'elenco dei comuni la sola sigla della provincia non basta a centrare la ricerca."
          : "Scegli la provincia, oppure scrivi il comune."
      };
    }

    return {
      dati: Object.assign({
        modalita: "precisa",
        via: R.campi.via, cap: R.campi.cap,
        citta, provincia: R.campi.provincia,
        categorie: R.categorie, raggio: R.raggio,
        soloQualita: R.soloQualita, soloConEmail: R.soloConEmail
      }, extra || {})
    };
  }

  /* ---------------- I gestori ---------------- */

  /* onCerca riceve i dati già validati e restituisce una
     promessa. L'attesa la gestisce questo modulo: il bottone si
     disabilita, si ridisegna, e si ridisegna di nuovo alla fine —
     anche se la promessa viene rifiutata, altrimenti il modulo
     resterebbe bloccato su «Ricerca in corso…» per sempre.

     extra sono i campi che una sola delle due schermate manda,
     come il tetto di cinquanta risultati del mail marketing. */
  function lega(R, onCerca, extra) {
    const $ = s => document.querySelector(s);

    document.querySelectorAll("[data-lead-modalita]").forEach(b =>
      b.addEventListener("click", () => {
        leggi(R);
        R.modalita = b.dataset.leadModalita;
        if (R.modalita === "precisa") caricaGeo();
        QF().render();
      }));

    /* La ricerca precisa può essere già aperta quando la sezione
       viene ridisegnata per un altro motivo: l'elenco va chiesto
       anche qui, e caricaGeo() sa già di non ripetersi. */
    if (R.modalita === "precisa") caricaGeo();

    /* Le tre tendine sono a cascata: cambiare regione svuota la
       provincia scelta se non le appartiene più, e cambiare
       provincia svuota il comune.

       Si agganciano solo quando le tendine ci sono davvero: se
       l'elenco dei comuni non si è caricato gli stessi
       identificativi appartengono a campi di testo, e un gestore
       che azzera il comune a ogni uscita dal campo cancellerebbe
       quello che si sta scrivendo. */
    if (geo.dati && R.modalita === "precisa") {
      $("#ld-regione")?.addEventListener("change", e => {
        leggi(R);
        R.campi.regione = e.target.value;
        const prov = provinceDi(R.campi.regione);
        if (!prov.includes(R.campi.provincia)) {
          R.campi.provincia = prov[0] || "";
          R.campi.citta = "";
          R.campi.cap = "";
        }
        QF().render();
      });

      $("#ld-prov")?.addEventListener("change", e => {
        leggi(R);
        R.campi.provincia = e.target.value;
        R.campi.citta = "";
        R.campi.cap = "";
        QF().render();
      });

      /* Scegliendo il comune si compila il CAP, ma solo se quel
         comune ne ha uno solo: Milano ne ha decine e sceglierne
         uno a caso vorrebbe dire centrare la ricerca su un
         quartiere qualunque senza che nessuno se ne accorga. */
      $("#ld-citta")?.addEventListener("change", e => {
        leggi(R);
        R.campi.citta = e.target.value;
        const trovato = comuniDi(R.campi.provincia).find(c => c[0] === R.campi.citta);
        R.campi.cap = trovato && trovato[1] ? trovato[1] : "";
        QF().render();
      });
    }

    document.querySelectorAll("[data-lead-cat]").forEach(b =>
      b.addEventListener("click", () => {
        leggi(R);
        const k = b.dataset.leadCat;
        if (R.categorie.includes(k)) R.categorie = R.categorie.filter(x => x !== k);
        else if (R.categorie.length >= 4) { QF().toast("Massimo 4 categorie per ricerca."); return; }
        else R.categorie.push(k);
        QF().render();
      }));

    $("#lead-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      leggi(R);
      const esito = richiesta(R, typeof extra === "function" ? extra() : extra);
      if (esito.errore) { QF().toast(esito.errore); return; }
      R.inCorso = true;
      QF().render();
      try {
        await onCerca(esito.dati);
      } finally {
        R.inCorso = false;
        QF().render();
      }
    });
  }

  window.QF_RICERCA = {
    CATEGORIE, RAGGI, geo,
    caricaGeo, provinceDi, comuniDi,
    moduloHtml, leggi, richiesta, lega
  };
})();
