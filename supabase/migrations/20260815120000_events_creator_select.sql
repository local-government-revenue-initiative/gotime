-- Fix: creating an event failed with "new row violates row-level security
-- policy for table events".
--
-- createEvent inserts with RETURNING (PostgREST .select()). Under RLS the
-- returned row must pass a SELECT policy, but the only select policy checked
-- event_organizers membership — and the owner row is added by an AFTER
-- INSERT trigger, which has not fired when RETURNING is evaluated. So the
-- creator could insert the event but not read it back, which Postgres
-- reports with the misleading RLS-violation message.
--
-- The creator of an event can always read it, trigger timing aside.

drop policy if exists "creators read own events" on public.events;
create policy "creators read own events"
  on public.events for select to authenticated
  using (auth.uid() = created_by);
