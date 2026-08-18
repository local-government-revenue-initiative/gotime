import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import Layout from './Layout.jsx';
import EventHeader from './EventHeader.jsx';
import AvailabilityGrid from './AvailabilityGrid.jsx';
import DayAvailability from './DayAvailability.jsx';
import TimezonePicker from './TimezonePicker.jsx';
import Comments from './Comments.jsx';
import AuthPanel from './AuthPanel.jsx';
import { useSession } from '../App.jsx';
import { useEvent, useToast } from '../hooks.jsx';
import { saveResponse, suggestDate, getMyProfile, updateMyIcsUrl, fetchMyCalendarIcs } from '../api.js';
import { parseBusyRanges, busySlotKeys } from '../lib/icsParse.js';
import { SHOW_CALENDAR_OVERLAY } from '../features.js';
import { friendlyError } from '../supabaseClient.js';
import { buildSlotGrid, zoneLabelDrift, parseSlotKey } from '../lib/slots.js';
import { detectZone, zoneLabel } from '../lib/timezones.js';
import {
  getMyResponseId,
  setMyResponseId,
  clearMyResponseId,
  getMyEntryCache,
  setMyEntryCache,
} from '../lib/localIdentity.js';

const EMPTY_FIELDS = { name: '', email: '' };

export default function RespondPage() {
  const { token } = useParams();
  const { session } = useSession();
  const { data, error, loading, reload } = useEvent(token);
  const [toast, showToast] = useToast();

  const [view, setView] = useState('loading'); // 'home' | 'edit'
  const [responseId, setResponseId] = useState(null);
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [answers, setAnswers] = useState({});
  const [availability, setAvailability] = useState({});
  const [brush, setBrush] = useState(2);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [claim, setClaim] = useState(false);

  const [zone, setZone] = useState(() => {
    try {
      return window.localStorage.getItem('gotime_zone') || detectZone();
    } catch {
      return detectZone();
    }
  });
  const [extraZones, setExtraZones] = useState([]);

  const event = data?.event;
  const levels = event?.preference_levels || [];
  const approvedDates = useMemo(
    () => (data?.dates || []).filter((d) => d.approved).map((d) => d.date),
    [data],
  );
  const grid = useMemo(
    () => (event ? buildSlotGrid(event, approvedDates) : null),
    [event, approvedDates],
  );
  const isDayMode = event?.granularity === 'day';
  const zones = [zone, ...extraZones.filter((z) => z !== zone)];

  // "Show my busy times": the signed-in user's own published calendar,
  // overlaid on the grid as a visual aid. Never saved, never shown to others.
  const [busyRanges, setBusyRanges] = useState(null);
  const busyKeys = useMemo(() => {
    if (!busyRanges || !grid || isDayMode) return null;
    return busySlotKeys(grid.allKeys, busyRanges, event.slot_minutes, parseSlotKey);
  }, [busyRanges, grid, isDayMode, event?.slot_minutes]);
  const drift = useMemo(
    () => (grid ? zones.some((z) => zoneLabelDrift(grid, z)) : false),
    [grid, zones.join('|')],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem('gotime_zone', zone);
    } catch {
      /* ignore */
    }
  }, [zone]);

  useEffect(() => {
    if (dirty) setBrush((b) => b); // no-op; keeps linters honest about deps
    const handler = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Decide the initial view once the event has loaded.
  useEffect(() => {
    if (!data || view !== 'loading') return;
    const myId = getMyResponseId(token);
    const mine =
      (data.responses || []).find((r) => r.mine) ||
      (myId && (data.responses || []).find((r) => r.id === myId)) ||
      null;
    if (mine) {
      setView('home');
    } else if (myId && !data.event.responses_visible) {
      // Hidden responses: trust local continuity, edit straight away.
      openEntry({ id: myId }, { skipConfirm: true });
    } else {
      setView('home');
    }
  }, [data]);

  if (loading) {
    return (
      <Layout>
        <div className="card"><p className="hint">Loading…</p></div>
      </Layout>
    );
  }
  if (error || !event) {
    return (
      <Layout narrow>
        <div className="card">
          <div className="banner banner-error">{error || 'This event could not be loaded.'}</div>
        </div>
      </Layout>
    );
  }

  const myStoredId = getMyResponseId(token);
  const defaultBrush = levels.length - 1;

  function seedFromCacheOrResponse(resp) {
    // Prefer full server fields (organizer/claimed-own); fall back to the
    // local cache for the email the server withholds from anonymous users.
    const cache = getMyEntryCache(token);
    const useCache = cache && (!resp || cache.id === resp.id);
    return {
      name: resp?.name && !resp.anonymized ? resp.name : (useCache ? cache.fields?.name : '') || resp?.name || '',
      email: resp?.email ?? (useCache ? cache.fields?.email : '') ?? '',
    };
  }

  function openEntry(resp, { skipConfirm = false } = {}) {
    const isMine = resp?.id && (resp.id === getMyResponseId(token) || resp.mine);
    if (resp?.id && !isMine && !skipConfirm) {
      if (resp.claimed) {
        showToast('That response is linked to an account — only its owner can edit it.');
        return;
      }
      if (
        !window.confirm(
          `You are opening the entry of “${resp.name}”.\n\nIs this you? Please only edit your own answers.`,
        )
      )
        return;
    }
    setResponseId(resp?.id || null);
    setFields(seedFromCacheOrResponse(resp));
    setAnswers(resp?.answers ? { ...resp.answers } : (getMyEntryCache(token)?.answers && !resp?.id ? {} : {}));
    setAvailability(resp?.availability ? { ...resp.availability } : {});
    setBrush(defaultBrush);
    setClaim(false);
    setDirty(false);
    setSavedAt(null);
    setView('edit');
    window.scrollTo({ top: 0 });
  }

  function startNew() {
    const cache = getMyEntryCache(token);
    setResponseId(null);
    setFields(
      cache?.fields
        ? { name: cache.fields.name || '', email: cache.fields.email || '' }
        : EMPTY_FIELDS,
    );
    setAnswers({});
    setAvailability({});
    setBrush(defaultBrush);
    setClaim(false);
    setDirty(false);
    setSavedAt(null);
    setView('edit');
  }

  function paint(key, level) {
    setAvailability((prev) => {
      if ((Number(prev[key]) || 0) === level) return prev;
      const next = { ...prev };
      if (level === 0) delete next[key];
      else next[key] = level;
      return next;
    });
    setDirty(true);
  }

  async function save() {
    if (!fields.name.trim()) {
      showToast('Please enter your name before saving.');
      return;
    }
    for (const q of data.questions) {
      if (q.required) {
        const v = answers[q.id];
        const missing =
          q.type === 'multi' ? !Array.isArray(v) || v.length === 0 : !v || !String(v).trim();
        if (missing) {
          showToast(`Please answer: “${q.label}”`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      const payload = {
        ...fields,
        name: fields.name.trim(),
        availability,
        answers,
      };
      const result = await saveResponse(token, responseId, payload, claim);
      setResponseId(result.id);
      setMyResponseId(token, result.id);
      setMyEntryCache(token, { id: result.id, fields: { ...fields }, answers: { ...answers } });
      setDirty(false);
      setSavedAt(DateTime.now());
      showToast('Saved — thank you! You can come back and update any time.');
      await reload();
    } catch (err) {
      showToast(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------- home view
  if (view !== 'edit') {
    const visible = event.responses_visible;
    const mine =
      (data.responses || []).find((r) => r.mine) ||
      (myStoredId && (data.responses || []).find((r) => r.id === myStoredId)) ||
      null;
    return (
      <Layout>
        <EventHeader event={event} isOrganizer={data.is_organizer} />
        <div className="card">
          {mine ? (
            <>
              <h2>Welcome back{mine.name && !event.anonymize_names ? `, ${mine.name.split(' ')[0]}` : ''}!</h2>
              <p className="hint">You already responded on this device.</p>
              <button
                type="button"
                className="btn btn-primary btn-wide"
                onClick={() => openEntry(mine, { skipConfirm: true })}
                disabled={event.locked}
              >
                Review or update my availability
              </button>
              {!event.locked && (
                <p className="hint">
                  Not you?{' '}
                  <button
                    type="button"
                    className="linklike"
                    onClick={() => {
                      clearMyResponseId(token);
                      startNew();
                    }}
                  >
                    Start a fresh response
                  </button>
                </p>
              )}
            </>
          ) : (
            <>
              <h2>Add your availability</h2>
              <p className="hint">
                No sign-in needed — enter your name, select the times that work, and save.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-wide"
                onClick={startNew}
                disabled={event.locked}
              >
                {event.locked ? 'Form is locked' : 'I’m new — add my availability'}
              </button>
              {!event.locked &&
                (session ? (
                  <p className="hint">
                    Signed in as {session.user.email} — when you save, you can lock your
                    response to your account so only you can change it.
                  </p>
                ) : (
                  <details className="section" style={{ boxShadow: 'none' }}>
                    <summary>
                      Prefer to sign in first?{' '}
                      <span className="sub">optional — protects your response</span>
                    </summary>
                    <div className="section-body">
                      <p className="hint">
                        Responding without signing in works fine. Signing in adds two
                        things: you can lock your response to your account, so nobody
                        else with the link can change it, and you can create events of
                        your own.
                      </p>
                      <AuthPanel />
                    </div>
                  </details>
                ))}
            </>
          )}
          {visible && (data.responses || []).filter((r) => !r.mine).length > 0 && !event.locked && (
            <>
              <p className="hint" style={{ marginTop: 14 }}>
                Already responded on another device? Find yourself below:
              </p>
              <ul className="people-list">
                {(data.responses || [])
                  .filter((r) => !mine || r.id !== mine.id)
                  .map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => openEntry(r)}>
                        <span className="who">{r.name}</span>{' '}
                        <span className="meta">
                          updated {DateTime.fromISO(r.updated_at).toRelative()}
                          {r.claimed ? ' · linked to an account' : ''}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          )}
          {!visible && (
            <p className="hint">
              {data.response_count} response{data.response_count === 1 ? '' : 's'} so far. The
              organizer has kept individual responses private.
            </p>
          )}
        </div>
        <Comments data={data} token={token} onPosted={reload} showToast={showToast} />
        {toast}
      </Layout>
    );
  }

  // ------------------------------------------------------------- edit view
  return (
    <Layout>
      <EventHeader event={event} isOrganizer={data.is_organizer} />
      <div className="card">
        <h2>About you</h2>
        <label htmlFor="f-name">
          Name <span className="req">*</span>
          <input
            id="f-name"
            type="text"
            value={fields.name}
            maxLength={120}
            onChange={(e) => {
              setFields({ ...fields, name: e.target.value });
              setDirty(true);
            }}
            autoComplete="name"
          />
        </label>
        <label htmlFor="f-email">
          Email
          <input
            id="f-email"
            type="email"
            value={fields.email}
            maxLength={200}
            onChange={(e) => {
              setFields({ ...fields, email: e.target.value });
              setDirty(true);
            }}
            autoComplete="email"
          />
        </label>
        <p className="hint">Your email is only visible to the organizers.</p>
        {session && (
          <div className="checkbox">
            <input
              id="f-claim"
              type="checkbox"
              checked={claim}
              onChange={(e) => {
                setClaim(e.target.checked);
                setDirty(true);
              }}
            />
            <label htmlFor="f-claim" style={{ margin: 0, fontWeight: 400 }}>
              Lock this response to my account ({session.user.email})
              <span className="sub">Once linked, only you (signed in) can edit it.</span>
            </label>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Your availability</h2>
        <p className="hint">
          Pick an option below, then tap or drag across the{' '}
          {isDayMode ? 'calendar' : 'grid'}. Everything starts as “{levels[0]}”, so you only
          select the {isDayMode ? 'days' : 'times'} that could work.
        </p>
        {!isDayMode && (
          <TimezonePicker zone={zone} onZone={setZone} extras={extraZones} onExtras={setExtraZones} allowExtras />
        )}
        {drift && (
          <div className="banner">
            A daylight-saving change falls between these dates, so times in{' '}
            {zones.map(zoneLabel).join(' / ')} shift on some days. Row labels follow the first
            date; hover or long-press a cell for its exact time.
          </div>
        )}
        {event.locked ? (
          <div className="banner banner-locked">
            The form is locked, so this is read-only.
          </div>
        ) : null}
        {isDayMode ? (
          <DayAvailability
            mode="edit"
            grid={grid}
            levels={levels}
            availability={availability}
            onPaint={event.locked ? () => {} : paint}
            brush={brush}
            setBrush={setBrush}
          />
        ) : (
          <>
            {SHOW_CALENDAR_OVERLAY && session && (
              <MyCalendar
                grid={grid}
                onBusy={setBusyRanges}
                busyRanges={busyRanges}
                showToast={showToast}
              />
            )}
            <AvailabilityGrid
              mode="edit"
              grid={grid}
              zones={zones}
              levels={levels}
              availability={availability}
              onPaint={event.locked ? () => {} : paint}
              brush={brush}
              setBrush={setBrush}
              busyKeys={busyKeys}
            />
            <p className="hint">
              Times shown in {zoneLabel(zone)}. The event’s own time zone is {event.timezone}.
              {busyKeys && busyKeys.size > 0 && (
                <>
                  {' '}
                  <span className="busy-legend" /> = busy in your calendar ({busyKeys.size} slot
                  {busyKeys.size === 1 ? '' : 's'}).
                </>
              )}
            </p>
          </>
        )}
      </div>

      {data.questions.length > 0 && (
        <div className="card">
          <h2>A few questions from the organizer</h2>
          {data.questions.map((q) => (
            <QuestionField
              key={q.id}
              question={q}
              value={answers[q.id]}
              onChange={(v) => {
                setAnswers({ ...answers, [q.id]: v });
                setDirty(true);
              }}
            />
          ))}
        </div>
      )}

      {event.allow_suggestions && !event.locked && (
        <details className="section">
          <summary>
            Suggest another date <span className="sub">propose a date the organizer didn’t list</span>
          </summary>
          <div className="section-body">
            <SuggestDate token={token} onSuggested={reload} showToast={showToast} pending={data.dates.filter((d) => !d.approved)} />
          </div>
        </details>
      )}

      <Comments data={data} token={token} onPosted={reload} showToast={showToast} defaultName={fields.name} responseId={responseId} />

      <div className="save-bar">
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (dirty && !window.confirm('Discard unsaved changes?')) return;
            setDirty(false);
            setView('home');
            reload();
          }}
        >
          Back
        </button>
        <span className={'save-status' + (dirty ? ' unsaved' : '')}>
          {saving
            ? 'Saving…'
            : dirty
              ? 'Unsaved changes'
              : savedAt
                ? `Saved ${savedAt.toFormat('HH:mm')}`
                : ''}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={saving || event.locked}
        >
          {responseId ? 'Save changes' : 'Save my availability'}
        </button>
      </div>
      {toast}
    </Layout>
  );
}

function QuestionField({ question: q, value, onChange }) {
  if (q.type === 'text') {
    return (
      <label>
        {q.label} {q.required && <span className="req">*</span>}
        <textarea rows={2} value={value || ''} maxLength={2000} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (q.type === 'single') {
    return (
      <fieldset>
        <legend style={{ fontWeight: 600, fontSize: '0.95rem' }}>
          {q.label} {q.required && <span className="req">*</span>}
        </legend>
        {q.options.map((opt) => (
          <div className="radio" key={opt}>
            <input
              type="radio"
              id={`q-${q.id}-${opt}`}
              name={`q-${q.id}`}
              checked={value === opt}
              onChange={() => onChange(opt)}
            />
            <label htmlFor={`q-${q.id}-${opt}`} style={{ margin: 0, fontWeight: 400 }}>
              {opt}
            </label>
          </div>
        ))}
      </fieldset>
    );
  }
  const arr = Array.isArray(value) ? value : [];
  return (
    <fieldset>
      <legend style={{ fontWeight: 600, fontSize: '0.95rem' }}>
        {q.label} {q.required && <span className="req">*</span>}
      </legend>
      {q.options.map((opt) => (
        <div className="checkbox" key={opt}>
          <input
            type="checkbox"
            id={`q-${q.id}-${opt}`}
            checked={arr.includes(opt)}
            onChange={(e) =>
              onChange(e.target.checked ? [...arr, opt] : arr.filter((x) => x !== opt))
            }
          />
          <label htmlFor={`q-${q.id}-${opt}`} style={{ margin: 0, fontWeight: 400 }}>
            {opt}
          </label>
        </div>
      ))}
    </fieldset>
  );
}

function SuggestDate({ token, onSuggested, showToast, pending }) {
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <p className="hint">
        Suggested dates appear on the grid once an organizer approves them.
        {pending.length > 0 &&
          ` Waiting for approval: ${pending.map((d) => DateTime.fromISO(d.date).toFormat('d LLL')).join(', ')}.`}
      </p>
      <div className="add-date-row">
        <label style={{ fontWeight: 400 }}>
          Date to suggest
          <input
            type="date"
            min={DateTime.now().toISODate()}
            disabled={busy}
            onChange={async (e) => {
              if (!e.target.value) return;
              const v = e.target.value;
              e.target.value = '';
              setBusy(true);
              try {
                const res = await suggestDate(token, v);
                showToast(
                  res.approved
                    ? 'That date is already on the grid.'
                    : 'Suggestion sent — the organizer will review it.',
                );
                onSuggested();
              } catch (err) {
                showToast(friendlyError(err));
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
    </div>
  );
}

/**
 * "My calendar" — a signed-in user can paste the public ICS link their
 * calendar app publishes, and Go Time shades the slots they're already busy.
 * Purely an aid while answering: it never changes what gets saved, and the
 * link is stored only on that user's own profile row (nobody else can read
 * it, organizers included).
 */
function MyCalendar({ grid, onBusy, busyRanges, showToast }) {
  const [url, setUrl] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusyState] = useState(false);
  const [error, setError] = useState('');

  // Load any saved URL once.
  useEffect(() => {
    let cancelled = false;
    getMyProfile()
      .then((p) => {
        if (!cancelled) {
          setUrl(p?.ics_url || '');
          setLoaded(true);
        }
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = Boolean(busyRanges);

  async function showBusy() {
    setBusyState(true);
    setError('');
    try {
      const trimmed = url.trim();
      if (trimmed) await updateMyIcsUrl(trimmed);
      const ics = await fetchMyCalendarIcs(trimmed || undefined);
      // Only expand recurrence across the window this event covers.
      const keys = grid.allKeys;
      const first = parseSlotKey(keys[0]).minus({ days: 1 });
      const last = parseSlotKey(keys[keys.length - 1]).plus({ days: 2 });
      const ranges = parseBusyRanges(ics, first, last);
      onBusy(ranges);
      showToast(
        ranges.length
          ? `Found ${ranges.length} calendar event${ranges.length === 1 ? '' : 's'} in this period.`
          : 'No calendar events in this period — your calendar may not publish that far ahead.',
      );
    } catch (err) {
      setError(friendlyError(err));
      onBusy(null);
    } finally {
      setBusyState(false);
    }
  }

  return (
    <details className="section" style={{ boxShadow: 'none' }}>
      <summary>
        My calendar
        <span className="sub">
          {shown ? 'busy times shown on the grid' : 'optionally shade times you’re already busy'}
        </span>
      </summary>
      <div className="section-body">
        <p className="hint">
          Paste the <strong>published ICS link</strong> from your Outlook or Google calendar and
          Go Time will mark the slots you’re busy. Only you ever see this — it isn’t saved with your
          response, and nobody else (organizers included) can see your calendar or the link.
        </p>
        <label htmlFor="ics-url">
          Published calendar link (ICS)
          <input
            id="ics-url"
            type="url"
            value={url}
            placeholder="https://outlook.office365.com/owa/calendar/.../calendar.ics"
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        {error && <div className="banner banner-error">{error}</div>}
        <button
          type="button"
          className="btn"
          onClick={showBusy}
          disabled={busy || !loaded || !url.trim()}
        >
          {busy ? 'Loading…' : shown ? 'Refresh my busy times' : 'Show my busy times'}
        </button>
        {shown && (
          <button
            type="button"
            className="btn btn-small"
            style={{ marginLeft: 8 }}
            onClick={() => onBusy(null)}
          >
            Hide
          </button>
        )}
        <p className="hint">
          Repeating meetings are handled for common weekly/daily patterns; unusual repeat rules may
          not appear. Times come from your calendar as published.
        </p>
      </div>
    </details>
  );
}
