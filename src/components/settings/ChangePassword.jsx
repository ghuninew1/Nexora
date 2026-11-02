import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cx } from '../../utils/cx';
import { validatePasswordConfirmation } from '../../utils/password-validation';

export default function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault();
    const validationError = validatePasswordConfirmation(password, confirm);
    if (validationError) { setStatus('error'); setMessage(validationError); return; }
    setStatus('saving'); setMessage('');
    try {
      const response = await fetch('/api/settings/change-password', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: current, newPassword: password }) });
      if (!response.ok) throw new Error(response.status === 403 ? 'Current password is incorrect.' : 'Could not change password. Try again.');
      setCurrent(''); setPassword(''); setConfirm(''); setStatus('success'); setMessage('Password changed. Other sessions were signed out.');
    } catch (error) { setStatus('error'); setMessage(error.message); }
  }
  return <form className={cx('glass-surface flex flex-col items-start gap-4 p-5')} onSubmit={submit}>
    <h2 className={cx('font-semibold')}>Change password</h2><p className={cx('text-sm text-muted-foreground')}>Use at least 12 UTF-8 bytes. Your current session stays signed in.</p>
    <label className={cx('flex w-full flex-col gap-2 text-sm')}>Current password<Input type="password" autoComplete="current-password" required value={current} disabled={status === 'saving'} onChange={e => setCurrent(e.target.value)} /></label>
    <label className={cx('flex w-full flex-col gap-2 text-sm')}>New password<Input type="password" autoComplete="new-password" required value={password} disabled={status === 'saving'} onChange={e => setPassword(e.target.value)} /></label>
    <label className={cx('flex w-full flex-col gap-2 text-sm')}>Confirm new password<Input type="password" autoComplete="new-password" required value={confirm} disabled={status === 'saving'} aria-invalid={status === 'error' && password !== confirm} aria-describedby={message ? 'password-feedback' : undefined} onChange={e => setConfirm(e.target.value)} /></label>
    {message && <p id="password-feedback" role={status === 'error' ? 'alert' : 'status'} className={cx('text-sm')}>{message}</p>}
    <Button type="submit" disabled={status === 'saving'}>{status === 'saving' ? 'Saving…' : 'Change password'}</Button>
  </form>;
}
