import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { cx } from '../../utils/cx';

import { fields, preset, presetName, updatePermission } from './storage-assignment-permissions';

async function request(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(path, { method, credentials: 'same-origin', signal,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error('The request could not be completed. Please try again.');
  const payload = await response.json();
  return payload.data;
}

export default function StorageAssignments({ selectedUser }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogTruncated, setCatalogTruncated] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [permissions, setPermissions] = useState(() => preset('Viewer'));
  const [customSelected, setCustomSelected] = useState(false);
  const [storageId, setStorageId] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [revoke, setRevoke] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const userId = selectedUser?.id;
  const path = `/api/admin/users/${encodeURIComponent(userId || '')}/storages`;

  useEffect(() => {
    if (!userId) return undefined;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setRows(null); setError('');
      request(path, { signal: controller.signal }).then(data => {
        if (!controller.signal.aborted) setRows(data.assignments);
      }).catch(() => { if (!controller.signal.aborted) setError('Unable to load assigned storages.'); });
    });
    return () => controller.abort();
  }, [userId, path, revision]);

  useEffect(() => {
    if (!editor || editor.storageId) return undefined;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setCatalog(null); setCatalogError('');
      request('/api/admin/storages', { signal: controller.signal }).then(data => {
        if (!controller.signal.aborted) { setCatalog(data.storages); setCatalogTruncated(data.truncated === true); }
      }).catch(() => { if (!controller.signal.aborted) setCatalogError('Unable to load storages.'); });
    });
    return () => controller.abort();
  }, [editor, catalogRevision]);

  if (!selectedUser) return null;
  const available = catalog?.filter(storage => !rows?.some(row => row.storageId === storage.storageId)) || [];
  function openEditor(row) {
    setDialogError(''); setCatalog(null); setCatalogError('');
    setStorageId(row?.storageId || ''); setPermissions(row ? { ...row.permissions } : preset('Viewer'));
    setCustomSelected(false);
    setIsDefault(row?.isDefault || false); setEditor(row || {});
  }
  async function save(event) {
    event.preventDefault();
    if (!storageId) { setDialogError('Select a storage.'); return; }
    setBusy(true); setDialogError('');
    try {
      const editing = Boolean(editor.storageId);
      await request(editing ? `${path}/${encodeURIComponent(storageId)}` : path, {
        method: editing ? 'PATCH' : 'POST', body: { ...(editing ? {} : { storageId }), permissions, isDefault },
      });
      setEditor(null); setFeedback('Storage access saved.'); setRevision(value => value + 1);
    } catch { setDialogError('Unable to save storage access. Please try again.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setDialogError('');
    try {
      await request(`${path}/${encodeURIComponent(revoke.storageId)}`, { method: 'DELETE' });
      setRevoke(null); setFeedback('Storage access revoked.'); setRevision(value => value + 1);
    } catch { setDialogError('Unable to revoke storage access. Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className={cx('glass-surface flex flex-col gap-4 p-4')} aria-labelledby="assigned-storages-title">
    <div className={cx('flex flex-wrap items-center justify-between gap-3')}><div><h2 id="assigned-storages-title" className={cx('font-semibold')}>Assigned Storages</h2><p className={cx('break-all text-sm text-muted-foreground')}>{selectedUser.displayName} · {selectedUser.email}</p></div><Button onClick={() => openEditor(null)} disabled={!rows}>Assign Storage</Button></div>
    {feedback && <p role="status" className={cx('text-sm')}>{feedback}</p>}
    {!rows && !error && <p role="status">Loading assigned storages…</p>}
    {error && <div role="alert" className={cx('flex flex-wrap items-center gap-2 text-sm text-destructive')}>{error}<Button variant="outline" onClick={() => setRevision(value => value + 1)}>Retry</Button></div>}
    {rows?.length === 0 && <p className={cx('text-sm text-muted-foreground')}>No storage assigned</p>}
    {rows?.map(row => <div key={row.storageId} className={cx('flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3')}><div className={cx('min-w-0')}><p className={cx('break-words font-medium')}>{row.name} {row.isDefault && <span className={cx('rounded-full bg-primary/15 px-2 py-1 text-xs text-primary')}>Default</span>}</p><p className={cx('text-sm text-muted-foreground')}>{presetName(row.permissions)}</p></div><div className={cx('flex flex-wrap gap-2')}><Button variant="outline" onClick={() => openEditor(row)}>Edit</Button><Button variant="destructive" onClick={() => { setDialogError(''); setRevoke(row); }}>Revoke Access</Button></div></div>)}
    <Dialog open={Boolean(editor)} onOpenChange={open => { if (!open && !busy) setEditor(null); }}><DialogContent className={cx('max-h-[90dvh] overflow-y-auto')}><DialogHeader><DialogTitle>{editor?.storageId ? 'Edit storage access' : 'Assign storage'}</DialogTitle><DialogDescription>Choose the permissions for this user. Provider capabilities and policy can further restrict access.</DialogDescription></DialogHeader>
      <form onSubmit={save} className={cx('flex flex-col gap-4')}>
        {!editor?.storageId && <label className={cx('flex flex-col gap-1 text-sm')}>Storage<select className={cx('h-10 rounded-md border border-input bg-background px-3')} value={storageId} onChange={event => setStorageId(event.target.value)} disabled={busy || !catalog}><option value="">Select storage</option>{available.map(storage => <option key={storage.storageId} value={storage.storageId}>{storage.name} ({storage.status})</option>)}</select></label>}
        {editor?.storageId && <p className={cx('break-words text-sm font-medium')}>{editor.name}</p>}
        {!editor?.storageId && !catalog && !catalogError && <p role="status">Loading storages…</p>}
        {catalogError && <div role="alert" className={cx('text-sm text-destructive')}>{catalogError} <Button type="button" variant="outline" onClick={() => setCatalogRevision(value => value + 1)}>Retry</Button></div>}
        {catalogTruncated && <p role="status" className={cx('text-sm')}>Showing the first 500 storages.</p>}
        {catalog && available.length === 0 && <p role="status" className={cx('text-sm')}>{catalogTruncated ? 'No unassigned storages in the first 500 results.' : 'All available storages are already assigned.'}</p>}
        <label className={cx('flex flex-col gap-1 text-sm')}>Permission preset<select className={cx('h-10 rounded-md border border-input bg-background px-3')} value={customSelected ? 'Custom' : presetName(permissions)} disabled={busy} onChange={event => { setCustomSelected(event.target.value === 'Custom'); if (event.target.value !== 'Custom') setPermissions(preset(event.target.value)); }}><option>Viewer</option><option>Contributor</option><option>Editor</option><option>Full Access</option><option>Custom</option></select></label>
        <fieldset className={cx('grid grid-cols-1 gap-2 sm:grid-cols-2')}><legend className={cx('mb-2 text-sm font-medium')}>Permissions</legend>{fields.map(([key, label]) => <label key={key} className={cx('flex min-h-10 items-center gap-2 text-sm')}><input type="checkbox" checked={permissions[key]} disabled={busy || (['preview', 'download', 'favorite'].includes(key) && !permissions.read) || (key === 'permanentDelete' && !permissions.delete) || (key === 'manageShare' && !permissions.share)} onChange={event => { setCustomSelected(false); setPermissions(updatePermission(permissions, key, event.target.checked)); }} />{label}</label>)}</fieldset>
        <label className={cx('flex items-center gap-2 text-sm')}><input type="checkbox" checked={isDefault} disabled={busy} onChange={event => setIsDefault(event.target.checked)} />Set as default storage</label>
        {dialogError && <p role="alert" className={cx('text-sm text-destructive')}>{dialogError}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" disabled={busy || !storageId || (!editor?.storageId && (!catalog || !available.some(item => item.storageId === storageId)))}>{busy ? 'Saving…' : 'Save'}</Button></DialogFooter>
      </form></DialogContent></Dialog>
    <Dialog open={Boolean(revoke)} onOpenChange={open => { if (!open && !busy) setRevoke(null); }}><DialogContent><DialogHeader><DialogTitle>Revoke storage access?</DialogTitle><DialogDescription>This user will lose access to this storage. The storage and its files will not be deleted.</DialogDescription></DialogHeader><p className={cx('break-words text-sm')}>{revoke?.name}</p>{dialogError && <p role="alert" className={cx('text-sm text-destructive')}>{dialogError}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setRevoke(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? 'Revoking…' : 'Revoke Access'}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
