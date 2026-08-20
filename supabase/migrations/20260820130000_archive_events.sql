-- Archiving: let organizers put a finished event out of the way without
-- destroying it.
--
-- Archiving is purely organizational — it hides the event from "Your events"
-- on the home page and nothing else. The share link keeps working, responses
-- and results stay intact, and it is reversible. Stopping new responses is a
-- separate, existing control (events.locked), so the two can be used
-- independently: archive a finished event, lock a running one, or both.
--
-- Deletion needs no schema work: RLS already restricts DELETE on events to
-- the owner (not co-organizers), and every child table cascades.
--
-- Re-runnable, following the established style.

alter table public.events
  add column if not exists archived boolean not null default false;

comment on column public.events.archived is
  'Organizer-side tidying only: hides the event from the organizer home page. Does not affect the share link, responses, or results.';
