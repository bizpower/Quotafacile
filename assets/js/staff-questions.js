/* ============================================================
   QuotaFacile — Domande Staff (keyword SEO posizionate in bacheca)
   ------------------------------------------------------------
   Sono le domande che la redazione pubblica per intercettare
   keyword ad alto intento e bassa concorrenza. A differenza
   della "domanda del giorno" escono TUTTE subito e restano in
   cima alla bacheca finché non le si sposta.

   Metodo di selezione (stile Neil Patel):
   1. Long-tail con intento chiaro, non head keyword generiche
      ("assicurazione auto" è ingiocabile: la presidiano
      Facile.it, Segugio, Prima con budget a sei zeri).
   2. SERP occupata da news o da settori NON assicurativi
      (portali fiscali, studi legali): lì un intermediario
      iscritto al RUI è più autorevole dell'incumbent.
   3. Normativa recente o poco conosciuta = pagine concorrenti
      vecchie o assenti = finestra di posizionamento.
   4. Il lettore che cerca quella frase ha un problema che si
      risolve parlando con un intermediario. Traffico che non
      converte non serve a nulla.

   ⚠️ I volumi sono STIME ragionate sulla base della SERP e
   della stagionalità, non dati di Keyword Planner: vanno
   confermati con Google Keyword Planner / Ahrefs / Semrush
   prima di costruirci sopra un piano editoriale.

   Formato di uno slot:
   { id, cat, keyword, volume, difficolta, intento, data,
     domanda, meta, risposta (HTML) }
   ============================================================ */
"use strict";

(function () {

  const STAFF = [
    /* ---------------------------------------------------------
       KEYWORD 1 — la finestra più larga aperta in questo momento.
       L'obbligo è scattato l'11 luglio 2026: la SERP è fatta di
       articoli di cronaca (QuiFinanza, Borsa&Finanza, Moveo),
       non di pagine evergreen ottimizzate. Chi mette online una
       Q&A strutturata adesso si prende il featured snippet.
       --------------------------------------------------------- */
    {
      id: "k1",
      cat: "Auto",
      keyword: "assicurazione monopattino elettrico obbligatoria",
      titolo: "Assicurazione monopattino elettrico: obbligatoria dal 2026",
      volume: "≈ 1.500–4.000/mese (picco in corso)",
      difficolta: "Molto bassa",
      intento: "Informativo → transazionale",
      data: "2026-07-27",
      domanda: "L'assicurazione per il monopattino elettrico è obbligatoria? Quanto costa e cosa rischi senza",
      meta: "Sì, dal 16 luglio 2026 la RC per il monopattino elettrico è obbligatoria. Costi reali, multe fino a 400€ e i 3 errori che ti lasciano scoperto.",
      risposta: `
        <p><strong>Sì. Dal 16 luglio 2026 circolare con un monopattino elettrico senza polizza RC è vietato</strong>, e la multa va da 100 a 400 euro. Una polizza base costa tra 35 e 55 euro l'anno: meno di quanto ti costa una singola multa, molto meno di quanto ti costa un pedone investito.</p>

        <h4>Quanto costa davvero</h4>
        <ul>
          <li><strong>35–55 €/anno</strong> per la sola RC verso terzi (la garanzia obbligatoria).</li>
          <li><strong>Fino a ~150 €/anno</strong> se aggiungi furto, infortuni del conducente e assistenza.</li>
          <li>Il premio cambia poco per età e provincia: qui la vera differenza tra compagnie la fanno <em>massimali</em> e <em>franchigie</em>, non il prezzo.</li>
        </ul>

        <h4>Il rischio vero non è la multa</h4>
        <p>La multa la paghi una volta. Senza RC, se investi un pedone <strong>rispondi con il tuo patrimonio personale</strong>: stipendio, conto corrente, casa. Un danno da lesioni permanenti a una persona supera con facilità i 200.000 euro. È esattamente il tipo di rischio che non puoi permetterti di tenere in proprio — ed è per questo che il legislatore ha reso obbligatoria la copertura.</p>

        <h4>I 3 errori che vediamo più spesso</h4>
        <ol>
          <li><strong>"Sono già coperto dalla RC capofamiglia".</strong> Quasi mai. Le polizze capofamiglia escludono espressamente i veicoli soggetti a obbligo di assicurazione: dal 16 luglio il monopattino è entrato in quella categoria e in molti contratti è uscito dalla copertura da solo. Rileggi le esclusioni, non il titolo della garanzia.</li>
          <li><strong>Assicurare la persona invece del mezzo.</strong> Alcune formule coprono "il conducente qualunque mezzo usi", altre sono legate al numero di serie del monopattino. Se in famiglia ne girano due, verifica quale delle due logiche hai comprato.</li>
          <li><strong>Ignorare il massimale.</strong> Un massimale da 500.000 € costa pochi euro in più di uno da 250.000 € e copre uno scenario due volte più grave. Su questa garanzia risparmiare sul massimale non ha senso economico.</li>
        </ol>

        <h4>Checklist prima di firmare</h4>
        <p>Controlla quattro righe del contratto: <strong>massimale RC</strong>, <strong>copertura del conducente minorenne</strong> (se il monopattino lo usa un figlio), <strong>uso su area privata</strong> e <strong>franchigia sui danni a cose</strong>. Se una delle quattro non ti torna, chiedi a un intermediario prima di firmare: il preventivo non costa nulla e la differenza tra due polizze da 40 euro può essere di 250.000 euro di massimale.</p>
      `
    },

    /* ---------------------------------------------------------
       KEYWORD 2 — B2B, la più redditizia del gruppo.
       La SERP è tutta di portali fiscali e studi commercialisti
       (PMI.it, FiscoeTasse, Ingenio): nessun intermediario
       presidia la query, pur essendo l'unico che può risolverla.
       Un solo lead d'impresa ripaga il contenuto.
       --------------------------------------------------------- */
    {
      id: "k2",
      cat: "Impresa",
      keyword: "polizza catastrofale obbligatoria micro imprese scadenza",
      titolo: "Polizza catastrofale obbligatoria: scadenze e rischi PMI",
      volume: "≈ 800–2.500/mese",
      difficolta: "Bassa (lato assicurativo: nulla)",
      intento: "Commerciale, urgente",
      data: "2026-07-27",
      domanda: "Polizza catastrofale obbligatoria: la mia micro impresa è fuori tempo massimo? Cosa rischio davvero",
      meta: "Scadenza 1° gennaio 2026 per micro e piccole imprese. Niente multe, ma stop a contributi e agevolazioni pubbliche: cosa fare adesso.",
      risposta: `
        <p><strong>Se sei una micro o piccola impresa il termine è scaduto il 1° gennaio 2026.</strong> Non ti arriverà una multa — e proprio per questo l'obbligo viene sottovalutato. La sanzione vera è un'altra: <strong>senza polizza catastrofale attiva non accedi a contributi, sovvenzioni e agevolazioni pubbliche</strong>, e quelle già concesse possono essere revocate.</p>

        <h4>Le date che contano</h4>
        <ul>
          <li><strong>Micro e piccole imprese:</strong> obbligo in vigore dal 1° gennaio 2026.</li>
          <li><strong>Proroga al 31 marzo 2026</strong> solo per tre categorie: micro-imprese turistico-ricettive, somministrazione di alimenti e bevande (bar e ristoranti), pesca e acquacoltura. Se non rientri in queste tre, la proroga non ti riguarda.</li>
          <li>Le grandi imprese hanno già superato il proprio termine.</li>
        </ul>

        <h4>Perché "tanto non c'è la multa" è un ragionamento che costa caro</h4>
        <p>L'art. 1, comma 102 della L. 213/2023 stabilisce che della mancata stipula si tiene conto nell'assegnazione di risorse pubbliche. Il decreto MIMIT del 18 giugno 2025 lo ha reso operativo: se presenti domanda per un incentivo senza una polizza Cat Nat in corso di validità, <strong>la domanda viene respinta</strong>; se l'agevolazione era già stata concessa, <strong>viene revocata</strong>. Bandi, credito d'imposta, contributi regionali: tutto passa da lì. Il conto non arriva come multa, arriva come finanziamento perso.</p>

        <h4>Cosa devi assicurare (e cosa no)</h4>
        <p>L'obbligo copre <strong>terreni, fabbricati, impianti, macchinari e attrezzature</strong> — le immobilizzazioni materiali iscritte in bilancio — contro <strong>sismi, alluvioni, frane, inondazioni ed esondazioni</strong>. Restano fuori merci, scorte e beni in leasing intestati ad altri: attenzione, perché è proprio lì che molte imprese scoprono di avere un buco.</p>

        <h4>I 4 controlli da fare questa settimana</h4>
        <ol>
          <li><strong>Hai già una polizza incendio?</strong> Nella maggior parte dei casi <em>non</em> è conforme: la garanzia catastrofale è quasi sempre un'estensione separata da attivare.</li>
          <li><strong>I valori assicurati sono aggiornati?</strong> Se sono fermi al valore contabile di cinque anni fa, in caso di sinistro scatta la regola proporzionale e l'indennizzo viene ridotto.</li>
          <li><strong>Zona sismica e rischio idrogeologico:</strong> determinano franchigie e scoperti, che la norma consente entro limiti precisi. Verificali, non darli per scontati.</li>
          <li><strong>Hai bandi aperti o in programma nei prossimi 12 mesi?</strong> Se sì, la polizza va messa in regola prima della domanda, non dopo.</li>
        </ol>

        <p>Un intermediario iscritto al RUI può dirti in mezz'ora se la copertura che hai già è conforme o se stai pagando un premio che non ti mette al riparo da nulla. È il controllo con il miglior rapporto tempo/rischio che puoi fare adesso.</p>
      `
    },

    /* ---------------------------------------------------------
       KEYWORD 3 — obbligo di legge che quasi nessuno conosce.
       SERP presidiata da INAIL, patronati e siti fiscali: zero
       concorrenza assicurativa. Porta d'ingresso naturale
       all'infortuni privato, che è il vero prodotto da vendere.
       --------------------------------------------------------- */
    {
      id: "k3",
      cat: "Salute",
      keyword: "assicurazione casalinghe INAIL obbligatoria quanto costa",
      titolo: "Assicurazione casalinghe INAIL: obbligatoria, 24 € l'anno",
      volume: "≈ 500–1.500/mese (picco a gennaio)",
      difficolta: "Bassa",
      intento: "Informativo → cross-sell infortuni",
      data: "2026-07-27",
      domanda: "L'assicurazione INAIL per le casalinghe è obbligatoria? Quanto costa e cosa copre davvero",
      meta: "Sì, è obbligatoria: 24 € l'anno entro il 31 gennaio, gratis sotto una certa soglia di reddito. Ma copre molto meno di quanto pensi.",
      risposta: `
        <p><strong>Sì, è obbligatoria per legge e costa 24 euro l'anno</strong>, da versare entro il <strong>31 gennaio</strong>. Riguarda chi ha tra i <strong>18 e i 67 anni</strong> e svolge in via non occasionale e gratuita il lavoro di cura della propria casa e della famiglia. È l'obbligo assicurativo meno conosciuto d'Italia: milioni di persone lo violano senza saperlo.</p>

        <h4>Quando non paghi nulla</h4>
        <p>Il premio è <strong>a carico dello Stato</strong> se hai un reddito personale complessivo lordo fino a 4.648,11 € l'anno e un reddito del nucleo familiare fino a 9.296,22 €. L'iscrizione resta comunque obbligatoria: cambia chi paga, non se sei tenuto a iscriverti. Se paghi tu, i 24 euro sono <strong>fiscalmente deducibili</strong>.</p>

        <h4>Ecco il punto che quasi nessuno ti spiega</h4>
        <p>La copertura INAIL <strong>indennizza solo l'invalidità permanente</strong>, e solo sopra soglie precise:</p>
        <ul>
          <li><strong>Invalidità dal 6% al 15%:</strong> una prestazione <em>una tantum</em> di 337,41 €.</li>
          <li><strong>Invalidità dal 16% in su:</strong> una rendita mensile a vita, proporzionale al grado, fino a 1.454,08 € al mese.</li>
          <li><strong>Sotto il 6%: zero.</strong></li>
        </ul>
        <p>Tradotto: la caduta dalla scala che ti costa tre mesi di gesso, le visite, la fisioterapia e l'aiuto in casa — cioè l'infortunio domestico <em>tipico</em> — <strong>non ti fa arrivare un euro</strong>. L'INAIL copre la catastrofe, non l'incidente.</p>

        <h4>Cosa serve davvero, oltre ai 24 euro</h4>
        <p>Il buco si chiude con una polizza infortuni privata, che aggiunge quello che l'INAIL non dà:</p>
        <ul>
          <li><strong>diaria da ricovero e da gessatura</strong>, i giorni in cui non puoi fare nulla;</li>
          <li><strong>rimborso delle spese mediche</strong> e della fisioterapia;</li>
          <li><strong>indennizzo dell'invalidità sotto il 6%</strong>, che è la stragrande maggioranza dei casi;</li>
          <li>spesso una <strong>diaria per l'aiuto domestico</strong> nel periodo di inabilità.</li>
        </ul>
        <p>Si parla di poche decine di euro l'anno in più. La regola pratica è semplice: <strong>versa i 24 euro perché è obbligatorio, ma non considerarti coperto.</strong> Chiedi a un intermediario un confronto tra due o tre polizze infortuni sul tuo profilo: è una delle poche coperture dove il rapporto tra premio e utilità reale è quasi sempre favorevole.</p>
      `
    },

    /* ---------------------------------------------------------
       KEYWORD 4 — volume alto e costante, difficoltà media, ma
       la SERP è fatta di pagine FAQ leggere e di comparatori che
       rispondono in tre righe. Si vince andando in profondità
       sulle esclusioni, dove nessuno entra.
       --------------------------------------------------------- */
    {
      id: "k4",
      cat: "Casa",
      keyword: "assicurazione cane obbligatoria",
      titolo: "Assicurazione cane obbligatoria? Quando sì e quando no",
      volume: "≈ 1.000–2.500/mese",
      difficolta: "Medio-bassa sul long tail",
      intento: "Informativo → RC capofamiglia",
      data: "2026-07-27",
      domanda: "L'assicurazione per il cane è obbligatoria? La risposta breve e quella che ti serve davvero",
      meta: "In generale no, ma in un caso sì. E in ogni caso rispondi tu dei danni del tuo cane: art. 2052 c.c. Cosa controllare in polizza.",
      risposta: `
        <p><strong>In generale no, l'assicurazione per il cane non è obbligatoria. Con un'eccezione:</strong> se un veterinario dichiara il tuo cane a rischio elevato di aggressività e lo iscrive nel registro dei cani impegnativi, <strong>la RC verso terzi diventa obbligatoria</strong>. Fin qui la risposta breve. Quella che ti serve davvero è un'altra.</p>

        <h4>Non è obbligatoria, ma la responsabilità sì</h4>
        <p>L'art. 2052 del Codice Civile prevede una <strong>responsabilità oggettiva</strong> del proprietario: rispondi dei danni causati dal tuo animale <em>anche se non hai colpa</em>, che il cane fosse sotto la tua custodia o smarrito. L'unica via d'uscita è provare il caso fortuito, e in giudizio è una porta strettissima. In pratica: se il tuo cane fa cadere un ciclista, paghi tu. Se morde un bambino, paghi tu — e le lesioni permanenti su un minore si liquidano a sei cifre.</p>

        <h4>La buona notizia: probabilmente sei già coperto</h4>
        <p>La <strong>RC del capofamiglia</strong> — 30-80 euro l'anno, spesso già inclusa nella polizza casa — copre nella maggior parte dei casi anche i danni causati dagli animali domestici. Prima di comprare una polizza dedicata, apri la tua e cerca la voce "animali domestici" tra le garanzie. Molti pagano due volte per lo stesso rischio.</p>

        <h4>Le 5 esclusioni che rendono inutile una polizza che sembra buona</h4>
        <ol>
          <li><strong>Danni ai familiari conviventi.</strong> Se il cane morde tuo figlio, quasi nessuna RC capofamiglia interviene: i conviventi non sono "terzi".</li>
          <li><strong>Cane affidato a terzi.</strong> Dog sitter, pensione, un amico che lo porta a spasso: alcune polizze escludono i danni avvenuti mentre il cane non era sotto la tua custodia diretta.</li>
          <li><strong>Razze escluse.</strong> Alcuni contratti elencano razze non assicurabili o applicano scoperti maggiorati. È scritto nelle condizioni, non nel volantino.</li>
          <li><strong>Uso non domestico.</strong> Cane da guardia aziendale, da caccia, impiegato in attività lavorativa: serve una copertura diversa.</li>
          <li><strong>Massimale troppo basso.</strong> Un massimale da 150.000 € su un danno da lesioni gravi lascia scoperta la parte più costosa. Punta ad almeno 500.000 €, meglio 1 milione: la differenza di premio è di pochi euro l'anno.</li>
        </ol>

        <h4>Cosa fare in 5 minuti</h4>
        <p>Prendi la tua polizza casa, cerca "responsabilità civile della vita privata", verifica <strong>massimale</strong>, <strong>inclusione degli animali</strong> e <strong>franchigia</strong>. Se una delle tre manca, un intermediario può dirti gratuitamente se conviene estendere quella che hai o attivarne una dedicata. Nel 90% dei casi si risolve con un'estensione da poche decine di euro.</p>
      `
    },

    /* ---------------------------------------------------------
       KEYWORD 5 — il gioiello del gruppo per valore del lead.
       SERP interamente occupata da studi legali e società di
       recupero crediti: zero intermediari. Chi cerca questa
       frase ha un patrimonio da proteggere ed è il cliente
       ideale per un broker vita/previdenza.
       --------------------------------------------------------- */
    {
      id: "k5",
      cat: "Vita",
      keyword: "polizza vita pignorabile",
      titolo: "Polizza vita pignorabile? Cosa dice l'art. 1923 c.c.",
      volume: "≈ 300–900/mese",
      difficolta: "Bassa (nessun intermediario in SERP)",
      intento: "Informativo ad altissimo valore",
      data: "2026-07-27",
      domanda: "La polizza vita è pignorabile dai creditori? Quando la protezione dell'art. 1923 c.c. salta davvero",
      meta: "Di regola no: l'art. 1923 c.c. protegge le somme dovute dall'assicuratore. Ma l'impignorabilità non è assoluta: le 3 eccezioni che contano.",
      risposta: `
        <p><strong>Di regola no.</strong> L'art. 1923, comma 1 del Codice Civile stabilisce che le somme dovute dall'assicuratore al contraente o al beneficiario <strong>non possono essere sottoposte ad azione esecutiva o cautelare</strong>. È una delle protezioni patrimoniali più forti del nostro ordinamento. <strong>Ma non è assoluta</strong>, e chi te la vende come uno scudo blindato ti sta raccontando metà della storia.</p>

        <h4>Le 3 situazioni in cui la protezione salta</h4>
        <ol>
          <li><strong>I premi pagati restano aggredibili.</strong> Il comma 2 dello stesso articolo fa salve, rispetto ai premi versati, le azioni di <em>revocatoria</em> e quelle di <em>collazione, imputazione e riduzione delle donazioni</em>. Tradotto: se hai versato premi consistenti quando eri già indebitato, il creditore può attaccare l'importo dei premi. Il momento in cui sottoscrivi conta quanto il contratto che sottoscrivi.</li>
          <li><strong>Le polizze a prevalente contenuto finanziario.</strong> È l'eccezione che oggi pesa di più. La giurisprudenza guarda alla <em>sostanza</em> del contratto: se una unit linked o index linked è di fatto un investimento — rischio demografico irrilevante, capitale garantito, riscattabile in qualsiasi momento — il giudice può riqualificarla come strumento finanziario e <strong>l'impignorabilità non si applica</strong>. Non basta l'etichetta "polizza vita" sulla copertina.</li>
          <li><strong>Il sequestro penale.</strong> L'art. 1923 c.c. protegge dalle azioni dei creditori, non dai provvedimenti dell'autorità giudiziaria penale.</li>
        </ol>

        <h4>Cosa rende una polizza davvero protetta</h4>
        <p>Se la protezione patrimoniale è tra i tuoi obiettivi, questi sono gli elementi che il giudice guarda — e quindi quelli su cui costruire il contratto:</p>
        <ul>
          <li>una <strong>causa previdenziale effettiva</strong>, non un investimento travestito;</li>
          <li>un <strong>rischio demografico reale e significativo</strong> a carico dell'assicuratore;</li>
          <li>una <strong>designazione del beneficiario</strong> coerente con quella finalità;</li>
          <li>una <strong>sottoscrizione non sospetta</strong> quanto a tempistica rispetto alla situazione debitoria.</li>
        </ul>

        <h4>L'errore da non fare</h4>
        <p>Sottoscrivere una polizza vita <em>dopo</em> che i problemi sono già iniziati è il modo più rapido per trasformare una protezione in una revocatoria. La pianificazione patrimoniale funziona quando è preventiva: fatta prima, regge; fatta dopo, si sgretola in giudizio.</p>

        <p>Questa è materia di confine tra diritto e assicurazione: prima di firmare, fatti analizzare il contratto da un intermediario che lavori abitualmente sul ramo vita e, se il patrimonio è rilevante, affiancagli un legale. La differenza tra una polizza protetta e una attaccabile sta in clausole che si leggono in dieci minuti — se sai dove guardare.</p>
      `
    },
    /* ---------------------------------------------------------
       KEYWORD 6-9 — query PROCEDURALI.
       Sono la miniera meno sfruttata del settore: chi cerca
       "come faccio a…" ha un problema aperto adesso, e la SERP
       risponde con definizioni generiche invece che con la
       procedura. Valgono doppio anche per i motori generativi
       (ChatGPT, Perplexity, AI Overviews), che citano
       volentieri chi espone passaggi numerati, termini precisi
       e riferimenti normativi verificabili.
       --------------------------------------------------------- */
    {
      id: "k6",
      cat: "Auto",
      keyword: "classe di merito sbagliata come farla correggere",
      titolo: "Classe di merito sbagliata: come farla correggere",
      volume: "≈ 400–1.200/mese",
      difficolta: "Bassa",
      intento: "Procedurale, problema aperto",
      data: "2026-07-31",
      domanda: "La mia classe di merito è sbagliata: come faccio a farla correggere?",
      meta: "L'errore va contestato alla compagnia che ha emesso l'attestato di rischio. La procedura passo per passo e cosa fare se non risponde.",
      risposta: `
        <p><strong>L'errore va contestato per iscritto alla compagnia che ha emesso l'attestato di rischio, non a quella nuova.</strong> È lei l'unica che può correggere il dato nella banca dati ANIA, ed è tenuta a farlo se la segnalazione è fondata. Nel frattempo continui a pagare un premio più alto del dovuto, quindi la fretta è giustificata.</p>

        <h4>Prima verifica di avere ragione</h4>
        <p>La classe che conta è la <strong>CU (Classe Universale)</strong>, non la classe interna della compagnia: sono due numeri diversi e vengono confusi in continuazione. La classe interna è un parametro commerciale della singola impresa e può peggiorare senza che la CU cambi. Controlla la CU sull'attestato di rischio, che la compagnia deve mettere a disposizione nell'area riservata <strong>almeno 30 giorni prima della scadenza</strong>.</p>

        <h4>La procedura, nell'ordine</h4>
        <ol>
          <li><strong>Recupera i documenti:</strong> attestato di rischio contestato, quello dell'anno precedente e, se l'errore riguarda un sinistro, la documentazione che ne dimostra l'esito.</li>
          <li><strong>Scrivi un reclamo formale alla compagnia emittente</strong>, via PEC o raccomandata: indica numero di polizza, targa, il dato errato e quello corretto. Chiedi espressamente la rettifica nella banca dati ANIA.</li>
          <li><strong>Aspetta 45 giorni.</strong> È il termine massimo entro cui la compagnia deve rispondere a un reclamo.</li>
          <li><strong>Se non risponde o rifiuta</strong>, presenta reclamo all'<strong>IVASS</strong> allegando quello inviato alla compagnia e l'eventuale risposta.</li>
        </ol>

        <h4>I due errori più frequenti</h4>
        <ul>
          <li><strong>Un sinistro attribuito per intero quando la responsabilità era paritaria.</strong> Con il concorso di colpa il malus si applica in proporzione: se ti hanno applicato il 100% controlla la constatazione amichevole.</li>
          <li><strong>La classe non ereditata dopo una Legge Bersani o RC familiare.</strong> Capita quando lo stato di famiglia non risultava aggiornato alla data di decorrenza.</li>
        </ul>

        <h4>Cosa recuperi</h4>
        <p>Ottenuta la rettifica hai diritto al <strong>ricalcolo del premio</strong> e alla restituzione della differenza pagata in eccesso. Su una RC auto media parliamo di 150-400 euro l'anno, per ogni anno in cui l'errore ha prodotto effetti. Un intermediario iscritto al RUI può scrivere il reclamo al posto tuo e seguirlo: è esattamente il tipo di pratica in cui conoscere il linguaggio giusto accorcia i tempi.</p>
      `
    },
    {
      id: "k7",
      cat: "Impresa",
      keyword: "reclamo assicurazione IVASS come funziona",
      titolo: "Reclamo contro l'assicurazione: la procedura completa",
      volume: "≈ 700–2.000/mese",
      difficolta: "Bassa",
      intento: "Procedurale, alta urgenza",
      data: "2026-07-31",
      domanda: "L'assicurazione non mi risponde: come si presenta un reclamo e a chi?",
      meta: "Prima alla compagnia, che ha 45 giorni per rispondere. Poi IVASS o Arbitro Assicurativo. Termini, indirizzi e cosa scrivere.",
      risposta: `
        <p><strong>Il reclamo si presenta sempre prima all'impresa o all'intermediario, che hanno 45 giorni per rispondere.</strong> Solo dopo — o se il termine scade nel silenzio — puoi rivolgerti all'IVASS. Saltare il primo passaggio fa respingere il reclamo per improcedibilità: è l'errore che vediamo più spesso.</p>

        <h4>Passo 1 — Il reclamo all'impresa</h4>
        <p>Va inviato per iscritto all'ufficio reclami, tramite PEC o raccomandata A/R. Deve contenere: i tuoi dati, il numero di polizza o di sinistro, una descrizione ordinata dei fatti, cosa chiedi e i documenti a supporto. Conserva la ricevuta: da lì decorrono i 45 giorni.</p>

        <h4>Passo 2 — Il reclamo all'IVASS</h4>
        <p>Se la risposta non arriva o non ti soddisfa, scrivi a <strong>IVASS — Servizio Tutela del Consumatore, Via del Quirinale 21, 00187 Roma</strong>, allegando copia del reclamo già inviato e dell'eventuale risposta. L'IVASS interviene sui comportamenti di imprese e intermediari: trasparenza, correttezza, rispetto dei termini.</p>

        <h4>Cosa l'IVASS non può fare</h4>
        <p class="muted">È il punto che fa perdere più tempo. <strong>L'IVASS non liquida i sinistri e non decide chi ha ragione nel merito economico</strong>: vigila sul comportamento. Se la contestazione riguarda l'<em>importo</em> del risarcimento o l'interpretazione di una clausola, gli strumenti sono altri:</p>
        <ul>
          <li><strong>Arbitro Assicurativo</strong>, per le controversie di valore contenuto, con procedura gratuita per il consumatore;</li>
          <li><strong>Negoziazione assistita</strong>, obbligatoria prima della causa in materia di risarcimento da circolazione di veicoli;</li>
          <li><strong>Giudice ordinario</strong>, per il resto.</li>
        </ul>

        <h4>I tre errori che affossano un reclamo valido</h4>
        <ol>
          <li><strong>Scriverlo per email ordinaria:</strong> senza PEC o raccomandata non hai prova della data, e i 45 giorni non decorrono.</li>
          <li><strong>Raccontare i fatti in ordine sparso:</strong> date, numeri di sinistro e importi in sequenza valgono più di tre pagine di argomentazioni.</li>
          <li><strong>Non allegare nulla:</strong> un reclamo senza documenti riceve una risposta interlocutoria e ricomincia da capo.</li>
        </ol>

        <p>Se il rapporto è nato tramite un intermediario iscritto al RUI, coinvolgilo: ha accesso diretto ai referenti della compagnia e spesso risolve prima che i 45 giorni scadano.</p>
      `
    },
    {
      id: "k8",
      cat: "Auto",
      keyword: "risarcimento sinistro troppo basso cosa fare",
      titolo: "Risarcimento troppo basso: come contestare la perizia",
      volume: "≈ 500–1.500/mese",
      difficolta: "Bassa",
      intento: "Procedurale, alto valore economico",
      data: "2026-07-31",
      domanda: "Il risarcimento offerto è troppo basso: posso contestare la perizia?",
      meta: "Sì, e non sei obbligato ad accettare. Perito di parte, quietanza da non firmare e i passaggi per ottenere di più.",
      risposta: `
        <p><strong>Sì, puoi contestarla, e soprattutto non sei obbligato ad accettare la prima offerta.</strong> La perizia della compagnia è una valutazione di parte, non una sentenza. La regola d'oro è una sola: <strong>non firmare la quietanza finché non sei convinto</strong>, perché con quella firma dichiari il sinistro chiuso e rinunci a chiedere altro.</p>

        <h4>Cosa fare, in ordine</h4>
        <ol>
          <li><strong>Chiedi la perizia per iscritto.</strong> Hai diritto a conoscere come è stato calcolato l'importo: voci, valori, coefficienti applicati.</li>
          <li><strong>Confronta con preventivi reali.</strong> Due o tre preventivi di carrozzerie o di imprese sono il modo più semplice per dimostrare uno scostamento.</li>
          <li><strong>Nomina un perito di parte.</strong> Costa in genere qualche centinaio di euro e in molti casi si ripaga da solo. Molte polizze prevedono il <strong>rimborso delle spese peritali</strong>: controlla, spesso c'è e nessuno lo usa.</li>
          <li><strong>Attiva la tutela legale</strong>, se ce l'hai in polizza: copre perito e avvocato, e ha un massimale spesso ampio.</li>
          <li><strong>Formalizza la contestazione</strong> con una richiesta motivata di riesame, allegando la perizia di parte.</li>
        </ol>

        <h4>Le voci che vengono dimenticate più spesso</h4>
        <ul>
          <li><strong>Svalutazione commerciale</strong> del veicolo incidentato, su danni rilevanti;</li>
          <li><strong>Fermo tecnico</strong>, per i giorni in cui non hai potuto usare il mezzo;</li>
          <li><strong>Spese di soccorso, custodia e demolizione</strong>;</li>
          <li>sul danno alla persona, il <strong>danno morale</strong> e la <strong>personalizzazione</strong> del danno biologico, che non sono automatici e vanno chiesti.</li>
        </ul>

        <h4>Quando conviene fermarsi</h4>
        <p>Se lo scostamento è di poche centinaia di euro e ti hanno già offerto una cifra coerente con i preventivi, insistere costa più di quanto rende. Se invece parliamo di migliaia di euro, di danno alla persona o di un veicolo dichiarato antieconomico, il confronto tecnico ha quasi sempre senso. Un intermediario iscritto al RUI può leggere la perizia con te e dirti in mezz'ora da che parte pende il conto.</p>
      `
    },
    {
      id: "k9",
      cat: "Casa",
      keyword: "polizza catastrofale immobile affittato chi paga",
      titolo: "Polizza catastrofale su immobile affittato: chi paga",
      volume: "≈ 250–800/mese",
      difficolta: "Molto bassa",
      intento: "Informativo → consulenza",
      data: "2026-07-31",
      domanda: "Ho un immobile affittato a un'impresa: la polizza catastrofale la pago io o l'inquilino?",
      meta: "Dipende da chi ha il bene a bilancio. Proprietario, inquilino e il caso più frequente: entrambi, su cose diverse.",
      risposta: `
        <p><strong>L'obbligo segue chi ha il bene iscritto tra le immobilizzazioni materiali di bilancio.</strong> Se il fabbricato è tuo, l'obbligo sul fabbricato è tuo; l'impresa che lo occupa deve assicurare ciò che è suo — impianti, macchinari e attrezzature che ha installato. Nel caso più frequente <strong>entrambi hanno un obbligo, su cose diverse</strong>, ed è per questo che la domanda genera tanta confusione.</p>

        <h4>Come si divide, in pratica</h4>
        <ul>
          <li><strong>Proprietario (impresa o società immobiliare):</strong> terreni e fabbricati iscritti a bilancio.</li>
          <li><strong>Conduttore:</strong> impianti, macchinari, attrezzature di sua proprietà presenti nell'immobile, comprese le migliorie capitalizzate su bene di terzi.</li>
          <li><strong>Persona fisica che affitta a un'impresa:</strong> non ha immobilizzazioni d'impresa, quindi <strong>l'obbligo di legge non lo riguarda</strong>. Il che non significa che sia protetto: senza copertura, un evento catastrofale sul fabbricato resta a suo carico per intero.</li>
        </ul>

        <h4>Il punto che il contratto d'affitto deve chiarire</h4>
        <p>Un contratto ben scritto dice espressamente <strong>chi assicura cosa</strong>, con quali massimali, e prevede la <strong>rinuncia alla rivalsa</strong> reciproca tra le parti. Senza quella clausola, dopo un sinistro l'assicuratore di uno può rivalersi sull'altro: il classico contenzioso tra proprietario e inquilino che entrambi credevano impossibile.</p>

        <h4>Da controllare subito</h4>
        <ol>
          <li>Che cosa risulta esattamente nelle <strong>immobilizzazioni materiali</strong> del tuo bilancio.</li>
          <li>Se il contratto d'affitto contiene già obblighi assicurativi, e se sono conformi al nuovo obbligo.</li>
          <li>Che i <strong>valori assicurati siano aggiornati</strong>: se fermi al costo storico, in caso di sinistro scatta la regola proporzionale e l'indennizzo viene ridotto.</li>
          <li>Se hai <strong>bandi o incentivi pubblici</strong> in programma: senza polizza conforme la domanda viene respinta e le agevolazioni già concesse possono essere revocate.</li>
        </ol>

        <p>È la materia in cui una lettura incrociata di bilancio e contratto d'affitto vale più di qualunque preventivo online: falla fare a un intermediario prima di firmare.</p>
      `
    }
  ];

  /* ---- Utility ---- */
  const stripHtml = html => html
    .replace(/<\/(p|li|h4|ol|ul)>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  window.STAFF_FAQS = STAFF.map(s => ({ ...s, testo: stripHtml(s.risposta) }));
})();
