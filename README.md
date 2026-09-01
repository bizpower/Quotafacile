# QuotaFacile — Il Marketplace delle Assicurazioni in Italia

Piattaforma web (mobile-first, stile app) dove **intermediari assicurativi** (agenti, broker, subagenti) mettono in vetrina il proprio profilo — la **QuotaPass**, una tessera professionale con numero RUI e specializzazioni — e gli **utenti** possono contattarli, richiedere preventivi e consulenze.

Il cuore SEO del portale è la **Bacheca Q&A gamificata**: gli intermediari rispondono alle domande assicurative degli utenti, guadagnano punti/badge e salgono in classifica. Ogni Q&A genera contenuto originale con markup `schema.org/FAQPage`, ovvero contenuto indicizzabile che lavora per il portale.

## Struttura

```
quotafacile/
├── index.html                    # Shell dell'app, meta SEO, JSON-LD, header/footer/tabbar
├── assets/
│   ├── css/style.css             # Design system (verde professionale + oro gamification)
│   ├── js/app.js                 # Router, store, viste, gamification, motore giornaliero
│   ├── js/daily-questions.js     # ⭐ Pool 200 domande "del giorno" (qui vanno le tue keyword)
│   ├── js/staff-questions.js     # 📌 Guide QuotaFacile: keyword SEO posizionate in bacheca
│   ├── js/intermediari.js        # 🪪 Intermediari in vetrina (fonte di verità delle QuotaPass)
│   ├── js/mailer.js              # 📬 Invio dei contatti alla Edge Function Supabase
│   ├── js/admin.js               # 🔐 Console riservata (#/admin): KPI, moderazione, keyword
│   ├── js/legal.js               # ⚖️ Privacy, Cookie Policy, T&C, Note legali (+ LEGAL_CONFIG)
│   └── js/consent.js             # 🍪 Cookie banner e centro preferenze (CMP)
├── .github/workflows/            # Pubblicazione su Pages, attivazione casella email
├── llms.txt                      # 🤖 Presentazione del sito per i motori generativi
├── vercel.json                   # Intestazioni di sicurezza e cache
├── robots.txt                    # Include le regole per i crawler AI
├── sitemap.xml
└── README.md
```

Zero dipendenze, zero build: HTML + CSS + JS vanilla. Funziona aprendo `index.html` o servendo la cartella.

## ☀️ Sistema "Domanda del giorno" (200 giorni)

Ogni giorno alle 00:00 viene pubblicata automaticamente **1 nuova domanda** dal pool di 200 (`assets/js/daily-questions.js`), in ordine, a partire dalla data `DAILY_EPOCH` in `app.js` (default: 2026-07-17). Ogni domanda esce già con una **risposta automatica della "Redazione QuotaFacile"** (badge dedicato + disclaimer), e gli **intermediari possono integrare** con risposte firmate (+10 pt): il contenuto cresce da solo, ogni giorno, per 200 giorni.

In bacheca il contatore mostra "Domanda del giorno X di 200" con progress bar e countdown alla prossima.

### Come inserire le tue 200 keyword
Apri `assets/js/daily-questions.js`:
1. **CURATED** — le domande scritte a mano, escono per prime. Formato: `{ cat, keyword, domanda, rispostaAuto }`. Sostituiscile/aggiungine con le tue keyword prioritarie.
2. **TOPICS** — liste di argomenti per categoria: il generatore le combina con 4 template (costo / copertura / convenienza / funzionamento) e riempie automaticamente fino a 200 slot senza duplicati.
Puoi anche azzerare tutto e mettere 200 voci CURATED: il sistema pubblica in ordine, una al giorno. Per cambiare la data di partenza modifica `DAILY_EPOCH` in `app.js`.

## Funzionalità

| Area | Cosa fa |
|---|---|
| **Home** | Hero con doppia CTA, come funziona, vantaggi, QuotaPass in evidenza, anteprima bacheca (con la domanda del giorno in testa) |
| **Per i professionisti** | Landing dedicata: sistema punti, livelli, perché iscriversi |
| **Area Pro** | Dopo la creazione del profilo si sbloccano 3 tab: **📊 Dashboard** (chiamate ricevute, email, consulenze, viste profilo, ultimi contatti, richieste dal marketplace, pubblicazione FAQ), **💬 Bacheca da rispondere** (domande community senza tua risposta + domande del giorno da integrare), **🪪 Profilo** (editor con anteprima live della QuotaPass) |
| **Preventivo** | Form multi-step (tipo richiesta → ramo → contatti), anche indirizzato a un intermediario specifico (`#/preventivo?to=b1`) |
| **Directory** | Griglia di QuotaPass filtrabile per ramo, con Chiama / Email / Consulenza |
| **Bacheca Q&A** | Domanda del giorno + domande della community, risposte firmate, voti "utile", classifica esperti live |

> La dashboard del professionista mostra **solo contatti reali**: nessun lead di esempio precaricato.
> I click su CHIAMA ed Email non sono ancora tracciati — servirebbe un backend.

## Avvio locale

```bash
# opzione 1: apri direttamente
open index.html

# opzione 2: server locale
npx serve .
```

## 🚀 Pubblicazione

Il progetto è servibile così com'è: nessun passaggio di build.

### GitHub Pages
`.github/workflows/deploy-pages.yml` pubblica ad ogni push su `main`. **Pages va abilitato a mano
una volta sola** — Settings → Pages → Source: `GitHub Actions` — perché crearlo richiede permessi
di amministrazione che il token delle Actions non possiede. Finché non è fatto il workflow si ferma
con un avviso esplicativo invece di fallire.

La consegna dei contatti non dipende dall'host: passa da Supabase e funziona anche qui, dove
funzioni serverless proprie non esistono.

### Vercel
`vercel.json` è già presente, con intestazioni di sicurezza e cache degli asset. Nessuna variabile
d'ambiente da impostare: la consegna dei contatti passa da Supabase in ogni caso.

### Gamification (la SEO del portale)
- **+10 pt** risposta pubblicata · **+5 pt** voto utile · **+25 pt** migliore risposta
- Livelli: Novizio → Consulente (50) → Esperto (150) → **Top Advisor (300)**
- I Top Advisor finiscono in evidenza in home → incentivo a produrre contenuto → contenuto = pagine indicizzabili

## SEO: il limite che resta

Questa è una SPA con routing `#/`. Gli URL con il cancelletto **non vengono indicizzati come
pagine separate**: per Google esiste una sola pagina, e tutto il lavoro sulle guide vale meno di
quanto potrebbe. È il collo di bottiglia più serio rimasto sul fronte organico.

Le due strade, in ordine di sforzo:

1. **Prerender** — uno script che genera un file HTML statico per ogni guida (`/guide/assicurazione-monopattino-elettrico-obbligatoria/`). Il markup e i dati strutturati esistono già: serve solo scriverli su disco.
2. **Migrazione ad Astro o Next.js** con backend, quando i contenuti diventano reali e condivisi.

Fino ad allora le guide restano ottime per chi arriva sul sito e per i motori generativi (che
leggono la pagina renderizzata), ma partono handicappate sulla ricerca tradizionale.

## 📬 Contatti e consegna — Supabase

Le richieste vengono inviate alla Edge Function **`qf-contatti`** sul progetto Supabase
`QuotaFacile` (regione Francoforte, UE). Il principio che regge tutto:

> **Salva prima, notifica poi.**

Finché la consegna dipendeva da un servizio di posta, una richiesta poteva sparire senza che nessuno
se ne accorgesse. Ora il contatto è scritto nel database *prima* che si provi a spedire alcunché: se
l'avviso fallisce, il lead resta al sicuro. Cambia di conseguenza anche cosa si dice all'utente —
"richiesta ricevuta" significa *salvata*, non "email partita".

| Cosa arriva | Tabella |
|---|---|
| Richieste di preventivo e consulenza | `richieste` |
| Iscrizioni dei professionisti (RUI da verificare) | `iscrizioni_pro` |
| Lista d'attesa dell'app | `waitlist` |
| Segnalazioni di contenuti (art. 16 DSA) | `segnalazioni` |
| Prova dei consensi raccolti (art. 7.1 GDPR) | `consensi` |

**Sicurezza.** RLS attiva su tutte le tabelle e nessuna policy: le chiavi che vivono nel browser non
leggono né scrivono nulla — verificato, il ruolo `anon` riceve `permission denied`. Si passa solo
dalla Edge Function, che valida lato server e usa il service role. Il sito non contiene alcuna
chiave Supabase.

**Freno anti-abuso.** L'endpoint è pubblico per necessità: un modulo di preventivo non può chiedere
di autenticarsi. `qf_troppe_richieste()` blocca oltre 5 richieste dallo stesso indirizzo in un'ora
(`429`), senza ostacolare chi ne manda due per rami diversi.

### Notifiche (opzionali)

Nessuna configurata = il sito funziona lo stesso, i contatti si leggono dall'area admin. Da
impostare fra i *secrets* delle Edge Function del progetto Supabase:

| Variabile | A cosa serve |
|---|---|
| `QF_RESEND_KEY`, `QF_RESEND_FROM` | Avviso via email. Parte con `Reply-To` sull'indirizzo dell'utente: rispondendo si scrive al cliente |
| `QF_TELEGRAM_TOKEN`, `QF_TELEGRAM_CHAT` | Avviso immediato sul telefono. Il token si ottiene da [@BotFather](https://t.me/BotFather) senza registrazioni |
| `QF_DESTINATARIO` | Casella della piattaforma (default `r.difalco@lori-crm.it`) |

Se la richiesta è indirizzata a un intermediario, l'avviso parte **anche alla sua casella**.

### Se il servizio non risponde

L'utente vede un `mailto:` già compilato con un solo pulsante da premere. Compare **solo** quando il
salvataggio non è riuscito: un errore di validazione si corregge nel modulo, non riscrivendo a mano.

## 🔐 Area Admin — `#/admin`

Console riservata, non linkata da nessuna parte nel sito. Cinque sezioni:

| Sezione | Cosa fa |
|---|---|
| **📊 KPI** | Iscritti e stato di verifica, domande e risposte per tipo, richieste ricevute (totali, ultimi 30 giorni, per ramo), voti "utile", domande scoperte, segnalazioni aperte, waitlist app, copertura della bacheca, classifica professionisti |
| **🪪 Professionisti** | Ogni iscritto con la sua QuotaPass, dati RUI e attività. Stato di verifica impostabile su Verificato / In attesa / Respinto, con link diretto al registro IVASS |
| **💬 Bacheca** | Tutte le domande (utenti, guide, del giorno) con le rispettive risposte. Badge **★ Migliore risposta** (+25 pt all'autore), rimozione risposte e domande, filtri per tipo e per "senza risposta" |
| **🎯 Keyword → Staff** | Pubblica una keyword come domanda Staff: campi SEO con contatori di lunghezza, editor con formattazione leggera, anteprima dello snippet Google, pubblicazione immediata in cima alla bacheca e ritiro |
| **🚩 Segnalazioni** | Coda DSA alimentata dal pulsante *Segnala*. Accogli (rimuove il contenuto) o respingi, sempre con motivazione registrata |

Ogni rimozione richiede una motivazione, archiviata in `DB.moderazioni`: serve per rispondere
all'autore, come previsto dall'art. 17 del Digital Services Act.

**Editor delle guide** — nel campo risposta: `## titolo`, `- elenco`, `1. elenco numerato`,
`**grassetto**`. Viene convertito in HTML da `mdToHtml()`.

> 🔓 **Sull'accesso, senza giri di parole.** La passphrase è confrontata nel browser contro il suo
> hash SHA-256 scritto in `admin.js`. Tiene fuori chi arriva per caso o prova a indovinare la rotta;
> **non** ferma chi apre i sorgenti. È un deterrente, non un controllo di accesso: diventa sicurezza
> vera solo con un login server-side. La passphrase in uso è stata impostata dal titolare; per
> sostituirla:
> ```bash
> node -e "console.log(require('crypto').createHash('sha256').update('LA-TUA-PASSPHRASE').digest('hex'))"
> ```
> e incolla il risultato in `PASS_HASH`. Finché resta quella di default la console mostra un avviso.

> 📊 **Sui numeri.** Senza backend la console legge il `localStorage` del browser da cui la apri:
> mostra le iscrizioni e le domande create lì, non quelle degli altri visitatori. Diventano dati
> reali con il database.

## 🪪 Intermediari in vetrina

`assets/js/intermediari.js` è la fonte di verità delle QuotaPass pubblicate. Viene **risincronizzato
ad ogni avvio**: modificarlo aggiorna le schede anche per chi ha già dati nel `localStorage`
(punti e risposte accumulati vengono conservati per `id`).

Regola non negoziabile: **il campo `rui` resta `null` finché il numero non è stato letto sul
[registro pubblico IVASS](https://servizi.ivass.it/RuirPubblica/)**. Con `rui: null` la tessera
mostra `RUI sez. E · dal gg/mm/aaaa · n. in verifica` e il badge "In verifica" al posto di
"✓ Verificato RUI". Appena inserisci il numero, `verificato` diventa `true` da solo.

I campi ancora da compilare si scrivono tra virgolette basse (`«Città»`) e vengono evidenziati in
giallo nell'interfaccia invece di essere stampati come se fossero veri.

## 🔎 Keyword map

Il criterio non è il volume: è il **rapporto fra intento e concorrenza**. Le head keyword
assicurative italiane sono presidiate da Facile.it, Segugio e Prima con budget a sei zeri —
inseguirle è bruciare soldi. Si vince dove la SERP è occupata da chi *non* è del settore.

| # | Keyword | Volume stimato | Difficoltà | Perché |
|---|---|---|---|---|
| k1 | assicurazione monopattino elettrico obbligatoria | 1.500–4.000 | Molto bassa | Obbligo dal 16/07/2026: SERP di sole notizie, nessuna pagina evergreen. Finestra a tempo |
| k2 | polizza catastrofale obbligatoria micro imprese | 800–2.500 | Bassa | SERP di portali fiscali, zero intermediari. Lead B2B |
| k3 | assicurazione casalinghe INAIL obbligatoria | 500–1.500 | Bassa | Obbligo che quasi nessuno conosce. Porta all'infortuni privato |
| k4 | assicurazione cane obbligatoria | 1.000–2.500 | Medio-bassa | Comparatori con risposte di tre righe: si vince sulle esclusioni |
| k5 | polizza vita pignorabile | 300–900 | Bassa | SERP di soli studi legali. Il lead più prezioso |
| k6 | classe di merito sbagliata come farla correggere | 400–1.200 | Bassa | Procedurale: problema aperto adesso |
| k7 | reclamo assicurazione IVASS come funziona | 700–2.000 | Bassa | Procedurale ad alta urgenza |
| k8 | risarcimento sinistro troppo basso cosa fare | 500–1.500 | Bassa | Procedurale, alto valore economico |
| k9 | polizza catastrofale immobile affittato chi paga | 250–800 | Molto bassa | Nicchia B2B senza risposte chiare in SERP |

> ⚠️ I volumi sono **stime ragionate** su SERP e stagionalità, non dati di Keyword Planner.
> La gerarchia relativa regge; i valori assoluti vanno confermati con Keyword Planner,
> Ahrefs o Semrush prima di costruirci sopra un piano editoriale.

**Le query procedurali (k6-k9) sono la miniera meno sfruttata del settore.** Chi cerca
"come faccio a…" ha un problema aperto adesso, e la SERP gli risponde con definizioni.
Valgono doppio sui motori generativi, che citano volentieri chi espone passaggi numerati,
termini precisi e riferimenti normativi verificabili.

## 🤖 GEO — farsi citare dai motori generativi

L'ottimizzazione per ChatGPT, Perplexity e le AI Overviews non è SEO con un altro nome:
lì non si "posiziona", si **viene citati**. Cosa è stato fatto:

| Intervento | A cosa serve |
|---|---|
| `llms.txt` | Presentazione del sito in formato leggibile dalle macchine: cosa è, chi lo gestisce, indice ragionato delle guide, come citarle |
| `robots.txt` con i crawler AI | GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Applebot-Extended e altri sono **esplicitamente ammessi**: senza, molti non leggono nulla |
| `Organization` con dati reali | Ragione sociale, P. IVA, indirizzo, fondatore con qualifica RUI: è così che un motore capisce che dietro i contenuti c'è un soggetto identificabile |
| `FAQPage` con date e autore | Ogni risposta porta data e firma. La freschezza e l'attribuzione sono i due segnali che più pesano nella scelta di cosa citare |
| `BreadcrumbList` | Gerarchia esplicita delle pagine |
| `InsuranceAgency` in directory | Gli intermediari sono entità tipizzate, non righe di testo |
| Risposta secca in apertura | Ogni guida risponde nella prima frase, in grassetto: è il frammento che i motori estraggono |
| Guide correlate | Contesto tematico fra pagine, che una pagina isolata non ha |

## 📌 Guide QuotaFacile (keyword SEO in bacheca)

`assets/js/staff-questions.js` contiene le domande che la redazione pubblica per presidiare keyword
ad alto intento. A differenza della "domanda del giorno" **escono tutte subito**, restano in cima
alla bacheca e non dipendono dal `localStorage`: sono identiche per ogni visitatore.

Ogni slot porta con sé i metadati di ricerca (`keyword`, `volume`, `difficolta`, `intento`) più
`titolo` e `meta` usati per il `<title>` e la meta description della pagina. Gli intermediari le
integrano come qualunque altra domanda (+10 pt), e le loro risposte finiscono in `DB.staffExtra`.

Il criterio di scelta è quello che conta: **long-tail con SERP occupata da chi non è del settore**
(news, portali fiscali, studi legali). Le head keyword assicurative sono presidiate da Facile.it,
Segugio e Prima: inseguirle è bruciare budget.

## ⚖️ Conformità legale e GDPR

| Documento | Rotta | Riferimenti |
|---|---|---|
| Privacy Policy | `#/privacy` | Artt. 13-14 GDPR, d.lgs. 101/2018 |
| Cookie Policy | `#/cookie-policy` | Art. 122 d.lgs. 196/2003, Linee guida Garante 231/2021 |
| Termini e Condizioni | `#/termini` | Cod. Consumo, DSA (Reg. UE 2022/2065) |
| Note legali | `#/note-legali` | Art. 7 d.lgs. 70/2003, art. 106 CAP (d.lgs. 209/2005) |
| Chi siamo / Contatti | `#/contatti`, `#/chi-siamo` | — |

**Cookie banner (`assets/js/consent.js`)** — nessuno strumento non necessario prima della scelta,
"Rifiuta tutti" con la stessa evidenza di "Accetta tutti", consenso granulare per 4 categorie,
chiusura con la ✕ = rifiuto, registrazione della scelta con data e versione, banner non riproposto
per 6 mesi dopo un rifiuto. Revoca sempre disponibile dal footer o via `QFConsent.open()`.

> ⚠️ **Prima di pubblicare:** compila `LEGAL_CONFIG` in `assets/js/legal.js` (ragione sociale, sede,
> P. IVA, REA, PEC, foro). Finché i campi restano `«...»` le pagine legali mostrano un avviso giallo
> in cima: nessun dato societario inventato viene mai pubblicato al posto di quelli reali.

**Segnalazione contenuti (DSA)** — ogni risposta in bacheca ha un pulsante 🚩 *Segnala* che apre il
modulo di notice & action (art. 16 Reg. UE 2022/2065). Le segnalazioni finiscono in
`DB.segnalazioni` per la coda di moderazione.

**Consensi** — ogni form (preventivo, domanda in bacheca, waitlist app, registrazione pro) ha una
checkbox non precompilata con informativa contestuale; l'evento è registrato in `DB.consensi`
(accountability, art. 7.1 GDPR).

## Backend (non incluso, per design)

I dati sono in `localStorage` con seed demo: perfetto per validare UX e pitch. Per andare in produzione servono: auth intermediari, verifica RUI (registro IVASS), database Q&A, notifiche richieste preventivo.
