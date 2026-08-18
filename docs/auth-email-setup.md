# Branded sign-in emails (one-time dashboard setup)

By default Supabase sends sign-in links as **"Supabase Auth
<noreply@mail.app.supabase.io>"** with generic copy that never mentions
Go Time — which reads as phishing to anyone who doesn't know what Supabase
is. Two dashboard changes fix both halves. Neither requires code; the
templates live in `supabase/templates/`.

Both are made at https://supabase.com/dashboard → project **gotime**.

## 1. Send from your own domain (Resend SMTP)

Resend already sends the organizer notifications from
`evan-trowbridge.com`, and the same account can carry the auth emails —
no new DNS records needed.

1. In **Resend** (resend.com): API Keys → Create API key, e.g.
   `gotime-auth-smtp`, permission "Sending access". Copy it. (Reusing the
   existing key also works; a separate one is easier to revoke.)
2. In **Supabase**: Project Settings → **Authentication** (or Auth →
   SMTP Settings, the dashboard moves this around) → **SMTP Settings** →
   enable **Custom SMTP**, then:
   - Sender email: `signin@evan-trowbridge.com`
   - Sender name: `Go Time`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key
3. Save.

The address doesn't need a mailbox — it only sends. Bonus: custom SMTP
also lifts Supabase's built-in cap of ~2 auth emails per hour, which
matters the first time several colleagues sign in at once.

## 2. Replace the email templates

Authentication → **Emails** (→ Templates):

| Template | Subject | Body |
|---|---|---|
| **Magic Link** | `Sign in to Go Time` | paste `supabase/templates/magic-link.html` |
| **Confirm signup** | `Confirm your Go Time account` | paste `supabase/templates/confirm-signup.html` |

Both templates say who is writing and why ("you asked to sign in to
Go Time, the event scheduling tool at its-go-time.vercel.app"), carry the
logo (drawn as a table so it renders with images blocked), and end with
the honest footer: the link works once, expires after an hour, and doing
nothing is safe. `{{ .ConfirmationURL }}`, `{{ .SiteURL }}` and
`{{ .Email }}` are Supabase template variables — leave them as-is.

Go Time only ever uses magic links, so the other templates (password
reset, invite, change email) are never sent and can stay default.

## 3. Check it

Sign out at its-go-time.vercel.app, request a sign-in link, and confirm
the email arrives from **Go Time <signin@evan-trowbridge.com>** with the
branded body. First time only, also look in spam — then "Not spam" it.
