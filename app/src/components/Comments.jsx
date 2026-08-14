import React, { useState } from 'react';
import { DateTime } from 'luxon';
import { addComment } from '../api.js';
import { friendlyError } from '../supabaseClient.js';

/** Public comment list + composer. Comments always show the name entered. */
export default function Comments({ data, token, onPosted, showToast, defaultName = '', responseId = null }) {
  const [name, setName] = useState(defaultName);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = data.event.locked;

  async function post(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await addComment(token, name.trim() || defaultName.trim(), body.trim(), responseId);
      setBody('');
      showToast('Comment posted.');
      onPosted();
    } catch (err) {
      showToast(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Comments</h2>
      {data.comments.length === 0 && <p className="hint">No comments yet.</p>}
      {data.comments.map((c) => (
        <div className="comment" key={c.id}>
          <span className="who">
            {c.author_name}
            <span className="when">{DateTime.fromISO(c.created_at).toFormat('d LLL, HH:mm')}</span>
          </span>
          <p className="body">{c.body}</p>
        </div>
      ))}
      {!locked && (
        <form onSubmit={post}>
          <label>
            Your name
            <input
              type="text"
              value={name || defaultName}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label>
            Comment
            <textarea
              rows={2}
              value={body}
              maxLength={2000}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Visible to everyone with the link"
              required
            />
          </label>
          <button className="btn" type="submit" disabled={busy || !body.trim() || !(name || defaultName).trim()}>
            {busy ? 'Posting…' : 'Post comment'}
          </button>
        </form>
      )}
    </div>
  );
}
