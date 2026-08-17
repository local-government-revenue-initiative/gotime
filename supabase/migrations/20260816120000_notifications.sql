-- Organizer email notifications.
--
-- Each event carries a notify_mode. When a response is inserted or updated,
-- an AFTER trigger asynchronously POSTs to the notify-organizers Edge
-- Function (via pg_net), which looks up the event's organizers and emails
-- them through Resend. The trigger never blocks or fails the respondent's
-- save — pg_net only queues the request, and any error is swallowed.
--
-- notify_mode:  'off'  = never;  'new' = first-time responses only (default);
--               'all'  = new responses and later edits.
--
-- The shared secret the trigger sends (x-notify-secret) lives in a private
-- table, seeded out-of-band (not in this committed file). Until the Edge
-- Function has its RESEND_API_KEY set, it no-ops, so this is dormant and safe.

create extension if not exists pg_net;

alter table public.events
  add column if not exists notify_mode text not null default 'new'
  check (notify_mode in ('off', 'new', 'all'));

-- Private config (shared secret). No API access — only the definer trigger reads it.
create schema if not exists private;
create table if not exists private.config (
  key   text primary key,
  value text not null
);
revoke all on schema private from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;

create or replace function public.notify_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode   text;
  v_kind   text;
  v_secret text;
begin
  select notify_mode into v_mode from public.events where id = new.event_id;
  if v_mode is null or v_mode = 'off' then
    return new;
  end if;

  v_kind := case when tg_op = 'INSERT' then 'new' else 'edit' end;
  if v_mode = 'new' and v_kind = 'edit' then
    return new;
  end if;

  select value into v_secret from private.config where key = 'notify_secret';

  -- Fire-and-forget; a notification failure must never break saving a response.
  begin
    perform net.http_post(
      url := 'https://huahyyikgfqhficrdhbd.supabase.co/functions/v1/notify-organizers',
      body := jsonb_build_object('response_id', new.id, 'event_id', new.event_id, 'kind', v_kind),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-notify-secret', coalesce(v_secret, '')
      )
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

revoke all on function public.notify_response() from public, anon, authenticated;

drop trigger if exists responses_notify on public.responses;
create trigger responses_notify
  after insert or update on public.responses
  for each row execute function public.notify_response();

-- Re-create get_event with notify_mode added to the returned event object
-- (organizer UI reads it to initialise the notification selector).
create or replace function public.get_event(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event  public.events%rowtype;
  v_uid    uuid;
  v_is_org boolean;
  v_responses jsonb;
  v_count  int;
begin
  select * into v_event from public.events where token = p_token;
  if not found then
    raise exception 'not_found';
  end if;

  v_uid := auth.uid();
  v_is_org := v_uid is not null and exists (
    select 1 from public.event_organizers eo
    where eo.event_id = v_event.id and eo.user_id = v_uid
  );

  select count(*) into v_count from public.responses r where r.event_id = v_event.id;

  if v_is_org then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id, 'name', r.name, 'email', r.email, 'phone', r.phone,
             'position_title', r.position_title, 'organization', r.organization,
             'availability', r.availability, 'answers', r.answers,
             'claimed', r.claimed_by is not null,
             'mine', r.claimed_by = v_uid,
             'created_at', r.created_at, 'updated_at', r.updated_at
           ) order by r.created_at), '[]'::jsonb)
      into v_responses
      from public.responses r where r.event_id = v_event.id;
  elsif v_event.responses_visible then
    select coalesce(jsonb_agg(x.obj order by x.created_at), '[]'::jsonb)
      into v_responses
      from (
        select r.created_at,
               case
                 when v_uid is not null and r.claimed_by = v_uid then
                   jsonb_build_object(
                     'id', r.id, 'name', r.name, 'email', r.email, 'phone', r.phone,
                     'position_title', r.position_title, 'organization', r.organization,
                     'availability', r.availability, 'answers', r.answers,
                     'claimed', true, 'mine', true,
                     'created_at', r.created_at, 'updated_at', r.updated_at)
                 else
                   jsonb_build_object(
                     'id', r.id,
                     'name', case when v_event.anonymize_names
                       then 'Respondent ' || row_number() over (order by r.created_at)
                       else r.name end,
                     'availability', r.availability, 'answers', r.answers,
                     'claimed', r.claimed_by is not null, 'mine', false,
                     'created_at', r.created_at, 'updated_at', r.updated_at)
               end as obj
          from public.responses r
         where r.event_id = v_event.id
      ) x;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id, 'name', r.name, 'email', r.email, 'phone', r.phone,
             'position_title', r.position_title, 'organization', r.organization,
             'availability', r.availability, 'answers', r.answers,
             'claimed', true, 'mine', true,
             'created_at', r.created_at, 'updated_at', r.updated_at
           ) order by r.created_at), '[]'::jsonb)
      into v_responses
      from public.responses r
     where r.event_id = v_event.id and v_uid is not null and r.claimed_by = v_uid;
  end if;

  return jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event.id, 'token', v_event.token, 'title', v_event.title,
      'description', v_event.description, 'timezone', v_event.timezone,
      'slot_minutes', v_event.slot_minutes,
      'day_start', to_char(v_event.day_start, 'HH24:MI'),
      'day_end', to_char(v_event.day_end, 'HH24:MI'),
      'preference_levels', v_event.preference_levels,
      'responses_visible', v_event.responses_visible,
      'anonymize_names', v_event.anonymize_names,
      'allow_suggestions', v_event.allow_suggestions,
      'notify_mode', v_event.notify_mode,
      'locked', v_event.locked, 'created_at', v_event.created_at),
    'is_organizer', v_is_org,
    'dates', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id, 'date', d.date, 'approved', d.approved,
               'suggested', d.suggested_by is not null
             ) order by d.date), '[]'::jsonb)
        from public.event_dates d where d.event_id = v_event.id),
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', q.id, 'type', q.type, 'label', q.label,
               'options', q.options, 'required', q.required, 'position', q.position
             ) order by q.position, q.label), '[]'::jsonb)
        from public.questions q where q.event_id = v_event.id),
    'comments', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id, 'author_name', c.author_name, 'body', c.body,
               'created_at', c.created_at
             ) order by c.created_at), '[]'::jsonb)
        from public.comments c where c.event_id = v_event.id),
    'responses', v_responses,
    'response_count', v_count);
end;
$$;
