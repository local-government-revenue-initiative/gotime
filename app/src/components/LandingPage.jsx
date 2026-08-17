import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from './Layout.jsx';
import AuthPanel from './AuthPanel.jsx';
import { useSession } from '../App.jsx';
import { listMyEvents } from '../api.js';
import { friendlyError } from '../supabaseClient.js';

export default function LandingPage() {
  const { session, authChecked } = useSession();
  const navigate = useNavigate();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) {
      setEvents(null);
      return;
    }
    let cancelled = false;
    listMyEvents()
      .then((rows) => !cancelled && setEvents(rows))
      .catch((err) => !cancelled && setError(friendlyError(err)));
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <Layout narrow>
      <div className="card">
        <h1>Find a time that works for everyone</h1>
        <p>Propose dates, share one link, and let people select the times that suit them.</p>
        <button className="btn btn-primary btn-wide" type="button" onClick={() => navigate('/new')}>
          Create an event
        </button>
        <p className="hint">
          Responding to an invitation instead? Just open the link the organizer sent you.
        </p>
      </div>

      <div className="card">
        <h2>{session ? 'Your events' : 'Organizer sign-in'}</h2>
        {!authChecked ? (
          <p className="hint">Checking session…</p>
        ) : !session ? (
          <AuthPanel intro="Sign in to create events, see your existing ones, and act as a co-organizer." />
        ) : (
          <>
            <AuthPanel />
            {error && <div className="banner banner-error">{error}</div>}
            {events === null && !error && <p className="hint">Loading your events…</p>}
            {events !== null && events.length === 0 && (
              <p className="hint">
                No events yet. <Link to="/new">Create your first one.</Link>
              </p>
            )}
            {events !== null && events.length > 0 && (
              <ul className="event-list">
                {events.map((ev) => (
                  <li key={ev.id}>
                    <span className="title">
                      <Link to={`/e/${ev.token}/manage`}>{ev.title}</Link>
                      {ev.locked && <span className="badge badge-locked">Locked</span>}
                    </span>
                    <span className="meta">
                      {(ev.event_dates || []).length} date{(ev.event_dates || []).length === 1 ? '' : 's'}
                    </span>
                    <Link className="meta" to={`/e/${ev.token}`}>
                      respond
                    </Link>
                    <Link className="meta" to={`/e/${ev.token}/results`}>
                      results
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
