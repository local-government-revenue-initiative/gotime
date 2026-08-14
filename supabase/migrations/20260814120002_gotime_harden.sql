-- Hardening pass after the security advisor run.
--
-- The five token-gated RPCs (get_event, save_response, add_comment,
-- suggest_date + search_profiles for signed-in users) are *meant* to be
-- callable through the API — that is the entire respondent access model, so
-- their advisor warnings are accepted. Trigger functions, however, have no
-- business being callable via /rest/v1/rpc/ (Postgres would reject the call
-- anyway, but there is no reason to leave the door handle on), and
-- is_organizer() is only referenced from RLS policies, which run as
-- `authenticated`.
--
-- Trigger execution does not recheck EXECUTE privilege at fire time, so
-- revoking these breaks nothing.

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.add_owner_organizer() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.is_organizer(uuid) from anon;
