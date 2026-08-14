-- GoTime core schema: events, organizers, dates, questions, responses, comments.
--
-- Access model, in one paragraph: organizers are signed-in users and reach
-- these tables directly under Row Level Security scoped to event_organizers
-- membership. Respondents do NOT need accounts and never touch the tables
-- directly: everything they do goes through the security-definer functions in
-- the companion "rpc" migration, which take the event's unguessable share
-- token and enforce locking, response visibility, and anonymization
-- server-side. The anon role therefore has NO grants on any table here.
--
-- Written to be re-runnable: the migration can be applied to a fresh database
-- or an existing one without erroring.

create extension if not exists pgcrypto with schema extensions;

------------------------------------------------------------------- helpers

-- 12-char URL-safe share token (72 bits of randomness).
create or replace function public.new_share_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_');
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

------------------------------------------------------------------- profiles

-- Mirror of auth.users so organizers can find each other as co-organizers.
-- Filled by a trigger on auth.users; users may edit their display name.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null default '',
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name',
             split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any users who signed up before this migration ran.
insert into public.profiles (id, email, display_name)
select u.id, coalesce(u.email, ''), split_part(coalesce(u.email, ''), '@', 1)
from auth.users u
on conflict (id) do nothing;

------------------------------------------------------------------- events

create table if not exists public.events (
  id                uuid primary key default gen_random_uuid(),
  token             text not null unique default public.new_share_token(),
  title             text not null check (char_length(title) between 1 and 140),
  description       text not null default '' check (char_length(description) <= 5000),
  created_by        uuid not null references auth.users (id) on delete cascade,
  timezone          text not null default 'UTC' check (char_length(timezone) <= 64),
  slot_minutes      int  not null default 30 check (slot_minutes in (15, 20, 30, 60)),
  day_start         time not null default '08:00',
  day_end           time not null default '18:00',
  preference_levels jsonb not null default
    '["Not available", "Possible (but inconvenient)", "Possible (and convenient)"]'
    check (jsonb_typeof(preference_levels) = 'array'
           and jsonb_array_length(preference_levels) between 2 and 6),
  responses_visible bool not null default true,
  anonymize_names   bool not null default false,
  allow_suggestions bool not null default false,
  locked            bool not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint events_day_range check (day_end > day_start)
);

comment on table public.events is
  'One row per scheduling poll. token is the unguessable share-link key; preference_levels is an array of level labels, index 0 = not available.';

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

------------------------------------------------------------------- organizers

create table if not exists public.event_organizers (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'co' check (role in ('owner', 'co')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_organizers_user_idx
  on public.event_organizers (user_id);

-- The creator automatically becomes the owner-organizer. Security definer so
-- the insert isn't blocked by event_organizers' own RLS during the trigger.
create or replace function public.add_owner_organizer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_organizers (event_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists events_add_owner on public.events;
create trigger events_add_owner
  after insert on public.events
  for each row execute function public.add_owner_organizer();

-- Membership check used by nearly every policy below. Security definer to
-- avoid RLS recursion (a policy on event_organizers can't query itself).
create or replace function public.is_organizer(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_organizers eo
    where eo.event_id = p_event and eo.user_id = (select auth.uid())
  );
$$;

------------------------------------------------------------------- responses

create table if not exists public.responses (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 120),
  email          text not null default '' check (char_length(email) <= 200),
  phone          text not null default '' check (char_length(phone) <= 50),
  position_title text not null default '' check (char_length(position_title) <= 120),
  organization   text not null default '' check (char_length(organization) <= 200),
  availability   jsonb not null default '{}',
  answers        jsonb not null default '{}',
  claimed_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.responses is
  'availability maps slot keys ("2026-09-03T13:30Z") to preference level indices; answers maps question ids to values. claimed_by links the response to an account with exclusive edit rights.';

create index if not exists responses_event_idx
  on public.responses (event_id, created_at);

drop trigger if exists responses_touch_updated_at on public.responses;
create trigger responses_touch_updated_at
  before update on public.responses
  for each row execute function public.touch_updated_at();

------------------------------------------------------------------- dates

-- Candidate dates. Organizer-added rows are approved; respondent suggestions
-- (allow_suggestions on) arrive approved = false until an organizer approves.
create table if not exists public.event_dates (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  date         date not null,
  approved     bool not null default true,
  suggested_by uuid references public.responses (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (event_id, date)
);

create index if not exists event_dates_event_idx
  on public.event_dates (event_id, date);

------------------------------------------------------------------- questions

create table if not exists public.questions (
  id       uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  type     text not null check (type in ('single', 'multi', 'text')),
  label    text not null check (char_length(label) between 1 and 300),
  options  jsonb not null default '[]'
    check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 20),
  required bool not null default false,
  position int  not null default 0
);

create index if not exists questions_event_idx
  on public.questions (event_id, position);

------------------------------------------------------------------- comments

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  response_id uuid references public.responses (id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 120),
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index if not exists comments_event_idx
  on public.comments (event_id, created_at);

------------------------------------------------------------------- row security

alter table public.profiles         enable row level security;
alter table public.events           enable row level security;
alter table public.event_organizers enable row level security;
alter table public.event_dates      enable row level security;
alter table public.questions        enable row level security;
alter table public.responses        enable row level security;
alter table public.comments         enable row level security;

-- Re-runnable: policies have no CREATE ... IF NOT EXISTS form.

-- profiles: users see and edit only their own row. Co-organizer discovery
-- goes through the search_profiles() RPC, which rate-limits what it returns.
drop policy if exists "read own profile"   on public.profiles;
drop policy if exists "update own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id);
create policy "update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- events
drop policy if exists "organizers read events"   on public.events;
drop policy if exists "users create events"      on public.events;
drop policy if exists "organizers update events" on public.events;
drop policy if exists "owners delete events"     on public.events;
create policy "organizers read events"
  on public.events for select to authenticated
  using (public.is_organizer(id));
create policy "users create events"
  on public.events for insert to authenticated
  with check (auth.uid() = created_by);
create policy "organizers update events"
  on public.events for update to authenticated
  using (public.is_organizer(id))
  with check (public.is_organizer(id));
create policy "owners delete events"
  on public.events for delete to authenticated
  using (exists (
    select 1 from public.event_organizers eo
    where eo.event_id = id and eo.user_id = auth.uid() and eo.role = 'owner'
  ));

-- event_organizers: any organizer can see the team and add co-organizers;
-- only 'co' rows can be removed (the owner row lives and dies with the event).
drop policy if exists "organizers read team"   on public.event_organizers;
drop policy if exists "organizers add team"    on public.event_organizers;
drop policy if exists "organizers remove team" on public.event_organizers;
create policy "organizers read team"
  on public.event_organizers for select to authenticated
  using (public.is_organizer(event_id));
create policy "organizers add team"
  on public.event_organizers for insert to authenticated
  with check (public.is_organizer(event_id) and role = 'co');
create policy "organizers remove team"
  on public.event_organizers for delete to authenticated
  using (public.is_organizer(event_id) and role = 'co');

-- event_dates / questions: organizers manage them freely.
drop policy if exists "organizers read dates"   on public.event_dates;
drop policy if exists "organizers write dates"  on public.event_dates;
drop policy if exists "organizers update dates" on public.event_dates;
drop policy if exists "organizers delete dates" on public.event_dates;
create policy "organizers read dates"
  on public.event_dates for select to authenticated
  using (public.is_organizer(event_id));
create policy "organizers write dates"
  on public.event_dates for insert to authenticated
  with check (public.is_organizer(event_id));
create policy "organizers update dates"
  on public.event_dates for update to authenticated
  using (public.is_organizer(event_id))
  with check (public.is_organizer(event_id));
create policy "organizers delete dates"
  on public.event_dates for delete to authenticated
  using (public.is_organizer(event_id));

drop policy if exists "organizers read questions"   on public.questions;
drop policy if exists "organizers write questions"  on public.questions;
drop policy if exists "organizers update questions" on public.questions;
drop policy if exists "organizers delete questions" on public.questions;
create policy "organizers read questions"
  on public.questions for select to authenticated
  using (public.is_organizer(event_id));
create policy "organizers write questions"
  on public.questions for insert to authenticated
  with check (public.is_organizer(event_id));
create policy "organizers update questions"
  on public.questions for update to authenticated
  using (public.is_organizer(event_id))
  with check (public.is_organizer(event_id));
create policy "organizers delete questions"
  on public.questions for delete to authenticated
  using (public.is_organizer(event_id));

-- responses / comments: organizers may read full rows (contact details
-- included) and delete spam. All inserts and edits — including the
-- organizer's own availability — go through the RPCs, so no insert/update
-- policies exist at all.
drop policy if exists "organizers read responses"   on public.responses;
drop policy if exists "organizers delete responses" on public.responses;
create policy "organizers read responses"
  on public.responses for select to authenticated
  using (public.is_organizer(event_id));
create policy "organizers delete responses"
  on public.responses for delete to authenticated
  using (public.is_organizer(event_id));

drop policy if exists "organizers read comments"   on public.comments;
drop policy if exists "organizers delete comments" on public.comments;
create policy "organizers read comments"
  on public.comments for select to authenticated
  using (public.is_organizer(event_id));
create policy "organizers delete comments"
  on public.comments for delete to authenticated
  using (public.is_organizer(event_id));

------------------------------------------------------------------------ grants

grant usage on schema public to authenticated, anon;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, delete on public.event_organizers to authenticated;
grant select, insert, update, delete on public.event_dates to authenticated;
grant select, insert, update, delete on public.questions to authenticated;
grant select, delete on public.responses to authenticated;
grant select, delete on public.comments to authenticated;

-- Respondents without accounts interact only through the security-definer
-- RPCs; the anon role gets nothing else.
revoke all on public.profiles         from anon;
revoke all on public.events           from anon;
revoke all on public.event_organizers from anon;
revoke all on public.event_dates      from anon;
revoke all on public.questions        from anon;
revoke all on public.responses        from anon;
revoke all on public.comments         from anon;

revoke all on function public.new_share_token() from public, anon;
grant execute on function public.new_share_token() to authenticated;
revoke all on function public.is_organizer(uuid) from public;
grant execute on function public.is_organizer(uuid) to authenticated, anon;
