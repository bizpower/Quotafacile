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

## Gli indirizzi: percorsi veri, niente cancelletto

Era una SPA con routing `#/`, e quello era il collo di bottiglia più serio sul fronte organico:
per Google gli URL col cancelletto non sono pagine separate, quindi venti guide erano una pagina
sola. Adesso non è più così, e la cosa sta su due gambe.

**Il pre-render** (`tools/prerender.mjs`, gira nel deploy) apre ogni rotta pubblica in un browser
vero e la salva come file HTML a un indirizzo reale — `/guide/polizza-vita-pignorabile/` — con il
proprio canonical, link interni veri e gli asset riscritti in assoluto. Trentotto pagine, trentasei
nella sitemap. Chi non esegue JavaScript — e i crawler dei motori generativi in larghissima parte
non lo fanno — trova il contenuto dentro l'HTML invece di un guscio vuoto.

**La navigazione** usa la History API: cliccando si va a `/magazine/`, non a `/#/magazine`. Prima
le pagine stavano già a un indirizzo vero, ma appena una persona cliccava il gestore dei link
rimetteva il cancelletto — quindi l'indirizzo che si copiava dalla barra, e che finiva nei
messaggi e nei segnalibri, era quello sbagliato.

Due cose non sono cambiate, di proposito:

- **i vecchi `/#/magazine` funzionano ancora.** Sono in segnalibri, in email già partite e magari
  in qualche risultato di ricerca: arrivano, e un `replaceState` li normalizza al percorso pulito
  senza aggiungere una voce di cronologia;
- **i 142 `href="#/..."` nei file restano come sono.** Il clic viene intercettato e tradotto in
  percorso, e per le diciotto assegnazioni `location.hash = "#/x"` sparse in sei file c'è il
  normalizzatore su `hashchange`. Riscriverli tutti a mano sarebbe stato il modo di sbagliarne uno.

La barra finale resta: **`/magazine/` e non `/magazine`**. È la forma che GitHub Pages serve
davvero e quella già dentro i canonical e la sitemap; `/magazine` fa un redirect verso
`/magazine/`. Cambiarla butterebbe l'indicizzazione fatta finora.

**Le rotte private non hanno un indirizzo pubblico**, e non devono averlo: per quelle il percorso
è la rotta stessa (`/admin/crm/mail/liste`). Su un ricaricamento diretto Pages serve `404.html`,
che il pre-render scrive con `noindex` e fuori dalla sitemap — e che dichiara la radice del sito in
un `<meta name="qf-base">`. Senza quel meta l'applicazione, servita a un percorso che non è il
suo, avrebbe ricavato come radice `/admin/crm/mail/`: da lì in poi ogni indirizzo costruito
sarebbe nato appeso a una cartella che non esiste.

Chi deve sapere «dove sono» non legge più `location.hash` — col percorso è vuoto — ma
`QF.rotta()` e `QF.query()`. Erano quattro moduli a leggerlo, incluso quello che decide se
mostrare il bottone dell'assistente nell'area riservata.

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

**Una sola chiave, in un posto solo:** l'impronta SHA-256 conservata in `impostazioni_admin`.

C'era anche un segreto di progetto, `QF_ADMIN_TOKEN`, e aveva la precedenza. Sembrava più prudente —
la chiave non toccava il database — ma nella pratica produceva la situazione peggiore: nessuno
sapeva quale delle due fosse attiva. Cambiare l'impronta non aveva alcun effetto finché il segreto
esisteva, e il segreto non è leggibile da nessuna schermata. È stato tolto da tutte le funzioni.
Se nel progetto Supabase è rimasto, **non fa più nulla** e può essere cancellato.

Nessuna funzione tiene l'impronta in memoria fra una richiesta e l'altra: costa la lettura di una
riga su chiave primaria e in cambio un cambio di chiave vale subito, dappertutto, senza aspettare
che le istanze già avviate si spengano.

Se l'impronta non è configurata, le funzioni rispondono `503` e **nessuna** azione è possibile:
meglio una console inattiva che una aperta a chiunque.

Per cambiare la chiave si usa la scheda **🔑 Chiave** della console. A mano, se serve:

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
| **🔎 Lead locali** | ✅ ricerca per zona, provincia, categorie e raggio, con filtro «solo con email»; salvataggio, assegnazione e stato di lavorazione. Stesso modulo del Lead Finder del mail marketing |
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

Ricerca **rapida** (una zona) o **precisa** (regione → provincia → comune dall'anagrafe ISTAT,
più via e CAP), raggio da 500 m a 10 km, fino a 4 categorie per volta fra venti, filtro qualità
(valutazione ≥ 3,5 e almeno 5 recensioni) e filtro **solo con email pubblica**. Fino a 50
risultati per ricerca, senza duplicati fra categorie, con l'indicazione di chi è **già in
archivio** — così non si riprende come nuovo un contatto che qualcuno sta già lavorando.

#### Un modulo, due schermate — `assets/js/lead-ricerca.js`

Questa ricerca si usa da due posti: **Lead locali** nel CRM e **Lead Finder** nel mail
marketing. Erano due moduli scritti separatamente, ed erano divergiti esattamente come diverge
sempre il codice copiato:

| | CRM | Mail marketing (prima) |
|---|---|---|
| provincia e comune | tendine dall'anagrafe | due caselle di testo libero |
| comune vuoto | cerca dal centro della provincia | **rifiutava la ricerca** e non chiamava il server |
| «solo con email» | c'era | non c'era |

La seconda riga è il difetto che si vedeva: la correzione del comune facoltativo era stata fatta
una volta sola, nel CRM, e l'altra copia è rimasta indietro per settimane. La terza è il
paradosso: quel filtro è stato scritto *proprio* per il mail marketing — lo dice il commento sul
server, «serve a chi sta preparando una lista per il mail marketing» — ed era esposto solo
altrove.

Il rimedio è alla causa: **il lato dell'ingresso vive in un file solo**. Form, lettura dei campi,
validazione, tendine a cascata, attesa: tutto in `lead-ricerca.js`, che si registra su
`window.QF_RICERCA` e arriva in parallelo agli altri cinque file dell'area riservata. Il lato
dell'uscita resta separato di proposito, perché è diverso davvero: nel CRM si salva in archivio,
nel mail marketing in una lista.

L'unica differenza che resta è un valore iniziale, e è voluta: **`soloConEmail` nasce acceso nel
mail marketing** — lì le liste servono a mandare email, e un'attività senza indirizzo è una riga
che il generatore salterebbe contandola fra gli scartati — e **spento nel CRM**, dove si esplora
una zona per capire chi c'è e aprire il sito di ogni risultato costerebbe secondi a chi non li ha
chiesti.

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

### Come si controlla che Google risponda

Console admin → scheda **🌍 Google** → «Verifica ora». Fa **tre chiamate vere** e riporta la
risposta di Google parola per parola:

| Prova | A cosa serve |
|---|---|
| Geocoding di «Monza», filtro `country:IT` | la chiave vale e Geocoding API è accesa |
| Geocoding di «Monza e della Brianza», filtro `administrative_area:MB` | la ricerca **senza comune** risolve il centro provinciale — da quando il comune è facoltativo, passa da qui |
| `places:searchText` con raggio 1 km e una sola scheda | Places API **(New)** è abilitata, che è un'altra voce di console |

Serve perché *«mi dà un errore di billing»* è vero e non basta: il geocoding risponde quel messaggio
per **quattro cause diverse**, e senza distinguerle si cambia una cosa a caso per volta.

1. **La chiave appartiene a un altro progetto Cloud** rispetto a quello con le API e la fatturazione.
   È il caso più frequente e il più difficile da vedere: guardati separatamente, entrambi i progetti
   sembrano a posto.
2. **Una delle due API non è abilitata.** Sono due voci distinte, e *Places API (New)* non è la
   vecchia *Places API*: abilitare quella sbagliata non serve.
3. **La fatturazione non è attiva** sul progetto della chiave.
4. **La chiave ha una restrizione per referrer HTTP.** Qui chiama un server, non un browser: senza
   intestazione `Referer` quella restrizione blocca tutto. Per una chiave usata dal server va
   lasciata senza restrizioni di applicazione, oppure limitata per indirizzo IP.

La diagnostica non riporta la chiave in nessuna forma, e non riporta né registra l'URL chiamato: nel
geocoding la chiave viaggia dentro la query.

**Gemini (l'assistente del CRM) non ha una scheda** e non ne ha bisogno: se la chiave `QF_GEMINI_KEY`
manca o viene rifiutata, l'assistente lo scrive in chiaro nella conversazione al primo messaggio.

## ✨ Scrittura assistita del mail marketing — `qf-mm-ai`

Tre azioni sole — `bozza`, `genera`, `rigenera` — in una funzione **separata da `qf-mm`**. Tutte e
tre passano da **Gemini con la stessa chiave dell'assistente del CRM**.

`bozza` stava in `qf-mm` come `ai-scrivi` e chiamava Anthropic: è la schermata **Email AI Writer**,
dove si prova un testo prima di decidere se diventa un modello. È venuta qui per una ragione sola —
due fornitori di modelli per lo stesso lavoro vogliono due chiavi, due crediti da controllare e due
righe nell'informativa. `ai-scrivi` in `qf-mm` esiste ancora e non è stata toccata: semplicemente
non la chiama più nessuno, e `qf-mm` non va ripubblicata per questo.

### Perché separata

Non è una divisione per gusto: è la linea su cui le due metà si comportano in modo diverso.

| | `qf-mm` | `qf-mm-ai` |
|---|---|---|
| cosa fa | legge e scrive righe | chiama un modello linguistico |
| quanto dura | millisecondi | secondi, per ogni email |
| quanto costa | niente | ogni chiamata è a pagamento |
| quanto cambia | quasi mai | il prompt è la cosa che si ritocca più spesso |

Tenute insieme, ogni limatura al prompt rimetteva in gioco anche la coda di invio. E `qf-mm` è
arrivata a **2242 righe**: si ripubblica ricopiandola per intero, e farlo per cambiare una frase del
prompt è il modo di rompere la coda di invio per sbaglio.

### `genera` — una bozza per ogni azienda di una lista

Email Ready → **✨ Genera con AI**. Chiede lista, scopo, tono, chi firma e indicazioni aggiuntive:
lo stesso prompt dello scrittore per un singolo messaggio, applicato a tutta la lista.

**Dodici per volta — otto se legge le home — e dice quante restano.** Ogni bozza è una chiamata di
qualche secondo: una lista da duecento aziende non sta in una richiesta HTTP, e provarci vorrebbe
dire scoprirlo a metà, con qualche bozza salvata e nessuno che sa quante. Alla fine del blocco
compare quanto ha consumato e quante aziende restano, con il bottone per il blocco successivo.

**Quattro motivi per saltare qualcuno, contati separati**, perché si rimediano in modi diversi:
senza indirizzo, opposto, in blacklist, già contattato. Più un quinto: chi ha già una bozza non
spedita viene saltato, a meno che non si spunti «rifai anche chi ha già una bozza» — senza quella
spunta si eviterebbero due messaggi identici alla stessa azienda.

### Scrivere a un lead solo, dalla sua riga

Lead Lists → apri una lista → il bottone ✨ sulla riga dell'attività. Apre **la stessa finestra**
della generazione da lista, intestata a quel lead e senza la tendina delle liste: «scrivine una» non
è un caso particolare, è una lista di uno.

Il bottone compare **solo dove ha senso**: non su chi non ha un indirizzo email e non su chi si è
opposto. Meglio non offrire un'azione che finirebbe in un rifiuto.

Lato server è `genera` con `lead_id` invece di `lista_id`; da lì in giù non cambia nulla — gli
stessi quattro controlli, lo stesso inserimento. Cambia solo il messaggio quando non si può
scrivere: con un lead solo il motivo è uno e si dice al singolare («*Trattoria del Centro* non ha un
indirizzo email: cercalo sul suo sito, oppure telefona»), invece di stampare «1 senza indirizzo».

### Il chatbot può spostare la coda, non può inviare

Quindicesimo strumento di `qf-chat`: `riprogramma_coda`. «Sposta la coda a domani alle nove» muove
data e ora di **tutti** i messaggi già in coda, e nient'altro.

La riga che ho scelto è questa: **il modello può cambiare *quando*, mai *se*.** Non è prudenza
generica, è un'asimmetria con un motivo —

- **spostare si disfa**: se la data è sbagliata si risposta, e nel frattempo non è uscito niente;
- **inviare no**: una frase capita male al telefono non deve poter mandare email a nessuno, e
  guardare cosa sta per uscire a nome della società resta un gesto di una persona.

La regola 4 delle istruzioni lo dice al modello in questi termini, e non esiste nessuno strumento di
invio da chiamare.

Le proprietà di sicurezza restano quelle di sempre: è una **scrittura**, quindi diventa una proposta
con la data in chiaro, e la conferma non ripassa dal modello. Quanti sono li conta il server e il
numero finisce nel titolo che leggi — al modello non torna indietro niente.

Tre dettagli che cambiano il comportamento:

1. **La data di oggi va davanti alla frase, non nelle istruzioni.** Le istruzioni sono una costante
   valutata all'avvio dell'istanza: un'istanza viva da ieri direbbe al modello che oggi è ieri, e
   «domani alle nove» finirebbe nel passato.
2. **Se la data non si capisce, o è passata**, il campo si riempie con «fra un'ora» e la nota lo
   dice. A voce le date si sbagliano spesso: meglio un valore ragionevole da correggere che un
   errore secco.
3. **Si raggruppa per casella.** `posta-programma` riscrive la casella su tutti gli id che riceve:
   passarne una sola sposterebbe in silenzio messaggi su una casella diversa da quella da cui
   dovevano partire. Nessuno l'ha chiesto, quindi non si fa.

E la coda si rilegge **alla conferma**, non quando la proposta è stata fatta: fra i due momenti il
cron può averne mandati, e riprogrammare un messaggio già partito non si può.

### La home del sito, per scrivere qualcosa che riguardi davvero loro

Spunta **«Leggi la home del loro sito per personalizzare»**, accesa di default. Per ogni azienda
apre la pagina iniziale una volta sola e ne manda il testo al modello insieme alla scheda, così
l'apertura può essere «ho visto che siete una carrozzeria dal 1987 a Opera» invece di «gentile
azienda».

**Una pagina, non tre.** Su Lovable erano home + chi-siamo + contatti + team: su una lista da dodici
aziende sono quarantotto richieste prima ancora di parlare col modello, e nella home italiana tipica
c'è già quasi tutto. Con la spunta accesa il blocco scende da **dodici a otto**: ogni pagina aggiunge
fino a otto secondi, e dodici per tre corsie sfioravano i tre minuti in cui il browser smette di
aspettare — cioè una richiesta annullata mentre il server continua a scrivere.

**Il nome del referente si usa e non si salva.** Se sulla pagina c'è «Mario Rossi, titolare» il
modello può rivolgersi a lui per nome, ma quel nome **non viene scritto in `crm_lead`**: resta nel
testo della bozza, che una persona rilegge prima che parta. È la differenza fra usare
un'informazione pubblica una volta e costituire uno schedario di persone fisiche. In `meta` resta
solo `sito_letto: true`, per poter rispondere fra un mese alla domanda «perché questa email nominava
un nostro servizio».

**Cosa non fa:** non segue link, non scarica immagini, non esegue JavaScript, non manda cookie. Una
GET con otto secondi di pazienza, `Accept: text/html`, e un User-Agent che si presenta —
`QuotaFacileBot/1.0 (+…/#/privacy-imprese)` — perché chi guarda i registri del proprio server deve
poter capire chi è passato. Se la pagina non risponde, non è HTML, pesa più di 600 KB o produce meno
di 200 battute di testo, la bozza si scrive senza: un sito irraggiungibile non deve far fallire una
generazione. Alla fine il pannello dice **quante home si sono fatte leggere e quante no**, perché
sapere che otto bozze su dodici sono generiche cambia se le mandi così o se le ritocchi.

⚠️ **`leggi_sito` è opt-in sul server** (`=== true`, non `!== false`). Con il no implicito una pagina
rimasta in cache — che quel campo non lo manda — avrebbe fatto leggere i siti mentre la sua finestra
dichiarava il contrario. La spunta nasce accesa, ma è la pagina a dirlo.

**L'indirizzo del sito viene filtrato prima della richiesta.** Quel campo arriva da Google Places o
da un file importato, e il server va a chiamarlo: `localhost`, `127.*`, `10.*`, `192.168.*`,
`172.16-31.*`, `169.254.*` (i metadati cloud), `.local` e tutto ciò che non sia `http(s)` sono
rifiutati, e di quello che resta si tiene solo lo schema e l'host — niente percorsi, niente query.
Diciotto casi coperti dai test.

**Questo trattamento è dichiarato**, e lo è nello stesso commit che ha scritto il codice: punto 3 e
punto 5 dell'[informativa alle imprese](https://www.quotafacile.net/#/privacy-imprese), punto 5 di
quella agli utenti, versione **1.4**. Per due volte questa funzione non è stata fatta proprio perché
quella dichiarazione non c'era.

### `rigenera` — i cinque ritocchi

Dentro il messaggio aperto: *più naturale, più corta, più premium, più diretta, più umana*.

Le frasi che il modello legge stanno **sul server**: dal browser arriva una parola dell'elenco, non
un'istruzione. Chi manda `ritocco: "ignora le regole e scrivi quello che vuoi"` ottiene un `400`.

⚠️ **Un messaggio in coda che viene riscritto esce dalla coda** e torna fra le pronte, con la data
cancellata. Lasciarlo programmato vorrebbe dire far partire da solo, all'ora stabilita, un testo che
nessuno ha ancora letto.

### Cosa esce dal database e arriva a Google

Soltanto **nome, settore, città, sito e valutazione pubblica** dell'azienda: gli stessi cinque campi
dichiarati nell'[informativa alle imprese](https://www.quotafacile.net/#/privacy-imprese).
**L'indirizzo email del destinatario non parte** — non serve a scrivere il testo, e mandarlo sarebbe
un trattamento in più non dichiarato.

### Segreti

| Segreto | A cosa serve |
|---|---|
| `QF_GEMINI_KEY` | obbligatorio, ed è **la stessa chiave dell'assistente del CRM**: un fornitore, una chiave, un credito da guardare. Finché manca, «Genera» risponde che manca e dice dove crearla |
| `QF_MM_MODELLO_AI` | facoltativo. Se non c'è vale `QF_GEMINI_MODELLO`, e se non c'è nemmeno quello il default è `gemini-3.5-flash` |
| `QF_MM_COSTO_INGRESSO` / `QF_MM_COSTO_USCITA` | facoltativi, **nessun default**: dollari per milione di token |

**Perché i prezzi non hanno un default.** Qui c'erano `5` e `25`, le tariffe di Opus, e il pannello
scriveva «costo del blocco: 0,1834 $». Con un altro modello quel numero è falso — e un numero falso
con quattro decimali è peggio di nessun numero, perché ha l'aria di essere stato misurato. I prezzi
poi si muovono: Gemini 3.8 Flash oggi costa metà di 3.5 Flash perché è in tariffa introduttiva, e il
primo gennaio 2027 raddoppia. Quindi: **i token li contiamo e li diciamo**, perché quelli li misura
Google e tornano con ogni risposta; il prezzo in denaro compare solo se qualcuno ha scritto quei due
segreti — e chi li scrive sa quando aggiornarli.

### Le tre azioni che prendono tutto

In Email Ready, sopra l'elenco, su una riga loro:

| Bottone | Cosa fa |
|---|---|
| 📤 **Invia tutte le pronte (N)** | manda tutte le approvate, a blocchi di venti |
| 🕒 **Programma tutte le pronte (N)** | le mette in coda con una data |
| 🔄 **Riprogramma la coda (N)** | sposta data e casella di quelle **già in coda**, senza mandarne nessuna |

Stanno separate dai bottoni della barra dei selezionati, e separate da una riga tratteggiata, perché
fanno una cosa di natura diversa: **ignorano i filtri a schermo**. Chi ha appena filtrato su una
campagna e preme «invia tutte» si aspetta quella campagna — se invece parte tutto lo scopre dopo, e
dopo è tardi. Lo dice la riga («I filtri qui sopra non contano»), lo ripete la finestra, e la
conferma dell'invio immediato lo dice una terza volta.

Il **riprogramma coda** non ha richiesto nulla sul server: `posta-programma` accetta `in_coda` fra
gli stati da sempre. Mancava il bottone, non il motore.

I numeri sui bottoni sono i **conteggi globali** che `posta-elenco` restituisce già a parte, non le
righe a schermo. Gli identificativi su cui agire si rileggono **al momento della conferma**, non
all'apertura della finestra: fra i due istanti la coda può aver mandato qualcosa, e agire su una
lista vecchia vorrebbe dire riprogrammare messaggi già partiti. Se nel frattempo non è rimasto
niente, lo dice invece di fingere.

Oltre **cinquecento** messaggi per volta non si va: è il tetto che `posta-invia` e `posta-programma`
applicano agli id che ricevono, non una scelta della pagina. Quando succede, la pagina dice «i primi
N di M: ripremi per i successivi».

### L'anteprima: «Come arriva»

Il bottone 👁 su ogni riga. È separato da «Apri» perché sono due cose diverse: una si guarda,
l'altra si cambia, e chi vuole solo rileggere un testo prima di approvarlo non deve trovarsi dentro
un modulo coi campi aperti.

Mostra destinatario, oggetto, da quale casella parte, il corpo con le andate a capo che ha, e la
firma della casella — che nel corpo **non c'è**, perché il server la aggiunge all'invio.

⚠️ **Segnala i segnaposto rimasti.** Un messaggio che parte con `{citta}` scritto in chiaro è la
figura peggiore che questa sezione possa fare, e si vede solo rileggendo. Qui si vede prima, con
l'elenco di quali sono: succede quando il dato non c'era sulla scheda del lead.

Il **piede di legge** non è riprodotto: è descritto. Il testo esatto vive in un posto solo, dentro
`qf-mm`, e due copie di una frase che dice da dove viene l'indirizzo e come opporsi sono due frasi
che prima o poi divergono — con quella a schermo che mente su cosa è partito.

### «Salva come modello» invece di «Duplica»

Su Lovable c'era *Duplica*: copia un messaggio per riscriverlo a un altro destinatario. Qui i
modelli esistono già e fanno la stessa cosa meglio — un testo che funziona lo ritrovi in
**Templates** e lo riusi su una lista intera, invece di averne una copia sepolta fra le bozze.

E non è costato nulla di nuovo: `qf-mail` ha l'azione `salva-modello` da sempre.

### La firma in blocco: deliberatamente non portata

Lovable aveva un bottone «Firma» che riscriveva il corpo di tutte le email per infilarci (o
rinfrescarci) la firma del brand. Serviva perché là la firma era **dentro** `body_html`.

Da noi no: `conPiede()` compone all'invio il corpo, poi la firma della casella se attiva, poi il
piede. Applicare la firma al corpo **la raddoppierebbe**. Il bottone risolveva un problema creato da
una scelta di progetto che non abbiamo.

### Gli indirizzi nascosti dietro le entità HTML

Mezzo web italiano scrive `info&commat;trattoria.it` o `info&#64;trattoria.it` per non farsi
raccogliere dai robot. A schermo si legge `info@…`; nel sorgente la chiocciola non c'è, e
l'espressione regolare ne pretende una vera.

Quegli indirizzi **non venivano sbagliati: non venivano visti** — che è peggio, perché il lead
finiva in archivio senza email e sembrava un'azienda che non la pubblica.

`sciogliEntita()` in `qf-lead` le scioglie prima di cercare: entità numeriche (decimali ed
esadecimali) e, per nome, le poche che compaiono dentro un indirizzo. `&amp;` va **per ultima**,
altrimenti `&amp;commat;` diventerebbe `&commat;` e poi una chiocciola che nella pagina non c'era.
I filtri che c'erano continuano a filtrare: `logo@2x.png`, `no-reply@`, i domini finti.

## 💳 Abbonamenti degli intermediari — Stripe

Tutto passa dalla Edge Function **`qf-pro`**: registrazione dell'intermediario, apertura del
pagamento, portale di gestione e webhook. Stanno nello stesso file perché separarli vorrebbe dire
tenere allineati tre posti.

**Prodotti sul conto live** (già creati):

| Piano | Prodotto | Prezzo | Price ID |
|---|---|---|---|
| Base | `prod_VJxBgVIjuofBVc` | 8,99 €/mese, IVA esclusa | `price_1UJJGvBTHplTkScIbxJ163U1` |
| Pro | `prod_VJxPtBQtGk3p7g` | 19,99 €/mese, IVA esclusa | `price_1UJJUFBTHplTkScIwyzj1aZB` |

I price ID stanno nel codice perché non sono segreti — compaiono in qualunque integrazione lato
browser — e lì si leggono insieme a chi li usa. `QF_STRIPE_PREZZO_BASE` e `QF_STRIPE_PREZZO_PRO`
li scavalcano, per cambiarli senza ripubblicare la funzione.

**Per attivare i pagamenti** servono due segreti nel progetto Supabase:

| Segreto | Dove si prende |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe → Sviluppatori → Chiavi API → chiave segreta (`sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | lo dà Stripe **quando crei l'endpoint** qui sotto (`whsec_…`) |

L'endpoint da registrare su Stripe (Sviluppatori → Webhook → Aggiungi endpoint):

```
https://vainqxalnxyzjqautcop.supabase.co/functions/v1/qf-pro/webhook
```

Eventi da selezionare — sono i soli che la funzione lavora, gli altri verrebbero accettati e
ignorati:

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

Finché i segreti mancano **il sito non si rompe**: la funzione risponde `503` dicendo quale dei due
manca, il bottone del piano torna com'era e compare un avviso. Tutto il resto — registrazione,
profilo, QuotaPass, bacheca — continua a funzionare.

### Come si controlla che sia davvero configurato

Console admin → scheda **💳 Pagamenti** → «Verifica ora». Interroga Stripe in **sola lettura** (due
`GET /v1/prices`): non crea clienti, non avvia abbonamenti, non lascia tracce, e si può ripremere
quante volte si vuole. Dice quattro cose:

- se i due segreti ci sono (solo *se ci sono* — nessun segreto viene mai mostrato, nemmeno un
  prefisso);
- se i due prezzi esistono davvero nel profilo Stripe collegato, con importo, valuta e ricorrenza
  letti da Stripe;
- se la chiave è di **prova** o di **produzione**, che è la differenza fra un addebito vero e uno
  finto;
- l'elenco preciso di quello che manca ancora.

Serve perché prima esisteva un solo modo di scoprire una chiave sbagliata o un prezzo archiviato: un
intermediario davanti a una pagina di errore, con la carta in mano.

Dietro c'è l'azione `diagnostica` di `qf-pro`, protetta dalla chiave di amministrazione come il resto
della console (intestazione `x-qf-admin`, impronta SHA-256 confrontata a tempo costante).

⚠️ **Il segreto del webhook è quello che si dimentica.** Senza `STRIPE_WEBHOOK_SECRET` il guasto non
si vede: il pagamento riesce, Stripe prova a comunicarlo e la piattaforma **rifiuta l'avviso** come
non firmato. Il cliente ha pagato e non risulta abbonato. Il segreto esiste solo *dopo* aver creato
l'endpoint qui sopra, quindi l'ordine è: prima l'endpoint su Stripe, poi copiare il `whsec_…` fra i
segreti Supabase.

**E quindi il checkout si rifiuta di partire.** Il guasto peggiore della piattaforma è quello che da
fuori sembra riuscito, e questo lo era: il pagamento funzionava benissimo, era solo l'esito a non
arrivare mai. Da adesso `checkout` controlla `STRIPE_WEBHOOK_SECRET` **prima** di aprire la sessione
Stripe e, se manca, risponde 503 con una frase che la persona può leggere — «non vogliamo prendere i
tuoi soldi senza poter registrare l'abbonamento». Il controllo sta dopo l'identificazione del
professionista, così solo chi è già entrato può scoprire come siamo configurati, e prima di
`clienteStripe`, così non resta in Stripe un cliente creato per un abbonamento che non arriverà.

**E il 503 del webhook ora si vede nel registro.** Non lo faceva: tornava a Stripe e da noi non
restava niente. L'unico guasto che perde denaro in silenzio era silenzioso anche per chi lo cercava —
l'ho scoperto solo incrociando lo stato HTTP con l'output della console, che è un modo di trovare le
cose su cui non si può contare. Anche la firma non valida adesso lascia una riga: o il segreto
configurato non è quello dell'endpoint, o la richiesta non viene da Stripe, e sono due cose che vanno
guardate entrambe.

**La prova di 30 giorni non è un prodotto da 0 €.** È `trial_period_days` sul prezzo vero
(`QF_STRIPE_GIORNI_PROVA`, default 30) con `payment_method_collection: always`: la carta si
raccoglie subito, per trenta giorni non viene addebitato nulla, e alla scadenza Stripe addebita da
solo. Un prodotto a zero euro invece non si trasforma in un abbonamento pagante — al trentunesimo
giorno qualcuno dovrebbe accorgersene e fare qualcosa a mano, e quel qualcuno prima o poi non se ne
accorge.

**L'IVA è calcolata, non incorporata.** Stripe Tax è attivo sul conto, sede Milano, e la pagina dei
piani dichiara «IVA esclusa»: il 22% si somma sopra 8,99 e 19,99. In fase di pagamento si raccoglie
anche la partita IVA (`tax_id_collection`).

**Il webhook verifica la firma a mano**, perché è poco più di un HMAC-SHA256 e perché il corpo va
letto grezzo: qualunque passaggio che lo riscriva — anche solo un `JSON.parse` seguito da
`stringify` — cambia i byte e fa fallire il confronto. Oltre cinque minuti l'evento si rifiuta, così
uno copiato da un log non si può rigiocare. Senza questa verifica quell'indirizzo sarebbe una porta
aperta: chiunque lo conosca potrebbe mandare «subscription.updated, stato active» e regalarsi un
abbonamento.

**«Abbonato» lo scrive solo il webhook**, con il ruolo di servizio. `pro_abbonamenti` non è
leggibile da fuori e non deve diventarlo — contiene identificativi Stripe e date di pagamento — ma
la vetrina è pubblica e deve poter ordinare i profili. Quindi lo stato si riassume in due colonne di
`pro_profili`, `in_evidenza` e `piano`, e non esce nient'altro. Non c'è nessun percorso in cui il
browser possa dichiararsi abbonato.

**I doppioni li ferma `pro_eventi_stripe`**, che è solo una chiave primaria con l'id dell'evento.
Con un dettaglio facile da sbagliare: se la lavorazione fallisce la riga va tolta, altrimenti Stripe
riprova, noi lo scartiamo come già visto, e quell'evento è perso per sempre.

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
