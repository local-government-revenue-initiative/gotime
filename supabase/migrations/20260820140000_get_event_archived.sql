-- get_event returns events.archived.
--
-- The archive control on the Manage page is a checkbox bound to
-- event.archived, but get_event never returned the column, so it read as
-- undefined: archiving worked while the tick never appeared, and un-ticking
-- was impossible. The function is otherwise identical to the version in
-- 20260818120000_drop_contact_fields.sql.
--
-- Re-runnable.

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
             'id', r.id, 'name', r.name, 'email', r.email,
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
                     'id', r.id, 'name', r.name, 'email', r.email,
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
             'id', r.id, 'name', r.name, 'email', r.email,
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
      'archived', v_event.archived,
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
