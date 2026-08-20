-- Shorter default preference levels.
--
-- "Possible (but inconvenient)" / "Possible (and convenient)" were accurate
-- but long: they wrap on the brush bar and read as a mouthful in the results
-- legend. "If need be" / "Available" say the same thing in a glance.
--
-- Only the column default changes. Every existing event stores its own
-- labels, so events already created (and any custom levels an organizer set)
-- keep exactly the wording their respondents have already seen.
--
-- Re-runnable.

alter table public.events
  alter column preference_levels
  set default '["Not available", "If need be", "Available"]'::jsonb;
