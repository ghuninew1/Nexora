import { useCallback, useEffect, useMemo, useState } from 'react';
import { PreferencesContext } from './preferences-context';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(null);
  const [status, setStatus] = useState('loading');
  const { expireSession } = useAuth();
  const { setTheme } = useTheme();
  useEffect(() => {
    if (preferences?.theme) setTheme(preferences.theme);
  }, [preferences?.theme, setTheme]);
  useEffect(() => () => setTheme('dark'), [setTheme]);
  const load = useCallback(async (signal) => {
    try {
      const response = await fetch('/api/settings/preferences', { credentials: 'same-origin', signal });
      if (response.status === 401) { expireSession(); return; }
      if (!response.ok) throw new Error();
      const { data } = await response.json();
      if (!signal?.aborted) { setPreferences(data); setStatus('ready'); }
    } catch { if (!signal?.aborted) setStatus('error'); }
  }, [expireSession]);
  useEffect(() => {
    const controller = new AbortController();
    setTheme('dark');
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => controller.abort();
  }, [load, setTheme]);
  const save = useCallback(async (changes) => {
    const response = await fetch('/api/settings/preferences', { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
    if (response.status === 401) expireSession();
    if (!response.ok) throw new Error('Unable to save preferences. Try again.');
    const { data } = await response.json();
    setPreferences(data);
  }, [expireSession]);
  const value = useMemo(() => ({ preferences, status, load, save }), [preferences, status, load, save]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
