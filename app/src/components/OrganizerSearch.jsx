import React, { useState } from 'react';
import { searchProfiles, addOrganizer } from '../api.js';
import { friendlyError } from '../supabaseClient.js';

/**
 * Find registered users (by exact email or name prefix) and add them as
 * co-organizers.
 */
export default function OrganizerSearch({ eventId, existing, onAdded }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function search(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setResults(await searchProfiles(query.trim()));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={search}>
        <label>
          Add a co-organizer
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Their account email (exact) or name"
          />
        </label>
        <button className="btn btn-small" type="submit" disabled={busy || query.trim().length < 2}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>
      <p className="hint">
        Co-organizers need a GoTime account first — ask them to sign in once at {window.location.origin},
        then search for their email here.
      </p>
      {error && <div className="banner banner-error">{error}</div>}
      {results !== null && results.length === 0 && (
        <p className="hint">No matching account found. Check the exact email address.</p>
      )}
      {results !== null && results.length > 0 && (
        <ul className="people-list">
          {results.map((p) => (
            <li key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 2px' }}>
              <span style={{ flex: 1 }}>
                <span className="who">{p.display_name || p.email}</span>{' '}
                <span className="meta">{p.email}</span>
              </span>
              {existing.includes(p.id) ? (
                <span className="meta">already an organizer</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  onClick={async () => {
                    try {
                      await addOrganizer(eventId, p.id);
                      setResults(null);
                      setQuery('');
                      onAdded();
                    } catch (err) {
                      setError(friendlyError(err));
                    }
                  }}
                >
                  Add
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
