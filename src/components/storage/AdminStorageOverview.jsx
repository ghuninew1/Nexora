import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { cx } from '../../utils/cx';

export default function AdminStorageOverview() {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', storages: [], truncated: false });
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
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
    {state.status === 'loading' && <p role="status" className={cx('mt-4 text-sm')}>Loading catalog…</p>}
    {state.status === 'error' && <div role="alert" className={cx('mt-4 text-sm text-destructive')}>Unable to load the admin catalog. <Button variant="outline" onClick={() => setRevision(value => value + 1)}>Retry</Button></div>}
    {state.status === 'ready' && <><p className={cx('mt-4 text-sm')}>{state.truncated ? 'First 500 results: ' : ''}Total {state.storages.length} · Active {active} · Inactive {state.storages.filter(item => item.status === 'inactive').length}</p>{state.truncated && <p role="status" className={cx('mt-1 text-sm text-muted-foreground')}>The catalog is limited to 500 results; totals may be higher. Pagination is not available.</p>}<p className={cx('mt-1 text-sm text-muted-foreground')}>Provider type and assignment counts are not reported by this API.</p>
      {state.storages.length === 0 ? <p className={cx('mt-4 text-sm text-muted-foreground')}>No storages in the catalog.</p> : <div className={cx('mt-4 grid gap-3')}>{state.storages.map(item => <article key={item.storageId} className={cx('flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4')}><div className={cx('min-w-0')}><p className={cx('break-words font-medium')}>{item.name}</p><p className={cx('break-all text-sm text-muted-foreground')}>{item.storageId} · {item.status} · Provider: N/A · Assignments: N/A</p></div><Button variant="outline" onClick={() => setSelected(item)}>Details</Button></article>)}</div>}</>}
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>{selected?.name || 'Storage details'}</DialogTitle><DialogDescription>Administrator catalog information.</DialogDescription></DialogHeader>{selected && <div className={cx('grid gap-2 text-sm')}><p className={cx('break-all')}>Storage ID: {selected.storageId}</p><p>Status: {selected.status}</p><p>Access policy: {selected.readOnly ? 'Read only' : 'Not marked read only'}</p><p>Provider type: N/A</p><p>Assignment count: N/A</p></div>}</DialogContent></Dialog>
  </section>;
}
