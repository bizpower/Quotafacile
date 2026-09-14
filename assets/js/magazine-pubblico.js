/* ============================================================
   QuotaFacile — Magazine, lato pubblico
   ------------------------------------------------------------
   Carica una volta l'elenco degli articoli pubblicati e lo tiene
   in memoria, così le viste restano sincrone come il resto del
   sito. Il corpo di un articolo non è nell'elenco — sarebbe
   mezzo megabyte per mostrare una lista — e si chiede quando
   serve, una volta per articolo.

   Se il servizio non risponde il sito continua a funzionare: le
   pagine del Magazine sono già scritte dal deploy, e quello che
   si perde è soltanto l'aggiornamento fra un deploy e l'altro.
   ============================================================ */
"use strict";

(function () {

  const API = "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-magazine";

  const stato = {
    caricata: false,
    inCorso: false,
    errore: null,
    articoli: [],
    categorie: [],
    corpi: {}       // slug → articolo completo, una volta chiesto
  };

  const ascoltatori = [];
  const avvisa = () => ascoltatori.forEach(fn => { try { fn(stato); } catch (e) { /* no-op */ } });

  async function prendi(url) {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), 12000);
    try {
      const r = await fetch(url, { signal: stop.signal });
      const dati = await r.json().catch(() => ({}));
      return r.ok && dati.ok === true ? dati : { ok: false };
    } catch (e) {
      return { ok: false };
    } finally {
      clearTimeout(t);
    }
  }

  async function carica() {
    if (stato.inCorso || stato.caricata) return stato;
    stato.inCorso = true;
    const esito = await prendi(API);
    stato.inCorso = false;
    if (esito.ok) {
      stato.articoli = esito.articoli || [];
      stato.categorie = esito.categorie || [];
      stato.caricata = true;
      stato.errore = null;
    } else {
      stato.errore = "Magazine non raggiungibile";
    }
    avvisa();
    return stato;
  }

  /* Il corpo di un articolo. Si chiede una volta sola: la seconda
     visita alla stessa pagina non ripassa dalla rete, e tornare
     indietro dall'elenco è istantaneo. La promessa in corso viene
     ricordata, altrimenti due render ravvicinati — cosa normale
     in questa applicazione — partirebbero con due richieste
     uguali. */
  const inArrivo = {};
  function articolo(slug) {
    if (!slug) return null;
    if (stato.corpi[slug] !== undefined) return stato.corpi[slug];
    if (!inArrivo[slug]) {
      inArrivo[slug] = prendi(API + "?slug=" + encodeURIComponent(slug)).then(e => {
        /* null e non undefined: "chiesto, non esiste". Senza
           questa distinzione la pagina continuerebbe a richiedere
           all'infinito un articolo che non c'è. */
        stato.corpi[slug] = e.ok && e.articolo ? { ...e.articolo, correlati: e.correlati || [] } : null;
        delete inArrivo[slug];
        avvisa();
      });
    }
    return undefined;
  }

  window.QFMagazine = {
    stato,
    carica,
    articolo,
    onAggiorna: fn => ascoltatori.push(fn),
    categoria: id => stato.categorie.find(c => c.id === id) || null
  };
})();
