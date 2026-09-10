-- ============================================================
-- QuotaFacile — schema del database (progetto Supabase, eu-central-1)
-- ------------------------------------------------------------
-- Questo file descrive lo stato del database. Serve a poterlo
-- ricostruire da zero e, soprattutto, a poter discutere le
-- scelte in sede di revisione invece di doverle andare a leggere
-- nel pannello di Supabase.
--
-- Il principio che tiene insieme tutto: il browser non parla mai
-- con le tabelle. Parla con le Edge Function, che usano il ruolo
-- service_role e validano ciò che ricevono. Le policy pubbliche
-- qui sotto sono quindi pochissime e tutte in sola lettura.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Contatti in arrivo dal sito
-- ------------------------------------------------------------

create table if not exists public.richieste (
  id                 uuid primary key default gen_random_uuid(),
  creato_il          timestamptz not null default now(),
  tipo               text not null default 'preventivo'
                       check (tipo in ('preventivo','consulenza','revisione')),
  ramo               text,
  nome               text not null,
  citta              text,
  email              text not null,
  telefono           text,
  note               text,
  destinatario_id    text,
  destinatario_nome  text,
  destinatario_email text,
  consenso_privacy   boolean not null default false,
  consenso_testo     text,
  origine            text,
  stato              text not null default 'nuova'
                       check (stato in ('nuova','presa_in_carico','chiusa')),
  -- l'avviso è informativo: se fallisce, il contatto resta qui
  notifica_inviata   boolean not null default false,
  notifica_errore    text
);
comment on table public.richieste is
  'Richieste degli utenti. Conservazione dichiarata in Privacy Policy: 24 mesi dall''ultimo contatto.';

create table if not exists public.iscrizioni_pro (
  id               uuid primary key default gen_random_uuid(),
  creato_il        timestamptz not null default now(),
  nome             text not null,
  ruolo            text,
  azienda          text,
  rui_numero       text,
  rui_sezione      text,
  rui_dal          date,
  opera_per_conto  text,
  citta            text,
  telefono         text,
  email            text not null,
  specializzazioni text[],
  bio              text,
  -- nessuno è "verificato" per il fatto di essersi iscritto:
  -- il badge si concede dopo il riscontro sul registro IVASS
  stato_verifica   text not null default 'in_attesa'
                     check (stato_verifica in ('in_attesa','verificato','respinto')),
  verificato_il    timestamptz,
  note_admin       text,
  consenso_rui     boolean not null default false,
  consenso_termini boolean not null default false
);

create table if not exists public.waitlist (
  id        uuid primary key default gen_random_uuid(),
  creato_il timestamptz not null default now(),
  email     text not null unique,
  consenso  boolean not null default false
);

-- ------------------------------------------------------------
-- 2. Bacheca condivisa
-- ------------------------------------------------------------

create table if not exists public.domande (
  id                   uuid primary key default gen_random_uuid(),
  creato_il            timestamptz not null default now(),
  tipo                 text not null default 'utente' check (tipo in ('utente','guida')),
  categoria            text not null,
  domanda              text not null,
  -- solo per le guide pubblicate dalla console
  keyword              text,
  volume               text,
  difficolta           text,
  titolo_seo           text,
  meta_seo             text,
  risposta_redazionale text,
  stato                text not null default 'pubblicata' check (stato in ('pubblicata','rimossa')),
  motivo_rimozione     text,
  rimossa_il           timestamptz
);
comment on column public.domande.volume is
  'Volume di ricerca stimato, come annotato in fase di pianificazione (testo libero: "≈ 700/mese").';
comment on column public.domande.difficolta is 'Difficoltà stimata della keyword.';

create table if not exists public.risposte (
  id               uuid primary key default gen_random_uuid(),
  creato_il        timestamptz not null default now(),
  -- una risposta si aggancia a una domanda del database…
  domanda_id       uuid references public.domande(id),
  -- …oppure a un contenuto che vive nel repository ("k1" per una
  -- guida, "d12" per una domanda del giorno)
  domanda_chiave   text,
  autore_nome      text not null,
  autore_ruolo     text,
  autore_azienda   text,
  autore_rui       text,
  autore_email     text,
  testo            text not null,
  voti             integer not null default 0,
  migliore         boolean not null default false,
  -- Le risposte nascono in attesa. Senza autenticazione chiunque
  -- potrebbe firmarsi con il nome di un intermediario reale, e su
  -- un sito che vive di identità verificabile sarebbe il danno
  -- peggiore possibile.
  stato            text not null default 'in_attesa'
                     check (stato in ('in_attesa','pubblicata','rimossa')),
  motivo_rimozione text,
  moderata_il      timestamptz
);

create table if not exists public.voti (
  id          uuid primary key default gen_random_uuid(),
  creato_il   timestamptz not null default now(),
  risposta_id uuid not null references public.risposte(id),
  -- identificativo del dispositivo, non della persona
  votante     text not null,
  unique (risposta_id, votante)
);

-- Il conteggio dei voti lo tiene il database: se lo calcolasse il
-- client, due schede aperte darebbero due numeri diversi.
create or replace function public.aggiorna_conteggio_voti()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.risposte
     set voti = (select count(*) from public.voti where risposta_id
                 = coalesce(new.risposta_id, old.risposta_id))
   where id = coalesce(new.risposta_id, old.risposta_id);
  return null;
end;
$$;

drop trigger if exists voti_aggiornano_conteggio on public.voti;
create trigger voti_aggiornano_conteggio
after insert or delete on public.voti
for each row execute function public.aggiorna_conteggio_voti();

-- ------------------------------------------------------------
-- 3. Adempimenti
-- ------------------------------------------------------------

-- Art. 7.1 GDPR: il titolare deve poter dimostrare che
-- l'interessato ha prestato il consenso.
create table if not exists public.consensi (
  id          uuid primary key default gen_random_uuid(),
  creato_il   timestamptz not null default now(),
  contesto    text not null,
  testo       text,
  riferimento uuid
);

-- Artt. 16-17 DSA: notice & action, con motivazione della decisione.
create table if not exists public.segnalazioni (
  id               uuid primary key default gen_random_uuid(),
  creato_il        timestamptz not null default now(),
  target           text not null,
  motivo           text not null,
  dettaglio        text,
  email_segnalante text,
  stato            text not null default 'aperta' check (stato in ('aperta','accolta','respinta')),
  esito            text,
  chiusa_il        timestamptz
);

-- ------------------------------------------------------------
-- 4. Chiave della console di moderazione
-- ------------------------------------------------------------
-- Il segreto QF_ADMIN_TOKEN del progetto ha la precedenza. Qui
-- c'è solo l'impronta SHA-256 di un token casuale a 240 bit:
-- nemmeno chi legge questa tabella può risalire alla chiave.
create table if not exists public.impostazioni_admin (
  id            smallint primary key default 1 check (id = 1),
  token_hash    text not null,
  aggiornato_il timestamptz not null default now()
);
comment on table public.impostazioni_admin is
  'Impronta SHA-256 della chiave di amministrazione. Per ruotarla: update impostazioni_admin set token_hash = encode(digest(''nuova-chiave'',''sha256''),''hex''), aggiornato_il = now() where id = 1;';

-- ------------------------------------------------------------
-- 5. Freno agli invii automatici
-- ------------------------------------------------------------
-- Il modulo di preventivo non può chiedere di autenticarsi: è
-- pubblico per necessità. Questo evita che basti uno script per
-- riempire database e casella di posta.
create or replace function public.qf_troppe_richieste(p_email text, p_max integer default 5)
returns boolean language sql security definer set search_path = '' as $$
  select count(*) >= p_max
    from public.richieste
   where lower(email) = lower(p_email)
     and creato_il > now() - interval '1 hour';
$$;

-- ------------------------------------------------------------
-- 6. Row Level Security
-- ------------------------------------------------------------
-- RLS attiva ovunque. Le uniche policy sono due letture
-- pubbliche, ed espongono soltanto ciò che è pubblicato: una
-- risposta in attesa non è visibile a nessuno, nemmeno
-- conoscendone l'identificativo. Tutto il resto (contatti,
-- iscrizioni, segnalazioni, consensi, chiave admin) non ha alcuna
-- policy: nessuna chiave pubblica lo raggiunge, solo il
-- service_role delle Edge Function.

alter table public.richieste          enable row level security;
alter table public.iscrizioni_pro     enable row level security;
alter table public.waitlist           enable row level security;
alter table public.segnalazioni       enable row level security;
alter table public.consensi           enable row level security;
alter table public.impostazioni_admin enable row level security;
alter table public.domande            enable row level security;
alter table public.risposte           enable row level security;
alter table public.voti               enable row level security;

drop policy if exists "domande pubblicate visibili a tutti" on public.domande;
create policy "domande pubblicate visibili a tutti"
  on public.domande for select using (stato = 'pubblicata');

drop policy if exists "risposte pubblicate visibili a tutti" on public.risposte;
create policy "risposte pubblicate visibili a tutti"
  on public.risposte for select using (stato = 'pubblicata');

-- ------------------------------------------------------------
-- 7. CRM Bizpower
-- ------------------------------------------------------------
-- Tutto ciò che riguarda l'amministrazione della società sta in
-- tabelle con prefisso crm_. La separazione dal marketplace non è
-- un vezzo: i dati di QuotaFacile sono in parte pubblici (la
-- bacheca), quelli del CRM non lo sono mai. Tenerli distinti rende
-- difficile sbagliarsi.

create table if not exists public.crm_collaboratori (
  id         uuid primary key default gen_random_uuid(),
  creato_il  timestamptz not null default now(),
  nome       text not null,
  email      text not null unique,
  telefono   text,
  -- i ruoli di una struttura commerciale, più il titolare
  ruolo      text not null default 'commerciale'
               check (ruolo in ('titolare','direttore','account','commerciale','consulente')),
  -- Un collaboratore che se ne va si disattiva, non si cancella:
  -- cancellarlo porterebbe via anche la storia di ciò che ha
  -- prodotto e dei documenti che ha caricato.
  attivo     boolean not null default true,
  note       text,
  -- Aggancio all'utenza vera, quando i collaboratori avranno un
  -- proprio accesso. Nullo finché non esiste.
  utente_id  uuid unique
);
comment on table public.crm_collaboratori is
  'Collaboratori Bizpower. Non è una tabella pubblica: nessuna policy, si passa solo dalla Edge Function qf-crm.';

alter table public.crm_collaboratori enable row level security;

create index if not exists crm_collaboratori_attivo_idx
  on public.crm_collaboratori (attivo, nome);

-- ------------------------------------------------------------
-- 7b. CRM: accessi personali dei collaboratori
-- ------------------------------------------------------------
-- Il titolare entra con la chiave di amministrazione, che vale
-- per tutto. I collaboratori no: hanno un'utenza personale
-- (Supabase Auth) e da quel momento "chi entra" ha una risposta
-- diversa per ciascuno. Le regole di cosa può vedere non stanno
-- nella pagina né nella funzione, ma qui: una policy che il
-- database applica sempre non si può dimenticare di scrivere in
-- una schermata nuova.

alter table public.crm_collaboratori
  drop constraint if exists crm_collaboratori_utente_id_fkey;
alter table public.crm_collaboratori
  add constraint crm_collaboratori_utente_id_fkey
  foreign key (utente_id) references auth.users(id) on delete set null;

-- Le tre funzioni che rispondono a "chi sta chiedendo". Vivono
-- in uno schema che PostgREST non espone: devono essere
-- eseguibili dalle policy, non invocabili dal mondo via
-- /rest/v1/rpc. Sono SECURITY DEFINER perché leggono
-- crm_collaboratori anche per chi su quella tabella non ha
-- ancora alcun diritto — cioè chiunque, un istante prima di
-- sapere chi è.
create schema if not exists crm_interno;
grant usage on schema crm_interno to authenticated, service_role;

create or replace function crm_interno.collaboratore_corrente()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.crm_collaboratori
   where utente_id = auth.uid() and attivo
   limit 1;
$$;

create or replace function crm_interno.ruolo_corrente()
returns text language sql stable security definer set search_path = '' as $$
  select ruolo from public.crm_collaboratori
   where utente_id = auth.uid() and attivo
   limit 1;
$$;

create or replace function crm_interno.vede_tutto()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(crm_interno.ruolo_corrente() in ('titolare','direttore'), false);
$$;

revoke execute on all functions in schema crm_interno from public, anon;
grant  execute on all functions in schema crm_interno to authenticated;

-- La condizione "attivo" nella prima policy non è ridondante: la
-- sospensione dell'utenza impedisce di ottenere un token nuovo,
-- ma uno già emesso resta valido fino alla scadenza. Senza questa
-- riga, per quel margine un collaboratore appena disattivato
-- continuerebbe a entrare.
drop policy if exists "ognuno vede la propria scheda" on public.crm_collaboratori;
create policy "ognuno vede la propria scheda"
  on public.crm_collaboratori for select to authenticated
  using (utente_id = auth.uid() and attivo);

drop policy if exists "titolare e direttore vedono la squadra" on public.crm_collaboratori;
create policy "titolare e direttore vedono la squadra"
  on public.crm_collaboratori for select to authenticated
  using (crm_interno.vede_tutto());

-- Nessuna policy di scrittura su crm_collaboratori: ruoli,
-- attivazione e punteggio si cambiano solo dalla funzione qf-crm.
-- Un collaboratore che potesse promuoversi da solo renderebbe i
-- ruoli un ornamento.

-- ------------------------------------------------------------
-- 7c. CRM: documenti
-- ------------------------------------------------------------
create table if not exists public.crm_documenti (
  id               uuid primary key default gen_random_uuid(),
  creato_il        timestamptz not null default now(),
  collaboratore_id uuid not null references public.crm_collaboratori(id) on delete cascade,
  -- percorso dell'oggetto nel bucket: <collaboratore_id>/<file>
  percorso         text not null unique,
  nome_file        text not null,
  tipo_mime        text,
  dimensione       bigint,
  categoria        text not null default 'altro'
                     check (categoria in ('contratto','documento_identita','polizza','fattura','formazione','altro')),
  note             text,
  -- Le scadenze sono il motivo per cui questa non è una cartella
  -- condivisa: un contratto che scade va saputo prima, non dopo.
  scadenza         date,
  caricato_da      uuid references auth.users(id) on delete set null
);
comment on table public.crm_documenti is
  'Anagrafica dei documenti caricati dai collaboratori. I file veri stanno nel bucket privato "documenti".';

alter table public.crm_documenti enable row level security;

create index if not exists crm_documenti_collaboratore_idx
  on public.crm_documenti (collaboratore_id, creato_il desc);
create index if not exists crm_documenti_scadenza_idx
  on public.crm_documenti (scadenza) where scadenza is not null;

drop policy if exists "ognuno vede i propri documenti" on public.crm_documenti;
create policy "ognuno vede i propri documenti"
  on public.crm_documenti for select to authenticated
  using (collaboratore_id = crm_interno.collaboratore_corrente() or crm_interno.vede_tutto());

drop policy if exists "ognuno carica nella propria area" on public.crm_documenti;
create policy "ognuno carica nella propria area"
  on public.crm_documenti for insert to authenticated
  with check (collaboratore_id = crm_interno.collaboratore_corrente());

drop policy if exists "ognuno annota i propri documenti" on public.crm_documenti;
create policy "ognuno annota i propri documenti"
  on public.crm_documenti for update to authenticated
  using (collaboratore_id = crm_interno.collaboratore_corrente() or crm_interno.vede_tutto())
  with check (collaboratore_id = crm_interno.collaboratore_corrente() or crm_interno.vede_tutto());

drop policy if exists "ognuno elimina i propri documenti" on public.crm_documenti;
create policy "ognuno elimina i propri documenti"
  on public.crm_documenti for delete to authenticated
  using (collaboratore_id = crm_interno.collaboratore_corrente() or crm_interno.vede_tutto());

-- ------------------------------------------------------------
-- 7d. CRM: l'archivio dei file
-- ------------------------------------------------------------
-- Bucket PRIVATO: nessun file è raggiungibile da un indirizzo
-- pubblico, mai. Qui dentro finiscono contratti e documenti di
-- identità — un bucket pubblico sarebbe stato una violazione
-- ambulante, e la difficoltà di indovinare un indirizzo non è
-- una protezione.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documenti', 'documenti', false, 15728640,
  array['application/pdf','image/jpeg','image/png','image/heic','image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Il primo segmento del percorso è l'identificativo del
-- collaboratore: è ciò che rende l'area di ciascuno davvero sua.
drop policy if exists "documenti: ognuno carica nella propria cartella" on storage.objects;
create policy "documenti: ognuno carica nella propria cartella"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documenti'
    and (storage.foldername(name))[1] = crm_interno.collaboratore_corrente()::text);

drop policy if exists "documenti: ognuno legge i propri" on storage.objects;
create policy "documenti: ognuno legge i propri"
  on storage.objects for select to authenticated
  using (bucket_id = 'documenti'
    and ((storage.foldername(name))[1] = crm_interno.collaboratore_corrente()::text
         or crm_interno.vede_tutto()));

drop policy if exists "documenti: ognuno elimina i propri" on storage.objects;
create policy "documenti: ognuno elimina i propri"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documenti'
    and ((storage.foldername(name))[1] = crm_interno.collaboratore_corrente()::text
         or crm_interno.vede_tutto()));

-- ------------------------------------------------------------
-- 7e. CRM: lead locali
-- ------------------------------------------------------------
-- Attività raccolte dalle API ufficiali Google (Places +
-- Geocoding). Niente scraping: è il vincolo che il progetto
-- cercalead si era già dato, ed è anche ciò che tiene la
-- raccolta di dati d'impresa dentro il perimetro del legittimo
-- interesse invece che fuori.
--
-- Per la stessa ragione ogni riga porta con sé la propria
-- provenienza: da quale fonte, con quale ricerca, in che giorno.
-- Se un domani qualcuno chiede "dove avete preso il mio
-- recapito", la risposta è una riga di database, non un ricordo.

create table if not exists public.crm_lead (
  id            uuid primary key default gen_random_uuid(),
  creato_il     timestamptz not null default now(),

  -- identificativo Google: è ciò che impedisce di salvare due
  -- volte la stessa attività trovata da due ricerche diverse
  place_id      text unique,

  nome          text not null,
  categoria     text,
  indirizzo     text,
  citta         text,
  provincia     text,
  cap           text,
  telefono      text,
  sito          text,
  valutazione   numeric(2,1),
  recensioni    integer,
  lat           double precision,
  lng           double precision,

  -- ---- provenienza ----
  fonte         text not null default 'google_places',
  raccolto_il   timestamptz not null default now(),
  query_origine text,

  -- ---- lavorazione ----
  stato         text not null default 'nuovo'
                  check (stato in ('nuovo','contattato','in_trattativa','cliente','scartato')),
  assegnato_a   uuid references public.crm_collaboratori(id) on delete set null,
  note          text,
  contattato_il timestamptz
);
comment on table public.crm_lead is
  'Attività raccolte dalle API ufficiali Google. Ogni riga conserva la propria provenienza: fonte, ricerca che l''ha prodotta, data di raccolta.';

alter table public.crm_lead enable row level security;

create index if not exists crm_lead_stato_idx on public.crm_lead (stato, creato_il desc);
create index if not exists crm_lead_assegnato_idx on public.crm_lead (assegnato_a) where assegnato_a is not null;

drop policy if exists "ognuno vede i lead che gli sono assegnati" on public.crm_lead;
create policy "ognuno vede i lead che gli sono assegnati"
  on public.crm_lead for select to authenticated
  using (assegnato_a = crm_interno.collaboratore_corrente() or crm_interno.vede_tutto());

-- Chi lavora un lead può aggiornarne stato e note, non
-- riassegnarselo né cambiarne i dati di provenienza: quelli
-- raccontano da dove viene, e riscriverli cancellerebbe la
-- risposta a "dove avete preso il mio recapito".
drop policy if exists "ognuno aggiorna i lead che gli sono assegnati" on public.crm_lead;
create policy "ognuno aggiorna i lead che gli sono assegnati"
  on public.crm_lead for update to authenticated
  using (assegnato_a = crm_interno.collaboratore_corrente() or crm_interno.vede_tutto())
  with check (assegnato_a = crm_interno.collaboratore_corrente() or crm_interno.vede_tutto());

-- ------------------------------------------------------------
-- 7f. CRM: pipeline — etichette e attività
-- ------------------------------------------------------------
-- Due cose che mancavano perché un elenco di contatti diventi
-- un CRM:
--
-- 1. LE ETICHETTE. Lo stato dice a che punto è la trattativa ed
--    è uno solo per volta. Le etichette dicono tutto il resto —
--    "priorità alta", "richiamare a settembre", "ha già una
--    polizza" — e possono essere molte insieme. Confonderle in
--    un campo solo costringe a scegliere fra informazioni che
--    non si escludono.
--
-- 2. LE ATTIVITÀ. Chi ha chiamato, quando, com'è andata. È la
--    memoria del lavoro: senza, "contattato" è un'affermazione
--    che nessuno può verificare, e la produzione di ciascuno
--    resta un'opinione. Questa tabella sarà anche la fonte dei
--    punti, che si contano dai fatti registrati e non si
--    digitano a mano.

create table if not exists public.crm_etichette (
  id        uuid primary key default gen_random_uuid(),
  creato_il timestamptz not null default now(),
  nome      text not null unique,
  colore    text not null default 'verde'
              check (colore in ('verde','oro','rosso','blu','grigio'))
);

alter table public.crm_etichette enable row level security;

drop policy if exists "le etichette le vede chi è entrato" on public.crm_etichette;
create policy "le etichette le vede chi è entrato"
  on public.crm_etichette for select to authenticated using (true);

-- Molti a molti: un'etichetta sta su più lead, un lead ne porta
-- più di una.
create table if not exists public.crm_lead_etichette (
  lead_id      uuid not null references public.crm_lead(id) on delete cascade,
  etichetta_id uuid not null references public.crm_etichette(id) on delete cascade,
  messa_il     timestamptz not null default now(),
  primary key (lead_id, etichetta_id)
);

alter table public.crm_lead_etichette enable row level security;

drop policy if exists "le etichette dei propri lead" on public.crm_lead_etichette;
create policy "le etichette dei propri lead"
  on public.crm_lead_etichette for select to authenticated
  using (exists (
    select 1 from public.crm_lead l
     where l.id = lead_id
       and (l.assegnato_a = crm_interno.collaboratore_corrente() or crm_interno.vede_tutto())
  ));

create table if not exists public.crm_attivita (
  id               uuid primary key default gen_random_uuid(),
  creato_il        timestamptz not null default now(),
  lead_id          uuid not null references public.crm_lead(id) on delete cascade,
  -- chi l'ha fatta. Se il collaboratore viene rimosso resta null
  -- ma l'attività non sparisce: è successa comunque.
  collaboratore_id uuid references public.crm_collaboratori(id) on delete set null,
  tipo             text not null default 'nota'
                     check (tipo in ('chiamata','email','incontro','preventivo','nota')),
  testo            text,
  -- com'è andata: serve a distinguere venti tentativi da venti
  -- conversazioni, che non valgono la stessa cosa
  esito            text check (esito in ('positivo','da_richiamare','negativo','nessuna_risposta')),
  quando           timestamptz not null default now()
);

alter table public.crm_attivita enable row level security;

create index if not exists crm_attivita_lead_idx on public.crm_attivita (lead_id, quando desc);
create index if not exists crm_attivita_collaboratore_idx on public.crm_attivita (collaboratore_id, quando desc);

drop policy if exists "le attività sui lead che si vedono" on public.crm_attivita;
create policy "le attività sui lead che si vedono"
  on public.crm_attivita for select to authenticated
  using (exists (
    select 1 from public.crm_lead l
     where l.id = lead_id
       and (l.assegnato_a = crm_interno.collaboratore_corrente() or crm_interno.vede_tutto())
  ));

-- Registrare un'attività è consentito a chi ha il lead, ma solo
-- a proprio nome: firmare il lavoro di un altro falserebbe la
-- produzione di entrambi.
drop policy if exists "ognuno registra le proprie attività" on public.crm_attivita;
create policy "ognuno registra le proprie attività"
  on public.crm_attivita for insert to authenticated
  with check (
    collaboratore_id = crm_interno.collaboratore_corrente()
    and exists (
      select 1 from public.crm_lead l
       where l.id = lead_id
         and (l.assegnato_a = crm_interno.collaboratore_corrente() or crm_interno.vede_tutto())
    )
  );

-- Le quattro etichette con cui si comincia. Sono un punto di
-- partenza, non una regola: si aggiungono, si rinominano e si
-- eliminano dalla pipeline.
insert into public.crm_etichette (nome, colore) values
  ('Priorità alta', 'rosso'),
  ('Da richiamare', 'oro'),
  ('Preventivo inviato', 'blu'),
  ('Non interessato', 'grigio')
on conflict (nome) do nothing;

-- ------------------------------------------------------------
-- 7g. CRM: produzione
-- ------------------------------------------------------------
-- Il punteggio si calcola dai fatti registrati. Non è una
-- preferenza di stile: un numero che si può digitare a mano non
-- misura niente, e una classifica costruita così non motiva
-- nessuno — si scopre subito che dipende da chi tiene la penna.
--
-- Qui il punteggio è una VISTA: non esiste una colonna da
-- scrivere, esiste una somma che si ricalcola ogni volta
-- leggendo le attività e i lead. Non si può falsare senza
-- falsare i fatti.

-- Quanto vale cosa. I numeri sono discutibili — e vanno
-- discussi — ma il principio no: vale di più ciò che porta
-- avanti il lavoro, non ciò che lo fa sembrare avanti.
--
-- Una nota registrata vale zero: serve a ricordare, non a
-- produrre, e darle punti insegnerebbe solo a scrivere note.
create or replace function crm_interno.valore_attivita(p_tipo text, p_esito text)
returns integer language sql immutable set search_path = '' as $$
  select case p_tipo
           when 'chiamata'   then 2
           when 'email'      then 1
           when 'incontro'   then 5
           when 'preventivo' then 8
           else 0
         end
       + case p_esito
           when 'positivo'      then 3
           when 'da_richiamare' then 1
           else 0
         end;
$$;

create or replace view public.crm_produzione as
select
  c.id                                   as collaboratore_id,
  c.nome,
  c.ruolo,
  c.attivo,
  coalesce(a.attivita, 0)                as attivita,
  coalesce(a.chiamate, 0)                as chiamate,
  coalesce(a.incontri, 0)                as incontri,
  coalesce(a.preventivi, 0)              as preventivi,
  coalesce(a.punti_attivita, 0)          as punti_attivita,
  coalesce(l.lead_assegnati, 0)          as lead_assegnati,
  coalesce(l.clienti, 0)                 as clienti,
  -- Un cliente chiuso pesa quanto una giornata di telefonate: è
  -- il risultato, non il tentativo.
  coalesce(a.punti_attivita, 0) + coalesce(l.clienti, 0) * 20 as punti,
  a.ultima_attivita
from public.crm_collaboratori c
left join (
  select collaboratore_id,
         count(*)                                       as attivita,
         count(*) filter (where tipo = 'chiamata')      as chiamate,
         count(*) filter (where tipo = 'incontro')      as incontri,
         count(*) filter (where tipo = 'preventivo')    as preventivi,
         sum(crm_interno.valore_attivita(tipo, esito))  as punti_attivita,
         max(quando)                                    as ultima_attivita
    from public.crm_attivita
   where collaboratore_id is not null
   group by collaboratore_id
) a on a.collaboratore_id = c.id
left join (
  select assegnato_a,
         count(*)                                    as lead_assegnati,
         count(*) filter (where stato = 'cliente')   as clienti
    from public.crm_lead
   where assegnato_a is not null
   group by assegnato_a
) l on l.assegnato_a = c.id;

comment on view public.crm_produzione is
  'Classifica calcolata dai fatti registrati: attività e lead chiusi. Non esiste una colonna "punti" da scrivere a mano.';

-- La vista eredita le policy delle tabelle sottostanti, quindi un
-- commerciale vede i numeri costruiti sui propri lead e non su
-- quelli degli altri.
alter view public.crm_produzione set (security_invoker = on);

revoke all on public.crm_produzione from public, anon;
grant select on public.crm_produzione to authenticated, service_role;

revoke execute on function crm_interno.valore_attivita(text, text) from public, anon;
grant  execute on function crm_interno.valore_attivita(text, text) to authenticated, service_role;

-- La colonna "punti" su crm_collaboratori era un residuo del
-- primo passo, quando la produzione non aveva ancora una fonte.
-- Ora la fonte c'è, e tenere due numeri che possono divergere è
-- il modo più sicuro di non fidarsi di nessuno dei due.
alter table public.crm_collaboratori drop column if exists punti;

-- ------------------------------------------------------------
-- 7h. CRM: posta
-- ------------------------------------------------------------
-- Invio dalla casella della società, con modelli riutilizzabili
-- e registro di ciò che è partito.
--
-- Un'email inviata è un fatto che riguarda una persona: va
-- saputo che è stata mandata, a chi, quando e con quale testo.
-- Serve a non scrivere due volte alla stessa azienda, serve a
-- rispondere se qualcuno chiede conto di un messaggio, e serve
-- perché senza registro "abbiamo scritto a tutti" è una frase
-- che nessuno può verificare.

create table if not exists public.crm_email_modelli (
  id        uuid primary key default gen_random_uuid(),
  creato_il timestamptz not null default now(),
  nome      text not null unique,
  oggetto   text not null,
  corpo     text not null,
  scopo     text not null default 'contatto'
              check (scopo in ('contatto','preventivo','sollecito','informativa')),
  attivo    boolean not null default true
);

alter table public.crm_email_modelli enable row level security;

drop policy if exists "i modelli li vede chi è entrato" on public.crm_email_modelli;
create policy "i modelli li vede chi è entrato"
  on public.crm_email_modelli for select to authenticated using (true);

create table if not exists public.crm_email_inviate (
  id               uuid primary key default gen_random_uuid(),
  inviata_il       timestamptz not null default now(),
  lead_id          uuid references public.crm_lead(id) on delete set null,
  collaboratore_id uuid references public.crm_collaboratori(id) on delete set null,
  modello_id       uuid references public.crm_email_modelli(id) on delete set null,
  destinatario     text not null,
  oggetto          text not null,
  -- il testo esatto partito, non il modello: i modelli cambiano,
  -- quello che è stato scritto a una persona no
  corpo            text not null,
  esito            text not null default 'inviata' check (esito in ('inviata','fallita')),
  errore           text
);

alter table public.crm_email_inviate enable row level security;

create index if not exists crm_email_inviate_lead_idx
  on public.crm_email_inviate (lead_id, inviata_il desc);
create index if not exists crm_email_inviate_dest_idx
  on public.crm_email_inviate (lower(destinatario), inviata_il desc);

drop policy if exists "gli invii sui lead che si vedono" on public.crm_email_inviate;
create policy "gli invii sui lead che si vedono"
  on public.crm_email_inviate for select to authenticated
  using (
    collaboratore_id = crm_interno.collaboratore_corrente()
    or crm_interno.vede_tutto()
    or exists (
      select 1 from public.crm_lead l
       where l.id = lead_id
         and l.assegnato_a = crm_interno.collaboratore_corrente()
    )
  );

-- Chi ha detto di non voler essere contattato.
-- L'art. 21 del GDPR dà a chiunque il diritto di opporsi al
-- trattamento fatto per legittimo interesse — che è esattamente
-- la base su cui questi contatti sono stati raccolti. Il diritto
-- però vale poco se l'opposizione resta in una casella di posta:
-- deve stare qui, dove il sistema la incontra prima di ogni
-- invio. Per questo non è un promemoria ma un divieto.
alter table public.crm_lead
  add column if not exists no_contatto        boolean not null default false,
  add column if not exists no_contatto_il     timestamptz,
  add column if not exists no_contatto_motivo text,
  -- Google Places non restituisce l'indirizzo email: dà nome,
  -- indirizzo, telefono e sito, non la posta. Va trovata sul
  -- sito dell'attività e annotata qui, una volta sola.
  add column if not exists email              text;

create index if not exists crm_lead_no_contatto_idx
  on public.crm_lead (no_contatto) where no_contatto;

comment on column public.crm_lead.no_contatto is
  'Opposizione al contatto (art. 21 GDPR). Se vero, qf-mail rifiuta l''invio: non è un promemoria, è un divieto.';
comment on column public.crm_lead.email is
  'Indirizzo trovato a mano: Places non lo fornisce. Senza questo, a un lead si può solo telefonare.';

-- ------------------------------------------------------------
-- 8. Funzioni non esposte
-- ------------------------------------------------------------
-- Una funzione nello schema public è invocabile via /rest/v1/rpc
-- da chiunque abbia una chiave pubblica. Nessuna delle due qui
-- sotto è pensata per essere chiamata da fuori: la prima la
-- esegue il trigger, la seconda la Edge Function. Il trigger
-- continua a funzionare perché lo esegue il database, non chi ha
-- fatto la richiesta.
revoke execute on function public.aggiorna_conteggio_voti() from public, anon, authenticated;
revoke execute on function public.qf_troppe_richieste(text, integer) from public, anon, authenticated;
grant  execute on function public.qf_troppe_richieste(text, integer) to service_role;

-- ------------------------------------------------------------
-- 9. Mail Marketing
-- ------------------------------------------------------------
-- Il modulo che su Lovable viveva nel progetto Bizpower, portato
-- qui dentro. Le tabelle hanno prefisso mm_ per distinguerle da
-- quelle del CRM: sono cose diverse. Il CRM segue le persone —
-- chi è il lead, chi lo lavora, a che punto è. Il mail marketing
-- segue i messaggi — quale testo, a quale indirizzo, con quale
-- casella, e se è partito.
--
-- Una scelta va spiegata subito: i lead NON si duplicano. Su
-- Lovable c'era mm_leads separata dai lead del CRM, e due elenchi
-- della stessa azienda che divergono sono il modo più sicuro di
-- scrivere due volte a chi ha già detto di no. Qui le liste
-- puntano a crm_lead, che è già l'unico posto dove un'attività
-- esiste, con la sua provenienza e la sua eventuale opposizione.

-- ---- 9a. Mittenti ----
-- Il selettore di brand della sidebar. Su Lovable i brand erano
-- due costanti nel codice (Bizpower, Lori CRM): aggiungerne uno
-- voleva dire una modifica al sorgente e un rilascio. Qui sono
-- righe, così se domani si spedisce anche per un'altra società
-- basta inserirla.
create table if not exists public.mm_mittenti (
  id          uuid primary key default gen_random_uuid(),
  creato_il   timestamptz not null default now(),
  chiave      text not null unique,
  etichetta   text not null,
  from_email  text not null,
  from_nome   text not null,
  dominio     text not null,
  accento     text not null default '#145233',
  firma_html  text not null default '',
  attivo      boolean not null default true
);

alter table public.mm_mittenti enable row level security;

comment on table public.mm_mittenti is
  'Identità con cui si spedisce: il selettore di brand, come dati invece che come costanti nel codice.';

insert into public.mm_mittenti (chiave, etichetta, from_email, from_nome, dominio, accento)
values ('quotafacile', 'QuotaFacile', 'info@quotafacile.net', 'QuotaFacile', 'quotafacile.net', '#145233')
on conflict (chiave) do nothing;

-- ---- 9b. Caselle di invio ----
-- La password NON sta qui. Su Lovable veniva salvata e poi
-- applicata a un segreto; questa tabella conserva solo ciò che
-- serve a sapere se una casella funziona e quanto ha spedito.
-- La credenziale resta nei segreti del progetto (QF_SMTP_PASS),
-- dove il database non la può leggere e un errore di RLS non la
-- può esporre.
create table if not exists public.mm_smtp (
  id                 uuid primary key default gen_random_uuid(),
  creato_il          timestamptz not null default now(),
  mittente_id        uuid references public.mm_mittenti(id) on delete cascade,
  nome               text not null,
  host               text not null,
  porta              integer not null default 465,
  -- 465 apre gia in TLS, 587 ci passa dopo con STARTTLS: e la
  -- coppia che si sbaglia piu spesso, e l'errore che ne esce non
  -- somiglia alla causa.
  tls                boolean not null default true,
  utente             text not null,
  from_email         text not null,
  from_nome          text not null default '',
  rispondi_a         text,
  firma              text,
  firma_attiva       boolean not null default true,
  -- l'identificativo del segreto nel Vault, non il segreto
  segreto_id         uuid,
  stato              text not null default 'nuovo'
                       check (stato in ('nuovo','attivo','errore','sospeso')),
  -- Aruba taglia le connessioni a chi supera la propria soglia:
  -- il limite non è una gentilezza, è ciò che tiene viva la casella.
  limite_giornaliero integer not null default 200,
  inviate_oggi       integer not null default 0,
  giorno_contatore   date    not null default current_date,
  ultimo_uso         timestamptz,
  ultimo_test_il     timestamptz,
  ultimo_test_esito  text check (ultimo_test_esito in ('ok','errore')),
  ultimo_test_errore text,

  -- SPF, DKIM e DMARC: i tre documenti che dicono a chi riceve
  -- che il dominio ha davvero autorizzato chi spedisce. Senza,
  -- la posta parte lo stesso e finisce nello spam.
  spf_stato          text not null default 'non_verificato'
                       check (spf_stato in ('ok','avviso','assente','non_verificato')),
  dkim_stato         text not null default 'non_verificato'
                       check (dkim_stato in ('ok','avviso','assente','non_verificato')),
  dmarc_stato        text not null default 'non_verificato'
                       check (dmarc_stato in ('ok','avviso','assente','non_verificato')),
  dkim_selettore     text,
  punteggio          integer,
  dns_esito          jsonb,
  dns_verificato_il  timestamptz
);

alter table public.mm_smtp enable row level security;
create index if not exists mm_smtp_mittente_idx on public.mm_smtp (mittente_id);

comment on column public.mm_smtp.segreto_id is
  'Riferimento al segreto nel Vault di Supabase. La password non sta in questa tabella: qui c''e solo il numero della cassetta, e la chiave ce l''ha il database.';
comment on column public.mm_smtp.punteggio is
  'Quanto il dominio e credibile per chi riceve: SPF 40, DKIM 40, DMARC 20. Non dice se l''email arriva, dice se ha i documenti in regola.';
comment on column public.mm_smtp.limite_giornaliero is
  'Soglia giornaliera concordata col fornitore. Superarla non fa arrivare più posta: fa sospendere la casella.';

-- ---- 9c. Liste ----
create table if not exists public.mm_liste (
  id            uuid primary key default gen_random_uuid(),
  creata_il     timestamptz not null default now(),
  nome          text not null,
  descrizione   text,
  mittente_id   uuid references public.mm_mittenti(id) on delete set null,
  creata_da     uuid references public.crm_collaboratori(id) on delete set null
);

alter table public.mm_liste enable row level security;

create table if not exists public.mm_lista_lead (
  lista_id    uuid not null references public.mm_liste(id) on delete cascade,
  lead_id     uuid not null references public.crm_lead(id) on delete cascade,
  aggiunto_il timestamptz not null default now(),
  primary key (lista_id, lead_id)
);

alter table public.mm_lista_lead enable row level security;
create index if not exists mm_lista_lead_lead_idx on public.mm_lista_lead (lead_id);

comment on table public.mm_lista_lead is
  'Appartenenza di un lead a una lista. Il lead resta uno solo, in crm_lead: le liste sono punti di vista su quell''elenco, non copie.';

-- I lead che arrivano a mano o da un file non hanno un place_id
-- di Google, quindi l'unicita su quella colonna non li copre:
-- il doppione si riconosce dall'indirizzo email, che e anche il
-- solo modo in cui reimportare due volte lo stesso file
-- produrrebbe due schede della stessa azienda.
create index if not exists crm_lead_email_idx
  on public.crm_lead (lower(email)) where email is not null;

-- ---- 9d. Campagne ----
create table if not exists public.mm_campagne (
  id               uuid primary key default gen_random_uuid(),
  creata_il        timestamptz not null default now(),
  nome             text not null,
  mittente_id      uuid references public.mm_mittenti(id) on delete set null,
  lista_id         uuid references public.mm_liste(id) on delete set null,
  modello_id       uuid references public.crm_email_modelli(id) on delete set null,
  smtp_id          uuid references public.mm_smtp(id) on delete set null,
  -- Un invio di massa senza pause somiglia a uno spam anche
  -- quando non lo e: la pausa fra un messaggio e l'altro serve a
  -- non farsi chiudere la casella. Sotto i 15 secondi, su una
  -- casella condivisa, il fornitore sospende.
  pausa_secondi    integer not null default 60,
  stato            text not null default 'bozza'
                     check (stato in ('bozza','in_revisione','programmata','in_corso','completata','annullata')),
  programmata_per  timestamptz,
  note             text
);

alter table public.mm_campagne enable row level security;
create index if not exists mm_campagne_stato_idx on public.mm_campagne (stato, creata_il desc);

-- ---- 9e. Posta in uscita ----
-- Il cuore del modulo: una riga per messaggio, dalla stesura
-- all'esito. Il corpo è quello esatto che parte, non il modello:
-- i modelli cambiano, ciò che è stato scritto a una persona no.
create table if not exists public.mm_email (
  id               uuid primary key default gen_random_uuid(),
  creata_il        timestamptz not null default now(),
  mittente_id      uuid references public.mm_mittenti(id) on delete set null,
  smtp_id          uuid references public.mm_smtp(id) on delete set null,
  campagna_id      uuid references public.mm_campagne(id) on delete cascade,
  lead_id          uuid references public.crm_lead(id) on delete set null,
  modello_id       uuid references public.crm_email_modelli(id) on delete set null,
  destinatario     text not null,
  oggetto          text not null,
  corpo            text not null,
  stato            text not null default 'bozza'
                     check (stato in ('bozza','pronta','in_coda','inviata','fallita','annullata')),
  programmata_per  timestamptz,
  inviata_il       timestamptz,
  errore           text,
  -- Una email corretta a mano non va rigenerata: chi l'ha
  -- riscritta aveva un motivo, e sovrascriverla lo cancella in
  -- silenzio.
  modificata       boolean not null default false,
  meta             jsonb not null default '{}'::jsonb
);

alter table public.mm_email enable row level security;
create index if not exists mm_email_stato_idx     on public.mm_email (stato, creata_il desc);
create index if not exists mm_email_coda_idx      on public.mm_email (programmata_per)
  where stato = 'in_coda';
create index if not exists mm_email_campagna_idx  on public.mm_email (campagna_id);
create index if not exists mm_email_dest_idx      on public.mm_email (lower(destinatario), creata_il desc);
create index if not exists mm_email_lead_idx      on public.mm_email (lead_id) where lead_id is not null;

-- ---- 9f. Blacklist ----
-- crm_lead.no_contatto copre chi è già nel CRM. Questa copre
-- tutti gli altri: chi risponde NO da un indirizzo che non
-- corrisponde a nessun lead, chi scrive per conto di un collega,
-- chi chiede la cancellazione prima ancora di essere schedato.
-- Un'opposizione che il sistema non sa dove mettere è
-- un'opposizione che prima o poi viene ignorata.
create table if not exists public.mm_blacklist (
  id          uuid primary key default gen_random_uuid(),
  aggiunta_il timestamptz not null default now(),
  email       text not null,
  motivo      text,
  origine     text not null default 'manuale'
                check (origine in ('manuale','risposta','bounce','reclamo'))
);

create unique index if not exists mm_blacklist_email_idx
  on public.mm_blacklist (lower(email));

alter table public.mm_blacklist enable row level security;

comment on table public.mm_blacklist is
  'Indirizzi da non contattare, anche se non corrispondono a nessun lead. Consultata prima di ogni invio.';

-- ---- 9g. Chi vede cosa ----
-- Il mail marketing è lavoro di direzione: decide cosa la
-- società dice a nome proprio. Lo vede chi vede tutto. I
-- collaboratori continuano a vedere i propri lead e i propri
-- documenti, che è il loro lavoro.
do $$
declare t text;
begin
  foreach t in array array['mm_mittenti','mm_smtp','mm_liste','mm_lista_lead',
                           'mm_campagne','mm_email','mm_blacklist']
  loop
    execute format('drop policy if exists "solo chi vede tutto" on public.%I', t);
    execute format(
      'create policy "solo chi vede tutto" on public.%I for select to authenticated using (crm_interno.vede_tutto())', t);
  end loop;
end $$;

-- ---- 9h. Il Vault, raggiungibile solo dal server ----
-- vault.decrypted_secrets non e esposto da PostgREST, e non deve
-- esserlo. Queste tre funzioni stanno in public perche la Edge
-- Function possa chiamarle, ma l'esecuzione e tolta a tutti
-- tranne service_role: chi ha la chiave pubblica del sito non
-- puo nemmeno provarci.

create or replace function public.mm_segreto_scrivi(p_id uuid, p_valore text, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_id is not null and exists (select 1 from vault.secrets where id = p_id) then
    perform vault.update_secret(p_id, p_valore);
    return p_id;
  end if;
  select vault.create_secret(p_valore, p_nome, 'Password della casella di invio ' || p_nome) into v_id;
  return v_id;
end $$;

create or replace function public.mm_segreto_leggi(p_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_id;
$$;

create or replace function public.mm_segreto_elimina(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where id = p_id;
$$;

revoke execute on function public.mm_segreto_scrivi(uuid, text, text)  from public, anon, authenticated;
revoke execute on function public.mm_segreto_leggi(uuid)               from public, anon, authenticated;
revoke execute on function public.mm_segreto_elimina(uuid)             from public, anon, authenticated;
grant  execute on function public.mm_segreto_scrivi(uuid, text, text)  to service_role;
grant  execute on function public.mm_segreto_leggi(uuid)               to service_role;
grant  execute on function public.mm_segreto_elimina(uuid)             to service_role;

-- ---- 9i. La coda che parte da sola ----
-- I messaggi programmati non partono da soli finche qualcuno non
-- va a premere un tasto: pg_cron chiama la Edge Function a
-- intervalli regolari e le fa svuotare la coda un pezzo per
-- volta.
--
-- IL CRON NON HA LA CHIAVE DI AMMINISTRAZIONE.
-- Ne ha una sua, che apre una porta sola: coda-scarica. Dare al
-- cron la chiave dell'area riservata avrebbe voluto dire tenerla
-- in chiaro in una definizione di job, e un job compromesso
-- avrebbe letto tutto il CRM. Cosi al massimo fa partire posta
-- che qualcuno aveva gia approvato.
-- In tabella c'e solo l'impronta; il valore in chiaro sta nel
-- Vault, dove il job va a prenderlo al momento della chiamata.

-- pg_cron per la sveglia, pg_net perche il cron possa fare una
-- richiesta HTTP: su Supabase vanno in extensions, non in public.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

alter table public.impostazioni_admin add column if not exists coda_hash text;

comment on column public.impostazioni_admin.coda_hash is
  'SHA-256 del token che autorizza il solo svuotamento della coda. Il valore in chiaro sta nel Vault, alla voce mm_coda_token.';

-- Ogni giro lascia una riga. Serve a rispondere a una domanda
-- sola, ma quella conta: "il cron gira?". Senza, una coda ferma e
-- una coda vuota si assomigliano troppo.
create table if not exists public.mm_coda_giri (
  id         bigserial primary key,
  quando     timestamptz not null default now(),
  trovati    integer not null default 0,
  partite    integer not null default 0,
  fallite    integer not null default 0,
  in_attesa  integer not null default 0,
  note       text
);

create index if not exists mm_coda_giri_quando on public.mm_coda_giri (quando desc);

alter table public.mm_coda_giri enable row level security;
drop policy if exists "solo chi vede tutto" on public.mm_coda_giri;
create policy "solo chi vede tutto" on public.mm_coda_giri
  for select to authenticated using (crm_interno.vede_tutto());

-- Trenta giorni: questi giri servono a capire se la coda gira
-- adesso, non a tenere uno storico. Uno al minuto vuol dire
-- mezzo milione di righe l'anno per niente.
create or replace function public.mm_coda_pota()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.mm_coda_giri where quando < now() - interval '30 days';
$$;

revoke execute on function public.mm_coda_pota() from public, anon, authenticated;
grant  execute on function public.mm_coda_pota() to service_role;

-- I due job. Il token viene letto dal Vault a ogni chiamata: non
-- compare nella definizione, quindi chi legge cron.job non lo
-- vede.
--
--   select cron.schedule('mm-coda', '* * * * *', $giro$
--     select net.http_post(
--       url := 'https://<progetto>.supabase.co/functions/v1/qf-mm',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-qf-coda', (select decrypted_secret from vault.decrypted_secrets
--                        where name = 'mm_coda_token')),
--       body := '{"azione":"coda-scarica"}'::jsonb,
--       timeout_milliseconds := 120000);
--   $giro$);
--
--   select cron.schedule('mm-coda-pota', '17 4 * * *',
--                        $pota$ select public.mm_coda_pota(); $pota$);
--
-- Restano commentati perche dipendono dall'indirizzo del
-- progetto e dal token nel Vault: si eseguono a mano una volta,
-- non a ogni applicazione dello schema.

-- ---- 9l. Automazioni: le sequenze ----
-- Una sequenza e' un seguito programmato: il primo messaggio,
-- poi un secondo dopo N giorni a chi non ha dato segno, poi
-- basta. La parte che conta non e' mandare il secondo: e' non
-- mandarlo.
--
-- COME SI CAPISCE CHE HANNO RISPOSTO
-- Non leggendo la posta in arrivo. Per farlo servirebbe tenere
-- una connessione IMAP aperta sulla casella e interpretare i
-- messaggi che arrivano, e un errore li' vorrebbe dire o seguiti
-- mandati a chi aveva gia' risposto, o seguiti mai mandati. Il
-- segnale che questo modulo usa e' quello che una persona
-- registra davvero: crm_lead.stato. Appena esce da 'contattato'
-- la sequenza si ferma, insieme alle opposizioni, alla blacklist
-- e agli indirizzi non piu' validi.

create table if not exists public.mm_sequenze (
  id          uuid primary key default gen_random_uuid(),
  creata_il   timestamptz not null default now(),
  nome        text not null,
  attiva      boolean not null default false,
  mittente_id uuid references public.mm_mittenti(id) on delete set null,
  smtp_id     uuid references public.mm_smtp(id) on delete set null,
  note        text
);

comment on table public.mm_sequenze is
  'Sequenze di messaggi con attesa fra un passo e l''altro. Una sequenza spenta non fa niente: i suoi iscritti restano fermi dove sono.';

-- I passi. Il primo ha dopo_giorni = 0: parte appena qualcuno
-- entra. Gli altri contano i giorni dal passo precedente, non
-- dall'iscrizione, perche' e' cosi' che si ragiona scrivendo.
create table if not exists public.mm_sequenze_passi (
  id           uuid primary key default gen_random_uuid(),
  sequenza_id  uuid not null references public.mm_sequenze(id) on delete cascade,
  ordine       integer not null,
  dopo_giorni  integer not null default 0 check (dopo_giorni between 0 and 365),
  modello_id   uuid references public.crm_email_modelli(id) on delete set null,
  oggetto      text,
  corpo        text,
  unique (sequenza_id, ordine)
);

comment on column public.mm_sequenze_passi.dopo_giorni is
  'Giorni di attesa dal passo precedente. Sul primo passo vale zero.';

-- Chi e' dentro, a che punto e', e quando tocca al prossimo
-- messaggio. Un lead sta in una sequenza una volta sola: due
-- iscrizioni vorrebbero dire due seguiti alla stessa persona,
-- che e' esattamente la cosa da non fare.
create table if not exists public.mm_sequenze_iscritti (
  id              uuid primary key default gen_random_uuid(),
  sequenza_id     uuid not null references public.mm_sequenze(id) on delete cascade,
  lead_id         uuid not null references public.crm_lead(id) on delete cascade,
  entrato_il      timestamptz not null default now(),
  passo_fatto     integer not null default 0,
  prossimo_il     timestamptz not null default now(),
  stato           text not null default 'attivo'
                    check (stato in ('attivo','fermato','finito')),
  fermato_motivo  text,
  fermato_il      timestamptz,
  unique (sequenza_id, lead_id)
);

-- L'indice che serve al giro del cron: chi e' dovuto adesso.
create index if not exists mm_sequenze_iscritti_dovuti_idx
  on public.mm_sequenze_iscritti (prossimo_il)
  where stato = 'attivo';

create index if not exists mm_sequenze_iscritti_lead_idx
  on public.mm_sequenze_iscritti (lead_id);

-- Da quale sequenza viene un messaggio: senza questo il Send Log
-- mostra email che sembrano nate dal nulla.
alter table public.mm_email add column if not exists sequenza_id uuid
  references public.mm_sequenze(id) on delete set null;

alter table public.mm_sequenze          enable row level security;
alter table public.mm_sequenze_passi    enable row level security;
alter table public.mm_sequenze_iscritti enable row level security;

do $$
declare t text;
begin
  foreach t in array array['mm_sequenze','mm_sequenze_passi','mm_sequenze_iscritti']
  loop
    execute format('drop policy if exists "solo chi vede tutto" on public.%I', t);
    execute format(
      'create policy "solo chi vede tutto" on public.%I for select to authenticated using (crm_interno.vede_tutto())', t);
  end loop;
end $$;
