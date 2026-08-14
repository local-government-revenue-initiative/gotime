import { useCallback, useEffect, useState } from 'react';
import { getEvent } from './api.js';
import { friendlyError } from './supabaseClient.js';

/** Load an event payload by share token, with reload support. */
export function useEvent(token) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setData(await getEvent(token));
      setError('');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/** Bottom-of-screen toast, auto-dismissing. */
export function useToast() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 3500);
    return () => clearTimeout(t);
  }, [message]);
  const toast = message ? <div className="toast" role="status">{message}</div> : null;
  return [toast, setMessage];
}
