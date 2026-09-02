/* ============================================================
   QuotaFacile — Intermediari in vetrina (QuotaPass)
   ------------------------------------------------------------
   Elenco editoriale degli intermediari pubblicati sul portale.
   È la fonte di verità: viene risincronizzato ad ogni avvio, così
   una modifica qui si riflette su tutti i visitatori anche se
   hanno già dati nel localStorage. I punti e le risposte
   accumulati da ciascuno vengono preservati.

   NUMERI RUI — VERIFICATI
   I due numeri sono stati letti sul registro pubblico IVASS
   (https://servizi.ivass.it/RuirPubblica/) e riscontrati per
   nominativo, sezione, data di iscrizione e data di nascita.
   Solo per questo `statoVerifica` è "verificato" e le tessere
   mostrano il badge: il badge attesta una verifica avvenuta, non
   una dichiarazione ricevuta. Se un dato cambia, si torna a
   "in_attesa" finché non lo si ricontrolla.

   ⚠️ CAMPI «...»
   Sono i dati che mancano ancora. Compilali e spariscono i
   marcatori gialli dalla tessera.
   ============================================================ */
"use strict";

(function () {

  const INTERMEDIARI = [
    {
      id: "b1",
      nome: "Riccardo Di Falco",
      ruolo: "Collaboratore",
      /* Dati da visura camerale CCIAA Milano Monza Brianza Lodi.
         È anche il gestore del sito: la circostanza è dichiarata
         nelle note legali. */
      azienda: "Di Falco Riccardo — impresa individuale",
      gestoreDelSito: true,
      /* Sezione E: collaboratore di un intermediario iscritto in
         sezione A, B o D, che risponde di lui verso l'IVASS. */
      ruiSezione: "E",
      ruiDal: "2021-06-24",         // da registro IVASS (non il 21: il registro fa fede)
      rui: "E000688335",
      statoVerifica: "verificato",
      /* La sezione E opera per conto di un intermediario iscritto in
         sezione A, B o D: il Reg. IVASS 40/2018 impone di indicarlo
         nelle comunicazioni rivolte al pubblico. */
      operaPerConto: "Colombo & Partners S.r.l., Cernusco sul Naviglio (MI)",
      citta: "Opera (MI)",
      tel: "«+39 ...»",
      email: "r.difalco@lori-crm.it",
      bio: "Addetto all'intermediazione assicurativa fuori dei locali dell'intermediario, iscritto alla sezione E del RUI dal giugno 2021.",
      spec: ["Auto", "Casa", "Vita"],
      punti: 0,
      risposte: 0
    },
    {
      id: "b2",
      nome: "Emanuele Gorgone",
      ruolo: "Collaboratore",
      azienda: "«Ragione sociale dell'intermediario di riferimento»",
      ruiSezione: "E",
      ruiDal: "2023-07-25",         // da registro IVASS
      rui: "E000733718",
      statoVerifica: "verificato",
      /* Il registro riporta l'intermediario per cui opera un
         iscritto di sezione E, ma quel dato non è ancora stato
         riportato qui: finché manca la riga non compare, invece
         di mostrare un segnaposto o una supposizione. */
      operaPerConto: null,
      citta: "«Città»",
      tel: "«+39 ...»",
      email: "«email professionale»",
      bio: "«Due righe su come aiuti i tuoi clienti: rami di specializzazione, tipo di clientela, tempi di risposta.»",
      spec: ["Impresa", "Vita", "Salute"],
      punti: 0,
      risposte: 0
    }
  ];

  /* Un profilo è "verificato" solo quando statoVerifica è stato
     portato a "verificato" a mano, dopo il riscontro sul registro
     pubblico. La sola presenza di un numero non basta: un numero
     si scrive, un riscontro si fa. */
  window.INTERMEDIARI = INTERMEDIARI.map(i => ({
    ...i,
    statoVerifica: i.statoVerifica || "in_attesa",
    verificato: i.statoVerifica === "verificato" && !!i.rui
  }));
})();
