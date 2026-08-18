# Go Time

A tool for finding a time for meetings — across time zones, with no account
needed to respond.

**Live app:** https://its-go-time.vercel.app

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
- Enter name + email (only ever shown to organizers). Nothing else is asked
  for — an organizer who wants a phone number, job title or organization adds
  a question for it, so no event carries fields it doesn't use, and the
  answers show up in the question tallies and result filters like any other.
- Respond straight away with no sign-in, or sign in first (optional, offered
  on the event page). Signing in adds three things: no one else can edit your
  response, the events you've responded to are listed on your Go Time home
  page (via the `list_my_responses` RPC — claimed responses only, excluding
  events you organize), and you can organize events of your own. For
  signed-in respondents the "link to my account" box is pre-ticked on their
  own entries — never on someone else's.
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
    icsParse.js          reads a published calendar (busy overlay)
    levelColors.js       colours for N preference levels
    respondentFilter.js  include/exclude people on the results page
  src/components/        pages + AvailabilityGrid (edit/heatmap modes)
  src/tokens.css         brand tokens — the source of truth for colour/type/etc.
  src/features.js        switches for finished-but-hidden features
  src/api.js             every network call in one place
  src/supabaseClient.js  lazy Supabase client (publishable key, safe to commit)
  public/                favicons, app icon, manifest, logo SVGs
docs/                    the brand handoff, as delivered
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

## Brand

The identity — the "Grid" mark, the Go Time wordmark, the icons and the design
tokens — comes from the handoff kept verbatim in `docs/brand-handoff.md` (with
`docs/brand-tokens-as-delivered.css` as the tokens it shipped). How it is
applied here:

- **Tokens** live in `app/src/tokens.css` (`--gt-*`), unchanged from the handoff
  except that Mulish is bundled locally via `@fontsource` instead of being
  fetched from Google Fonts, so the app makes no third-party request and text
  doesn't reflow mid-load. `styles.css` maps its own working variables onto
  those tokens, so a token change moves the whole interface.
- **Logo**: `app/src/components/BrandLockup.jsx` inlines the mark exactly as
  drawn (its geometry and colours are fixed — never recolour, reorder or
  animate the cells) and sets the wordmark as live text in the bundled Mulish.
  The header mark is 28px, under the 30px threshold at which the handoff calls
  for "Time" at weight 400 rather than 200. Full lockups for other uses are in
  `app/public/brand/`.
- **Icons**: the 2×2 icon variants ship at `app/public/` and are wired up in
  `index.html` plus `manifest.webmanifest`, with `theme-color` `#1A2E5A`.
- **Name**: always "Go Time", two words, sentence case — never "GoTime". The
  repository, package and database keep the one-word `gotime` identifier.
- **Voice**: plain, full sentences, sentence case, no emoji (the locked state
  says "Locked" rather than showing a padlock).

## Development

```bash
cd app
npm install
npm test        # Vitest unit tests for the domain modules
npm run dev     # http://localhost:5173 against the live Supabase project
npm run build
```

## Deployment

- **Vercel** project `gotime` (production URL above). Deploys build from this
  repo once the Vercel GitHub app has access to it — see the one-time setup
  below. Root directory: `app` (zero-config Vite build).
- **Supabase** project `gotime` (`huahyyikgfqhficrdhbd`, free tier). Apply
  new migrations from `supabase/migrations/` via the SQL editor or MCP tools.

### One-time setup: connect the repo to Vercel

The Vercel GitHub integration currently has access to `khomas_model` but not
this repository, so the full app cannot deploy until access is granted:

1. In Vercel: **Add New → Project → Import Git Repository**. If `gotime`
   isn't listed, click **Adjust GitHub App Permissions** and grant the Vercel
   app access to `local-government-revenue-initiative/gotime`.
2. Import the repo into the **existing `gotime` project** (or a new one),
   setting **Root Directory** to `app`. Framework auto-detects as Vite.
3. Pushes to the default branch then deploy to production automatically;
   other branches get preview URLs.

### One-time auth setup (magic links)

In the Supabase dashboard → Authentication → URL Configuration:
1. Set **Site URL** to `https://its-go-time.vercel.app`
2. Add **Redirect URLs**: `https://its-go-time.vercel.app/**` and
   `http://localhost:5173/**`

Without this, sign-in emails redirect to the default localhost URL.

### Known free-tier limits

- Supabase pauses projects after ~1 week of inactivity (restore from the
  dashboard); consider upgrading if event links must stay live unattended.
- Built-in auth email is rate-limited (a few per hour) — fine for organizer
  sign-ins; connect custom SMTP (e.g. Resend) if that ever binds.

### Email notifications (organizers)

Each event has a `notify_mode` (Off / New responses only / New responses and
edits, default "new"), chosen on the create-event and Manage pages. A trigger
on `responses` calls the `notify-organizers` Edge Function (via `pg_net`),
which emails every organizer of the event through [Resend](https://resend.com).
It stays dormant until Resend is configured, so nothing breaks before setup.

One-time setup:
1. Create a Resend account and verify a sending domain (e.g. `evan-trowbridge.com`)
   by adding the DNS records Resend shows (SPF/DKIM). Create an API key.
2. In the Supabase dashboard → Edge Functions → Secrets, add:
   - `RESEND_API_KEY` — the Resend API key
   - `NOTIFY_FROM` — e.g. `Go Time <notifications@evan-trowbridge.com>`
   - `NOTIFY_SECRET` — must equal `private.config.notify_secret` in the DB
   - `APP_ORIGIN` (optional) — `https://its-go-time.vercel.app`
3. The `notify-organizers` function and the DB trigger are already deployed
   (`supabase/functions/notify-organizers/`, migration `20260816120000_notifications.sql`).

### Scheduling granularity

Events are created in one of two modes (`events.granularity`, chosen on the
create-event page and returned by `get_event`):

- **`time`** (default) — respondents pick time slots within a day. Availability
  keys are UTC instants (`"2026-09-03T13:30Z"`); the timezone machinery applies.
- **`day`** — respondents mark **whole days**, dragging across a week at a time
  (for trips, visits and multi-day events). Keys are plain dates
  (`"2026-09-03"`), rendered by `DayAvailability.jsx` as a painting calendar,
  and time zones are irrelevant. Calendar invites become all-day events.

`save_response` validates keys against the event's granularity, so a day event
rejects instant keys and vice versa.

### Results filtering

Organizers and (where responses are visible) respondents can include/exclude
individual respondents on the Results page; the heatmap, best times and
question tallies recompute from the subset. Quick filters group people by their
answer to a poll question, and — for organizers only, since only they receive
those fields — by Position or Organization (`lib/respondentFilter.js`).
"Add to calendar" links are shown to organizers only.

### Calendar

Each slot on the results page offers "Add to Google Calendar", "Add to
Outlook", and a `.ics` download (`googleCalUrl` / `outlookCalUrl` / `buildICS`
in `app/src/lib/ics.js`). No account linking or OAuth is involved.

### Show my busy times (calendar overlay) — built, currently hidden

**Switched off** in `app/src/features.js` (`SHOW_CALENDAR_OVERLAY`), to keep the
respondent's page as simple as possible while people learn the tool. Nothing is
rendered, nothing is fetched, and no calendar link can be entered. To bring it
back, either flip that default to `true`, or set
`VITE_SHOW_CALENDAR_OVERLAY=1` in the Vercel project's environment variables
and redeploy. Everything below still describes how it works when on.

A **signed-in** respondent can paste the published ICS link from their Outlook
or Google calendar in the "My calendar" section of a time-based event; the slots
they're already busy get a corner marker. It is display-only: it never changes
what is saved, and the link is stored on that user's own `profiles.ics_url` row,
which existing RLS keeps private from everyone else, organizers included.

Browsers can't request those ICS URLs (no CORS), so the fetch goes through the
`fetch-ics` edge function, which runs with `verify_jwt` and only fetches the
caller's own URL. Because it makes outbound requests on our behalf, it is
https-only (`webcal://` is rewritten), restricted to an allowlist of Outlook and
Google calendar hosts, refuses redirects, and caps response size and time.

`app/src/lib/icsParse.js` does the parsing: line unfolding, UTC/TZID/all-day
dates, simple `RRULE` expansion inside the viewed window, `EXDATE`, and
free/busy hints (`TRANSP`, `STATUS:CANCELLED`,
`X-MICROSOFT-CDO-BUSYSTATUS`). Outlook labels times with Windows zone names, so
TZIDs resolve in three tiers — IANA name, known Windows name, then the offset
declared by the document's own `VTIMEZONE`. Limitations are listed in the
module header; an imperfect overlay is acceptable because it only ever shades
cells. A "can view when I'm busy" publish is enough — only start and end times
are used.

### Possible next steps (schema already supports them)

- Daily-digest notification mode (needs a scheduled `pg_cron`/edge job).
- Notifications for new comments and date suggestions (same trigger pattern).
- Full Google/Outlook calendar-account linking (OAuth), instead of a published
  ICS link — would also allow writing invites back to attendees' calendars.
- The busy overlay in whole-day mode (today it is time-granularity only).
