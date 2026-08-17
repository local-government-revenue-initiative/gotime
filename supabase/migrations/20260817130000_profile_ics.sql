-- Optional published-calendar URL per user, for the "show my busy times"
-- overlay on the respond page.
--
-- This is the user's own published (public) ICS link — the one Outlook or
-- Google generates when you publish a calendar. It is stored only on that
-- user's own profile row; the existing profiles policies already restrict
-- select/update to auth.uid() = id, so no new policy is needed, and no
-- other user (or organizer) can read it.
--
-- Re-runnable.

alter table public.profiles
  add column if not exists ics_url text not null default ''
  check (char_length(ics_url) <= 1000);
