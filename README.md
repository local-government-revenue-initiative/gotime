# GoTime

A tool for finding a time for meetings — across time zones, with no account
needed to respond.

**Live app:** https://gotime-kappa.vercel.app

Organizers create an event (title, candidate dates, timeslot size, optional
extra questions), share one link, and respondents paint the times that work
for them using configurable preference levels (default: *Not available* /
*Possible (but inconvenient)* / *Possible (and convenient)*). The results page
combines everyone's answers into a heatmap, ranks the best times, and can
generate a calendar invite (.ics) for the winning slot.

This replaces the earlier [scheduler](https://github.com/evantrowbridge/scheduler)
tool, which needed code edits for every new event. Here everything is
configured in the UI, using the Vercel + Supabase setup proven in
[khomas_model](https://github.com/local-government-revenue-initiative/khomas_model).

## Features

**Organizers** (sign in with an email link — no password):
- Multiple candidate dates, configurable daily time range and slot length
  (15/20/30/60 min, default 30)
- Optional description and extra poll questions (choose-one, choose-several,
  or free text; optionally required)
- Custom preference levels (2–6; default is the classic three)
- Response visibility controls: hide responses entirely, or show them with
  names anonymized ("Respondent 1, 2, …") to non-organizers
- Co-organizers: search registered users by email/name and add them
- Lock the form to freeze all responses, comments and suggestions
- Optionally let respondents suggest extra dates (suggestions need approval)
- Full response table with contact details, CSV export, spam deletion

**Respondents** (no account needed):
- Enter name + email (phone/WhatsApp, position, organization optional —
  contact details are only ever shown to organizers)
- Paint availability per slot: pick a level, tap or drag across the grid
- Return later on the same device and continue automatically; or open your
  entry from the list on another device (with an "is this you?" confirmation,
  since unlinked entries are editable by anyone with the link)
- Optionally sign in and *lock the response to your account* so only you can
  edit it
- Public comments; date suggestions when the organizer allows them

**Time zones**
- Every slot is stored as an absolute UTC instant; the grid renders in any
  IANA zone with one-tap chips for Toronto, London, Sierra Leone (GMT),
  Accra/Lagos (WAT), CET, Lusaka (CAT), Nairobi/Kampala (EAT)
- Up to two extra zones can be shown side-by-side on the time axis
  (Google-Calendar style)
- Daylight-saving transitions are handled explicitly (nonexistent slots become
  gaps; a notice appears when labels drift across dates)

## Architecture

```
app/                     Vite + React 18 (plain JS), react-router, Luxon
  src/lib/               pure domain logic, unit-tested with Vitest:
    slots.js             slot keys ("2026-09-03T13:30Z"), DST-safe grid math
    timezones.js         zone list/labels     aggregate.js  heatmap scoring
    ics.js               calendar invites     localIdentity.js  device continuity
    levelColors.js       colours for N preference levels
  src/components/        pages + AvailabilityGrid (edit/heatmap modes)
  src/api.js             every network call in one place
  src/supabaseClient.js  lazy Supabase client (publishable key, safe to commit)
supabase/migrations/     schema, RLS policies, and respondent RPCs
```

**Access model.** Organizers are signed-in users and reach tables directly
under Row Level Security scoped to `event_organizers` membership. Respondents
have no accounts and go exclusively through `security definer` RPCs
(`get_event`, `save_response`, `add_comment`, `suggest_date`) that take the
event's unguessable share token and enforce locking, visibility,
anonymization, and claimed-response protection server-side. The `anon` role
has zero table grants. Respondent contact details never leave the server
except to organizers.

## Development

```bash
cd app
npm install
npm test        # Vitest unit tests for the domain modules
npm run dev     # http://localhost:5173 against the live Supabase project
npm run build
```

## Deployment

- **Vercel** project `gotime` (files-based deploys; production URL above).
  To enable git-push deploys instead, connect this repo in the Vercel
  dashboard (Project → Settings → Git) and set the root directory to `app`.
- **Supabase** project `gotime` (`huahyyikgfqhficrdhbd`, free tier). Apply
  new migrations from `supabase/migrations/` via the SQL editor or MCP tools.

### One-time auth setup (magic links)

In the Supabase dashboard → Authentication → URL Configuration:
1. Set **Site URL** to `https://gotime-kappa.vercel.app`
2. Add **Redirect URLs**: `https://gotime-kappa.vercel.app/**` and
   `http://localhost:5173/**`

Without this, sign-in emails redirect to the default localhost URL.

### Known free-tier limits

- Supabase pauses projects after ~1 week of inactivity (restore from the
  dashboard); consider upgrading if event links must stay live unattended.
- Built-in auth email is rate-limited (a few per hour) — fine for organizer
  sign-ins; connect custom SMTP (e.g. Resend) if that ever binds.

### Possible next steps (schema already supports them)

- Email the organizer on new responses: Supabase Edge Function + Resend,
  triggered by a database webhook on `responses`.
- Google/Outlook calendar linking (the .ics download covers the core need).
