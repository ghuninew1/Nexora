import { useContext } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { RemoteFilesContext } from '../../context/files-context';
import { Button } from '../ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { cx } from '../../utils/cx';
import UploadQueue from './UploadQueue';

// Presentation only. FilesProvider remains the single authenticated queue owner.
export default function TransferManager() {
  const browser = useContext(RemoteFilesContext);
  const queue = browser.uploadQueue;
  const pending = queue.items.filter(item => !['success', 'cancelled', 'expired', 'error'].includes(item.status));
  const attention = queue.items.some(item => ['error', 'recovery_error', 'file_mismatch', 'waiting_file', 'waiting_ownership'].includes(item.status));
  const status = attention ? 'Needs attention' : pending.length ? 'Transfers pending' : 'No active transfers';
  return <Dialog>
    <DialogTrigger render={<Button variant="ghost" className={cx('relative min-h-11 min-w-11 gap-2')} />} aria-label={`Transfers, ${pending.length} active, ${status}`}>
      <ArrowUpDown aria-hidden="true" />
      <span className={cx('hidden lg:inline')}>Transfers</span>
      {pending.length > 0 && <span aria-hidden="true" className={cx('rounded-full bg-primary/15 px-1.5 text-xs text-primary')}>{pending.length}</span>}
      {attention && <span aria-hidden="true" className={cx('absolute right-1 top-1 size-2 rounded-full bg-amber-500')} />}
    </DialogTrigger>
    <DialogContent dialogSize="transfer" className={cx('w-full sm:max-w-2xl')}>
      <DialogTitle className={cx('pr-8')}>Transfer Manager</DialogTitle>
      <DialogDescription>Uploads continue while this panel is closed and as you navigate your workspace.</DialogDescription>
      <div data-transfer-kind="uploads" className={cx('min-w-0')}>
        {queue.items.length === 0 && !queue.restoring && !queue.persistenceWarning && <p role="status" className={cx('rounded-xl border border-border p-6 text-center text-muted-foreground')}>No uploads yet. Add files from My Files.</p>}
        <UploadQueue items={queue.items} concurrency={queue.concurrency} restoring={queue.restoring} persistenceWarning={queue.persistenceWarning}
          onCancel={queue.cancelUpload} onRetry={queue.retryUpload} onPause={queue.pauseUpload} onResume={queue.resumeUpload}
          onClearFinished={queue.clearFinished} onSelectOriginal={queue.selectOriginalFile} onRetryReconciliation={queue.retryReconciliation}
          onClearLocalHistory={queue.clearLocalHistory} canRetry={browser.canUpload} />
      </div>
    </DialogContent>
  </Dialog>;
}
