import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { cx } from '../utils/cx';

export default function AccountPage() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user.displayName);
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');
  async function save(event) {
    event.preventDefault();
    setState('saving'); setMessage('');
    try { await updateProfile(name); setState('idle'); setMessage('Account updated.'); }
    catch (error) { setState('error'); setMessage(error.message); }
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
  </div>;
}
