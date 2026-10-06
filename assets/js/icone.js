/* ============================================================
   QuotaFacile — le icone del sito pubblico
   ------------------------------------------------------------
   Icone disegnate, non emoji.

   PERCHE'
   Un'emoji non è un'icona: è un carattere, e lo disegna il
   sistema operativo di chi guarda. La stessa 🛡️ è un piatto
   azzurro su Windows, un distintivo giallo su Android e uno
   scudo grigio su macOS — tre immagini diverse nella stessa
   pagina, nessuna scelta da noi. E quelle espressive (✨ 🏆 🙋
   👏 🍪) portano un tono da chat che su un sito che parla di
   polizze lavora contro.

   COME SONO FATTE
   Tratto, non pieno. 24×24, spessore 1.8, estremi arrotondati:
   un'unica famiglia, così due icone accanto sembrano disegnate
   dalla stessa mano.

   1.8 non è un numero scelto a caso: è lo spessore che la barra
   di navigazione in fondo (.tabbar in style.css) usava già da
   prima. Era l'unico posto del sito con icone disegnate invece
   che emoji, e allinearsi a lei era meglio che chiederle di
   allinearsi a noi — così il set non ha un «prima» e un «dopo».

   Due regole che fanno tutto il lavoro:
     - currentColor: l'icona prende il colore del testo che
       accompagna. Dentro un bottone verde diventa bianca da
       sola, in un avviso rosso diventa rossa. Nessuna variante
       da mantenere.
     - width/height in em: cresce col testo. La stessa icona sta
       in un titolo e in una didascalia senza due classi.

   ACCESSIBILITA'
   Tutte aria-hidden. Non è pigrizia: qui un'icona sta sempre
   accanto alla sua parola («📞 CHIAMA» diventa icona + «CHIAMA»),
   oppure dentro un bottone che ha già il suo aria-label. Fare
   leggere anche l'icona vorrebbe dire sentire la stessa cosa due
   volte.

   NIENTE LIBRERIE
   Il progetto non ha passo di build e non ha dipendenze: queste
   restano stringhe in un file, caricato come gli altri. Un set di
   icone scaricato sarebbe centinaia di glifi per usarne trenta.

   AGGIUNGERE UN'ICONA
   Una voce in DISEGNI con il contenuto dentro al viewBox 24×24.
   Niente attributi di colore o di spessore nel tracciato: li
   mette involucro() per tutte, ed è il motivo per cui restano
   coerenti.
   ============================================================ */

(function () {
  "use strict";

  /* I tracciati. Solo il contenuto: nessun colore, nessuno
     spessore, nessuna dimensione — quelli valgono per tutte e
     stanno in involucro(). */
  var DISEGNI = {

    // ---------- Contatti ----------
    telefono:
      '<path d="M6.3 3h3.1l1.6 4-2.1 1.5a12.2 12.2 0 0 0 6.6 6.6L17 13l4 1.6v3.1a2 2 0 0 1-2.2 2A16.8 16.8 0 0 1 3.3 5.2 2 2 0 0 1 5.3 3Z"/>',

    telefonino:
      '<rect x="7" y="2.5" width="10" height="19" rx="2.4"/>' +
      '<path d="M10.6 5.4h2.8"/><path d="M12 18.4h.01"/>',

    busta:
      '<rect x="3" y="5.2" width="18" height="13.6" rx="2"/>' +
      '<path d="m3.8 7 7.1 5.3a1.8 1.8 0 0 0 2.2 0L20.2 7"/>',

    posta:
      '<path d="M3 13.2h4.6l1.5 2.8h5.8l1.5-2.8H21"/>' +
      '<path d="M3 13.2 6.2 5.4h11.6L21 13.2v5.4H3Z"/>',

    chat:
      '<path d="M20.5 11.6c0 4.4-3.8 7.9-8.5 7.9a9.6 9.6 0 0 1-3.3-.6L3.5 20.5l1.6-4.2a7.6 7.6 0 0 1-1.6-4.7c0-4.4 3.8-7.9 8.5-7.9s8.5 3.5 8.5 7.9Z"/>',

    // ---------- Riconoscimenti ----------
    stella:
      '<path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9Z" ' +
      'fill="currentColor" stroke="none"/>',

    stella_vuota:
      '<path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9Z"/>',

    trofeo:
      '<path d="M8 3.8h8v4.9a4 4 0 0 1-8 0Z"/>' +
      '<path d="M8 5.6H5.6a2.4 2.4 0 0 0 2.6 3.9"/>' +
      '<path d="M16 5.6h2.4a2.4 2.4 0 0 1-2.6 3.9"/>' +
      '<path d="M12 12.7v3.6"/><path d="M8.4 20.2h7.2l-.9-3.9H9.3Z"/>',

    medaglia:
      '<circle cx="12" cy="14.6" r="5.6"/>' +
      '<path d="m9.3 9.6-2.9-6.4h11.2l-2.9 6.4"/>' +
      '<path d="M12 12.6v4"/>',

    // ---------- Esiti ----------
    spunta:
      '<path d="m4.8 12.6 4.9 4.9L19.3 6.8"/>',

    spunta_cerchio:
      '<circle cx="12" cy="12" r="8.8"/><path d="m8 12.4 2.8 2.8 5.3-5.9"/>',

    chiudi:
      '<path d="m6.3 6.3 11.4 11.4"/><path d="m17.7 6.3L6.3 17.7"/>',

    avviso:
      '<path d="M12 3.9 21.2 19.8H2.8Z"/>' +
      '<path d="M12 9.6v4.2"/><path d="M12 16.9h.01"/>',

    vietato:
      '<circle cx="12" cy="12" r="8.8"/><path d="m6.2 17.8 11.6-11.6"/>',

    // ---------- Frecce e navigazione ----------
    freccia_destra:
      '<path d="M4 12h14.6"/><path d="m12.8 6.2 5.8 5.8-5.8 5.8"/>',

    freccia_sinistra:
      '<path d="M20 12H5.4"/><path d="m11.2 6.2-5.8 5.8 5.8 5.8"/>',

    freccia_su:
      '<path d="M12 19.4V5.2"/><path d="m6 11.2 6-6 6 6"/>',

    ricarica:
      '<path d="M20.4 11.4A8.4 8.4 0 0 0 6.2 6.6L3.6 9"/>' +
      '<path d="M3.6 4.2V9h4.8"/>' +
      '<path d="M3.6 12.6a8.4 8.4 0 0 0 14.2 4.8l2.6-2.4"/>' +
      '<path d="M20.4 19.8V15h-4.8"/>',

    // ---------- Settori assicurativi ----------
    /* Le due diagonali sono il parabrezza e il lunotto: senza,
       la linea di cintura taglia la sagoma in due e quello che
       resta somiglia a una panchina con le ruote. */
    auto:
      '<path d="M4.2 15.4v-2.6l1.9-4.3a1.6 1.6 0 0 1 1.5-1h8.8a1.6 1.6 0 0 1 1.5 1l1.9 4.3v2.6"/>' +
      '<path d="M3.4 12.8h17.2"/>' +
      '<path d="M9.4 7.5 8.3 12.8"/><path d="m14.6 7.5 1.1 5.3"/>' +
      '<circle cx="7.4" cy="16.4" r="1.8"/><circle cx="16.6" cy="16.4" r="1.8"/>',

    casa:
      '<path d="m3.4 10.6 8.6-7 8.6 7"/><path d="M5.9 9.4V20.4h12.2V9.4"/>' +
      '<path d="M10 20.4v-5.6h4v5.6"/>',

    cuore:
      '<path d="M12 20.1c-1.5-1-7.6-5-7.6-9.6a4.3 4.3 0 0 1 7.6-2.7 4.3 4.3 0 0 1 7.6 2.7c0 4.6-6.1 8.6-7.6 9.6Z"/>',

    salute:
      '<path d="M3 12.4h3.6l1.9-5.1 3.2 10.4 2.4-5.3h6.9"/>',

    edificio:
      '<rect x="5.2" y="3.2" width="13.6" height="17.6" rx="1.6"/>' +
      '<path d="M9 7.4h2"/><path d="M13 7.4h2"/>' +
      '<path d="M9 11.4h2"/><path d="M13 11.4h2"/>' +
      '<path d="M10.4 20.8v-4.4h3.2v4.4"/>',

    aereo:
      '<path d="M21 3.4 3.4 10.7l6.8 2.9 2.9 6.8Z"/><path d="m10.2 13.6L21 3.4"/>',

    // ---------- Fiducia e identità ----------
    scudo:
      '<path d="M12 3.2 4.6 6.1v5.4c0 4.2 3 8 7.4 9.3 4.4-1.3 7.4-5.1 7.4-9.3V6.1Z"/>' +
      '<path d="m9.2 11.9 2.2 2.2 4.3-4.6"/>',

    lucchetto:
      '<rect x="4.8" y="10.8" width="14.4" height="10" rx="2.2"/>' +
      '<path d="M8.4 10.8V7.9a3.6 3.6 0 0 1 7.2 0v2.9"/>' +
      '<path d="M12 14.6v2.4"/>',

    tessera:
      '<rect x="2.8" y="4.8" width="18.4" height="14.4" rx="2.2"/>' +
      '<circle cx="8.6" cy="11" r="2.1"/>' +
      '<path d="M6 16.4a3 3 0 0 1 5.2 0"/>' +
      '<path d="M14.6 10.2h4"/><path d="M14.6 13.6h4"/>',

    // ---------- Contenuti ----------
    documento:
      '<path d="M6.2 3.2h7l4.6 4.6v13H6.2Z"/><path d="M13.2 3.2v4.6h4.6"/>' +
      '<path d="M9 12.4h6"/><path d="M9 15.8h6"/>',

    segnalibro:
      '<path d="M6.4 3.6h11.2v17L12 16.4l-5.6 4.2Z"/>',

    bandiera:
      '<path d="M5.6 3.2v17.6"/>' +
      '<path d="M5.6 4.6h11.2l-1.9 4.1 1.9 4.1H5.6Z"/>',

    lente:
      '<circle cx="10.8" cy="10.8" r="6.6"/><path d="m15.6 15.6 4.8 4.8"/>',

    occhio:
      '<path d="M2.4 12S6 6.2 12 6.2 21.6 12 21.6 12 18 17.8 12 17.8 2.4 12 2.4 12Z"/>' +
      '<circle cx="12" cy="12" r="2.8"/>',

    grafico:
      '<path d="M3.4 20.6h17.2"/>' +
      '<path d="M7 20.6v-5.4"/><path d="M12 20.6V8.8"/><path d="M17 20.6v-8.4"/>',

    // ---------- Persone ----------
    persona:
      '<circle cx="12" cy="8" r="3.6"/><path d="M5.2 20.4a6.8 6.8 0 0 1 13.6 0"/>',

    persone:
      '<circle cx="9.2" cy="8.2" r="3.4"/>' +
      '<path d="M3 20.4a6.2 6.2 0 0 1 12.4 0"/>' +
      '<path d="M16.4 5.2a3.4 3.4 0 0 1 0 6.4"/>' +
      '<path d="M18.2 19a5.6 5.6 0 0 0-2.4-4.3"/>',

    // ---------- Denaro ----------
    euro:
      '<path d="M18 7.3a6.9 6.9 0 1 0 0 9.4"/>' +
      '<path d="M4.4 10.4h8.4"/><path d="M4.4 13.6h8.4"/>',

    // ---------- Varie ----------
    sole:
      '<circle cx="12" cy="12" r="4"/>' +
      '<path d="M12 2.6v2.2"/><path d="M12 19.2v2.2"/>' +
      '<path d="M2.6 12h2.2"/><path d="M19.2 12h2.2"/>' +
      '<path d="m5.4 5.4 1.6 1.6"/><path d="m17 17 1.6 1.6"/>' +
      '<path d="m18.6 5.4-1.6 1.6"/><path d="m7 17-1.6 1.6"/>',

    scintilla:
      '<path d="m11 3.6 1.5 4.2 4.2 1.5-4.2 1.5L11 15l-1.5-4.2L5.3 9.3l4.2-1.5Z"/>' +
      '<path d="m17.8 14.2.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/>',

    /* Due cerchi concentrici, e i denti corti e fuori dal corpo.
       E' quello che lo distingue dal sole: il sole ha un disco
       solo e raggi lunghi che partono da lontano, l'ingranaggio
       ha un mozzo dentro una corona. Con i soli raggi le due
       icone erano la stessa immagine. */
    ingranaggio:
      '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/>' +
      '<path d="M12 3.1v1.9"/><path d="M12 19v1.9"/>' +
      '<path d="M3.1 12H5"/><path d="M19 12h1.9"/>' +
      '<path d="m5.7 5.7 1.4 1.4"/><path d="m16.9 16.9 1.4 1.4"/>' +
      '<path d="m18.3 5.7-1.4 1.4"/><path d="m7.1 16.9-1.4 1.4"/>',

    /* Per «gestisci le preferenze» due cursori dicono la cosa
       giusta meglio di un ingranaggio: non si va a sistemare un
       meccanismo, si sposta una scelta fra due posizioni. */
    cursori:
      '<path d="M4 7.4h10"/><path d="M18 7.4h2"/>' +
      '<path d="M4 16.6h4"/><path d="M12 16.6h8"/>' +
      '<circle cx="16" cy="7.4" r="2.1"/><circle cx="10" cy="16.6" r="2.1"/>',

    biscotto:
      '<circle cx="12" cy="12" r="8.8"/>' +
      '<circle cx="9.4" cy="9.6" r="1" fill="currentColor" stroke="none"/>' +
      '<circle cx="14.8" cy="10.8" r="1" fill="currentColor" stroke="none"/>' +
      '<circle cx="10.4" cy="14.8" r="1" fill="currentColor" stroke="none"/>' +
      '<circle cx="14.4" cy="15.2" r="1" fill="currentColor" stroke="none"/>',

    microfono:
      '<rect x="9.4" y="2.8" width="5.2" height="10.4" rx="2.6"/>' +
      '<path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0"/>' +
      '<path d="M12 17.8v3.4"/>',

    attesa:
      '<circle cx="12" cy="12" r="8.8"/><path d="M12 7.2V12l3.4 2"/>',
  };

  /* L'involucro, uguale per tutte: è questo che rende il set un
     set e non trenta disegni scollegati.

     1em invece di una misura fissa perché l'icona accompagna
     sempre del testo, e deve crescere con lui: la stessa voce
     dentro un titolo e dentro una didascalia, senza due classi.

     aria-hidden perché accanto c'è sempre la parola, o un
     aria-label sul bottone. */
  function involucro(contenuto, classe) {
    return '<svg class="qf-ico' + (classe ? " " + classe : "") + '" ' +
      'viewBox="0 0 24 24" width="1em" height="1em" ' +
      'fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false">' + contenuto + "</svg>";
  }

  /* Un nome sbagliato non deve svuotare la pagina in silenzio:
     in console si vede, a schermo resta un posto vuoto della
     misura giusta, così il resto della riga non si sposta. */
  function ico(nome, classe) {
    var d = DISEGNI[nome];
    if (!d) {
      if (typeof console !== "undefined") {
        console.warn("[icone] nome sconosciuto:", nome);
      }
      return involucro("", classe);
    }
    return involucro(d, classe);
  }

  window.QF_ICONE = { ico: ico, elenco: Object.keys(DISEGNI) };
})();
