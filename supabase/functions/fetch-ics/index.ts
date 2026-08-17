// fetch-ics — fetches a signed-in user's own published calendar (ICS) so the
// respond page can shade their busy times.
//
// Why a server function at all: browsers can't fetch Outlook/Google ICS URLs
// directly (no CORS headers on those endpoints). This runs with verify_jwt,
// so only a signed-in user can call it, and it will only ever fetch *their
// own* stored URL (or a URL they pass in to preview before saving).
//
// Security notes (this function makes outbound requests on our behalf, so it
// is the one place SSRF matters):
//   * https only, and the hostname must be on ALLOWED_HOSTS
//   * redirect: 'manual' — a 3xx is an error, so the allowlist can't be
//     escaped by an allowed host redirecting somewhere internal
//   * response size and time are capped
// The response is the raw ICS text; parsing happens client-side.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_HOSTS = new Set([
  'outlook.office365.com',
  'outlook.office.com',
  'outlook.live.com',
  'calendar.google.com',
]);

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const TIMEOUT_MS = 10_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

function checkUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  // Calendar apps hand out webcal: links interchangeably with https: ones;
  // they address the same resource, so accept them by rewriting the scheme.
  // Every check below (host allowlist included) still applies.
  const candidate = raw.replace(/^webcal:\/\//i, 'https://');
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: 'not_a_url' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'https_required' };
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return { ok: false, reason: 'host_not_allowed' };
  return { ok: true, url };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  // Identify the caller from their JWT; only they can trigger a fetch.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: { url?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* body is optional — fall back to the stored URL */
  }

  let target = (body.url ?? '').trim();
  if (!target) {
    // Read the caller's own stored URL (service role, filtered to their id).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: profile } = await admin
      .from('profiles')
      .select('ics_url')
      .eq('id', user.id)
      .single();
    target = (profile?.ics_url ?? '').trim();
  }
  if (!target) return json({ error: 'no_calendar_url' }, 400);

  const check = checkUrl(target);
  if (!check.ok) return json({ error: check.reason }, 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(check.url.toString(), {
      redirect: 'manual', // a redirect must not bypass the host allowlist
      signal: controller.signal,
      headers: { Accept: 'text/calendar, text/plain, */*' },
    });
  } catch (err) {
    clearTimeout(timer);
    return json({ error: 'fetch_failed', detail: String((err as Error).message) }, 502);
  }
  clearTimeout(timer);

  if (res.status >= 300 && res.status < 400) {
    return json({ error: 'redirect_not_followed', status: res.status }, 502);
  }
  if (!res.ok) return json({ error: 'calendar_http_error', status: res.status }, 502);

  const len = Number(res.headers.get('content-length') ?? '0');
  if (len && len > MAX_BYTES) return json({ error: 'calendar_too_large' }, 413);

  const text = await res.text();
  if (text.length > MAX_BYTES) return json({ error: 'calendar_too_large' }, 413);
  if (!/BEGIN:VCALENDAR/i.test(text)) return json({ error: 'not_a_calendar' }, 422);

  return json({ ok: true, ics: text });
});
