import { CheckCircle2, Download, Loader2, Pause, Play, RotateCcw, XCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { cx } from '../../utils/cx';

const LABELS = { choosing: 'Choose destination', checking: 'Checking file', queued: 'Queued', downloading: 'Downloading',
  pausing: 'Pausing', paused: 'Paused', cancelling: 'Cancelling', cancelled: 'Cancelled', finalizing: 'Saving to disk',
  retry_wait: 'Waiting to retry', waiting_network: 'Waiting for network', success: 'Saved to disk', error: 'Needs attention', native: 'Opened in browser', opening_native: 'Opening in browser' };
function bytes(value) {
  if (!Number.isFinite(value) || value < 0) return 'Size unavailable';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const n = value > 0 ? Math.min(4, Math.floor(Math.log(value) / Math.log(1024))) : 0;
  return `${(value / 1024 ** n).toFixed(n ? 1 : 0)} ${units[n]}`;
}
export default function DownloadQueue({ queue }) {
  const { items, concurrency, canResume } = queue;
  return <section aria-label="Download queue" className={cx('overflow-hidden rounded-xl border border-border bg-card')}>
    <div className={cx('flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3')}>
      <div><h2 className={cx('text-sm font-semibold')}>Downloads</h2><p className={cx('text-xs text-muted-foreground')}>Active page only · temporary files commit when complete</p></div>
      <div className={cx('flex flex-wrap items-center gap-2')}>
        <label className={cx('flex items-center gap-2 text-xs text-muted-foreground')}>Download concurrency
          <select aria-label="Download concurrency" value={concurrency} onChange={event => queue.setConcurrency(Number(event.target.value))} className={cx('min-h-11 rounded-lg border border-border bg-background px-2 text-foreground')}>
            {[1, 2, 3, 5].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        {items.some(item => ['success', 'cancelled', 'error', 'native'].includes(item.status) && !item.busy) && <Button variant="ghost" size="sm" className={cx('min-h-11')} onClick={() => void queue.clearFinished()}>Clear finished downloads</Button>}
      </div>
    </div>
    {!items.length && <p role="status" className={cx('p-4 text-sm text-muted-foreground')}>No downloads yet. Download a file from My Files. Unsupported browsers use native download without app progress or resume.</p>}
    <ul className={cx('divide-y divide-border')}>
      {items.map(item => {
        const label = LABELS[item.status] || 'Queued';
        const percent = item.status === 'success' ? 100 : item.sizeBytes > 0 ? Math.min(99, Math.floor(100 * item.writtenBytes / item.sizeBytes)) : 0;
        const active = ['checking', 'downloading', 'pausing', 'finalizing', 'cancelling', 'opening_native'].includes(item.status);
        const Icon = item.status === 'success' ? CheckCircle2 : active ? Loader2 : Download;
        const pausable = ['choosing', 'queued', 'checking', 'downloading', 'retry_wait', 'waiting_network'].includes(item.status);
        return <li key={item.id} className={cx('flex min-w-0 flex-wrap items-start gap-3 px-4 py-3')}>
          <Icon aria-hidden="true" className={cx('mt-0.5 size-5 shrink-0 text-muted-foreground', active && 'motion-safe:animate-spin', item.status === 'success' && 'text-primary')} />
          <div className={cx('min-w-0 flex-1 basis-36')}>
            <div className={cx('flex flex-wrap items-baseline justify-between gap-2')}><span className={cx('min-w-0 break-all text-sm font-medium')}>{item.name}</span><span className={cx('text-xs text-muted-foreground')}>{label} · {bytes(item.sizeBytes)}</span></div>
            {item.native ? <p role="status" className={cx('mt-1 text-xs text-muted-foreground')}>Your browser controls progress and completion. App pause and resume are unavailable.</p> : <>
              <div role="progressbar" aria-label={`Downloading ${item.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
                aria-valuetext={`${bytes(item.writtenBytes)} written to temporary file; ${label}`} className={cx('mt-2 h-1.5 overflow-hidden rounded-full bg-muted')}>
                <div style={{ width: `${percent}%` }} className={cx('h-full rounded-full bg-primary motion-safe:transition-[width]')} />
              </div>
              <p role="status" aria-live="polite" className={cx('mt-1 text-xs text-muted-foreground')}>{percent}% · {bytes(item.writtenBytes)} verified written · {bytes(Number.isSafeInteger(item.sizeBytes) ? Math.max(0, item.sizeBytes - item.writtenBytes) : null)} remaining</p>
              {item.status === 'downloading' && item.bytesPerSecond > 0 && Number.isFinite(item.etaSeconds) && <p className={cx('mt-1 text-xs text-muted-foreground')}>{bytes(item.bytesPerSecond)}/s · ETA about {Math.ceil(item.etaSeconds)}s (disk writes)</p>}
            </>}
            {item.error && <p role="alert" className={cx('mt-1 text-xs text-destructive')}>{item.error}</p>}
          </div>
          <div className={cx('ml-auto flex max-w-full flex-wrap justify-end gap-1')}>
            {pausable && <Button variant="ghost" size="icon-sm" className={cx('min-h-11 min-w-11')} aria-label={`Pause download ${item.name}`} onClick={() => queue.pause(item.id)}><Pause aria-hidden="true" /></Button>}
            {item.status === 'paused' && canResume && !item.busy && <Button variant="outline" size="sm" className={cx('min-h-11')} aria-label={`Resume download ${item.name}`} onClick={() => queue.resume(item.id)}><Play aria-hidden="true" />Resume</Button>}
            {item.retryable && canResume && !item.busy && <Button variant="outline" size="sm" className={cx('min-h-11')} aria-label={`Retry download ${item.name}`} onClick={() => queue.retry(item.id)}><RotateCcw aria-hidden="true" />{item.restartRequired ? 'Restart' : 'Retry'}</Button>}
            {!['success', 'cancelled', 'native', 'cancelling', 'finalizing'].includes(item.status) && <Button variant="ghost" size="icon-sm" className={cx('min-h-11 min-w-11')} aria-label={`Cancel download ${item.name}`} onClick={() => void queue.cancel(item.id)}><XCircle aria-hidden="true" /></Button>}
            {['error', 'paused'].includes(item.status) && !item.busy && queue.canUseNative !== false && <Button variant="ghost" size="sm" className={cx('min-h-11')} aria-label={`Use browser download ${item.name}`} onClick={() => void queue.useNative(item.id)}>Use browser</Button>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
