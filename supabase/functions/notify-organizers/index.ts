// notify-organizers — emails an event's organizers when a response comes in.
//
// Called (fire-and-forget) by the `responses_notify` trigger via pg_net with
// { response_id, event_id, kind: 'new' | 'edit' } and an x-notify-secret
// header. Runs with the service-role key (auto-provided) so it can read
// organizer emails, which never leave the server otherwise.
//
// Required Edge Function secrets (set in the Supabase dashboard):
//   NOTIFY_SECRET   — must match private.config.notify_secret
//   RESEND_API_KEY  — a Resend API key (if unset, this no-ops: feature dormant)
//   NOTIFY_FROM     — sender, e.g. 'GoTime <notifications@evan-trowbridge.com>'
//   APP_ORIGIN      — optional, e.g. 'https://its-go-time.vercel.app' (for links)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const secret = Deno.env.get('NOTIFY_SECRET') ?? '';
  if (!secret || req.headers.get('x-notify-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  // Dormant until Resend is configured — succeed quietly so nothing errors.
  if (!resendKey) return json({ ok: true, skipped: 'resend_not_configured' });

  const from = Deno.env.get('NOTIFY_FROM') ?? 'GoTime <notifications@example.com>';
  const origin = Deno.env.get('APP_ORIGIN') ?? 'https://its-go-time.vercel.app';

  let payload: { response_id?: string; event_id?: string; kind?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const { response_id, event_id, kind } = payload;
  if (!response_id || !event_id) return json({ error: 'missing_fields' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: event } = await supabase
    .from('events')
    .select('title, token, notify_mode')
    .eq('id', event_id)
    .single();
  if (!event) return json({ error: 'event_not_found' }, 404);

  // Defensive re-check of the mode (the trigger already filtered).
  if (event.notify_mode === 'off') return json({ ok: true, skipped: 'off' });
  if (event.notify_mode === 'new' && kind === 'edit') return json({ ok: true, skipped: 'edit' });

  const { data: response } = await supabase
    .from('responses')
    .select('name')
    .eq('id', response_id)
    .single();
  const respondentName = response?.name ?? 'Someone';

  // Organizer emails: event_organizers → profiles.email. Two explicit
  // queries because there is no direct FK between event_organizers and
  // profiles for PostgREST to auto-embed (both reference auth.users).
  const { data: orgRows } = await supabase
    .from('event_organizers')
    .select('user_id')
    .eq('event_id', event_id);
  const userIds = (orgRows ?? []).map((r: { user_id: string }) => r.user_id);
  let emails: string[] = [];
  if (userIds.length) {
    const { data: profs } = await supabase.from('profiles').select('email').in('id', userIds);
    emails = (profs ?? [])
      .map((p: { email?: string }) => p.email)
      .filter((e): e is string => Boolean(e && e.includes('@')));
  }
  if (emails.length === 0) return json({ ok: true, skipped: 'no_recipients' });

  const manageUrl = `${origin}/e/${event.token}/manage`;
  const verb = kind === 'edit' ? 'updated their response to' : 'responded to';
  const subject = `${respondentName} ${verb} “${event.title}”`;
  const html =
    `<p><strong>${escapeHtml(respondentName)}</strong> ${verb} ` +
    `<strong>${escapeHtml(event.title)}</strong> on GoTime.</p>` +
    `<p><a href="${manageUrl}">View responses and results</a></p>` +
    `<hr><p style="color:#888;font-size:12px">You receive this because you organize this event. ` +
    `Change notifications in the event's Manage page.</p>`;

  // One email per organizer, so co-organizer addresses aren't exposed.
  const results = await Promise.allSettled(
    emails.map((to) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
      }).then(async (r) => {
        if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`);
      }),
    ),
  );
  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => String(r.reason?.message ?? r.reason));
  return json({ ok: true, sent, failed: errors.length, errors });
});
