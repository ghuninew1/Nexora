import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { createShare, listShares, replaceShare, revokeShare } from '../services/shares';
import { SharesContext } from './shares-context';

export function SharesProvider({ children }) {
  const { expireSession } = useAuth();
  const [state, setState] = useState({ shares: [], nextCursor: null, status: 'idle', error: null });
  const [links, setLinks] = useState({});
  const controller = useRef(null);
  const lifetime = useRef(null);
  const busy = useRef(new Set());
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => { lifetime.current.abort(); controller.current?.abort(); };
  }, []);
  const report = useCallback(error => { if (error.status === 401) expireSession(); }, [expireSession]);
  const refresh = useCallback(async (cursor = null) => {
    controller.current?.abort(); const c = new AbortController(); controller.current = c;
    setState(s => ({ ...s, status: 'loading', error: null }));
    try {
      const p = await listShares({ cursor, signal: c.signal }); if (c.signal.aborted) return;
      setState(s => ({ shares: cursor ? [...new Map([...s.shares, ...p.shares].map(v => [v.id, v])).values()] : p.shares, nextCursor: p.nextCursor, status: 'ready', error: null }));
    } catch (e) { if (c.signal.aborted) return; report(e); setState(s => ({ ...s, status: 'error', error: e.message })); }
  }, [report]);
  const mutate = async (key, action) => {
    if (busy.current.has(key)) throw new Error('A sharing action is already in progress.');
    busy.current.add(key);
    const signal = lifetime.current.signal;
    try {
      const p = await action({ signal });
      if (signal.aborted) return null;
      // A mutation supersedes any stale listing already in flight.
      controller.current?.abort();
      if (p?.share) {
        setState(s => ({ ...s, shares: [p.share, ...s.shares.filter(v => v.id !== p.share.id)], status: s.status === 'loading' ? 'idle' : s.status }));
        if (p.publicPath) setLinks(s => ({ ...s, [p.share.id]: p.publicPath }));
      } else {
        setState(s => ({ ...s, shares: s.shares.filter(v => v.id !== key), status: s.status === 'loading' ? 'idle' : s.status }));
        setLinks(s => { const next = { ...s }; delete next[key]; return next; });
      }
      return p;
    } catch (e) { if (signal.aborted) return null; report(e); throw e; } finally { busy.current.delete(key); }
  };
  return <SharesContext.Provider value={{ ...state, links, refresh,
    create: (storageId, objectId) => mutate(`${storageId}:${objectId}`, options => createShare(storageId, objectId, options)),
    replace: id => mutate(id, options => replaceShare(id, options)), revoke: id => mutate(id, options => revokeShare(id, options)) }}>{children}</SharesContext.Provider>;
}
