import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { cx } from '../../utils/cx';
import { useStorage } from '../../hooks/useStorage';

export default function AdminStorageOverview() {
  const navigate = useNavigate();
  const { refresh } = useStorage();
  const saveController = useRef(null);
  const saving = useRef(false);
  const [state, setState] = useState({ status: 'loading', storages: [], truncated: false });
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => () => saveController.current?.abort(), []);
  function openDetails(item) { setSelected(item); setEditing(false); setError(''); }
  function startEditing() { setName(selected.name); setDescription(selected.description || ''); setError(''); setEditing(true); }
  async function save(event) {
    event.preventDefault();
    if (saving.current) return;
    if (!name.trim() || name.trim().length > 100 || description.trim().length > 500) { setError('Enter a name of up to 100 characters and a description of up to 500 characters.'); return; }
    saving.current = true; setBusy(true); setError(''); setFeedback('');
    const controller = new AbortController(); saveController.current = controller;
    try {
      const response = await fetch(`/api/admin/storages/${encodeURIComponent(selected.storageId)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), description: description.trim() }), signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data?.data?.storage) throw new Error(response.status === 409 ? 'A storage with this name already exists for this owner.' : 'Unable to save storage details. Please try again.');
      if (controller.signal.aborted) return;
      setSelected(current => current ? { ...current, ...data.data.storage } : current);
      setState(current => ({ ...current, storages: current.storages.map(item => item.storageId === selected.storageId ? { ...item, ...data.data.storage } : item) }));
      setEditing(false); setFeedback('Storage details saved.'); setRevision(value => value + 1);
      void refresh();
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message || 'Unable to save storage details. Please try again.'); }
    finally { if (!controller.signal.aborted) { saving.current = false; setBusy(false); } }
  }
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(async () => {
      if (controller.signal.aborted) return;
      setState({ status: 'loading', storages: [], truncated: false });
      try {
        const response = await fetch('/api/admin/storages', { credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (!Array.isArray(body?.data?.storages)) throw new Error();
        if (!controller.signal.aborted) setState({ status: 'ready', storages: body.data.storages, truncated: body.data.truncated === true });
      } catch { if (!controller.signal.aborted) setState({ status: 'error', storages: [], truncated: false }); }
    });
    return () => controller.abort();
  }, [revision]);
  const active = state.storages.filter(item => item.status === 'active').length;
  return <section className={cx('glass-surface p-5 sm:p-6')} aria-labelledby="admin-storage-title">
    <div className={cx('flex flex-wrap items-start justify-between gap-3')}><div><h2 id="admin-storage-title" className={cx('font-semibold')}>Admin storage catalog</h2><p className={cx('mt-1 text-sm text-muted-foreground')}>All storages in the administrator catalog. Status is configuration, not connection health.</p></div><Button variant="outline" onClick={() => navigate('/admin/users')}>Manage user assignments</Button></div>
    {feedback && !selected && <p role="status" className={cx('mt-3 text-sm')}>{feedback}</p>}
    {state.status === 'loading' && <p role="status" className={cx('mt-4 text-sm')}>Loading catalog…</p>}
    {state.status === 'error' && <div role="alert" className={cx('mt-4 text-sm text-destructive')}>Unable to load the admin catalog. <Button variant="outline" onClick={() => setRevision(value => value + 1)}>Retry</Button></div>}
    {state.status === 'ready' && <><p className={cx('mt-4 text-sm')}>{state.truncated ? 'First 500 results: ' : ''}Total {state.storages.length} · Active {active} · Inactive {state.storages.filter(item => item.status === 'inactive').length}</p>{state.truncated && <p role="status" className={cx('mt-1 text-sm text-muted-foreground')}>The catalog is limited to 500 results; totals may be higher. Pagination is not available.</p>}<p className={cx('mt-1 text-sm text-muted-foreground')}>Provider type and assignment counts are not reported by this API.</p>
      {state.storages.length === 0 ? <p className={cx('mt-4 text-sm text-muted-foreground')}>No storages in the catalog.</p> : <div className={cx('mt-4 grid gap-3')}>{state.storages.map(item => <article key={item.storageId} className={cx('flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4')}><div className={cx('min-w-0')}><p className={cx('break-words font-medium')}>{item.name}</p><p className={cx('break-all text-sm text-muted-foreground')}>{item.storageId} · {item.status} · Provider: N/A · Assignments: N/A</p></div><Button variant="outline" onClick={() => openDetails(item)}>Details</Button></article>)}</div>}</>}
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open && !busy) { setSelected(null); setEditing(false); } }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>{editing ? 'Edit storage details' : selected?.name || 'Storage details'}</DialogTitle><DialogDescription>Administrator catalog information.</DialogDescription></DialogHeader>{feedback && <p role="status" className={cx('text-sm')}>{feedback}</p>}{selected && (editing ? <form onSubmit={save} className={cx('grid gap-4')} noValidate>
      <label className={cx('grid gap-1 text-sm')}>Display name<input className={cx('glass-control min-h-11 rounded-lg px-3')} value={name} maxLength={100} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? 'metadata-error' : undefined} onChange={event => setName(event.target.value)} /></label>
      <label className={cx('grid gap-1 text-sm')}>Description<textarea className={cx('glass-control min-h-24 rounded-lg p-3')} value={description} maxLength={500} disabled={busy} onChange={event => setDescription(event.target.value)} /></label>
      {error && <p id="metadata-error" role="alert" className={cx('text-sm text-destructive')}>{error}</p>}
      <div className={cx('flex justify-end gap-2')}><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></div>
    </form> : <div className={cx('grid gap-2 text-sm')}><p className={cx('break-all')}>Storage ID: {selected.storageId}</p><p>Description: {selected.description || 'Not provided'}</p><p>Status: {selected.status}</p><p>Access policy: {selected.readOnly ? 'Read only' : 'Not marked read only'}</p><p>Provider type: N/A</p><p>Assignment count: N/A</p><Button onClick={startEditing}>Edit metadata</Button></div>)}</DialogContent></Dialog>
  </section>;
}
