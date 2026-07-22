/* ============================================================
   QuotaFacile — Pool "Domanda del giorno" (200 slot)
   ------------------------------------------------------------
   COME FUNZIONA
   - Ogni giorno viene pubblicata automaticamente 1 domanda dal
     pool, in ordine, a partire da DAILY_EPOCH (vedi app.js).
   - Ogni domanda esce già con una risposta automatica della
     "Redazione QuotaFacile"; gli intermediari possono integrare
     con risposte firmate (+10 pt).

   COME INSERIRE LE TUE 200 KEYWORD
   - Sostituisci/aggiungi elementi in CURATED (formato sotto) e/o
     modifica i TOPICS per categoria: il generatore riempie
     automaticamente fino a 200 slot.
   - Formato di uno slot curato:
     { cat: "Auto", keyword: "assicurazione neopatentati",
       domanda: "…?", rispostaAuto: "…" }
   ============================================================ */
"use strict";

(function () {

  /* ---- 1. Domande curate a mano (le prime a uscire) ---- */
  const CURATED = [
    { cat: "Auto", keyword: "assicurazione neopatentati prezzo", domanda: "Quanto costa l'assicurazione per un neopatentato nel 2026?", rispostaAuto: "Per un neopatentato la RC auto parte in genere da 900–1.800€/anno, ma varia molto per provincia, veicolo e classe di merito. Con la Legge Bersani puoi ereditare la classe di un familiare convivente e risparmiare fino al 40%. Alcune compagnie premiano la scatola nera e la guida esclusiva. Confronta sempre almeno 3 preventivi: le differenze tra compagnie sullo stesso profilo superano spesso il 50%." },
    { cat: "Casa", keyword: "assicurazione casa terremoto", domanda: "L'assicurazione casa copre anche il terremoto?", rispostaAuto: "No, di base no: la garanzia terremoto è quasi sempre un'estensione facoltativa della polizza incendio, con premio e franchigie proprie. Dal 2025 esistono anche detrazioni fiscali sul premio per le polizze catastrofali sulla prima casa. Verifica massimale (idealmente il valore di ricostruzione a nuovo), scoperto e limiti per zona sismica." },
    { cat: "Vita", keyword: "polizza vita mutuo obbligatoria", domanda: "La polizza vita sul mutuo è obbligatoria?", rispostaAuto: "No: per legge la banca può richiedere solo la polizza incendio-scoppio sull'immobile. La polizza vita (TCM) collegata al mutuo è facoltativa, e la banca non può obbligarti ad acquistare la sua: hai diritto a portare una polizza esterna equivalente, spesso molto più economica. Confrontare conviene quasi sempre." },
    { cat: "Salute", keyword: "assicurazione sanitaria visite specialistiche", domanda: "Le polizze salute rimborsano le visite specialistiche private?", rispostaAuto: "Dipende dal piano: le polizze base coprono di solito solo ricoveri e grandi interventi, mentre i piani completi includono visite specialistiche e diagnostica, spesso con network di strutture convenzionate (paghi solo la franchigia) o rimborso a percentuale fuori rete. Controlla massimali annui, franchigie per prestazione e tempi di carenza." },
    { cat: "Impresa", keyword: "polizza catastrofale imprese obbligatoria", domanda: "La polizza catastrofale per le imprese è davvero obbligatoria?", rispostaAuto: "Sì: dal 2025 le imprese con sede in Italia devono assicurare terreni, fabbricati, impianti e attrezzature contro sismi, alluvioni e frane, con scadenze differenziate per dimensione d'impresa. Chi non si adegua rischia di perdere l'accesso a contributi e agevolazioni pubbliche. Un intermediario può verificare se la tua copertura attuale è conforme." },
    { cat: "Auto", keyword: "sospensione assicurazione auto", domanda: "Posso sospendere l'assicurazione auto se non uso il veicolo?", rispostaAuto: "Molte compagnie lo permettono: la sospensione congela la polizza (di solito min. 30 giorni, max 10-12 mesi) e allunga la scadenza del periodo non goduto. Attenzione: il veicolo sospeso non può circolare né sostare su strada pubblica, pena sanzioni e sequestro. Verifica in polizza costi e limiti di riattivazione." },
    { cat: "Viaggi", keyword: "assicurazione viaggio USA costo", domanda: "Quanto costa un'assicurazione viaggio per gli Stati Uniti?", rispostaAuto: "Per gli USA servono massimali sanitari alti (min. 500.000€, meglio 1M€+): una settimana costa in genere 40–90€ a persona, di più per over 65 o coperture annullamento. La sanità americana è la più cara al mondo: un ricovero può superare i 100.000$. Verifica sempre l'anticipo diretto delle spese ospedaliere da parte della compagnia." },
    { cat: "Casa", keyword: "polizza affitto tutela proprietario", domanda: "Che polizza serve a un proprietario che affitta un appartamento?", rispostaAuto: "Le coperture chiave sono tre: tutela legale (sfratti e controversie), garanzia canoni non pagati (di solito 6-12 mensilità dopo franchigia) e danni all'immobile causati dall'inquilino. Alcune polizze richiedono referenze sull'inquilino in fase di sottoscrizione. In parallelo, chiedi all'inquilino una RC della sua polizza casa." },
    { cat: "Vita", keyword: "differenza TCM vita intera", domanda: "Che differenza c'è tra polizza vita temporanea (TCM) e vita intera?", rispostaAuto: "La TCM copre solo un periodo definito (es. 20 anni) con premi bassi: ideale per proteggere mutuo o figli. La vita intera copre per sempre e ha componente di risparmio, ma costa molto di più. Per la maggior parte delle famiglie la TCM è la scelta più efficiente: massima protezione al minimo costo negli anni in cui serve davvero." },
    { cat: "Impresa", keyword: "polizza cyber PMI", domanda: "Una piccola impresa ha davvero bisogno di una polizza cyber?", rispostaAuto: "Oggi quasi sempre sì: le PMI sono il bersaglio preferito del ransomware perché meno protette. Una polizza cyber copre ripristino dati, interruzione di attività, richieste danni per violazione dati (GDPR) e include assistenza tecnica-legale 24/7. I premi partono da poche centinaia di euro l'anno, molto meno del costo medio di un attacco." },
    { cat: "Auto", keyword: "kasko conviene auto usata", domanda: "Conviene la kasko su un'auto di 8-10 anni?", rispostaAuto: "Di rado: la kasko completa costa in proporzione al valore assicurato, ma l'indennizzo segue il valore commerciale del veicolo, che su un'auto datata è basso. Spesso convengono di più mini-garanzie mirate: cristalli, eventi atmosferici, atti vandalici. Regola pratica: se il premio kasko supera il 10% del valore dell'auto, difficilmente ha senso." },
    { cat: "Salute", keyword: "polizza malattie gravi come funziona", domanda: "Come funziona una polizza per malattie gravi (dread disease)?", rispostaAuto: "Alla diagnosi di una delle patologie elencate in polizza (tipicamente tumore, infarto, ictus...) la compagnia liquida un capitale in un'unica soluzione, da usare liberamente: cure, integrazione del reddito, assistenza. Punti da controllare: elenco patologie coperte, periodo di carenza, età massima e sopravvivenza minima richiesta dopo la diagnosi." },
    { cat: "Casa", keyword: "RC capofamiglia cosa copre", domanda: "Cosa copre davvero la RC del capofamiglia?", rispostaAuto: "Copre i danni involontari che tu, i familiari conviventi, i figli minori e persino gli animali domestici causate a terzi nella vita privata: dal vaso caduto dal balcone al morso del cane, dai danni in bici a quelli dei figli a scuola. Costa poco (30-80€/anno) ed è una delle coperture con il miglior rapporto costo/beneficio in assoluto." },
    { cat: "Viaggi", keyword: "assicurazione annullamento viaggio", domanda: "L'assicurazione annullamento viaggio rimborsa sempre?", rispostaAuto: "No: rimborsa solo per cause documentabili previste in polizza (malattia, infortunio, lutto, licenziamento...). Le formule \"any reason\" coprono qualunque motivo ma con scoperto del 20-30%. Va quasi sempre sottoscritta entro pochi giorni dalla prenotazione. Leggi con attenzione le esclusioni: malattie preesistenti e pandemie sono i punti critici." },
    { cat: "Impresa", keyword: "RC professionale partita IVA", domanda: "Quali professionisti hanno l'obbligo di RC professionale?", rispostaAuto: "Tutti i professionisti iscritti a ordini e collegi (avvocati, medici, ingegneri, commercialisti, geometri...) hanno l'obbligo di RC professionale, e lo stesso vale per gli intermediari assicurativi. Per i freelance senza ordine non c'è obbligo, ma spesso i clienti la richiedono contrattualmente. Massimali e retroattività fanno la vera differenza tra le offerte." }
  ];

  /* ---- 2. Generatore per riempire fino a 200 slot ----
     Sostituendo/ampliando TOPICS con le tue keyword il pool
     si ricompone automaticamente. */
  const TOPICS = {
    Auto: ["l'assicurazione moto 125", "la polizza per lo scooter elettrico", "l'assicurazione del camper", "la garanzia furto e incendio", "la garanzia cristalli", "la copertura eventi atmosferici", "l'assicurazione auto d'epoca", "la RC familiare (Bersani estesa)", "l'assicurazione con scatola nera", "la polizza per auto elettrica", "l'assicurazione del monopattino elettrico", "la garanzia assistenza stradale", "la polizza per il rimorchio", "l'assicurazione a chilometri", "la guida esclusiva ed esperta", "la copertura atti vandalici", "l'assicurazione temporanea auto", "la polizza per il quad", "l'assicurazione auto aziendale", "la RC auto per targa estera"],
    Casa: ["la polizza scoppio e incendio del mutuo", "la garanzia danni da acqua", "la copertura furto in casa", "l'assicurazione per la casa vacanze", "la polizza per l'impianto fotovoltaico", "la globale fabbricati condominiale", "la copertura alluvione", "l'assicurazione per l'inquilino", "la garanzia fenomeno elettrico", "la tutela legale della famiglia", "la copertura per danni del cane", "l'assicurazione della seconda casa", "la polizza per lavori di ristrutturazione", "la garanzia lastre e vetri", "la copertura giardino e pertinenze"],
    Vita: ["la polizza caso morte a capitale decrescente", "la garanzia invalidità totale permanente", "il riscatto di una polizza vita", "la designazione dei beneficiari", "la polizza vita unit linked", "il piano individuale pensionistico (PIP)", "la polizza vita per i figli", "l'esenzione fiscale delle polizze vita", "la polizza vita per soci d'azienda (key man)", "la rendita vitalizia"],
    Salute: ["la diaria da ricovero", "la copertura grandi interventi chirurgici", "la polizza odontoiatrica", "la copertura long term care (LTC)", "l'assicurazione infortuni personale", "il check-up annuale in polizza", "la polizza salute per la famiglia", "la copertura per la maternità", "l'assicurazione salute per over 60", "il rimborso ticket sanitari"],
    Impresa: ["la polizza D&O per amministratori", "l'assicurazione del credito commerciale", "la polizza flotte aziendali", "la copertura merci trasportate", "le fideiussioni assicurative", "la tutela legale d'impresa", "l'assicurazione infortuni dei dipendenti", "la polizza per il negozio", "la RC prodotti", "la copertura interruzione di attività", "l'assicurazione per lo studio professionale", "la polizza per l'e-commerce", "la copertura richiami prodotto", "l'assicurazione agricola agevolata", "la polizza per il ristorante"],
    Viaggi: ["l'assicurazione sci e sport invernali", "la copertura bagaglio smarrito", "la polizza viaggio annuale multitrip", "l'assicurazione per il visto Schengen", "la copertura sport avventura in viaggio", "l'assicurazione viaggio per over 70", "la polizza per lo studio all'estero", "la copertura rimpatrio sanitario"]
  };

  const TEMPLATES = [
    { q: t => `Quanto costa ${t}?`, a: t => `Il costo di ${t} dipende da diversi fattori: profilo dell'assicurato, massimali scelti, franchigie e compagnia. Le differenze di premio tra compagnie sullo stesso profilo possono superare il 40-50%, quindi conviene sempre confrontare almeno 2-3 proposte. Attenzione a non scegliere solo in base al prezzo: verifica franchigie, scoperti ed esclusioni nel set informativo. Un intermediario iscritto al RUI può costruire un preventivo sul tuo caso specifico, gratuitamente.` },
    { q: t => `Cosa copre esattamente ${t}?`, a: t => `Le coperture di ${t} variano da compagnia a compagnia: il perimetro esatto è definito nel set informativo (DIP e condizioni di assicurazione), che va sempre letto prima di firmare. I punti da controllare sono quattro: cosa è incluso, cosa è escluso, massimali e franchigie/scoperti. Se una garanzia per te essenziale è tra le esclusioni, spesso può essere aggiunta come estensione. In caso di dubbi, la valutazione di un intermediario verificato non costa nulla.` },
    { q: t => `Conviene davvero ${t}?`, a: t => `Dipende dal tuo profilo di rischio: ${t} conviene quando il danno potenziale sarebbe difficile da sostenere di tasca propria, meno quando il premio è alto in rapporto al rischio reale. La regola pratica: assicura le perdite che non potresti permetterti, non quelle piccole. Confronta il premio annuo con il danno massimo probabile e verifica se esistono formule modulari più economiche. Un intermediario può aiutarti a fare questo calcolo sul tuo caso concreto.` },
    { q: t => `Come funziona ${t}?`, a: t => `In sintesi, ${t} segue tre momenti: la sottoscrizione (dichiarazioni corrette = niente contestazioni future), la vita del contratto (scadenze, disdette e adeguamenti) e il sinistro (denuncia nei termini previsti, di solito 3-10 giorni, con documentazione completa). Il consiglio più importante: conserva il set informativo e verifica ogni anno che la copertura sia ancora adeguata alla tua situazione. Per una spiegazione sul tuo caso, chiedi a un intermediario qui sotto.` }
  ];

  /* ---- 3. Composizione del pool (deterministico) ---- */
  const pool = CURATED.map(c => ({ ...c }));
  const cats = Object.keys(TOPICS);
  const cursors = Object.fromEntries(cats.map(c => [c, 0])); // k-esima combinazione usata per categoria
  let safety = 0;
  while (pool.length < 200 && safety++ < 3000) {
    const cat = cats[pool.length % cats.length];
    const topics = TOPICS[cat];
    const k = cursors[cat]++;
    if (k >= topics.length * TEMPLATES.length) continue; // categoria esaurita
    const topic = topics[k % topics.length];
    const tpl = TEMPLATES[Math.floor(k / topics.length) % TEMPLATES.length];
    const domanda = tpl.q(topic);
    if (pool.some(p => p.domanda === domanda)) continue; // niente duplicati con le curate
    pool.push({ cat, keyword: topic.replace(/^(l'|la |le |il |lo |gli |i )/, ""), domanda, rispostaAuto: tpl.a(topic) });
  }

  window.DAILY_POOL = pool.slice(0, 200);
})();
