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
│   ├── js/admin.js               # 🔐 Area riservata (#/admin): la porta + console di piattaforma
│   ├── js/crm.js                 # 🏢 CRM Bizpower (#/admin/crm): amministrazione della società
│   ├── js/mm.js                  # 📮 Mail Marketing (#/admin/crm/mail): liste, campagne, invii
│   ├── js/accesso.js             # 🔑 Sessione dei collaboratori (Supabase Auth, storage, RLS)
│   ├── js/area.js                # 🧑‍💼 Area personale del collaboratore (#/admin/area)
│   ├── js/legal.js               # ⚖️ Privacy, Cookie Policy, T&C, Note legali (+ LEGAL_CONFIG)
│   └── js/consent.js             # 🍪 Cookie banner e centro preferenze (CMP)
├── supabase/
│   ├── schema.sql                # 🗄️ Tabelle, RLS, trigger: lo schema del database
│   └── functions/                # ☁️ Edge Function (Deno) — il backend, versionato qui
│       ├── qf-contatti/          #     riceve i contatti: salva prima, notifica poi
│       ├── qf-bacheca/           #     legge e scrive la bacheca condivisa
│       ├── qf-admin/             #     moderazione, protetta da chiave
│       ├── qf-crm/               #     collaboratori, documenti, produzione
│       ├── qf-lead/              #     ricerca dei lead e lavorazione della pipeline
│       ├── qf-mail/              #     invio dalla casella della società
│       └── qf-mm/                #     mail marketing: mittenti, caselle, liste, scrittura assistita
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
dalla Edge Function, che valida lato server e usa il service role.

Dall'arrivo degli accessi dei collaboratori il sito contiene **una** chiave Supabase, quella
`publishable`: è progettata per stare nelle pagine e da sola non apre nulla, perché su ogni
tabella la RLS è attiva e senza una sessione valida non c'è riga leggibile. Serve solo a dire
*quale* progetto si sta interrogando. La chiave di servizio, quella che scavalca le regole, resta
soltanto dentro le Edge Function.

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

Si entra dal footer. Dietro l'accesso ci sono **due porte**, perché dietro c'è un solo
utente ma due mestieri diversi:

| Porta | Rotta | Di cosa si occupa |
|---|---|---|
| **Piattaforma QuotaFacile** | `#/admin/piattaforma` | Il marketplace: richieste, iscrizioni, bacheca, guide, segnalazioni |
| **CRM Bizpower** | `#/admin/crm` | La società: collaboratori, lead, documenti, mail, produzione |

Chiedere quale dei due mestieri stai per fare, invece di mescolarli in un unico pannello,
riduce la possibilità di trattare un dato interno come se fosse pubblico.

### Piattaforma QuotaFacile

Legge e modera **i dati veri del database**: quello che vedi qui è quello che vedrebbe
chiunque altro aprisse la console.

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

## 🏢 CRM Bizpower — `#/admin/crm`

L'amministrazione della società, dentro l'area riservata ma **separata dal marketplace**:
tabelle con prefisso `crm_`, Edge Function propria (`qf-crm`), nessuna policy pubblica. I dati
di QuotaFacile sono in parte pubblici — la bacheca lo è per definizione — quelli del CRM non
lo sono mai: tenerli distinti rende difficile sbagliarsi.

| Sezione | Stato |
|---|---|
| **👥 Collaboratori** | ✅ anagrafica, ruoli, attivazione e **creazione degli accessi personali** |
| **📁 Documenti** | ✅ archivio della squadra: chi ha caricato cosa, categorie, scadenze in evidenza |
| **🔎 Lead locali** | ✅ ricerca per zona, categorie e raggio; salvataggio, assegnazione e stato di lavorazione |
| **📇 Pipeline** | ✅ viste per fase, etichette, storia delle attività su ogni lead |
| **✉️ Mail** | ✅ modelli, invio dalla casella Aruba, registro, opposizione al contatto |
| **🏆 Produzione** | ✅ classifica calcolata dai fatti registrati, con i pesi dichiarati |

### 🔑 Accessi dei collaboratori — `#/admin/area`

Dalla stessa porta entrano due tipi di persona: il titolare con la chiave di amministrazione,
i collaboratori con **email e password proprie** (Supabase Auth). Chi entra come collaboratore
non vede la porta: vede la sua area e basta.

Le credenziali le crea il titolare dalla scheda Collaboratori. La password è **generata dal
server e leggibile una volta sola**: nel database resta solo la sua forma cifrata, quindi non è
recuperabile — se ne genera un'altra. Al primo accesso il collaboratore dovrebbe cambiarla dalla
propria area, perché una password passata da un messaggio non è più un segreto fra lui e il sistema.

**Cosa vede chi:**

| | Propria scheda | Squadra | Propri documenti | Documenti altrui |
|---|---|---|---|---|
| Commerciale, account, consulente | ✅ | ✕ | ✅ | ✕ |
| Direttore, titolare | ✅ | ✅ | ✅ | ✅ |

Non è una questione di schermate mancanti: **lo nega il database**, con le policy, anche a chi
provasse a interrogarlo direttamente. Le tre funzioni che rispondono a "chi sta chiedendo" vivono
nello schema `crm_interno`, che PostgREST non espone: devono servire alle policy, non essere
invocabili dal mondo.

Nessuno può cambiarsi il ruolo: su `crm_collaboratori` non esiste alcuna policy di scrittura, e
ruoli, attivazione e punteggio passano solo dalla funzione `qf-crm`, che risponde solo al titolare.

**Disattivare chiude davvero la porta.** L'utenza viene sospesa (niente token nuovi) *e* la
policy richiede `attivo`, perché un token già emesso resta valido fino a un'ora: senza quella
condizione, per quel margine si continuerebbe a entrare.

### 📇 Pipeline

Lo stesso archivio dei lead, guardato **per fase** invece che in elenco: cinque colonne, e si
vede subito dove si accumula il lavoro. Filtri per collaboratore e per etichetta; aprendo un
lead si registra cosa si è fatto e gli si mettono le etichette.

**Stato ed etichette non sono la stessa cosa.** Lo stato dice a che punto è la trattativa ed è
uno solo per volta. Le etichette dicono tutto il resto — «priorità alta», «richiamare a
settembre», «ha già una polizza» — e possono essere molte insieme. Confonderle in un campo solo
costringerebbe a scegliere fra informazioni che non si escludono.

**Le attività sono la memoria del lavoro**: chi ha chiamato, quando, com'è andata. Senza,
«contattato» è un'affermazione che nessuno può verificare, e la produzione di ciascuno resta
un'opinione. Saranno anche la fonte dei punti, che si contano dai fatti registrati e non si
digitano a mano.

Due comportamenti voluti: registrare una chiamata, un'email o un incontro **porta avanti da solo**
un lead ancora «nuovo» — evita che resti tale uno con tre chiamate alle spalle; e un'attività si
registra sempre **a nome di qualcuno**, perché firmare il lavoro di un altro falserebbe la
produzione di entrambi.

### ✉️ Mail

Invio dalla casella della società, con **modelli** riutilizzabili (variabili `{azienda}`,
`{citta}`, `{telefono}`, `{mittente}`), **anteprima** del messaggio esatto prima di mandarlo, e
**registro** di ciò che è partito — riuscito o fallito.

Il registro non è un vezzo: un'email inviata è un fatto che riguarda una persona. Serve a non
scrivere due volte alla stessa azienda, a rispondere se qualcuno chiede conto di un messaggio, e
perché senza «abbiamo scritto a tutti» è una frase che nessuno può verificare. Nel registro resta
il **testo esatto partito**, non il modello: i modelli cambiano, quello che è stato scritto a una
persona no.

**L'opposizione al contatto è un divieto, non un promemoria.** L'art. 21 del GDPR dà a chiunque
il diritto di opporsi al trattamento fatto per legittimo interesse — la base su cui questi
contatti sono raccolti. Ogni messaggio esce quindi con scritto come farsi togliere, e
l'opposizione si registra dalla scheda del lead: da quel momento il **server** rifiuta l'invio,
non è la schermata a nasconderlo.

**Per attivarla** servono quattro segreti nel progetto Supabase:

| Segreto | Su Aruba |
|---|---|
| `QF_SMTP_HOST` | `smtps.aruba.it` |
| `QF_SMTP_PORT` | `465` |
| `QF_SMTP_USER` | l'indirizzo completo della casella |
| `QF_SMTP_PASS` | la password della casella |

`QF_SMTP_FROM` è facoltativo (`Nome <indirizzo>`). Finché mancano, modelli e registro funzionano
e l'invio è disattivato con un messaggio che dice cosa manca.

**La posta in arrivo non c'è, e non è una dimenticanza.** Leggerla richiede IMAP, cioè una
connessione lunga tenuta aperta verso un server di posta; le Edge Function sono fatte per
rispondere in fretta e spegnersi, e per Deno non esiste un client IMAP di cui fidarsi in mezzo a
una casella di lavoro. Ne sarebbe uscita una schermata che a volte mostra la posta e a volte no —
peggio di una che manca. La sezione lo dichiara apertamente invece di lasciarlo scoprire.

**Un limite da conoscere:** Google Places non restituisce gli indirizzi email. Un lead trovato con
la ricerca ha nome, indirizzo, telefono e sito, non la posta: l'email va cercata sul loro sito e
annotata sulla scheda, e da lì in poi resta.

### 🏆 Produzione

Il punteggio **non è una colonna**: è una vista che il database ricalcola a ogni lettura dalle
attività registrate nella pipeline e dai lead diventati clienti. Non si può falsare senza falsare
i fatti — ed è l'unico modo perché una classifica interna significhi qualcosa: un numero che si
può digitare a mano non misura niente, e si scopre subito che dipende da chi tiene la penna.

| Attività | Punti | | In più | Punti |
|---|---|---|---|---|
| Preventivo | 8 | | Esito positivo | +3 |
| Incontro | 5 | | Da richiamare | +1 |
| Chiamata | 2 | | **Lead diventato cliente** | **+20** |
| Email | 1 | | | |
| Nota | 0 | | | |

Una nota vale zero: serve a ricordare, non a produrre, e darle punti insegnerebbe solo a scrivere
note. Un cliente chiuso pesa quanto una giornata di telefonate, perché è il risultato e non il
tentativo.

I pesi si cambiano in un posto solo, `crm_interno.valore_attivita`: la classifica si riallinea da
sola, perché non c'è nulla di salvato da ricalcolare. Ogni collaboratore vede **la propria**
produzione dalla sua area; la classifica intera la vedono titolare e direttore. I disattivati non
compaiono in classifica, ma la loro storia resta.

### 📁 Come stanno i documenti

I file vivono in un **bucket privato**: non esiste un indirizzo pubblico che li raggiunga,
nemmeno conoscendolo. Si scaricano con la sessione di chi ha diritto di vederli. Il percorso di
ogni file comincia con l'identificativo di chi lo ha caricato, ed è la policy dell'archivio a
imporlo — è ciò che rende l'area di ciascuno davvero sua.

Limiti: 15 MB a file, e solo PDF, immagini, Word ed Excel. Un archivio che accetta qualunque cosa
diventa un modo per distribuire qualunque cosa.

Se il salvataggio della scheda fallisce dopo che il file è già salito, il file viene rimosso: un
file orfano è meno grave di una scheda che indica un file inesistente, perché la seconda sembra
tutto a posto.

Le sezioni non ancora costruite **dicono cosa faranno**, come, e cosa serve per attivarle:
una scheda vuota che sembra funzionante è peggio di una che dichiara di non esserlo.

**Due scelte che restano.** Un collaboratore che se ne va si *disattiva*, non si cancella:
cancellarlo porterebbe via la storia di ciò che ha prodotto e dei documenti che ha caricato.
E il punteggio di produzione nasce a zero e lo calcolerà il database dai fatti registrati —
un numero che si può digitare a mano non misura niente.

### 🔎 Lead locali

Ricerca **rapida** (una zona) o **precisa** (via, CAP, città, provincia), raggio da 500 m a
10 km, fino a 4 categorie per volta fra venti, filtro qualità (valutazione ≥ 3,5 e almeno 5
recensioni). Fino a 50 risultati per ricerca, senza duplicati fra categorie, con l'indicazione
di chi è **già in archivio** — così non si riprende come nuovo un contatto che qualcuno sta già
lavorando.

Dai risultati si salva quello che interessa; in archivio ogni lead ha uno stato (nuovo,
contattato, in trattativa, cliente, scartato) e si assegna a un collaboratore.

**Niente scraping.** Solo API ufficiali Google: Geocoding per trasformare un indirizzo in
coordinate, Places (New) per trovare le attività nel raggio. È il vincolo che il progetto
`cercalead` si era già dato, ed è anche ciò che tiene la raccolta di dati d'impresa dentro il
perimetro del legittimo interesse.

**Ogni lead porta con sé la propria provenienza**: fonte, ricerca che l'ha prodotto, giorno di
raccolta. Se un domani qualcuno chiede «dove avete preso il mio recapito», la risposta è una riga
di database, non un ricordo. Chi lavora un lead può cambiarne stato e note, non i dati di
provenienza.

**Per attivarla** serve il segreto `QF_GOOGLE_KEY` fra quelli del progetto Supabase, con
abilitate **Places API (New)** e **Geocoding API** sul progetto Google Cloud (e la fatturazione
attiva). Finché manca, la ricerca risponde con un messaggio che lo dice: meglio dirlo che
restituire un elenco vuoto, che sembrerebbe «nessun risultato».

La chiave sta **solo sul server**. Una chiave Places in un file JavaScript è pubblica per
definizione, e la si ritrova consumata da altri sul conto di chi l'ha esposta.

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
