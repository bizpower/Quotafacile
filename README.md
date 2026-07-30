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
│   ├── js/mailer.js              # 📬 Consegna delle richieste via email (config in cima)
│   ├── js/admin.js               # 🔐 Console riservata (#/admin): KPI, moderazione, keyword
│   ├── js/legal.js               # ⚖️ Privacy, Cookie Policy, T&C, Note legali (+ LEGAL_CONFIG)
│   └── js/consent.js             # 🍪 Cookie banner e centro preferenze (CMP)
├── robots.txt
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

> Nota demo: alla creazione del profilo la dashboard viene popolata con lead di esempio; in produzione andranno tracciati i contatti reali (click su Chiama/Email, form consulenza).

## Avvio locale

```bash
# opzione 1: apri direttamente
open index.html

# opzione 2: server locale
npx serve .
```

## Deploy su GitHub Pages

```bash
git init
git add .
git commit -m "QuotaFacile v1"
git branch -M main
git remote add origin https://github.com/TUO-USERNAME/quotafacile.git
git push -u origin main
```

Poi su GitHub: **Settings → Pages → Source: main / root**. Il sito sarà su `https://TUO-USERNAME.github.io/quotafacile/`.

> Aggiorna `sitemap.xml`, i tag `canonical`/`og:url` in `index.html` con il dominio definitivo.

### Gamification (la SEO del portale)
- **+10 pt** risposta pubblicata · **+5 pt** voto utile · **+25 pt** migliore risposta
- Livelli: Novizio → Consulente (50) → Esperto (150) → **Top Advisor (300)**
- I Top Advisor finiscono in evidenza in home → incentivo a produrre contenuto → contenuto = pagine indicizzabili

## SEO: cosa c'è e prossimo step

**Già incluso:**
- Meta title/description/keywords come da brief, Open Graph, Twitter card, canonical
- JSON-LD statico (`Organization`, `WebSite` + `SearchAction`)
- JSON-LD **dinamico `FAQPage`** rigenerato ad ogni navigazione della bacheca e delle singole domande
- `robots.txt` + `sitemap.xml`

**Nota importante:** questa v1 è una SPA con routing `#/`. Per sfruttare al massimo la genialata Q&A su Google, il passo successivo è servire ogni domanda come **pagina statica con URL proprio** (es. `/faq/classe-di-merito-auto-nuova/`), perché gli URL con `#` non vengono indicizzati come pagine separate. Opzioni, in ordine di sforzo:
1. **Prerender/SSG**: uno script che genera un file HTML per ogni FAQ dal database (il markup c'è già).
2. Migrazione a **Astro/Next.js** con backend (Supabase/Firebase) quando i contenuti diventano reali.

## 📬 Consegna delle richieste via email

Il sito è statico: non c'è un server che possa spedire email. La consegna passa da un servizio
**form-to-email** configurato in cima a `assets/js/mailer.js`.

| Evento | Destinatario |
|---|---|
| Richiesta di preventivo o consulenza | `destinatarioPiattaforma` + **la casella del professionista**, se la richiesta è indirizzata a lui (`#/preventivo?to=b1`) |
| Nuova domanda in bacheca | `destinatarioPiattaforma` |
| Registrazione di un professionista | `destinatarioPiattaforma`, con i recapiti e il promemoria di verificare il RUI |
| Iscrizione alla waitlist dell'app | `destinatarioPiattaforma` |

I recapiti che il professionista inserisce nel proprio profilo **sono le destinazioni**: il pulsante
CHIAMA compone quel numero, le richieste di consulenza scrivono a quell'indirizzo. La sua dashboard
lo dichiara esplicitamente — non esiste una casella interna da controllare.

> ⚠️ **Attivazione, una volta sola.** Con FormSubmit la prima richiesta inviata a un indirizzo non
> viene recapitata: arriva invece un'email di conferma con un link da cliccare. Vale per la casella
> della piattaforma **e per quella di ogni professionista**. Fai una richiesta di prova e conferma.

> 🔒 **Se la consegna fallisce nessun dato va perso:** l'utente vede una schermata con un `mailto:`
> già compilato e un solo pulsante da premere, e la richiesta resta comunque registrata nei KPI.

**Consigliato prima del traffico reale:** passare a Web3Forms (`provider: "web3forms"` + chiave
gratuita) oppure all'alias FormSubmit — così l'indirizzo di destinazione non resta leggibile nel
sorgente e non viene raccolto dagli spambot.

Il fornitore è un **responsabile del trattamento** ex art. 28 GDPR ed è dichiarato nella Privacy
Policy: cambiando provider va aggiornata anche quella sezione in `legal.js`.

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
