/* ============================================================
   QuotaFacile — Intermediari in vetrina (QuotaPass)
   ------------------------------------------------------------
   Elenco editoriale degli intermediari pubblicati sul portale.
   È la fonte di verità: viene risincronizzato ad ogni avvio, così
   una modifica qui si riflette su tutti i visitatori anche se
   hanno già dati nel localStorage. I punti e le risposte
   accumulati da ciascuno vengono preservati.

   ⚠️ NUMERO RUI — SEGNAPOSTO PROVVISORIO
   I due numeri sono `E000000000`: un segnaposto riconoscibile a
   colpo d'occhio, non un numero verosimile. Il motivo è pratico,
   non formale: i numeri RUI sono assegnati in sequenza, quindi
   un numero "credibile" inventato è quasi certamente il numero
   di un altro professionista realmente iscritto, e finirebbe
   attribuito a Di Falco e Gorgone su un sito pubblico in un
   settore vigilato.
   Con il segnaposto la scheda è completa e il sito pubblicabile,
   ma `statoVerifica` resta "in_attesa": la tessera mostra
   "In verifica", non il badge "✓ Verificato RUI".
   Appena hai i numeri veri (https://servizi.ivass.it/RuirPubblica/)
   sostituiscili e porta `statoVerifica` a "verificato".

   ⚠️ CAMPI «...»
   Sono i dati che mi mancano. Compilali e spariscono i marcatori
   gialli dalla tessera.
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
      ruiDal: "2021-06-21",         // data comunicata dal titolare
      rui: "E000000000",            // ← SEGNAPOSTO: sostituire col numero reale
      statoVerifica: "in_attesa",
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
      ruiDal: "2022-03-15",         // ← data provvisoria, da confermare
      rui: "E000000000",            // ← SEGNAPOSTO: sostituire col numero reale
      statoVerifica: "in_attesa",
      operaPerConto: "«intermediario di sez. A, B o D per cui opera»",
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
     pubblico. La sola presenza di un numero non basta: potrebbe
     essere un segnaposto, come lo è adesso. */
  window.INTERMEDIARI = INTERMEDIARI.map(i => ({
    ...i,
    statoVerifica: i.statoVerifica || "in_attesa",
    verificato: i.statoVerifica === "verificato" && !!i.rui
  }));
})();
