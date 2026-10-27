import { CheckCircle2, File, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { cx } from '../../utils/cx';
import { Button } from '../ui/button';

const STATUS = {
  queued: { label: 'Queued', icon: File },
  uploading: { label: 'Uploading', icon: Loader2 },
  success: { label: 'Uploaded', icon: CheckCircle2 },
  error: { label: 'Failed', icon: XCircle },
  cancelled: { label: 'Cancelled', icon: XCircle },
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Size unavailable';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function UploadQueue({ items, concurrency, onCancel, onRetry, onClearFinished }) {
  if (items.length === 0) return null;
  const activeCount = items.filter((item) => item.status === 'uploading').length;
  const queuedCount = items.filter((item) => item.status === 'queued').length;
  const finishedCount = items.filter((item) => ['success', 'error', 'cancelled'].includes(item.status)).length;

  return <section aria-label="Upload queue" className={cx('overflow-hidden rounded-xl border border-border bg-card')}>
    <div className={cx('flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3')}>
      <div>
        <h2 className={cx('text-sm font-semibold text-foreground')}>Uploads</h2>
        <p className={cx('text-xs text-muted-foreground')} role="status" aria-live="polite">
          {activeCount} uploading · {queuedCount} queued · up to {concurrency} at a time
        </p>
      </div>
      {finishedCount > 0 && <Button type="button" variant="ghost" size="sm" onClick={onClearFinished}>Clear finished</Button>}
    </div>
    <ul className={cx('divide-y divide-border')}>
      {items.map((item) => {
        const config = STATUS[item.status] ?? STATUS.queued;
        const Icon = config.icon;
        const canCancel = ['queued', 'uploading'].includes(item.status);
        return <li key={item.id} className={cx('flex min-w-0 items-start gap-3 px-4 py-3')}>
          <Icon className={cx('mt-0.5 size-5 shrink-0 text-muted-foreground', item.status === 'uploading' && 'motion-safe:animate-spin', item.status === 'success' && 'text-primary', item.status === 'error' && 'text-destructive')} aria-hidden="true" />
          <div className={cx('min-w-0 flex-1')}>
            <div className={cx('flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1')}>
              <span className={cx('min-w-0 max-w-full break-all text-sm font-medium text-foreground')} title={item.name}>{item.name}</span>
              <span className={cx('shrink-0 text-xs text-muted-foreground')}>{config.label} · {formatBytes(item.sizeBytes)}</span>
            </div>
            {item.status === 'uploading' && <div role="progressbar" aria-label={`Uploading ${item.name}`} aria-valuetext="Upload in progress" className={cx('mt-2 h-1.5 overflow-hidden rounded-full bg-muted')}>
              <div className={cx('h-full w-1/3 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none')} />
            </div>}
            {item.error && <p className={cx('mt-1 text-xs text-destructive')} role="alert">{item.error}</p>}
          </div>
          {canCancel && <Button type="button" variant="ghost" size="icon-sm" className={cx('min-h-10 min-w-10 shrink-0')} onClick={() => onCancel(item.id)} aria-label={`Cancel upload ${item.name}`}><XCircle aria-hidden="true" /></Button>}
          {item.status === 'error' && <Button type="button" variant="outline" size="sm" className={cx('min-h-10 shrink-0')} onClick={() => onRetry(item.id)} aria-label={`Retry upload ${item.name}`}><RotateCcw aria-hidden="true" />Retry</Button>}
        </li>;
      })}
    </ul>
  </section>;
}

export default UploadQueue;
