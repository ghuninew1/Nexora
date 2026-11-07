import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from './auth-context';
import { getCurrentUser, signIn, signOut, updateDisplayName } from '../services/auth';

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ status: 'loading', user: null });
  const [signingOut, setSigningOut] = useState(false);
  const restoreSequence = useRef(0);
  const sessionVersion = useRef(0);
  const isCheckingActiveSession = useRef(false);

  const restoreSession = useCallback(async (signal) => {
    const sequence = ++restoreSequence.current;
    try {
      const user = await getCurrentUser({ signal });
      if (signal?.aborted || sequence !== restoreSequence.current) return;
      setAuth(user ? { status: 'authenticated', user } : { status: 'unauthenticated', user: null });
    } catch {
      if (signal?.aborted || sequence !== restoreSequence.current) return;
      setAuth({ status: 'error', user: null });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void restoreSession(controller.signal);
    });
    return () => {
      controller.abort();
      restoreSequence.current += 1;
    };
  }, [restoreSession]);

  const login = useCallback(async (email, password) => {
    const user = await signIn(email, password);
    sessionVersion.current += 1;
    setAuth({ status: 'authenticated', user });
    return user;
  }, []);

  const logout = useCallback(async () => {
    // Stop workspace transfers immediately, even if the logout request is slow/fails.
    sessionVersion.current += 1;
    setSigningOut(true);
    try {
      await signOut();
      setAuth({ status: 'unauthenticated', user: null });
    } finally { setSigningOut(false); }
  }, []);

  const expireSession = useCallback(() => {
    sessionVersion.current += 1;
    setAuth({ status: 'unauthenticated', user: null });
  }, []);

  const retrySession = useCallback(() => {
    setAuth({ status: 'loading', user: null });
    void restoreSession();
  }, [restoreSession]);

  const updateProfile = useCallback(async (displayName) => {
    const version = sessionVersion.current;
    const user = await updateDisplayName(displayName);
    if (version === sessionVersion.current) setAuth(current => current.status === 'authenticated' ? { ...current, user } : current);
  }, []);

  useEffect(() => {
    if (auth.status !== 'authenticated') return undefined;
    let mounted = true;
    async function checkSession() {
      if (isCheckingActiveSession.current) return;
      isCheckingActiveSession.current = true;
      const version = sessionVersion.current;
      try {
        const user = await getCurrentUser();
        if (!mounted || version !== sessionVersion.current) return;
        setAuth((current) => current.status === 'authenticated'
          ? (user ? { status: 'authenticated', user } : { status: 'unauthenticated', user: null })
          : current);
      } catch {
        // Keep the current view during a transient network failure; the server still enforces authorization.
      } finally {
        isCheckingActiveSession.current = false;
      }
    }
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkSession();
    };
    window.addEventListener('focus', checkSession);
    document.addEventListener('visibilitychange', checkWhenVisible);
    return () => {
      mounted = false;
      window.removeEventListener('focus', checkSession);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, [auth.status]);

  const value = useMemo(() => ({ ...auth, signingOut, login, logout, retrySession, expireSession, updateProfile }), [auth, signingOut, login, logout, retrySession, expireSession, updateProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
