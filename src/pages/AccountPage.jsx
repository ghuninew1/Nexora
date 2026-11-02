import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { cx } from '../utils/cx';

export default function AccountPage() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user.displayName);
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');
  const [sessionState, setSessionState] = useState('idle');
  const [sessionMessage, setSessionMessage] = useState('');
  const [confirmSessions, setConfirmSessions] = useState(false);
  async function save(event) {
    event.preventDefault();
    setState('saving'); setMessage('');
    try { await updateProfile(name); setState('idle'); setMessage('Account updated.'); }
    catch (error) { setState('error'); setMessage(error.message); }
  }
  async function revokeOtherSessions() {
    setSessionState('saving'); setSessionMessage('');
    try {
      const response = await fetch('/api/settings/logout-other-sessions', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error();
      setSessionState('idle'); setSessionMessage('Other sessions signed out.'); setConfirmSessions(false);
    } catch { setSessionState('error'); setSessionMessage('Unable to sign out other sessions. Try again.'); }
  }
  return <div className={cx('flex max-w-2xl flex-col gap-6')}>
    <div><h1 className={cx('text-2xl font-semibold')}>Account</h1><p className={cx('mt-2 text-sm text-muted-foreground')}>View and update your account information.</p></div>
    <form className={cx('glass-surface flex flex-col gap-4 p-5')} onSubmit={save}>
      <label className={cx('flex flex-col gap-2 text-sm font-medium')}>Display name<input className={cx('glass-control min-h-11 rounded-lg px-3 font-normal')} required maxLength={120} value={name} disabled={state === 'saving'} onChange={event => setName(event.target.value)} /></label>
      <div><p className={cx('text-sm font-medium')}>Email</p><p className={cx('mt-1 text-sm text-muted-foreground')}>{user.email}</p></div>
      <div><p className={cx('text-sm font-medium')}>Role</p><p className={cx('mt-1 text-sm text-muted-foreground')}>{user.role}</p></div>
      {message && <p role={state === 'error' ? 'alert' : 'status'} className={cx('text-sm')}>{message}</p>}
      <div><Button type="submit" disabled={state === 'saving' || !name.trim() || name.trim() === user.displayName}>{state === 'saving' ? 'Saving…' : 'Save changes'}</Button></div>
    </form>
    <section className={cx('glass-surface flex flex-col items-start gap-3 p-5')}><h2 className={cx('font-semibold')}>Security</h2><p className={cx('text-sm text-muted-foreground')}>Sign out other sessions while keeping this session active.</p><Button type="button" variant="outline" onClick={() => { setSessionMessage(''); setConfirmSessions(true); }}>Sign out other sessions</Button>{sessionMessage && !confirmSessions && <p className={cx('text-sm')} role="status">{sessionMessage}</p>}</section>
    <Dialog open={confirmSessions} onOpenChange={open => { if (sessionState !== 'saving') setConfirmSessions(open); }}><DialogContent><DialogHeader><DialogTitle>Sign out other sessions?</DialogTitle><DialogDescription>All other sessions for your account will be signed out. This session stays active.</DialogDescription></DialogHeader>{sessionMessage && <p className={cx('text-sm text-destructive')} role="alert">{sessionMessage}</p>}<DialogFooter><Button type="button" variant="outline" disabled={sessionState === 'saving'} onClick={() => setConfirmSessions(false)}>Cancel</Button><Button type="button" disabled={sessionState === 'saving'} onClick={() => void revokeOtherSessions()}>{sessionState === 'saving' ? 'Signing out…' : 'Sign out other sessions'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
