import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { cx } from '../utils/cx';

const emptyForm = { email: '', displayName: '', password: '', active: true };

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  const [emailConflict, setEmailConflict] = useState(false);
  const load = useCallback(async (signal) => {
    const response = await fetch('/api/admin/users', { credentials: 'same-origin', signal });
    if (!response.ok) throw new Error('Unable to load users.');
    const { data } = await response.json();
    setRows(data.users); setTruncated(data.truncated);
  }, []);
  useEffect(() => {
    if (user?.role !== 'admin') return undefined;
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) load(controller.signal).catch(() => { if (!controller.signal.aborted) setFeedback('Unable to load users.'); }); });
    return () => controller.abort();
  }, [user?.role, load]);
  if (user?.role !== 'admin') return <p role="alert">You do not have access to user management.</p>;
  function edit(row) {
    setError(''); setEmailConflict(false); setEditor(row || { id: null });
    setForm(row ? { displayName: row.displayName, email: row.email, active: row.active, password: '' } : emptyForm);
  }
  async function perform(method, path, body) {
    setBusy(true); setError(''); setEmailConflict(false); setFeedback('');
    try {
      const response = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
      const payload = await response.json();
      if (!response.ok) {
        if (payload?.error?.code === 'NAME_CONFLICT') { setEmailConflict(true); throw new Error('An account with this email already exists.'); }
        throw new Error(payload?.error?.message || 'The request could not be completed.');
      }
      setEditor(null); setForm(emptyForm); setDeleting(null); setFeedback(method === 'DELETE' ? 'User deleted.' : 'User saved.');
      try { await load(); } catch { setFeedback('Saved, but the user list could not be refreshed.'); }
    } catch (e) { setError(e.message || 'The request could not be completed.'); }
    finally { setBusy(false); }
  }
  function submit(event) {
    event.preventDefault();
    const body = editor.id ? { email: form.email, displayName: form.displayName, active: form.active } : { email: form.email, displayName: form.displayName, password: form.password };
    void perform(editor.id ? 'PATCH' : 'POST', editor.id ? `/api/admin/users/${encodeURIComponent(editor.id)}` : '/api/admin/users', body);
  }
  return <div className={cx('flex flex-col gap-5')}>
    <div className={cx('flex flex-wrap items-center justify-between gap-3')}><div><h1 className={cx('text-2xl font-semibold')}>User management</h1><p className={cx('mt-1 text-sm text-muted-foreground')}>Create and manage user accounts. Storage access is provisioned separately.</p></div><Button onClick={() => edit(null)}>Create user</Button></div>
    {feedback && <p role="status" className={cx('text-sm')}>{feedback}</p>}
    {!rows && !feedback && <p role="status">Loading users…</p>}
    {truncated && <p role="status">Showing the first 500 users.</p>}
    {rows && <div className={cx('glass-surface divide-y divide-border overflow-hidden')}>{rows.map(row => <div key={row.id} className={cx('flex flex-wrap items-center justify-between gap-3 p-4')}><div className={cx('min-w-0')}><p className={cx('break-words font-medium')}>{row.displayName}</p><p className={cx('break-all text-sm text-muted-foreground')}>{row.email} · {row.role} · {row.active ? 'Active' : 'Inactive'}</p></div>{row.role === 'user' && <div className={cx('flex gap-2')}><Button variant="outline" onClick={() => edit(row)}>Edit</Button><Button variant="destructive" onClick={() => { setError(''); setDeleting(row); }}>Delete</Button></div>}</div>)}</div>}
    <Dialog open={Boolean(editor)} onOpenChange={open => { if (!open && !busy) setEditor(null); }}><DialogContent><DialogHeader><DialogTitle>{editor?.id ? 'Edit user' : 'Create user'}</DialogTitle><DialogDescription>New accounts have the user role. Administrator accounts are managed through provisioning.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className={cx('flex flex-col gap-4')}>
        <label className={cx('flex flex-col gap-1 text-sm')}>Display name<Input required maxLength={120} value={form.displayName} disabled={busy} onChange={e => setForm({ ...form, displayName: e.target.value })} /></label>
        <label className={cx('flex flex-col gap-1 text-sm')}>Email<Input type="email" required maxLength={254} value={form.email} disabled={busy} aria-invalid={emailConflict} aria-describedby={emailConflict ? 'user-email-error' : undefined} onChange={e => { setEmailConflict(false); setForm({ ...form, email: e.target.value }); }} /></label>
        {!editor?.id && <label className={cx('flex flex-col gap-1 text-sm')}>Initial password<Input type="password" autoComplete="new-password" required value={form.password} disabled={busy} onChange={e => setForm({ ...form, password: e.target.value })} /><span className={cx('text-xs text-muted-foreground')}>At least 12 UTF-8 bytes.</span></label>}
        {editor?.id && <label className={cx('flex items-center gap-2 text-sm')}><input type="checkbox" checked={form.active} disabled={busy} onChange={e => setForm({ ...form, active: e.target.checked })} />Account active (changing this signs out existing sessions)</label>}
        {error && <p id={emailConflict ? 'user-email-error' : undefined} role="alert" className={cx('text-sm text-destructive')}>{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></DialogFooter>
      </form></DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Delete user?</DialogTitle><DialogDescription>This removes the account and its session and account metadata. Accounts with storage mounts cannot be deleted. This cannot be undone.</DialogDescription></DialogHeader><p className={cx('break-all text-sm')}>{deleting?.email}</p>{error && <p role="alert" className={cx('text-sm text-destructive')}>{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={() => void perform('DELETE', `/api/admin/users/${encodeURIComponent(deleting.id)}`)}>{busy ? 'Deleting…' : 'Delete user'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
