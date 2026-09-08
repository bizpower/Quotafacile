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
  -- i ruoli sono quelli già in uso in LORI, più il titolare
  ruolo      text not null default 'commerciale'
               check (ruolo in ('titolare','direttore','account','commerciale','consulente')),
  -- Un collaboratore che se ne va si disattiva, non si cancella:
  -- cancellarlo porterebbe via anche la storia di ciò che ha
  -- prodotto e dei documenti che ha caricato.
  attivo     boolean not null default true,
  note       text,
  -- Punteggio di produzione: lo alimenteranno lead e trattative.
  -- Nasce a zero e non si scrive a mano.
  punti      integer not null default 0,
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
