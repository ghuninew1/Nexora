import { useEffect, useState } from 'react';
import { useShares } from '../../hooks/useShares';
import { listShares } from '../../services/shares';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { cx } from '../../utils/cx';

export default function ShareDialog({ file, storageId, initialShare, initialConfirm = null, onClose }) {
  const shares = useShares();
  const { expireSession } = useAuth();
  const [state, setState] = useState({ status: initialShare ? 'ready' : 'loading', share: initialShare ?? null, message: '' });
  const [confirm, setConfirm] = useState(initialConfirm);
  useEffect(() => {
    if (initialShare) return;
    const c = new AbortController();
    async function load() {
      try {
        const p = await listShares({ signal: c.signal, storageId, objectId: file.objectId });
        if (!c.signal.aborted) setState({ status: 'ready', share: p.shares[0] ?? null, message: '' });
      } catch (e) { if (!c.signal.aborted) { if (e.status === 401) expireSession(); setState({ status: 'error', share: null, message: e.message }); } }
    }
    void load(); return () => c.abort();
  }, [initialShare, storageId, file.objectId, expireSession]);
  const link = state.share && shares.links[state.share.id];
  const busy = state.status === 'busy' || state.status === 'loading';
  async function action(kind) {
    setState(s => ({ ...s, status: 'busy', message: '' }));
    try {
      const p = kind === 'create' ? await shares.create(storageId, file.objectId) : kind === 'replace' ? await shares.replace(state.share.id) : await shares.revoke(state.share.id);
      setState({ status: 'ready', share: p?.share ?? null, message: kind === 'revoke' ? 'Public link revoked.' : 'Public link ready.' }); setConfirm(null);
    } catch (e) { setState(s => ({ ...s, status: 'ready', message: e.message })); }
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent>
    <DialogTitle>Share publicly</DialogTitle><DialogDescription><span className={cx('block truncate')}>{file.name}</span>Anyone with this link can view and download.</DialogDescription>
    {state.status === 'loading' && <p role="status">Loading sharing state…</p>}
    {state.message && <p role="status" aria-live="polite">{state.message}</p>}
    {state.status === 'error' ? <Button className={cx("min-h-11")} variant="outline" onClick={onClose}>Close and try again</Button> : !busy && !state.share ? <Button className={cx("min-h-11")} onClick={() => void action('create')}>Create public link</Button> : state.share && <div className={cx('flex min-w-0 flex-col gap-3')}>
      {link ? <><p className={cx('break-all rounded-lg border border-border p-3 text-xs')}>{new URL(link, window.location.origin).href}</p><div className={cx('flex flex-wrap gap-2')}><Button className={cx("min-h-11")} disabled={busy} onClick={async () => { try { await navigator.clipboard.writeText(new URL(link, window.location.origin).href); setState(s => ({ ...s, message: 'Link copied.' })); } catch { setState(s => ({ ...s, message: 'Could not copy. Select and copy the link above.' })); } }}>Copy Link</Button><Button className={cx("min-h-11")} variant="outline" nativeButton={false} render={<a href={link} target="_blank" rel="noopener noreferrer" />}>Open</Button></div></> : <p className={cx('text-sm text-muted-foreground')}>This item already has an active link. Its secret cannot be recovered after refresh. Replace the link to copy a new one; the old link will stop working.</p>}
      <div className={cx('flex flex-wrap gap-2')}><Button className={cx("min-h-11")} variant="outline" disabled={busy} onClick={() => setConfirm('replace')}>Replace link</Button><Button className={cx("min-h-11")} variant="destructive" disabled={busy} onClick={() => setConfirm('revoke')}>Revoke</Button></div>
      {confirm && <div className={cx('flex flex-col gap-3 rounded-lg border border-border p-3')}><p>{confirm === 'replace' ? 'Replace this public link? The old link will stop working.' : 'Revoke this public link? Anyone using it will lose access.'}</p><div className={cx('flex gap-2')}><Button className={cx("min-h-11")} disabled={busy} onClick={() => void action(confirm)}>Confirm {confirm}</Button><Button className={cx("min-h-11")} variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button></div></div>}
    </div>}
    {state.status === 'busy' && <p role="status" aria-live="polite">Updating public link…</p>}
  </DialogContent></Dialog>;
}
