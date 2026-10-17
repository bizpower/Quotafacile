/* ============================================================
   QuotaFacile — I dati del titolare, e basta
   ------------------------------------------------------------
   Stavano dentro legal.js, insieme ai testi delle informative:
   cinquantotto kilobyte che ogni visitatore scaricava su ogni
   pagina — la home, una guida, la scheda di un intermediario —
   per un oggetto di tre kilobyte che serve davvero dappertutto.

   Serve dappertutto perché i dati strutturati di ogni pagina
   dichiarano chi è l'editore: ragione sociale, partita IVA,
   sede. Senza, il grafo schema.org resta anonimo.

   I testi invece servono su sette rotte sole, e adesso arrivano
   quando ci si va: li carica app.js, come già fa con l'area
   riservata.

   ⚠️ I campi marcati con «...» sono da compilare. Finché
   restano così, le pagine legali mostrano un avviso giallo:
   nessun dato societario inventato viene pubblicato al posto di
   quelli reali.
   ============================================================ */
"use strict";

window.QF_LEGAL_DATI = {
  brand: "QuotaFacile",
  dominio: "www.quotafacile.net",

  /* Identità del titolare del trattamento / gestore del sito.
     Dati da visura camerale CCIAA Milano Monza Brianza Lodi. */
  ragioneSociale: "Riccardo Di Falco — impresa individuale",
  /* Via comunicata dal titolare; comune, provincia e CAP sono quelli
     della sede risultante in visura. Da confermare se il
     trasferimento ha comportato anche un cambio di comune. */
  sedeLegale: "Via Gramsci 16, 20073 Opera (MI), Italia",
  piva: "11784600964",
  cf: "DFLRCR00H02F205X",
  rea: "MI - 2633479",
  pec: "riccardo.difalco@pec.it",
  foro: "Milano",

  /* Il sito è gestito da un intermediario iscritto al RUI: è un fatto
     che va dichiarato, non taciuto. Vedi la sezione "Natura
     dell'attività" delle Note legali. */
  gestoreIntermediario: {
    nome: "Riccardo Di Falco",
    sezioneRui: "E",
    numeroRui: "E000688335",         // letto sul RUI pubblico
    iscrittoDal: "2021-06-24",       // idem: il registro fa fede
    attivita: "addetto all'intermediazione assicurativa fuori dei locali dell'intermediario",
    ateco: "66.22.03 — sub-agenti di assicurazioni",
    /* La sezione E opera per conto di un intermediario iscritto in
       sezione A, B o D, che risponde di lui verso l'IVASS: il
       Reg. IVASS 40/2018 ne impone l'indicazione nelle comunicazioni. */
    operaPerConto: "Colombo & Partners S.r.l., Cernusco sul Naviglio (MI)"
  },

  /* Contatti operativi (devono essere caselle realmente attive)
   *
   * Erano tre indirizzi di servizio — info@, privacy@,
   * segnalazioni@ — e nessuno dei tre esisteva. Non era un
   * dettaglio: privacy@ era la via d'uscita che l'art. 21 GDPR
   * pretende sia facile; segnalazioni@ era dichiarato come punto
   * di contatto DSA; info@ finiva anche nello schema.org come
   * email dell'organizzazione, cioè in un dato strutturato che
   * dichiarava il falso. Tre recapiti che non rispondevano a
   * nessuno, in tre documenti che promettevano che qualcuno
   * rispondesse.
   *
   * Ora puntano tutti e tre alla casella del Titolare, che
   * esiste e si legge. Restano tre voci distinte, non una, così
   * il giorno in cui le caselle di servizio verranno create si
   * cambia una riga per volta senza rimettere mano ai testi: è
   * il motivo per cui erano costanti e non stringhe sparse.
   */
  emailInfo: "r.difalco@quotafacile.net",
  emailPrivacy: "r.difalco@quotafacile.net",
  emailSegnalazioni: "r.difalco@quotafacile.net",

  /* Responsabile Protezione Dati: null se non nominato (non obbligatorio
     per questa tipologia di trattamento, art. 37 GDPR) */
  dpo: null,

  /* Infrastruttura */
  hosting: "GitHub Pages — GitHub Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA (USA), gruppo Microsoft",
  hostingNota: "Fornitore aderente al EU-U.S. Data Privacy Framework",

  /* Cambia quando cambia il testo, non quando cambia il codice.
     La 1.3 era il passaggio del fornitore della scrittura
     assistita da Anthropic a Google. La 1.4 è la lettura della
     pagina iniziale del sito dell'azienda destinataria: una
     categoria di dati in più, quindi modifica sostanziale. */
  ultimoAggiornamento: "2 ottobre 2026",
  versione: "1.4"
};

