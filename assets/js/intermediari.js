/* ============================================================
   QuotaFacile — Intermediari in vetrina (QuotaPass)
   ------------------------------------------------------------
   Elenco editoriale degli intermediari pubblicati sul portale.
   È la fonte di verità: viene risincronizzato ad ogni avvio, così
   una modifica qui si riflette su tutti i visitatori anche se
   hanno già dati nel localStorage. I punti e le risposte
   accumulati da ciascuno vengono preservati.

   NUMERI RUI — VERIFICATI
   I numeri sono stati letti sul registro pubblico IVASS
   (https://servizi.ivass.it/RuirPubblica/) e riscontrati per
   nominativo, sezione, data di iscrizione e data di nascita.
   Solo per questo `statoVerifica` è "verificato" e le tessere
   mostrano il badge: il badge attesta una verifica avvenuta, non
   una dichiarazione ricevuta. Se un dato cambia, si torna a
   "in_attesa" finché non lo si ricontrolla.

   IL GESTORE DEL SITO NON È IN VETRINA
   C'era anche la tessera di Riccardo Di Falco, che QuotaFacile la
   gestisce. Essere insieme l'arbitro e un giocatore obbligava a
   dichiararlo in tre documenti e in due pagine, e restava
   comunque la domanda che nessuna dichiarazione toglie: chi
   decide l'ordine dei profili ci compare dentro.
   Togliendola la domanda non si pone. Il fatto che il gestore sia
   un intermediario iscritto resta dichiarato dov'era — è vero e
   va detto — ma non è più un profilo fra quelli che l'utente
   confronta.

   ⚠️ CAMPI «...»
   Sono i dati che mancano ancora. Compilali e spariscono i
   marcatori gialli dalla tessera.
   ============================================================ */
"use strict";

(function () {

  const INTERMEDIARI = [
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
