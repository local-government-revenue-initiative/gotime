import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from './Layout.jsx';
import { getSupabase, friendlyError } from '../supabaseClient.js';

/**
 * Where the sign-in email lands. The email's button links to
 * {SiteURL}/auth/confirm?token_hash=…&type=email&next=…, so every URL in the
 * email lives on Go Time's own domain instead of the Supabase project URL —
 * a sender/link mismatch is the classic phishing signature, and legitimate
 * mail shouldn't wear it.
 *
 * The token is NOT exchanged on page load. Corporate mail filters (Microsoft
 * Defender at U of T, notably) open links in a sandbox that executes
 * JavaScript before the recipient ever sees the email; sign-in tokens are
 * single-use, so auto-verifying meant the scanner consumed the token and the
 * human found it "already used". Requiring a real click defeats that:
 * scanners load pages, they don't press buttons.
 *
 * `next` is reduced to its path before navigating, for two reasons: an
 * absolute URL would be an open-redirect hole, and a link requested on one
 * of the app's domains may be opened on the other — the session lives in
 * this origin's storage, so staying on this origin is what keeps the user
 * signed in.
 */
export default function AuthConfirmPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { tokenHash, next } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    let path = '/';
    try {
      const raw = params.get('next');
      if (raw) {
        const u = new URL(raw, window.location.origin);
        path = u.pathname + u.search + u.hash;
      }
    } catch {
      /* unparseable → home */
    }
    return { tokenHash: params.get('token_hash'), next: path };
  }, []);

  async function complete() {
    setBusy(true);
    setError('');
    try {
      const supabase = await getSupabase();
      if (!supabase) {
        setError('Could not reach the server — check your connection and reload.');
        return;
      }
      const { error: err } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
      if (err) setError(friendlyError(err));
      else navigate(next, { replace: true });
    } finally {
      setBusy(false);
    }
  }

  if (!tokenHash) {
    return (
      <Layout narrow>
        <div className="card">
          <h2>Sign-in link problem</h2>
          <p className="hint">
            This page finishes a sign-in that starts from an email link, but no sign-in code came
            with the address. Request a fresh link from the sign-in box on the page you were using.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout narrow>
      <div className="card">
        <h2>Almost signed in</h2>
        <p>One more press finishes your sign-in to Go Time.</p>
        <button type="button" className="btn btn-primary btn-wide" onClick={complete} disabled={busy}>
          {busy ? 'Signing you in…' : 'Complete sign-in'}
        </button>
        {error && <div className="banner banner-error">{error}</div>}
        {error && (
          <p className="hint">
            Sign-in links work once and expire after an hour. Request a fresh one from the
            sign-in box on the page you were using — or just continue without signing in:
            responding to an event never requires an account.
          </p>
        )}
      </div>
    </Layout>
  );
}
