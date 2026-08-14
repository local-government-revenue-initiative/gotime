import React, { createContext, useContext, useEffect, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { getSupabase, isSupabaseConfigured } from './supabaseClient.js';
import LandingPage from './components/LandingPage.jsx';
import NewEventPage from './components/NewEventPage.jsx';
import RespondPage from './components/RespondPage.jsx';
import ResultsPage from './components/ResultsPage.jsx';
import ManagePage from './components/ManagePage.jsx';

/**
 * Session context: { session, authChecked, refresh }.
 * authChecked prevents a sign-in-screen flash before the stored session
 * resolves; if the Supabase client is unavailable it is still set true so
 * the app never locks users out of public pages.
 */
const SessionContext = createContext({ session: null, authChecked: false });
export const useSession = () => useContext(SessionContext);

export default function App() {
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let subscription = null;
    let cancelled = false;
    (async () => {
      const supabase = await getSupabase();
      if (!supabase || cancelled) {
        setAuthChecked(true);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        setSession(data?.session ?? null);
        setAuthChecked(true);
      }
      const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
        setSession(s);
      });
      subscription = sub?.subscription ?? null;
    })();
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, authChecked }}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/new" element={<NewEventPage />} />
        <Route path="/e/:token" element={<RespondPage />} />
        <Route path="/e/:token/results" element={<ResultsPage />} />
        <Route path="/e/:token/manage" element={<ManagePage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!isSupabaseConfigured() && (
        <p className="global-warning">Backend not configured — the app is read-only.</p>
      )}
    </SessionContext.Provider>
  );
}

function NotFound() {
  return (
    <main className="page narrow">
      <div className="card">
        <h1>Page not found</h1>
        <p>
          That link doesn&rsquo;t point anywhere. <Link to="/">Go to the home page</Link>.
        </p>
      </div>
    </main>
  );
}
