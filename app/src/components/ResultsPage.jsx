import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from './Layout.jsx';
import EventHeader from './EventHeader.jsx';
import AvailabilityGrid from './AvailabilityGrid.jsx';
import TimezonePicker from './TimezonePicker.jsx';
import { useEvent } from '../hooks.jsx';
import { buildSlotGrid, formatSlotInZone, zoneLabelDrift } from '../lib/slots.js';
import { detectZone, zoneLabel } from '../lib/timezones.js';
import { bestSlots, scoreSlots, slotBreakdown, questionTallies } from '../lib/aggregate.js';
import { levelColor } from '../lib/levelColors.js';
import { buildICS } from '../lib/ics.js';

export default function ResultsPage() {
  const { token } = useParams();
  const { data, error, loading } = useEvent(token);
  const [selectedKey, setSelectedKey] = useState(null);
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
  const zones = [zone, ...extraZones.filter((z) => z !== zone)];
  const responses = data?.responses || [];
  const scored = useMemo(
    () => (grid ? scoreSlots(grid.allKeys, responses) : null),
    [grid, responses],
  );
  const top = useMemo(() => (scored ? bestSlots(scored, 5) : []), [scored]);
  const tallies = useMemo(
    () => (data ? questionTallies(data.questions, responses) : []),
    [data, responses],
  );
  const drift = useMemo(
    () => (grid ? zones.some((z) => zoneLabelDrift(grid, z)) : false),
    [grid, zones.join('|')],
  );

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

  const hidden = !event.responses_visible && !data.is_organizer;

  function downloadInvite(key) {
    const ics = buildICS({
      title: event.title,
      description: event.description,
      startKey: key,
      durationMinutes: event.slot_minutes,
      url: `${window.location.origin}/e/${event.token}`,
      uid: `${event.id}-${key}@gotime`,
    });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${event.title.replace(/[^\w-]+/g, '_')}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (hidden) {
    return (
      <Layout>
        <EventHeader event={event} isOrganizer={false} hideDescription />
        <div className="card">
          <h2>Results are private</h2>
          <p>
            The organizer has chosen to keep individual responses private.{' '}
            {data.response_count} response{data.response_count === 1 ? '' : 's'} so far.
          </p>
        </div>
      </Layout>
    );
  }

  const detail = selectedKey ? slotBreakdown(selectedKey, responses, levels.length) : null;

  return (
    <Layout>
      <EventHeader event={event} isOrganizer={data.is_organizer} hideDescription />
      <div className="card">
        <h2>Combined availability</h2>
        {responses.length === 0 ? (
          <p className="hint">No responses yet — the heatmap appears once people respond.</p>
        ) : (
          <>
            <p className="hint">
              Darker green = works for more people (score: {levels.map((l, i) => `${l} = ${i}`).join(', ')}).
              Tap a slot to see who can make it.
            </p>
            <TimezonePicker zone={zone} onZone={setZone} extras={extraZones} onExtras={setExtraZones} allowExtras />
            {drift && (
              <div className="banner">
                ⚠️ A daylight-saving change falls between these dates, so times in{' '}
                {zones.map(zoneLabel).join(' / ')} shift on some days. Hover a cell for exact times.
              </div>
            )}
            <AvailabilityGrid
              mode="heatmap"
              grid={grid}
              zones={zones}
              levels={levels}
              responses={responses}
              selectedKey={selectedKey}
              onSelectSlot={(k) => setSelectedKey(k === selectedKey ? null : k)}
            />
            {detail && (
              <div className="slot-detail">
                <h3>{formatSlotInZone(selectedKey, zone)} ({zoneLabel(zone)})</h3>
                {levels
                  .map((label, i) => ({ label, i, people: detail[i] }))
                  .reverse()
                  .filter(({ i }) => i > 0)
                  .map(({ label, i, people }) => (
                    <div key={i}>
                      <strong>{label}:</strong>{' '}
                      {people.length ? (
                        people.map((p) => p.name).join(', ')
                      ) : (
                        <span className="none">nobody</span>
                      )}
                    </div>
                  ))}
                <p style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-small" onClick={() => downloadInvite(selectedKey)}>
                    📅 Download calendar invite for this slot
                  </button>
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {top.length > 0 && (
        <div className="card">
          <h2>Best times</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When ({zoneLabel(zone)})</th>
                  <th>Score</th>
                  <th>Can make it</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {top.map((slot) => (
                  <tr key={slot.key}>
                    <td>{formatSlotInZone(slot.key, zone)}</td>
                    <td>{slot.score}</td>
                    <td>
                      {slot.available} of {responses.length}
                    </td>
                    <td>
                      <button type="button" className="btn btn-small" onClick={() => downloadInvite(slot.key)}>
                        📅 Invite
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tallies.length > 0 && responses.length > 0 && (
        <div className="card">
          <h2>Question results</h2>
          {tallies.map(({ question: q, counts, texts, answered }) => (
            <div key={q.id} style={{ marginBottom: 14 }}>
              <h3>{q.label}</h3>
              {counts && (
                <div className="table-scroll">
                  <table className="data-table">
                    <tbody>
                      {Object.entries(counts).map(([opt, n]) => (
                        <tr key={opt}>
                          <td>{opt}</td>
                          <td>
                            {n} {n === 1 ? 'person' : 'people'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {texts &&
                (texts.length ? (
                  texts.map((t, i) => (
                    <div className="comment" key={i}>
                      <span className="who">{t.name}</span>
                      <p className="body">{t.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="hint">No answers yet.</p>
                ))}
              <p className="hint">{answered} of {responses.length} answered.</p>
            </div>
          ))}
        </div>
      )}

      {responses.length > 0 && (
        <div className="card">
          <h2>Individual responses</h2>
          {responses.map((r) => {
            const painted = Object.entries(r.availability || {}).filter(([, v]) => v > 0);
            return (
              <div className="q-row" key={r.id}>
                <h3>
                  {r.name}
                  {r.claimed ? ' 🔗' : ''}
                </h3>
                <p className="hint" style={{ margin: '2px 0 6px' }}>
                  {painted.length === 0
                    ? 'No available times selected.'
                    : `${painted.length} slot${painted.length === 1 ? '' : 's'} marked available.`}
                </p>
                {painted.length > 0 && (
                  <div className="chip-row">
                    {levels.map((label, i) =>
                      i === 0 ? null : (
                        <span
                          key={i}
                          className={'badge' + (levelColor(i, levels.length).striped ? ' striped' : '')}
                          style={{
                            backgroundColor: levelColor(i, levels.length).bg,
                            color: levelColor(i, levels.length).ink,
                          }}
                        >
                          {label}: {painted.filter(([, v]) => v === i).length}
                        </span>
                      ),
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
