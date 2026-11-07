import { useRef } from 'react';
import { CheckCircle2, File, Loader2, Pause, Play, RotateCcw, XCircle } from 'lucide-react';
import { cx } from '../../utils/cx';
import { Button } from '../ui/button';

const STATUS = {
  waiting_network: { label: 'Waiting for network', icon: Pause },
  recovering_connection: { label: 'Recovering connection', icon: Loader2 },
  other_tab: { label: 'Active in another tab', icon: Pause },
  waiting_ownership: { label: 'Waiting for ownership', icon: Pause },
  restoring: { label: 'Restoring', icon: Loader2 },
  checking_server: { label: 'Checking server', icon: Loader2 },
  waiting_file: { label: 'Waiting for original file', icon: File },
  file_mismatch: { label: 'File mismatch', icon: XCircle },
  recovery_error: { label: 'Recovery needs attention', icon: XCircle },
  queued: { label: 'Queued', icon: File },
  uploading: { label: 'Uploading', icon: Loader2 },
  verifying: { label: 'Verifying parts', icon: Loader2 },
  finalizing: { label: 'Finalizing', icon: Loader2 },
  pausing: { label: 'Pausing', icon: Loader2 },
  paused: { label: 'Paused · Resume available', icon: Pause },
  resuming: { label: 'Resuming', icon: Loader2 },
  cancelling: { label: 'Confirming cancellation', icon: Loader2 },
  retry_wait: { label: 'Waiting to retry', icon: Loader2 },
  reconciling: { label: 'Reconciling session', icon: Loader2 },
  expired: { label: 'Session expired', icon: XCircle },
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

function OriginalFileButton({ id, name, onSelect }) {
  const input = useRef(null);
  return <>
    <Button type="button" variant="outline" size="sm" className={cx('min-h-11')} onClick={() => input.current?.click()} aria-label={`Select original file for ${name}`}>Select original file</Button>
    <input ref={input} type="file" aria-label={`Original file for ${name}`} className={cx('hidden')} onChange={event => {
      const file = event.target.files?.[0];
      if (file) onSelect(id, file);
      event.target.value = '';
    }} />
  </>;
}

function UploadQueue({ items, concurrency, onCancel, onRetry, onPause, onResume, onClearFinished, onSelectOriginal, onRetryReconciliation, onClearLocalHistory, restoring = false, persistenceWarning, canRetry = true }) {
  if (items.length === 0 && !restoring && !persistenceWarning) return null;
  const activeCount = items.filter((item) => ['uploading', 'verifying', 'finalizing', 'pausing', 'resuming', 'cancelling', 'retry_wait', 'reconciling', 'recovering_connection'].includes(item.status)).length;
  const pausable = items.filter(item => item.strategy === 'multipart' && ['queued', 'uploading', 'verifying', 'retry_wait', 'reconciling', 'waiting_network', 'recovering_connection', 'other_tab'].includes(item.status));
  const resumable = items.filter(item => item.strategy === 'multipart' && item.status === 'paused' && !item.needsFile);
  const queuedCount = items.filter((item) => item.status === 'queued').length;
  const finishedCount = items.filter((item) => ['success', 'error', 'expired', 'cancelled'].includes(item.status)).length;

  return <section aria-label="Upload queue" className={cx('overflow-hidden rounded-xl border border-border bg-card')}>
    <div className={cx('flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3')}>
      <div>
        <h2 className={cx('text-sm font-semibold text-foreground')}>Uploads</h2>
        <p className={cx('text-xs text-muted-foreground')} role="status" aria-live="polite">
          {activeCount} uploading · {queuedCount} queued · up to {concurrency} at a time
        </p>
      </div>
      <div className={cx('flex flex-wrap gap-2')}>
        {pausable.length > 0 && <Button type="button" variant="outline" size="sm" className={cx('min-h-11')} onClick={() => pausable.forEach(item => onPause(item.id))}>Pause all</Button>}
        {canRetry && resumable.length > 0 && <Button type="button" variant="outline" size="sm" className={cx('min-h-11')} onClick={() => resumable.forEach(item => onResume(item.id))}>Resume all</Button>}
        {items.some(item => item.strategy === 'multipart') && <Button type="button" variant="ghost" size="sm" onClick={onClearLocalHistory} title="Forget inactive entries on this device only; server sessions are not cancelled.">Clear local history</Button>}
        {finishedCount > 0 && <Button type="button" variant="ghost" size="sm" onClick={onClearFinished}>Clear finished</Button>}
      </div>
    </div>
    {restoring && <p role="status" className={cx('px-4 py-3 text-sm text-muted-foreground')}>Restoring uploads…</p>}
    {persistenceWarning && <p role="alert" className={cx('px-4 py-3 text-sm text-destructive')}>{persistenceWarning}</p>}
    <ul className={cx('divide-y divide-border')}>
      {items.map((item) => {
        const config = STATUS[item.status] ?? STATUS.queued;
        const Icon = config.icon;
        const multipart = item.strategy === 'multipart';
        const canCancel = multipart
          ? !['success', 'expired', 'cancelled', 'cancelling', 'restoring', 'checking_server'].includes(item.status)
          : ['queued', 'uploading'].includes(item.status);
        const canPause = multipart && ['queued', 'uploading', 'verifying', 'retry_wait', 'reconciling', 'waiting_network', 'recovering_connection', 'other_tab'].includes(item.status);
        const percent = item.status === 'success' ? 100 : Math.max(0, Math.min(99, Math.floor(100 * (item.acknowledgedBytes || 0) / (item.sizeBytes || 1))));
        return <li key={item.id} className={cx('flex min-w-0 flex-wrap items-start gap-3 px-4 py-3')}>
          <Icon className={cx('mt-0.5 size-5 shrink-0 text-muted-foreground', ['uploading', 'verifying', 'finalizing', 'pausing', 'resuming', 'reconciling', 'cancelling'].includes(item.status) && 'motion-safe:animate-spin', item.status === 'success' && 'text-primary', item.status === 'error' && 'text-destructive')} aria-hidden="true" />
          <div className={cx('min-w-0 flex-1 basis-36')}>
            <div className={cx('flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1')}>
              <span className={cx('min-w-0 max-w-full break-all text-sm font-medium text-foreground')} title={item.name}>{item.name}</span>
              <span className={cx('shrink-0 text-xs text-muted-foreground')}>{config.label} · {formatBytes(item.sizeBytes)}</span>
            </div>
            {multipart && <div className={cx('mt-2')}>
              <div role="progressbar" aria-label={`Uploading ${item.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
                aria-valuetext={`${formatBytes(item.acknowledgedBytes || 0)} acknowledged by server; ${config.label}`}
                className={cx('h-1.5 overflow-hidden rounded-full bg-muted')}>
                <div style={{ width: `${percent}%` }} className={cx('h-full rounded-full bg-primary motion-safe:transition-[width]')} />
              </div>
              <p role="status" aria-live="polite" className={cx('mt-1 text-xs text-muted-foreground')}>
                {percent}% · {item.completedParts || 0}/{item.partCount ?? '—'} parts · {formatBytes(item.acknowledgedBytes || 0)} verified
                {item.acknowledgedBytes === item.sizeBytes && item.status !== 'success' && ' · awaiting finalization'}
              </p>
            </div>}
            {multipart && item.status === 'uploading' && item.bytesPerSecond > 0 && Number.isFinite(item.etaSeconds) && <p className={cx('mt-1 text-xs text-muted-foreground')}>{formatBytes(item.bytesPerSecond)}/s · ETA about {Math.ceil(item.etaSeconds)}s (server acknowledgements)</p>}
            {!multipart && item.status === 'uploading' && <div role="progressbar" aria-label={`Uploading ${item.name}`} aria-valuetext="Upload in progress" className={cx('mt-2 h-1.5 overflow-hidden rounded-full bg-muted')}>
              <div className={cx('h-full w-1/3 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none')} />
            </div>}
            {item.error && <p className={cx('mt-1 text-xs text-destructive')} role="alert">{item.error}</p>}
          </div>
          <div className={cx('ml-auto flex max-w-full shrink-0 flex-wrap justify-end gap-1')}>
            {item.needsFile && !item.pendingAction && ['waiting_file','file_mismatch','recovery_error'].includes(item.status) && <OriginalFileButton id={item.id} name={item.name} onSelect={onSelectOriginal} />}
            {item.status === 'recovery_error' && <Button type="button" variant="outline" size="sm" className={cx('min-h-11')} onClick={() => onRetryReconciliation(item.id)} aria-label={`Retry reconciliation ${item.name}`}><RotateCcw aria-hidden="true" />Retry reconciliation</Button>}
            {canPause && <Button type="button" variant="ghost" size="icon-sm" className={cx('min-h-11 min-w-11')} onClick={() => onPause(item.id)} aria-label={`Pause upload ${item.name}`}><Pause aria-hidden="true" /></Button>}
            {multipart && item.status === 'paused' && canRetry && <Button type="button" variant="outline" size="sm" className={cx('min-h-11')} onClick={() => onResume(item.id)} aria-label={`Resume upload ${item.name}`}><Play aria-hidden="true" />Resume</Button>}
            {canCancel && <Button type="button" variant="ghost" size="icon-sm" className={cx('min-h-11 min-w-11 shrink-0')} onClick={() => onCancel(item.id)} aria-label={`Cancel upload ${item.name}`}><XCircle aria-hidden="true" /></Button>}
            {item.status === 'error' && item.retryable && (canRetry || item.pendingAction === 'cancel') && <Button type="button" variant="outline" size="sm" className={cx('min-h-11 shrink-0')} onClick={() => onRetry(item.id)} aria-label={`Retry upload ${item.name}`}><RotateCcw aria-hidden="true" />{item.pendingAction ? `Retry ${item.pendingAction}` : multipart ? 'Retry connection' : 'Retry'}</Button>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}

export default UploadQueue;
