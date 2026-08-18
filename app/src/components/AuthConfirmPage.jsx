import React, { useEffect, useState } from 'react';
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
 * The page exchanges the token for a session, then continues to `next`.
 * `next` is reduced to its path before navigating, for two reasons: an
 * absolute URL would be an open-redirect hole, and during the domain
 * transition a link requested on one domain may be opened on the other —
 * the session lives in this origin's storage, so staying on this origin is
 * what keeps the user signed in.
 */
export default function AuthConfirmPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      let next = '/';
      try {
        const raw = params.get('next');
        if (raw) {
          const u = new URL(raw, window.location.origin);
          next = u.pathname + u.search + u.hash;
        }
      } catch {
        /* unparseable → home */
      }
      const tokenHash = params.get('token_hash');
      if (!tokenHash) {
        navigate(next, { replace: true });
        return;
      }
      const supabase = await getSupabase();
      if (!supabase) {
        if (!cancelled) setError('Could not reach the server — check your connection and reload.');
        return;
      }
      const { error: err } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
      if (cancelled) return;
      if (err) setError(friendlyError(err));
      else navigate(next, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Layout narrow>
      <div className="card">
        {error ? (
          <>
            <h2>Sign-in link problem</h2>
            <div className="banner banner-error">{error}</div>
            <p className="hint">
              Sign-in links work once and expire after an hour. Request a fresh one from the
              sign-in box on the page you were using — or just continue without signing in:
              responding to an event never requires an account.
            </p>
          </>
        ) : (
          <p className="hint">Signing you in…</p>
        )}
      </div>
    </Layout>
  );
}
