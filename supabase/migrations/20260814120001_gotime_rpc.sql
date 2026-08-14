-- GoTime respondent-facing RPCs.
--
-- Respondents have no accounts, so they cannot pass RLS. Instead, these
-- security-definer functions take the event's unguessable share token as
-- proof of access and enforce every rule server-side:
--   * locked events reject all writes;
--   * response visibility and name anonymization are applied before data
--     leaves the database;
--   * respondent contact details (email, phone, organization, position)
--     are NEVER returned to anyone but organizers;
--   * a response claimed by an account can only be edited by that account.
--
-- Client code maps the single-word exception messages (event_locked,
-- response_claimed, ...) to friendly text.
--
-- Written to be re-runnable.

------------------------------------------------------------------- get_event

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
    -- Organizers see everything, contact details included.
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
    -- Everyone else: no contact fields, and names masked when anonymized —
    -- except the caller's own claimed row, which comes back in full so they
    -- can edit it.
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
    -- Hidden responses: only the caller's own claimed row (if any).
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

------------------------------------------------------------------- save_response

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

  -- ------- validate availability: slot-key shaped keys, level-index values
  v_avail := coalesce(p_fields -> 'availability', '{}'::jsonb);
  if jsonb_typeof(v_avail) <> 'object' then
    raise exception 'bad_availability';
  end if;
  v_levels := jsonb_array_length(v_event.preference_levels);
  if (select count(*) from jsonb_object_keys(v_avail)) > 5000 then
    raise exception 'bad_availability';
  end if;
  for k, v in select * from jsonb_each(v_avail) loop
    if k !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$'
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

------------------------------------------------------------------- add_comment

create or replace function public.add_comment(
  p_token       text,
  p_author_name text,
  p_body        text,
  p_response_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_row   public.comments%rowtype;
begin
  select * into v_event from public.events where token = p_token;
  if not found then
    raise exception 'not_found';
  end if;
  if v_event.locked then
    raise exception 'event_locked';
  end if;
  if trim(coalesce(p_author_name, '')) = '' or trim(coalesce(p_body, '')) = '' then
    raise exception 'comment_empty';
  end if;

  insert into public.comments (event_id, response_id, author_name, body)
  values (v_event.id,
          (select r.id from public.responses r
            where r.id = p_response_id and r.event_id = v_event.id),
          left(trim(p_author_name), 120),
          left(trim(p_body), 2000))
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'created_at', v_row.created_at);
end;
$$;

------------------------------------------------------------------- suggest_date

create or replace function public.suggest_date(p_token text, p_date date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_row   public.event_dates%rowtype;
begin
  select * into v_event from public.events where token = p_token;
  if not found then
    raise exception 'not_found';
  end if;
  if v_event.locked then
    raise exception 'event_locked';
  end if;
  if not v_event.allow_suggestions then
    raise exception 'suggestions_disabled';
  end if;
  if p_date is null or p_date < (now() at time zone v_event.timezone)::date - 1
     or p_date > current_date + 365 * 2 then
    raise exception 'bad_date';
  end if;
  if (select count(*) from public.event_dates d where d.event_id = v_event.id) >= 60 then
    raise exception 'too_many_dates';
  end if;

  -- Suggestions arrive unapproved; an existing date (organizer's or another
  -- respondent's) is returned as-is.
  insert into public.event_dates (event_id, date, approved, suggested_by)
  values (v_event.id, p_date, false, null)
  on conflict (event_id, date) do nothing;

  select * into v_row from public.event_dates d
   where d.event_id = v_event.id and d.date = p_date;
  return jsonb_build_object('id', v_row.id, 'date', v_row.date, 'approved', v_row.approved);
end;
$$;

------------------------------------------------------------------- search_profiles

-- Co-organizer discovery for signed-in users: exact email match or
-- display-name prefix, capped at 10 rows so the user table can't be harvested.
create or replace function public.search_profiles(p_query text)
returns table (id uuid, display_name text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(trim(coalesce(p_query, ''))) < 2 then
    return;
  end if;
  return query
    select p.id, p.display_name, p.email
      from public.profiles p
     where lower(p.email) = lower(trim(p_query))
        or p.display_name ilike replace(replace(trim(p_query), '%', ''), '_', '') || '%'
     order by p.display_name
     limit 10;
end;
$$;

------------------------------------------------------------------------ grants

revoke all on function public.get_event(text) from public;
revoke all on function public.save_response(text, uuid, jsonb, boolean) from public;
revoke all on function public.add_comment(text, text, text, uuid) from public;
revoke all on function public.suggest_date(text, date) from public;
revoke all on function public.search_profiles(text) from public;

grant execute on function public.get_event(text) to anon, authenticated;
grant execute on function public.save_response(text, uuid, jsonb, boolean) to anon, authenticated;
grant execute on function public.add_comment(text, text, text, uuid) to anon, authenticated;
grant execute on function public.suggest_date(text, date) to anon, authenticated;
grant execute on function public.search_profiles(text) to authenticated;
