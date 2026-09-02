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
│   ├── js/bacheca.js             # 💬 Bacheca condivisa: lettura e scrittura sul database
│   ├── js/admin.js               # 🔐 Console riservata (#/admin): legge e modera i dati veri
│   ├── js/legal.js               # ⚖️ Privacy, Cookie Policy, T&C, Note legali (+ LEGAL_CONFIG)
│   └── js/consent.js             # 🍪 Cookie banner e centro preferenze (CMP)
├── supabase/
│   ├── schema.sql                # 🗄️ Tabelle, RLS, trigger: lo schema del database
│   └── functions/                # ☁️ Edge Function (Deno) — il backend, versionato qui
│       ├── qf-contatti/          #     riceve i contatti: salva prima, notifica poi
│       ├── qf-bacheca/           #     legge e scrive la bacheca condivisa
│       └── qf-admin/             #     moderazione, protetta da chiave
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

## 💬 Bacheca condivisa

Domande e risposte vivono nel database e sono **uguali per tutti i visitatori**: prima stavano nel
`localStorage`, quindi ognuno vedeva soltanto le proprie e per i motori di ricerca non esisteva nulla.

| Contenuto | Dove vive | Perché |
|---|---|---|
| Le 9 guide editoriali | `assets/js/staff-questions.js` | Scritte con cura e versionate in git |
| Domanda del giorno | `assets/js/daily-questions.js` | Generata dalla data, non serve un database |
| Domande degli utenti | tabella `domande` | Contenuto pubblico condiviso |
| Guide pubblicate dall'Admin | tabella `domande` (`tipo = 'guida'`) | Create senza toccare il codice |
| Risposte dei professionisti | tabella `risposte` | Condivise, ordinate per voti |
| Voti "utile" | tabella `voti` | Un voto per dispositivo, garantito da un vincolo di unicità |

Una risposta può riferirsi a una domanda del database (`domanda_id`) **oppure** a un contenuto del
repository (`domanda_chiave`, es. `k1` o `d12`): un vincolo assicura che sia valorizzato uno solo dei due.

### ⚠️ Le risposte passano dalla moderazione

Non è una scelta di prudenza, è una necessità: **senza autenticazione chiunque potrebbe firmarsi con
il nome di un intermediario reale**. Su un sito il cui valore sta nell'identità verificabile sarebbe
il danno peggiore possibile. Una risposta nasce quindi `in_attesa` e diventa pubblica solo dopo
l'approvazione dall'area Admin.

Il passo che toglie questo collo di bottiglia è l'autenticazione dei professionisti (Supabase Auth):
a quel punto chi risponde è chi dice di essere, e l'approvazione manuale non serve più.

### Se il servizio non risponde

Il sito continua a funzionare: guide e domanda del giorno vivono nel codice e non dipendono dalla
rete. Manca solo ciò che è condiviso.

## 🔐 Area Admin — `#/admin`

Console riservata, non linkata da nessuna parte nel sito. Legge e modera **i dati veri del
database**: quello che vedi qui è quello che vedrebbe chiunque altro aprisse la console.

| Sezione | Cosa fa |
|---|---|
| **📊 KPI** | Richieste ricevute (totali, ultimi 30 giorni, per ramo), iscrizioni e stato di verifica, domande degli utenti e copertura, risposte pubblicate e coda di approvazione, voti "utile", guide, segnalazioni aperte, waitlist. Avvisa se un contatto è arrivato ma l'avviso non è partito |
| **📥 Richieste** | I lead, con recapiti, note, prova del consenso e stato di lavorazione (nuova / presa in carico / chiusa). È il posto da cui si lavorano, non la casella di posta |
| **🪚 Professionisti** | Ogni iscrizione ricevuta dal sito, con i dati RUI dichiarati. Verificato / In attesa / Respinto, con link al registro IVASS e una conferma esplicita prima di attestare un'iscrizione |
| **💬 Bacheca** | Domande e risposte, comprese quelle **in attesa di approvazione** e quelle rimosse (con la loro motivazione). Pubblica, ripristina, assegna il badge ★ Migliore risposta, rimuove |
| **🎯 Keyword → Guida** | Pubblica una keyword come guida: campi SEO con contatori, editor con formattazione leggera, anteprima dello snippet Google, pubblicazione immediata in bacheca |
| **🚩 Segnalazioni** | Coda DSA alimentata dal pulsante *Segnala*. Accogli (rimuove davvero il contenuto) o respingi, sempre con motivazione registrata |

Ogni rimozione richiede una motivazione, conservata sulla riga rimossa: serve per rispondere
all'autore, come previsto dall'art. 17 del Digital Services Act. Ciò che è stato rimosso resta
visibile in console, in secondo piano — serve a ricostruire una decisione, non a riproporla.

**Editor delle guide** — nel campo risposta: `## titolo`, `- elenco`, `1. elenco numerato`,
`**grassetto**`. Viene convertito in HTML da `mdToHtml()`.

### 🔑 L'accesso

La chiave **non** viene confrontata nel browser: viaggia nell'intestazione `x-qf-admin` verso la
funzione `qf-admin`, che ne calcola l'impronta SHA-256 e la confronta a tempo costante lato server.
Nel sito e nel repository la chiave non compare mai, e senza di essa ogni azione riceve `401`.

Due modi di configurarla, in quest'ordine di precedenza:

1. il segreto **`QF_ADMIN_TOKEN`** fra i secrets del progetto Supabase — la via preferita, perché la
   chiave non tocca il database;
2. l'impronta conservata in `impostazioni_admin` — ripiego attivo, che permette alla console di
   funzionare senza passaggi manuali nel pannello.

Se non è configurata né l'una né l'altra la funzione risponde `503` e **nessuna** moderazione è
possibile: meglio una console inattiva che una aperta a chiunque.

Per ruotare la chiave conservata nel database:

```sql
update impostazioni_admin
   set token_hash = encode(digest('LA-TUA-NUOVA-CHIAVE','sha256'),'hex'),
       aggiornato_il = now()
 where id = 1;
```

La chiave resta in `sessionStorage` fino alla chiusura della scheda.

### Cosa **non** si modifica da qui

Le nove guide di `staff-questions.js` e le tessere di `intermediari.js` vivono nel repository e
compaiono in console in sola lettura: si modificano nel codice, dove ogni cambiamento resta
tracciato e rivedibile.

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
modulo di notice & action (art. 16 Reg. UE 2022/2065). Le segnalazioni finiscono nella tabella
`segnalazioni` ed escono nella coda dell'area Admin. Il bersaglio è l'identificativo della risposta:
la posizione nell'elenco cambia appena ne arriva una nuova, e chi modera si troverebbe davanti un
contenuto diverso da quello segnalato.

**Consensi** — ogni form (preventivo, domanda in bacheca, waitlist app, registrazione pro) ha una
checkbox non precompilata con informativa contestuale; l'evento è registrato nella tabella
`consensi` insieme al testo esatto accettato (accountability, art. 7.1 GDPR).
