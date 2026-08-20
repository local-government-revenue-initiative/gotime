import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from './Layout.jsx';
import AuthPanel from './AuthPanel.jsx';
import QuestionEditor, { parseOptionsText } from './QuestionEditor.jsx';
import DateMultiPicker from './DateMultiPicker.jsx';
import { useSession } from '../App.jsx';
import { createEvent } from '../api.js';
import { friendlyError } from '../supabaseClient.js';
import { QUICK_ZONES, allZones, detectZone, displayZoneName } from '../lib/timezones.js';
import { useToast } from '../hooks.jsx';
import { DateTime } from 'luxon';

const DEFAULT_LEVELS = ['Not available', 'If need be', 'Available'];

export default function NewEventPage() {
  const { session, authChecked } = useSession();
  const navigate = useNavigate();
  const [toast, showToast] = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dates, setDates] = useState([]);
  const [timezone, setTimezone] = useState(detectZone());
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [dayStart, setDayStart] = useState('08:00');
  const [dayEnd, setDayEnd] = useState('18:00');
  const [levels, setLevels] = useState(DEFAULT_LEVELS);
  const [responsesVisible, setResponsesVisible] = useState(true);
  const [anonymize, setAnonymize] = useState(false);
  const [allowSuggestions, setAllowSuggestions] = useState(false);
  const [notifyMode, setNotifyMode] = useState('new');
  const [granularity, setGranularity] = useState('time');
  const [questions, setQuestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return setError('Give the event a title.');
    if (dates.length === 0) return setError('Add at least one candidate date.');
    if (dayEnd <= dayStart) return setError('The daily end time must be after the start time.');
    const cleanLevels = levels.map((l) => l.trim()).filter(Boolean);
    if (cleanLevels.length < 2) return setError('Keep at least two preference levels.');
    const cleanQuestions = questions
      .map((q) => ({ ...q, label: q.label.trim(), options: parseOptionsText(q.optionsText) }))
      .filter((q) => q.label)
      .filter((q) => q.type === 'text' || q.options.length >= 2);

    setBusy(true);
    setError('');
    try {
      const event = await createEvent(
        session.user.id,
        {
          title: title.trim(),
          description: description.trim(),
          timezone,
          slot_minutes: slotMinutes,
          day_start: dayStart,
          day_end: dayEnd,
          preference_levels: cleanLevels,
          responses_visible: responsesVisible,
          anonymize_names: responsesVisible ? anonymize : false,
          allow_suggestions: allowSuggestions,
          notify_mode: notifyMode,
          granularity,
        },
        dates,
        cleanQuestions,
      );
      navigate(`/e/${event.token}/manage`, { state: { created: true } });
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  if (!authChecked) {
    return (
      <Layout narrow>
        <div className="card"><p className="hint">Checking session…</p></div>
      </Layout>
    );
  }

  if (!session) {
    return (
      <Layout narrow>
        <div className="card">
          <h1>Create an event</h1>
          <AuthPanel intro="Creating an event needs an account, so you can come back and manage it. Enter your email to get a sign-in link — no password needed." />
        </div>
      </Layout>
    );
  }

  return (
    <Layout narrow>
      <h1>Create an event</h1>
      <form onSubmit={submit}>
        <div className="card">
          <label htmlFor="ev-title">
            Title <span className="req">*</span>
            <input
              id="ev-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Project Team Meeting"
              maxLength={140}
              required
            />
          </label>
          <label htmlFor="ev-desc">
            Description <span className="hint" style={{ display: 'inline' }}>(optional)</span>
            <textarea
              id="ev-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this meeting about? Any links or context for respondents."
            />
          </label>
        </div>

        <div className="card">
          <h2>Time slot or a whole day?</h2>
          <div className="radio">
            <input
              type="radio"
              id="gran-time"
              name="granularity"
              checked={granularity === 'time'}
              onChange={() => setGranularity('time')}
            />
            <label htmlFor="gran-time" style={{ margin: 0, fontWeight: 400 }}>
              An event at a time of day
              <span className="sub">
                Respondents pick time slots (e.g. 30-minute slots) on the dates below.
              </span>
            </label>
          </div>
          <div className="radio">
            <input
              type="radio"
              id="gran-day"
              name="granularity"
              checked={granularity === 'day'}
              onChange={() => setGranularity('day')}
            />
            <label htmlFor="gran-day" style={{ margin: 0, fontWeight: 400 }}>
              Whole days — a trip, visit or multi-day event
              <span className="sub">
                Respondents mark whole days (drag across a week at a time). No times or time
                zones involved.
              </span>
            </label>
          </div>
        </div>

        <div className="card">
          <h2>Potential Dates <span className="req">*</span></h2>
          <p className="hint">
            {granularity === 'day'
              ? 'Add every day that could be part of the event — respondents will mark which of these work.'
              : 'Click dates to add or remove them — you can also drag across several days.'}
          </p>
          <DateMultiPicker value={dates} onChange={setDates} />
          {dates.length > 0 && (
            <ul className="date-list">
              {dates.map((d) => (
                <li key={d}>
                  {DateTime.fromISO(d).toFormat('ccc d LLL yyyy')}
                  <button type="button" aria-label={`Remove ${d}`} onClick={() => setDates(dates.filter((x) => x !== d))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {granularity === 'time' && (
            <>
              <div style={{ margin: '12px 0 0' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Time zone for organizer</span>
                <p className="hint" style={{ margin: '2px 0 6px' }}>
                  The daily range of available times (set below) is interpreted in this zone.
                  Respondents can view the grid in their own time zone.
                </p>
                <p className="hint" style={{ fontWeight: 600, margin: '6px 0 2px' }}>Commonly used time zones</p>
              </div>
              <div className="chip-row">
                {QUICK_ZONES.map((q) => (
                  <button
                    key={q.zone}
                    type="button"
                    className="chip"
                    aria-pressed={timezone === q.zone}
                    onClick={() => setTimezone(q.zone)}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <label htmlFor="ev-tz-select" className="hint" style={{ fontWeight: 600, margin: '8px 0 0' }}>
                Full time zone list
                <select
                  id="ev-tz-select"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  style={{ fontWeight: 400 }}
                >
                  {!allZones().includes(timezone) && (
                    <option value={timezone}>{displayZoneName(timezone)}</option>
                  )}
                  {allZones().map((z) => (
                    <option key={z} value={z}>
                      {displayZoneName(z)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>

        {granularity === 'time' && (
          <details className="section">
            <summary>
              Times &amp; slot length
              <span className="sub">{dayStart}–{dayEnd}, {slotMinutes}-minute slots</span>
            </summary>
            <div className="section-body">
              <label htmlFor="ev-start">
                Daily start time
                <input id="ev-start" type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} />
              </label>
              <label htmlFor="ev-end">
                Daily end time
                <input id="ev-end" type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} />
              </label>
              <label htmlFor="ev-slot">
                Slot length
                <select id="ev-slot" value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))}>
                  <option value={15}>15 minutes</option>
                  <option value={20}>20 minutes</option>
                  <option value={30}>30 minutes (default)</option>
                  <option value={60}>1 hour</option>
                </select>
              </label>
            </div>
          </details>
        )}

        <details className="section">
          <summary>
            Preference levels
            <span className="sub">{levels.length} levels{levels === DEFAULT_LEVELS ? ' (default)' : ''}</span>
          </summary>
          <div className="section-body">
            <p className="hint">
              Respondents indicate their availability/preference for time slots using the
              following options. You can customize the number and text of the options. The first
              level always means “Not available”; the last level is for the respondent&rsquo;s
              most preferred time slots.
            </p>
            {levels.map((l, i) => (
              <div key={i} className="q-head" style={{ display: 'flex', gap: 8, margin: '6px 0' }}>
                <input
                  type="text"
                  value={l}
                  maxLength={60}
                  aria-label={`Level ${i + 1}`}
                  onChange={(e) => setLevels(levels.map((x, j) => (j === i ? e.target.value : x)))}
                />
                {levels.length > 2 && i !== 0 && i !== levels.length - 1 && (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => setLevels(levels.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {levels.length < 6 && (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setLevels([...levels.slice(0, -1), 'Possible', levels[levels.length - 1]])}
              >
                + Add a middle level
              </button>
            )}
            <p className="hint">
              <button type="button" className="linklike" onClick={() => setLevels(DEFAULT_LEVELS)}>
                Reset to default
              </button>
            </p>
          </div>
        </details>

        <details className="section">
          <summary>
            Extra questions
            <span className="sub">{questions.filter((q) => q.label.trim()).length || 'none'}</span>
          </summary>
          <div className="section-body">
            <QuestionEditor value={questions} onChange={setQuestions} />
          </div>
        </details>

        <details className="section">
          <summary>
            Privacy &amp; options
            <span className="sub">
              {responsesVisible ? (anonymize ? 'responses visible, anonymized' : 'responses visible') : 'responses hidden'}
              {allowSuggestions ? ', date suggestions on' : ''}
            </span>
          </summary>
          <div className="section-body">
            <div className="checkbox">
              <input
                id="ev-visible"
                type="checkbox"
                checked={responsesVisible}
                onChange={(e) => setResponsesVisible(e.target.checked)}
              />
              <label htmlFor="ev-visible" style={{ margin: 0, fontWeight: 400 }}>
                Respondents can see each other’s responses
                <span className="sub">
                  Only organizers can see email addresses.
                </span>
              </label>
            </div>
            {responsesVisible && (
              <div className="checkbox">
                <input
                  id="ev-anon"
                  type="checkbox"
                  checked={anonymize}
                  onChange={(e) => setAnonymize(e.target.checked)}
                />
                <label htmlFor="ev-anon" style={{ margin: 0, fontWeight: 400 }}>
                  Hide names from other respondents
                  <span className="sub">Others see “Respondent 1, 2, …”; organizers see real names.</span>
                </label>
              </div>
            )}
            <div className="checkbox">
              <input
                id="ev-suggest"
                type="checkbox"
                checked={allowSuggestions}
                onChange={(e) => setAllowSuggestions(e.target.checked)}
              />
              <label htmlFor="ev-suggest" style={{ margin: 0, fontWeight: 400 }}>
                Let respondents suggest additional dates
                <span className="sub">Suggestions wait for your approval before joining the grid.</span>
              </label>
            </div>
            <label htmlFor="ev-notify">
              Email organizers when someone responds
              <select id="ev-notify" value={notifyMode} onChange={(e) => setNotifyMode(e.target.value)}>
                <option value="new">New responses only</option>
                <option value="all">New responses and edits</option>
                <option value="off">Don’t email me</option>
              </select>
              <span className="hint" style={{ display: 'block', fontWeight: 400, margin: '4px 0 0' }}>
                Emails every organizer of this event. Requires the one-time email setup (ask the
                tool administrator); until then it stays off.
              </span>
            </label>
          </div>
        </details>

        {error && <div className="banner banner-error">{error}</div>}
        <button className="btn btn-primary btn-wide" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create event & get share link'}
        </button>
      </form>
      {toast}
    </Layout>
  );
}
