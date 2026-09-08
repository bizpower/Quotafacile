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
