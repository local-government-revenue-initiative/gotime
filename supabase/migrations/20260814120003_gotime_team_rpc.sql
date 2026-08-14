-- Organizer-team listing. profiles is select-own-only, so organizers need a
-- scoped way to see the names/emails of their own event's team. Organizers of
-- an event already see each other's contact details by design.

create or replace function public.list_event_organizers(p_event uuid)
returns table (user_id uuid, role text, display_name text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_organizer(p_event) then
    raise exception 'not_organizer';
  end if;
  return query
    select eo.user_id, eo.role, coalesce(p.display_name, ''), coalesce(p.email, '')
      from public.event_organizers eo
      left join public.profiles p on p.id = eo.user_id
     where eo.event_id = p_event
     order by eo.role desc, p.display_name;  -- owner first
end;
$$;

revoke all on function public.list_event_organizers(uuid) from public, anon;
grant execute on function public.list_event_organizers(uuid) to authenticated;
