-- "Events you've responded to" on the signed-in landing page.
--
-- A signed-in user's saved responses carry claimed_by, but no permission
-- path lets them list those across events: signed-in table access is
-- organizer-scoped everywhere, and respondents only ever go through the
-- share-token RPC. This function is that path: it returns the events behind
-- the caller's own claimed responses — including each event's share token,
-- which is fine to hand back because having responded means having the link.
--
-- Events the caller organizes are excluded: they already appear in "Your
-- events", and one event in two lists reads as a bug.
--
-- Re-runnable, following the established style.

create or replace function public.list_my_responses()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'token', e.token,
           'title', e.title,
           'locked', e.locked,
           'granularity', e.granularity,
           'responded_at', r.updated_at
         ) order by r.updated_at desc), '[]'::jsonb)
    from public.responses r
    join public.events e on e.id = r.event_id
   where r.claimed_by = auth.uid()
     and auth.uid() is not null
     and not exists (
       select 1 from public.event_organizers eo
       where eo.event_id = e.id and eo.user_id = auth.uid()
     );
$$;

revoke all on function public.list_my_responses() from public, anon;
grant execute on function public.list_my_responses() to authenticated;
