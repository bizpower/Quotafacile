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
-- 7. Funzioni non esposte
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
