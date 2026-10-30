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
  const [expiresIn, setExpiresIn] = useState('never');
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
  const link = state.share && (state.share.publicPath ?? shares.links[state.share.id]);
  const busy = state.status === 'busy' || state.status === 'loading';
  async function action(kind) {
    setState(s => ({ ...s, status: 'busy', message: '' }));
    try {
      const p = kind === 'create' ? await shares.create(storageId, file.objectId, expiresIn) : kind === 'replace' ? await shares.replace(state.share.id, expiresIn) : await shares.revoke(state.share.id);
      setState({ status: 'ready', share: p?.share ?? null, message: kind === 'revoke' ? 'Public link revoked.' : kind === 'create' && !p?.publicPath ? 'This item already has a link. Replace it to apply a new expiration.' : 'Public link ready.' }); setConfirm(null);
    } catch (e) { setState(s => ({ ...s, status: 'ready', message: e.message })); }
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent>
    <DialogTitle>Share publicly</DialogTitle><DialogDescription><span className={cx('block truncate')}>{file.name}</span>Anyone with this link can view and download.</DialogDescription>
    {state.status === 'loading' && <p role="status">Loading sharing state…</p>}
    {state.message && <p role="status" aria-live="polite">{state.message}</p>}
    {!busy && state.status !== 'error' && <label className={cx('flex flex-col gap-1.5 text-sm font-medium')}>Link expiration
      <select className={cx('glass-control min-h-11 rounded-lg px-3 text-sm font-normal')} value={expiresIn} onChange={event => setExpiresIn(event.target.value)}>
        <option value="1h">1 hour</option><option value="1d">1 day</option><option value="1month">1 month (30 days)</option><option value="never">Never expires</option>
      </select>
      <span className={cx('text-xs font-normal text-muted-foreground')}>{state.share ? 'Applied when you replace the current link.' : 'The link stops working after this period.'}</span>
    </label>}
    {state.status === 'error' ? <Button className={cx("min-h-11")} variant="outline" onClick={onClose}>Close and try again</Button> : !busy && !state.share ? <Button className={cx("min-h-11")} onClick={() => void action('create')}>Create public link</Button> : state.share && <div className={cx('flex min-w-0 flex-col gap-3')}>
      <p className={cx('text-xs text-muted-foreground')}>{state.share.expiresAt ? `Expires ${new Date(state.share.expiresAt).toLocaleString()}` : 'Never expires'}{state.share.status === 'expired' ? ' · Expired' : ''}</p>
      {link && state.share.status === 'active' ? <><p className={cx('break-all rounded-lg border border-border p-3 text-xs')}>{new URL(link, window.location.origin).href}</p><div className={cx('flex flex-wrap gap-2')}><Button className={cx("min-h-11")} disabled={busy} onClick={async () => { try { await navigator.clipboard.writeText(new URL(link, window.location.origin).href); setState(s => ({ ...s, message: 'Link copied.' })); } catch { setState(s => ({ ...s, message: 'Could not copy. Select and copy the link above.' })); } }}>Copy Link</Button><Button className={cx("min-h-11")} variant="outline" nativeButton={false} render={<a href={link} target="_blank" rel="noopener noreferrer" />}>Open</Button></div></> : <p className={cx('text-sm text-muted-foreground')}>{state.share.status === 'expired' ? 'This link has expired.' : 'This link cannot be recovered. Replace it to enable copying on all devices.'} Replace the link to issue a new secret; the previous link will stop working.</p>}
      <div className={cx('flex flex-wrap gap-2')}><Button className={cx("min-h-11")} variant="outline" disabled={busy} onClick={() => setConfirm('replace')}>Replace link</Button><Button className={cx("min-h-11")} variant="destructive" disabled={busy} onClick={() => setConfirm('revoke')}>Revoke</Button></div>
      {confirm && <div className={cx('flex flex-col gap-3 rounded-lg border border-border p-3')}><p>{confirm === 'replace' ? 'Replace this public link? The old link will stop working.' : 'Revoke this public link? Anyone using it will lose access.'}</p><div className={cx('flex gap-2')}><Button className={cx("min-h-11")} disabled={busy} onClick={() => void action(confirm)}>Confirm {confirm}</Button><Button className={cx("min-h-11")} variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button></div></div>}
    </div>}
    {state.status === 'busy' && <p role="status" aria-live="polite">Updating public link…</p>}
  </DialogContent></Dialog>;
}
