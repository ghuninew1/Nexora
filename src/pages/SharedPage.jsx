import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { shareFilesDestination } from '../services/shares';
import { recordStorageRecent } from '../services/storage';
import { useAuth } from '../hooks/useAuth';
import { useShares } from '../hooks/useShares';
import { useStorage } from '../hooks/useStorage';
import ShareDialog from '../components/files/ShareDialog';
import { Button } from '../components/ui/button';
import { cx } from '../utils/cx';

export default function SharedPage() {
  const shares = useShares();
  const storage = useStorage();
  const navigate = useNavigate();
  const { expireSession } = useAuth();
  function openInFiles(share) {
    const destination = shareFilesDestination(share);
    if (!destination) return;
    if (destination.folderId) void recordStorageRecent(share.storageId, destination.folderId).catch(error => { if (error.status === 401) expireSession(); });
    navigate(destination.to, { state: destination.state });
  }
  const [selected, setSelected] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [notice, setNotice] = useState('');
  const { refresh } = shares;
  useEffect(() => { void refresh(); }, [refresh]);
  return <section className={cx('flex min-w-0 flex-col gap-5')}>
    <div className={cx('flex flex-wrap items-start justify-between gap-3')}><div><h1 className={cx('text-2xl font-semibold')}>Shared</h1><p className={cx('mt-2 text-sm text-muted-foreground')}>Your public links · Anyone with a link can view and download.</p></div><Button className={cx("min-h-11")} variant="outline" disabled={shares.status === 'loading'} onClick={() => void refresh()}>Refresh</Button></div>
    {notice && <p role="status" aria-live="polite">{notice}</p>}
    {storage.status === 'empty' && <p role="status">No active storage mount is connected.</p>}
    {shares.status === 'loading' && <p role="status" aria-live="polite">Loading public links…</p>}
    {shares.status === 'error' && <p role="alert">{shares.error}</p>}
    {shares.status === 'ready' && shares.shares.length === 0 && <div className={cx('glass-surface p-6')}><h2 className={cx('font-medium')}>No public links yet</h2><p className={cx('mt-2 text-sm text-muted-foreground')}>Create a public link from a file or folder’s Share action.</p></div>}
    {shares.shares.map(share => <article key={share.id} className={cx('glass-surface flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between')}>
      <div className={cx('min-w-0')}><h2 className={cx('break-words font-medium [overflow-wrap:anywhere]')}>{share.object?.name ?? 'Unavailable item'}</h2><p className={cx('mt-1 break-words text-xs text-muted-foreground')}>{share.object?.type ?? 'Item'} · {share.storageName} · {new Date(share.createdAt).toLocaleDateString()} · {share.status === 'active' ? 'View + Download' : share.status === 'expired' ? 'Expired' : 'Unavailable'} · {share.expiresAt ? `Expires ${new Date(share.expiresAt).toLocaleString()}` : 'Never expires'}</p></div>
      <div className={cx('flex shrink-0 flex-wrap gap-2')}>{share.status === 'active' && shares.links[share.id] && <><Button className={cx('min-h-11')} variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(new URL(shares.links[share.id], window.location.origin).href); setNotice('Link copied.'); } catch { setNotice('Could not copy. Open Manage link to select the URL.'); } }}>Copy Link</Button><Button className={cx('min-h-11')} variant="outline" nativeButton={false} render={<a href={shares.links[share.id]} target="_blank" rel="noopener noreferrer" />}>Open</Button></>}
      <Button className={cx('min-h-11')} variant="outline" onClick={() => { setConfirmAction('revoke'); setSelected(share); }}>Revoke</Button><Button className={cx("min-h-11")} variant="outline" onClick={() => { setConfirmAction(null); setSelected(share); }}>Manage link</Button><Button className={cx("min-h-11")} variant="ghost" disabled={!share.object || share.storageId !== storage.activeStorage?.storageId} onClick={() => openInFiles(share)}>Open in Files</Button></div>
    </article>)}
    {shares.nextCursor && <Button className={cx("min-h-11")} variant="outline" disabled={shares.status === 'loading'} onClick={() => void refresh(shares.nextCursor)}>Load more</Button>}
    {selected && <ShareDialog key={selected.id} file={selected.object ?? { objectId: selected.objectId, name: 'Unavailable item' }} storageId={selected.storageId} initialShare={selected} initialConfirm={confirmAction} onClose={() => setSelected(null)} />}
  </section>;
}
