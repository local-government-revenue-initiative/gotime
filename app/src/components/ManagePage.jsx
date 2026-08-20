import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import Layout from './Layout.jsx';
import AuthPanel from './AuthPanel.jsx';
import EventHeader from './EventHeader.jsx';
import QuestionEditor, { parseOptionsText } from './QuestionEditor.jsx';
import OrganizerSearch from './OrganizerSearch.jsx';
import { useSession } from '../App.jsx';
import { useEvent, useToast } from '../hooks.jsx';
import {
  updateEvent,
  addEventDate,
  setDateApproval,
  removeEventDate,
  replaceQuestions,
  deleteResponse,
  deleteComment,
  listOrganizers,
  removeOrganizer,
  deleteEvent,
} from '../api.js';
import { friendlyError } from '../supabaseClient.js';
import { formatSlotInZone, sortSlotKeys } from '../lib/slots.js';

export default function ManagePage() {
  const { token } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { session, authChecked } = useSession();
  const { data, error, loading, reload } = useEvent(token);
  const [toast, showToast] = useToast();
  const [team, setTeam] = useState([]);
  const [busy, setBusy] = useState(false);

  const event = data?.event;
  const isOrganizer = Boolean(data?.is_organizer);
  // Deleting is owner-only (RLS enforces it too); the team list carries roles.
  const isOwner = team.some((m) => m.role === 'owner' && m.user_id === session?.user?.id);

  useEffect(() => {
    if (!isOrganizer || !event) return;
    listOrganizers(event.id).then(setTeam).catch(() => {});
  }, [isOrganizer, event?.id]);

  async function patch(fields, message) {
    setBusy(true);
    try {
      await updateEvent(event.id, fields);
      await reload();
      if (message) showToast(message);
    } catch (err) {
      showToast(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !authChecked) {
    return (
      <Layout>
        <div className="card"><p className="hint">Loading…</p></div>
      </Layout>
    );
  }
  if (error) {
    return (
      <Layout>
        <div className="card"><div className="banner banner-error">{error}</div></div>
      </Layout>
    );
  }
  if (!session) {
    return (
      <Layout narrow>
        <EventHeader event={event} isOrganizer={false} hideDescription />
        <div className="card">
          <h2>Organizer sign-in</h2>
          <AuthPanel intro="Managing this event requires signing in with an organizer account." />
        </div>
      </Layout>
    );
  }
  if (!isOrganizer) {
    return (
      <Layout narrow>
        <EventHeader event={event} isOrganizer={false} hideDescription />
        <div className="card">
          <div className="banner banner-error">
            Your account ({session.user.email}) is not an organizer of this event. Ask an existing
            organizer to add you as a co-organizer.
          </div>
        </div>
      </Layout>
    );
  }

  const shareUrl = `${window.location.origin}/e/${event.token}`;
  const pendingDates = data.dates.filter((d) => !d.approved);

  return (
    <Layout>
      <EventHeader event={event} isOrganizer hideDescription />
      {location.state?.created && (
        <div className="banner banner-info">
          🎉 Your event is live. Share the link below with respondents.
        </div>
      )}

      <div className="card">
        <h2>Share link</h2>
        <p>
          <a href={shareUrl}>{shareUrl}</a>{' '}
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              navigator.clipboard?.writeText(shareUrl).then(
                () => showToast('Link copied to clipboard'),
                () => showToast('Could not copy — select and copy the link manually'),
              );
            }}
          >
            Copy
          </button>
        </p>
        <p className="hint">Anyone with this link can respond ({data.response_count} response{data.response_count === 1 ? '' : 's'} so far).</p>
        <div className="checkbox">
          <input
            id="mg-lock"
            type="checkbox"
            checked={event.locked}
            disabled={busy}
            onChange={(e) =>
              patch({ locked: e.target.checked }, e.target.checked ? 'Form locked — no more changes accepted.' : 'Form unlocked.')
            }
          />
          <label htmlFor="mg-lock" style={{ margin: 0, fontWeight: 600 }}>
            Lock the form
            <span className="sub">Locked forms reject new responses, edits, comments and suggestions.</span>
          </label>
        </div>
      </div>

      {pendingDates.length > 0 && (
        <div className="card">
          <h2>Suggested dates awaiting approval</h2>
          {pendingDates.map((d) => (
            <p key={d.id}>
              <strong>{DateTime.fromISO(d.date).toFormat('cccc d LLLL yyyy')}</strong>{' '}
              <button
                type="button"
                className="btn btn-small btn-primary"
                onClick={async () => {
                  await setDateApproval(d.id, true).catch((err) => showToast(friendlyError(err)));
                  reload();
                }}
              >
                Approve
              </button>{' '}
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={async () => {
                  await removeEventDate(d.id).catch((err) => showToast(friendlyError(err)));
                  reload();
                }}
              >
                Reject
              </button>
            </p>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Settings</h2>
        <SettingsForm event={event} busy={busy} onSave={(fields) => patch(fields, 'Settings saved.')} />
      </div>

      <details className="section">
        <summary>
          Archive or delete
          <span className="sub">
            {event.archived ? 'this event is archived' : 'tidy up or remove this event'}
          </span>
        </summary>
        <div className="section-body">
          <div className="checkbox">
            <input
              id="mg-archive"
              type="checkbox"
              checked={Boolean(event.archived)}
              disabled={busy}
              onChange={(e) =>
                patch(
                  { archived: e.target.checked },
                  e.target.checked
                    ? 'Archived — find it under “Archived events” on your home page.'
                    : 'Un-archived — back in your events list.',
                )
              }
            />
            <label htmlFor="mg-archive" style={{ margin: 0, fontWeight: 600 }}>
              Archive this event
              <span className="sub">
                Hides it from your events list to keep the page clear. The link, responses and
                results all keep working, and you can un-archive at any time. To stop accepting
                responses, lock the form instead.
              </span>
            </label>
          </div>

          {isOwner ? (
            <DeleteEvent
              event={event}
              responseCount={data.response_count}
              onDeleted={() => navigate('/', { state: { deleted: event.title } })}
              onError={(m) => showToast(m)}
            />
          ) : (
            <p className="hint" style={{ marginTop: 14 }}>
              Only the organizer who created this event can delete it.
            </p>
          )}
        </div>
      </details>

      <div className="card">
        <h2>Dates</h2>
        <ul className="date-list">
          {data.dates.filter((d) => d.approved).map((d) => (
            <li key={d.id}>
              {DateTime.fromISO(d.date).toFormat('ccc d LLL yyyy')}
              <button
                type="button"
                aria-label={`Remove ${d.date}`}
                onClick={async () => {
                  if (!window.confirm(`Remove ${d.date}? Availability already entered for this date stays stored but is no longer shown.`)) return;
                  await removeEventDate(d.id).catch((err) => showToast(friendlyError(err)));
                  reload();
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="add-date-row">
          <label style={{ fontWeight: 400 }}>
            Add a date
            <input
              type="date"
              onChange={async (e) => {
                if (!e.target.value) return;
                const v = e.target.value;
                e.target.value = '';
                await addEventDate(event.id, v).catch((err) => showToast(friendlyError(err)));
                reload();
              }}
            />
          </label>
        </div>
      </div>

      <details className="section">
        <summary>
          Extra questions <span className="sub">{data.questions.length || 'none'}</span>
        </summary>
        <div className="section-body">
          <ManagedQuestions eventId={event.id} questions={data.questions} onSaved={() => { reload(); showToast('Questions saved.'); }} onError={(m) => showToast(m)} />
        </div>
      </details>

      <details className="section">
        <summary>
          Co-organizers <span className="sub">{team.length} member{team.length === 1 ? '' : 's'}</span>
        </summary>
        <div className="section-body">
          <ul className="people-list">
            {team.map((m) => (
              <li key={m.user_id} style={{ display: 'flex', alignItems: 'center', padding: '8px 2px' }}>
                <span style={{ flex: 1 }}>
                  <span className="who">{m.display_name || m.email}</span>{' '}
                  <span className="meta">{m.email} · {m.role === 'owner' ? 'owner' : 'co-organizer'}</span>
                </span>
                {m.role === 'co' && (
                  <button
                    type="button"
                    className="btn btn-small btn-danger"
                    onClick={async () => {
                      await removeOrganizer(event.id, m.user_id).catch((err) => showToast(friendlyError(err)));
                      listOrganizers(event.id).then(setTeam).catch(() => {});
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          <OrganizerSearch
            eventId={event.id}
            existing={team.map((m) => m.user_id)}
            onAdded={() => {
              listOrganizers(event.id).then(setTeam).catch(() => {});
              showToast('Co-organizer added.');
            }}
          />
        </div>
      </details>

      <div className="card">
        <h2>Responses ({data.responses.length})</h2>
        {data.responses.length === 0 ? (
          <p className="hint">Nobody has responded yet. Share the link above to get started.</p>
        ) : (
          <>
            <button type="button" className="btn btn-small" onClick={() => downloadCsv(data)}>
              Download CSV
            </button>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.responses.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.name}
                        {r.claimed ? ' 🔗' : ''}
                      </td>
                      <td>{r.email}</td>
                      <td>{DateTime.fromISO(r.updated_at).toFormat('d LLL, HH:mm')}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-small btn-danger"
                          onClick={async () => {
                            if (!window.confirm(`Delete the response from “${r.name}”? This cannot be undone.`)) return;
                            await deleteResponse(r.id).catch((err) => showToast(friendlyError(err)));
                            reload();
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">🔗 = linked to an account (only that person can edit it).</p>
          </>
        )}
      </div>

      {data.comments.length > 0 && (
        <div className="card">
          <h2>Comments</h2>
          {data.comments.map((c) => (
            <div className="comment" key={c.id}>
              <span className="who">
                {c.author_name}
                <span className="when">{DateTime.fromISO(c.created_at).toFormat('d LLL, HH:mm')}</span>
              </span>
              <p className="body">{c.body}</p>
              <button
                type="button"
                className="linklike"
                onClick={async () => {
                  if (!window.confirm('Delete this comment?')) return;
                  await deleteComment(c.id).catch((err) => showToast(friendlyError(err)));
                  reload();
                }}
              >
                delete
              </button>
            </div>
          ))}
        </div>
      )}
      {toast}
    </Layout>
  );
}

function SettingsForm({ event, busy, onSave }) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [responsesVisible, setResponsesVisible] = useState(event.responses_visible);
  const [anonymize, setAnonymize] = useState(event.anonymize_names);
  const [allowSuggestions, setAllowSuggestions] = useState(event.allow_suggestions);
  const [notifyMode, setNotifyMode] = useState(event.notify_mode || 'new');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          title: title.trim() || event.title,
          description: description.trim(),
          responses_visible: responsesVisible,
          anonymize_names: responsesVisible ? anonymize : false,
          allow_suggestions: allowSuggestions,
          notify_mode: notifyMode,
        });
      }}
    >
      <label>
        Title
        <input type="text" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Description
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="checkbox">
        <input
          id="st-visible"
          type="checkbox"
          checked={responsesVisible}
          onChange={(e) => setResponsesVisible(e.target.checked)}
        />
        <label htmlFor="st-visible" style={{ margin: 0, fontWeight: 400 }}>
          Respondents can see each other’s responses
        </label>
      </div>
      {responsesVisible && (
        <div className="checkbox">
          <input
            id="st-anon"
            type="checkbox"
            checked={anonymize}
            onChange={(e) => setAnonymize(e.target.checked)}
          />
          <label htmlFor="st-anon" style={{ margin: 0, fontWeight: 400 }}>
            Hide names from other respondents
          </label>
        </div>
      )}
      <div className="checkbox">
        <input
          id="st-suggest"
          type="checkbox"
          checked={allowSuggestions}
          onChange={(e) => setAllowSuggestions(e.target.checked)}
        />
        <label htmlFor="st-suggest" style={{ margin: 0, fontWeight: 400 }}>
          Let respondents suggest additional dates
        </label>
      </div>
      <label htmlFor="st-notify">
        Email organizers when someone responds
        <select id="st-notify" value={notifyMode} onChange={(e) => setNotifyMode(e.target.value)}>
          <option value="new">New responses only</option>
          <option value="all">New responses and edits</option>
          <option value="off">Don’t email</option>
        </select>
        <span className="hint" style={{ display: 'block', fontWeight: 400, margin: '4px 0 0' }}>
          Emails every organizer of this event. Requires the one-time email setup; until then it stays off.
        </span>
      </label>
      <p className="hint">
        Time range, slot length and time zone are fixed once responses exist — changing them would
        silently invalidate what people already entered.
      </p>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        Save settings
      </button>
    </form>
  );
}

function ManagedQuestions({ eventId, questions, onSaved, onError }) {
  const [draft, setDraft] = useState(
    questions.map((q) => ({ ...q, optionsText: (q.options || []).join('\n') })),
  );
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <QuestionEditor value={draft} onChange={setDraft} />
      <p className="hint">
        Answers already given keep their stored values even if you edit questions; removed
        questions disappear from the form and results.
      </p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const clean = draft
              .map((q) => ({ ...q, label: q.label.trim(), options: parseOptionsText(q.optionsText) }))
              .filter((q) => q.label)
              .filter((q) => q.type === 'text' || q.options.length >= 2);
            await replaceQuestions(eventId, clean);
            onSaved();
          } catch (err) {
            onError(friendlyError(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        Save questions
      </button>
    </div>
  );
}

/**
 * Permanent deletion, behind a deliberate second step: the button arms a
 * confirmation that spells out exactly what disappears, because responses
 * other people took the trouble to give are not recoverable afterwards.
 */
function DeleteEvent({ event, responseCount, onDeleted, onError }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!armed) {
    return (
      <p style={{ marginTop: 18 }}>
        <button type="button" className="btn btn-danger" onClick={() => setArmed(true)}>
          Delete this event
        </button>
      </p>
    );
  }

  return (
    <div className="banner banner-error" style={{ marginTop: 18 }}>
      <p style={{ margin: '0 0 8px' }}>
        <strong>Delete “{event.title}” permanently?</strong>
      </p>
      <p className="hint" style={{ margin: '0 0 10px' }}>
        This removes the event, its {responseCount} response{responseCount === 1 ? '' : 's'},
        every comment, and the questions — for everyone, not just you. The share link stops
        working. This cannot be undone. To simply tidy your list, archive it instead.
      </p>
      <button
        type="button"
        className="btn btn-danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await deleteEvent(event.id);
            onDeleted();
          } catch (err) {
            onError(friendlyError(err));
            setBusy(false);
          }
        }}
      >
        {busy ? 'Deleting…' : 'Yes, delete permanently'}
      </button>{' '}
      <button type="button" className="btn" disabled={busy} onClick={() => setArmed(false)}>
        Cancel
      </button>
    </div>
  );
}

function downloadCsv(data) {
  const { event, questions, responses } = data;
  const slotKeys = sortSlotKeys([
    ...new Set(responses.flatMap((r) => Object.keys(r.availability || {}))),
  ]);
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const header = [
    'Name', 'Email', 'Updated',
    ...questions.map((q) => q.label),
    ...slotKeys.map((k) => formatSlotInZone(k, event.timezone)),
  ];
  const rows = responses.map((r) => [
    r.name, r.email, r.updated_at,
    ...questions.map((q) => {
      const v = r.answers?.[q.id];
      return Array.isArray(v) ? v.join('; ') : v ?? '';
    }),
    ...slotKeys.map((k) => r.availability?.[k] ?? 0),
  ]);
  const csv = [header, ...rows].map((row) => row.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${event.title.replace(/[^\w-]+/g, '_')}_responses.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
