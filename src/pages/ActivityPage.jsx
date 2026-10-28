import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Copy, FilePlus2, FolderPlus, Heart, LoaderCircle, MoveRight, RefreshCw, RotateCcw, Share2, Trash2, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ActivityApiError, formatActivity, listActivity } from '../services/activity';
import { Button } from '../components/ui/button';
import { cx } from '../utils/cx';

const ACTION_ICON = {
  upload: FilePlus2, create_folder: FolderPlus, rename: Activity, move: MoveRight, copy: Copy,
  trash: Trash2, restore: RotateCcw, delete_permanent: X, favorite: Heart, unfavorite: Heart,
  share_create: Share2, share_replace: Share2, share_revoke: Share2,
};

export default function ActivityPage() {
  const { expireSession } = useAuth();
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const controllerRef = useRef(null);
  const requestIdRef = useRef(0);
  const itemsRef = useRef(items);
  const nextCursorRef = useRef(nextCursor);

  const load = useCallback(async ({ append = false } = {}) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setStatus(append ? 'loading-more' : itemsRef.current.length ? 'refreshing' : 'loading');
    setError('');
    try {
      const page = await listActivity({ limit: 50, cursor: append ? nextCursorRef.current : null, signal: controller.signal });
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setItems((current) => append
        ? [...current, ...page.items.filter((item) => !current.some((entry) => entry.id === item.id))]
        : page.items);
      itemsRef.current = append
        ? [...itemsRef.current, ...page.items.filter((item) => !itemsRef.current.some((entry) => entry.id === item.id))]
        : page.items;
      setNextCursor(page.nextCursor);
      nextCursorRef.current = page.nextCursor;
      setStatus(page.items.length || append && itemsRef.current.length ? 'ready' : 'empty');
    } catch (loadError) {
      if (controller.signal.aborted || loadError?.name === 'AbortError' || requestId !== requestIdRef.current) return;
      if (loadError instanceof ActivityApiError && loadError.status === 401) expireSession();
      setError(loadError instanceof Error ? loadError.message : 'Activity could not be loaded. Try again.');
      setStatus('error');
    }
  }, [expireSession]);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [load]);

  return <section className={cx('flex min-w-0 flex-col gap-5')}>
    <div className={cx('flex flex-wrap items-end justify-between gap-3')}>
      <div><h1 className={cx('text-2xl font-semibold')}>Activity</h1><p className={cx('mt-2 text-sm text-muted-foreground')}>Successful file and sharing actions in your Nexora account.</p></div>
      <Button type="button" className={cx('min-h-11')} variant="outline" disabled={['loading', 'loading-more', 'refreshing'].includes(status)} onClick={() => void load()} aria-busy={status === 'refreshing'}><RefreshCw className={cx(status === 'refreshing' && 'motion-safe:animate-spin')} />Refresh</Button>
    </div>
    {['loading', 'refreshing'].includes(status) && items.length === 0 && <div className={cx('glass-surface flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground')} role="status" aria-live="polite"><LoaderCircle className={cx('size-4 motion-safe:animate-spin motion-reduce:animate-none')} />Loading activity…</div>}
    {status === 'error' && <div className={cx('glass-surface flex flex-col items-start gap-3 p-5')} role="alert"><p className={cx('text-sm text-destructive')}>{error}</p><Button type="button" variant="outline" onClick={() => void load()}>Try again<RefreshCw /></Button></div>}
    {status === 'empty' && <div className={cx('glass-surface p-6')}><h2 className={cx('font-medium')}>No activity yet</h2><p className={cx('mt-2 text-sm text-muted-foreground')}>Your successful file and sharing actions will appear here.</p></div>}
    {items.length > 0 && <ol className={cx('flex min-w-0 flex-col gap-3')} aria-label="Recent actions">
      {items.map((item) => {
        const Icon = ACTION_ICON[item.action] ?? Activity;
        return <li key={item.id} className={cx('glass-surface flex min-w-0 items-start gap-3 p-4')}>
          <span className={cx('glass-control flex size-10 shrink-0 items-center justify-center rounded-xl text-primary')}><Icon className={cx('size-5')} aria-hidden="true" /></span>
          <div className={cx('min-w-0 flex-1')}><p className={cx('break-words text-sm font-medium [overflow-wrap:anywhere]')}>{formatActivity(item)}</p><p className={cx('mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground')}>
            {item.storageName && <span>{item.storageName}</span>}
            <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>{new Date(item.createdAt).toLocaleString()}</time>
          </p></div>
        </li>;
      })}
    </ol>}
    {nextCursor && <Button type="button" className={cx('min-h-11 self-center')} variant="outline" disabled={status === 'loading-more'} onClick={() => void load({ append: true })} aria-busy={status === 'loading-more'}>{status === 'loading-more' ? 'Loading…' : 'Load more'}</Button>}
  </section>;
}
