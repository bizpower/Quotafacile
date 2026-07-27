/* ============================================================
   QuotaFacile — Intermediari in vetrina (QuotaPass)
   ------------------------------------------------------------
   Elenco editoriale degli intermediari pubblicati sul portale.
   È la fonte di verità: viene risincronizzato ad ogni avvio, così
   una modifica qui si riflette su tutti i visitatori anche se
   hanno già dati nel localStorage. I punti e le risposte
   accumulati da ciascuno vengono preservati.

   ⚠️ NUMERO RUI
   Il campo `rui` è volutamente `null` finché il numero non è
   stato letto sul registro pubblico IVASS
   (https://servizi.ivass.it/RuirPubblica/).
   Finché è null la tessera mostra "RUI sez. E · in verifica"
   invece di un numero: un numero di iscrizione inventato è
   un'attestazione professionale falsa, e verrebbe letta come
   vera da chi la usa per decidere a chi affidare una polizza.
   Appena hai il numero, incollalo qui e `verificato` diventa
   automaticamente true.

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
      azienda: "«Ragione sociale dell'intermediario di riferimento»",
      /* Sezione E: collaboratore di un intermediario iscritto in
         sezione A, B o D, che risponde di lui verso l'IVASS. */
      ruiSezione: "E",
      ruiDal: "2021-06-21",
      rui: null,                    // ← da leggere sul RUI pubblico
      citta: "«Città»",
      tel: "«+39 ...»",
      email: "«email professionale»",
      bio: "«Due righe su come aiuti i tuoi clienti: rami di specializzazione, tipo di clientela, tempi di risposta.»",
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
      ruiDal: null,                 // ← data di iscrizione da confermare
      rui: null,                    // ← da leggere sul RUI pubblico
      citta: "«Città»",
      tel: "«+39 ...»",
      email: "«email professionale»",
      bio: "«Due righe su come aiuti i tuoi clienti: rami di specializzazione, tipo di clientela, tempi di risposta.»",
      spec: ["Impresa", "Vita", "Salute"],
      punti: 0,
      risposte: 0
    }
  ];

  /* Un profilo è "verificato" solo quando il numero RUI è stato
     letto sul registro pubblico. Mai per default. */
  window.INTERMEDIARI = INTERMEDIARI.map(i => ({
    ...i,
    verificato: !!i.rui,
    statoVerifica: i.rui ? "verificato" : "in_attesa"
  }));
})();
