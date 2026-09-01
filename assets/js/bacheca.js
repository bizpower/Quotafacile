/* ============================================================
   QuotaFacile — Bacheca condivisa
   ------------------------------------------------------------
   Finora domande e risposte vivevano nel localStorage: ognuno
   vedeva soltanto le proprie, e per i motori di ricerca non
   esisteva nulla. Qui diventano contenuto pubblico, uguale per
   tutti i visitatori.

   Il modulo carica la bacheca una volta all'avvio e la tiene in
   memoria, così il rendering resta sincrono come prima. Dopo
   ogni scrittura ricarica e avvisa chi si è iscritto.

   Se il servizio non risponde il sito continua a funzionare:
   restano le guide del repository e le domande del giorno, che
   vivono nel codice e non dipendono dalla rete.
   ============================================================ */
"use strict";

(function () {

  const API = "https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-bacheca";
  const CHIAVE_VOTANTE = "qf_votante";

  const stato = {
    caricata: false,
    inCorso: false,
    errore: null,
    domande: [],
    perDomanda: {},
    perChiave: {}
  };

  const ascoltatori = [];
  const avvisa = () => ascoltatori.forEach(fn => { try { fn(stato); } catch (e) { /* no-op */ } });

  /* Identificativo del dispositivo, non della persona: serve solo
     a impedire che lo stesso browser voti due volte la stessa
     risposta. Non viene associato ad alcun dato personale. */
  function votante() {
    try {
      let v = localStorage.getItem(CHIAVE_VOTANTE);
      if (!v) {
        v = (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2));
        localStorage.setItem(CHIAVE_VOTANTE, v);
      }
      return v;
    } catch (e) {
      /* storage negato: il voto resta possibile, ma non ricordato */
      return "anonimo-" + Math.random().toString(36).slice(2);
    }
  }

  async function chiama(metodo, corpo) {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), 12000);
    try {
      const r = await fetch(API, {
        method: metodo,
        headers: corpo ? { "Content-Type": "application/json" } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: stop.signal
      });
      const dati = await r.json().catch(() => ({}));
      return { ok: r.ok && dati.ok === true, status: r.status, ...dati };
    } catch (e) {
      return { ok: false, status: 0, errore: e.name === "AbortError" ? "Tempo scaduto" : "Servizio non raggiungibile" };
    } finally {
      clearTimeout(t);
    }
  }

  async function carica() {
    if (stato.inCorso) return stato;
    stato.inCorso = true;
    const esito = await chiama("GET");
    stato.inCorso = false;
    if (esito.ok) {
      stato.domande = esito.domande || [];
      stato.perDomanda = esito.perDomanda || {};
      stato.perChiave = esito.perChiave || {};
      stato.caricata = true;
      stato.errore = null;
    } else {
      stato.errore = esito.errore || "Bacheca non raggiungibile";
    }
    avvisa();
    return stato;
  }

  const scrivi = azione => async dati => {
    const esito = await chiama("POST", { azione, dati });
    if (esito.ok) await carica();
    return esito;
  };

  window.QFBacheca = {
    stato,
    carica,
    votante,
    onAggiorna: fn => ascoltatori.push(fn),
    nuovaDomanda: scrivi("domanda"),
    nuovaRisposta: scrivi("risposta"),
    vota: async rispostaId => {
      const esito = await chiama("POST", { azione: "voto", dati: { rispostaId, votante: votante() } });
      if (esito.ok) await carica();
      return esito;
    },

    /* ---- Adattatori verso la forma usata dalle viste ----
       Le viste conoscono già una struttura: {id, cat, data,
       domanda, risposte:[...]}. Invece di riscriverle, i dati
       remoti vengono tradotti in quella forma. */
    risposteDi(riferimento, perChiave = false) {
      const fonte = perChiave ? stato.perChiave : stato.perDomanda;
      return (fonte[riferimento] || []).map(r => ({
        id: r.id,
        autoreNome: r.autore_nome,
        autoreRuolo: r.autore_ruolo,
        autoreAzienda: r.autore_azienda,
        autoreRui: r.autore_rui,
        testo: r.testo,
        voti: r.voti || 0,
        accettata: !!r.migliore,
        remota: true
      }));
    },

    /* Domande poste dagli utenti */
    domandeUtente() {
      return stato.domande.filter(d => d.tipo === "utente").map(d => ({
        id: "q" + d.id,
        uuid: d.id,
        cat: d.categoria,
        data: (d.creato_il || "").slice(0, 10),
        domanda: d.domanda,
        remota: true,
        risposte: window.QFBacheca.risposteDi(d.id)
      }));
    },

    /* Guide pubblicate dall'area Admin: stessa forma delle guide
       del repository, così finiscono nello stesso elenco. */
    guideRemote() {
      return stato.domande.filter(d => d.tipo === "guida").map(d => ({
        id: "g" + d.id,
        uuid: d.id,
        staff: true,
        cat: d.categoria,
        keyword: d.keyword,
        titolo: d.titolo_seo,
        meta: d.meta_seo,
        data: (d.creato_il || "").slice(0, 10),
        domanda: d.domanda,
        remota: true,
        risposte: [
          {
            autore: "qf", auto: true, staff: true, accettata: true, voti: 0,
            rich: d.risposta_redazionale,
            testo: String(d.risposta_redazionale || "")
              .replace(/<\/(p|li|h4|ol|ul)>/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
          },
          ...window.QFBacheca.risposteDi(d.id)
        ]
      }));
    }
  };
})();
