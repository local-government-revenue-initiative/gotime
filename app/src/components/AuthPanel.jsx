import React, { useState } from 'react';
import { sendMagicLink, signOut } from '../api.js';
import { friendlyError } from '../supabaseClient.js';
import { useSession } from '../App.jsx';

/**
 * Passwordless sign-in: enter an email, click the link that arrives.
 * Organizers need this; respondents never do (though they may sign in to
 * protect their response).
 */
export default function AuthPanel({ intro }) {
  const { session } = useSession();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (session) {
    return (
      <p className="hint">
        Signed in as <strong>{session.user.email}</strong>{' '}
        <button type="button" className="linklike" onClick={() => signOut()}>
          Sign out
        </button>
      </p>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await sendMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="banner banner-info">
        Check your inbox — we sent a sign-in link to <strong>{email}</strong>. Opening it brings
        you back here, signed in. (No email? Check spam. The message will have "Go Time" as the
        sender and "signin@gotime.evan-trowbridge.com" as the sender's email address.)
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {intro && <p className="hint">{intro}</p>}
      <label htmlFor="auth-email">
        Email address
        <input
          id="auth-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.org"
          autoComplete="email"
        />
      </label>
      {error && <div className="banner banner-error">{error}</div>}
      <button className="btn btn-primary" type="submit" disabled={busy || !email.trim()}>
        {busy ? 'Sending…' : 'Email me a sign-in link'}
      </button>
      <p className="hint">No password needed — the link signs you in.</p>
    </form>
  );
}
