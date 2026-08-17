-- Day-granularity events: schedule whole days (or ranges of days, e.g. a
-- week) instead of time slots within a day. Motivated by multi-day trip
-- planning, where the unit is "which week works", not "which half hour".
--
-- events.granularity:
--   'time' (default) — availability keys are UTC instants "2026-09-03T13:30Z"
--   'day'            — availability keys are plain dates  "2026-09-03"
--
-- In day mode day_start/day_end/slot_minutes are unused (they keep their
-- defaults so the events_day_range check still holds) and time zones are
-- irrelevant — a whole day is the same day everywhere.
--
-- Re-runnable, following the established migration style.

alter table public.events
  add column if not exists granularity text not null default 'time'
  check (granularity in ('time', 'day'));

------------------------------------------------------------------- save_response
-- Re-created so key validation matches the event's granularity: day-mode
-- events accept only date keys, time-mode events only instant keys. Keeping
-- the check strict per mode (rather than allowing both everywhere) means a
-- client bug can't silently write keys the grid will never render.

create or replace function public.save_response(
  p_token       text,
  p_response_id uuid default null,
  p_fields      jsonb default '{}'::jsonb,
  p_claim       boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event  public.events%rowtype;
  v_uid    uuid;
  v_row    public.responses%rowtype;
  v_name   text;
  v_avail  jsonb;
  v_answers jsonb;
  v_levels int;
  v_key_re text;
  k text;
  v jsonb;
  v_q public.questions%rowtype;
  elem jsonb;
begin
  select * into v_event from public.events where token = p_token;
  if not found then
    raise exception 'not_found';
  end if;
  if v_event.locked then
    raise exception 'event_locked';
  end if;

  v_uid := auth.uid();

  -- ------- validate identity fields (lengths clamped, name required)
  v_name := left(trim(coalesce(p_fields ->> 'name', '')), 120);
  if v_name = '' then
    raise exception 'name_required';
  end if;

  -- ------- validate availability: key shape depends on granularity
  v_avail := coalesce(p_fields -> 'availability', '{}'::jsonb);
  if jsonb_typeof(v_avail) <> 'object' then
    raise exception 'bad_availability';
  end if;
  v_levels := jsonb_array_length(v_event.preference_levels);
  if (select count(*) from jsonb_object_keys(v_avail)) > 5000 then
    raise exception 'bad_availability';
  end if;
  v_key_re := case when v_event.granularity = 'day'
                   then '^\d{4}-\d{2}-\d{2}$'
                   else '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$' end;
  for k, v in select * from jsonb_each(v_avail) loop
    if k !~ v_key_re
       or jsonb_typeof(v) <> 'number'
       or (v)::text !~ '^\d+$'
       or (v)::int < 0 or (v)::int >= v_levels then
      raise exception 'bad_availability';
    end if;
  end loop;

  -- ------- validate answers against this event's questions
  v_answers := coalesce(p_fields -> 'answers', '{}'::jsonb);
  if jsonb_typeof(v_answers) <> 'object' then
    raise exception 'bad_answers';
  end if;
  for k, v in select * from jsonb_each(v_answers) loop
    select * into v_q from public.questions q
     where q.event_id = v_event.id and q.id::text = k;
    if not found then
      raise exception 'bad_answers';
    end if;
    if v_q.type = 'text' then
      if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 2000 then
        raise exception 'bad_answers';
      end if;
    elsif v_q.type = 'single' then
      if jsonb_typeof(v) <> 'string' or not v_q.options @> jsonb_build_array(v) then
        raise exception 'bad_answers';
      end if;
    else -- multi
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 20 then
        raise exception 'bad_answers';
      end if;
      for elem in select * from jsonb_array_elements(v) loop
        if jsonb_typeof(elem) <> 'string' or not v_q.options @> jsonb_build_array(elem) then
          raise exception 'bad_answers';
        end if;
      end loop;
    end if;
  end loop;

  -- ------- insert or update
  if p_response_id is null then
    insert into public.responses
      (event_id, name, email, phone, position_title, organization,
       availability, answers, claimed_by)
    values
      (v_event.id, v_name,
       left(trim(coalesce(p_fields ->> 'email', '')), 200),
       left(trim(coalesce(p_fields ->> 'phone', '')), 50),
       left(trim(coalesce(p_fields ->> 'position_title', '')), 120),
       left(trim(coalesce(p_fields ->> 'organization', '')), 200),
       v_avail, v_answers,
       case when p_claim and v_uid is not null then v_uid else null end)
    returning * into v_row;
  else
    select * into v_row from public.responses r
     where r.id = p_response_id and r.event_id = v_event.id
     for update;
    if not found then
      raise exception 'not_found';
    end if;
    if v_row.claimed_by is not null and (v_uid is null or v_row.claimed_by <> v_uid) then
      raise exception 'response_claimed';
    end if;
    update public.responses set
      name           = v_name,
      email          = left(trim(coalesce(p_fields ->> 'email', '')), 200),
      phone          = left(trim(coalesce(p_fields ->> 'phone', '')), 50),
      position_title = left(trim(coalesce(p_fields ->> 'position_title', '')), 120),
      organization   = left(trim(coalesce(p_fields ->> 'organization', '')), 200),
      availability   = v_avail,
      answers        = v_answers,
      claimed_by     = case when p_claim and v_uid is not null then v_uid else claimed_by end
    where id = v_row.id
    returning * into v_row;
  end if;

  return jsonb_build_object('id', v_row.id, 'updated_at', v_row.updated_at,
                            'claimed', v_row.claimed_by is not null);
end;
$$;

------------------------------------------------------------------- get_event
-- Re-created to include granularity in the returned event object so the UI
-- knows which grid to render.

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
      'granularity', v_event.granularity,
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
