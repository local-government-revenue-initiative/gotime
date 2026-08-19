# Sign-in email deliverability — the domain-alignment setup

## Status: done and verified (19 Aug 2026)

A branded sign-in email now reaches `utoronto.ca` inboxes — the failure that
prompted all of this. Final configuration:

| Piece | Value |
|---|---|
| App | `https://gotime.evan-trowbridge.com` (Vercel; `its-go-time.vercel.app` still works) |
| Sender | `Go Time <signin@gotime.evan-trowbridge.com>` via Resend SMTP |
| Email links | `https://gotime.evan-trowbridge.com/auth/confirm?token_hash=…` — no `supabase.co` anywhere |
| Supabase Site URL | `https://gotime.evan-trowbridge.com` |

**The DNS detail worth remembering:** Vercel asks for a CNAME
(`gotime` → `…vercel-dns-017.com`), but this zone has a wildcard `*` A record
pointing at the Network Solutions web host. Network Solutions answered some
queries with the wildcard instead of following the CNAME, so resolution was
inconsistent worldwide, the Let's Encrypt http-01 challenge failed, and the
subdomain intermittently redirected to the main site. The fix was an explicit
**A record `gotime` → `76.76.21.21`** (Vercel's documented legacy address)
instead of the CNAME — an explicit A record beats a wildcard unambiguously.
Vercel shows "DNS Change Recommended" for this, which is only a nudge toward
its newer CNAME; do not act on it. Deleting the wildcard would also have
worked, but `www.evan-trowbridge.com` depends on it.

A cached permanent redirect from the broken window then persisted in already-
affected browsers; clearing cached files fixes it, and it never affected
anyone who hadn't visited during that window.

Remaining optional cleanup: remove the now-unused root-domain Resend records
(TXT `resend._domainkey`, MX `send`, TXT `send`) and the root domain from
Resend's dashboard. Keep TXT `_dmarc` (it covers subdomains too) and the
root `@` SPF (that's the personal mailbox's, not Resend's).

## Why this design

The first attempt at branded sign-in emails (custom SMTP from
`signin@evan-trowbridge.com`) was silently withheld by University of
Toronto's mail filtering — accepted on delivery, then never surfaced in
inbox, junk, or user-visible quarantine, for two different recipients —
while Supabase's default sender got through. U of T IT is not responsive,
so the design has to stop looking like phishing rather than rely on
allowlisting. Resend's own analysis flagged the cause: **the links in the
email didn't match the sending domain** (sender `evan-trowbridge.com`,
button `…supabase.co`, app `…vercel.app`).

The fix aligns all three on one domain, and fences Go Time's sending
reputation off from the personal mail that has used the root domain for
years:

| Piece | Domain |
|---|---|
| App | `gotime.evan-trowbridge.com` (Vercel custom domain) |
| Every link in the email | `gotime.evan-trowbridge.com` (the button goes to the app's `/auth/confirm` route, which completes the sign-in — the `…supabase.co` URL no longer appears anywhere) |
| Sender | `signin@gotime.evan-trowbridge.com` via Resend |

The `/auth/confirm` route ships in the app (v1.9.0). Everything else is
one-time dashboard/DNS setup, in this order:

## 1. Vercel — serve the app from the subdomain

1. vercel.com → project **gotime** → Settings → **Domains** → Add →
   `gotime.evan-trowbridge.com`.
2. At Network Solutions (Manage Advanced DNS Records) add: **A**, host
   `gotime`, value `76.76.21.21`, TTL 1 hour. Use the A record, not the
   CNAME Vercel suggests — see the DNS note above.
3. Wait until Vercel shows the domain as Valid and
   https://gotime.evan-trowbridge.com loads the app.
   `its-go-time.vercel.app` keeps working throughout — old shared links
   never break.

## 2. Resend — verify the sending subdomain

1. resend.com → Domains → **Add domain** → `gotime.evan-trowbridge.com`
   (same region as the existing domain).
2. Add the DNS records it lists at Network Solutions — they'll be for
   hosts like `send.gotime` (MX + TXT) and `resend._domainkey.gotime`
   (TXT). These don't conflict with the CNAME from step 1.
3. Click Verify and wait for green.

## 3. Supabase — point auth at the new domain

Dashboard → project **gotime** → Authentication:

1. **URL Configuration**: set Site URL to
   `https://gotime.evan-trowbridge.com`; under Redirect URLs make sure the
   list has BOTH `https://gotime.evan-trowbridge.com/**` and
   `https://its-go-time.vercel.app/**` (the old domain stays valid).
2. **SMTP Settings** (under Project Settings → Authentication): Custom
   SMTP on, sender email `signin@gotime.evan-trowbridge.com`, sender name
   `Go Time`, host `smtp.resend.com`, port `465`, username `resend`,
   password = the Resend API key.
3. **Emails → Templates**: re-paste both templates from
   `supabase/templates/` (their buttons now link through
   `/auth/confirm`). Subjects: Magic Link `Sign in to Go Time`; Confirm
   signup `Confirm your Go Time account`. Do step 3 only after step 1 —
   the button URL is built from the Site URL.

## 4. Edge-function secrets (organizer notifications)

Supabase → Edge Functions → Secrets: set `APP_ORIGIN` to
`https://gotime.evan-trowbridge.com` and (to fence the root domain
completely) `NOTIFY_FROM` to
`Go Time <notifications@gotime.evan-trowbridge.com>`.

## 5. Check it

1. Open https://gotime.evan-trowbridge.com, request a sign-in link.
2. The email should come from **signin@gotime.evan-trowbridge.com** and
   every URL in it (hover the button) should start with
   `https://gotime.evan-trowbridge.com/`.
3. The button should sign you in and return you to the page you started on.
4. Then the real test: a `utoronto.ca` address.

## Fallback

If strict filters still withhold it, the zero-risk fallback is turning
Custom SMTP off: Supabase's default sender (`noreply@mail.app.supabase.io`)
demonstrably reaches U of T, and the branded templates still apply — only
the From line is generic. Its limits: a very low project-wide hourly email
cap and best-effort delivery, so it's a fallback rather than the plan.

## DMARC status (root domain)

`_dmarc.evan-trowbridge.com` is `v=DMARC1; p=none; rua=mailto:edtrowbridge@gmail.com`.
Keep `p=none` unless weeks of aggregate reports show the personal
`evan@evan-trowbridge.com` stream passing DMARC — it sends through the
web host and may not be aligned; an enforced policy could quarantine it.
