import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Folder, FolderOpen, FolderPlus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { listStorageObjects, mergeStorageObjects, StorageApiError } from '../../services/storage';
import { appendBreadcrumb, isFolderDestinationInvalid, rootBreadcrumbs } from '../../utils/storage-files';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { cx } from '../../utils/cx';
import NewFolderDialog from './NewFolderDialog';

function operationMessage(code) {
  if (code === 'NAME_CONFLICT') return 'An item with this name already exists in that folder.';
  if (code === 'INVALID_INPUT') return 'That folder cannot be used as the destination.';
  if (code === 'FORBIDDEN' || code === 'CAPABILITY_UNAVAILABLE') return 'You do not have permission to do that.';
  if (code === 'NOT_FOUND') return 'The source or destination folder is no longer available.';
  if (code === 'OPERATION_TOO_LARGE') return 'This folder contains too many items for a synchronous copy.';
  if (code === 'TRANSFER_INCOMPLETE') return 'The transfer did not complete. Try again.';
  if (code === 'RATE_LIMITED') return 'Storage is temporarily busy. Try again shortly.';
  return 'Storage is temporarily unavailable. Try again later.';
}

function FolderDestinationDialog({ open, onOpenChange, storageId, source, action, isAllowed, canCreateFolder, onCreateFolder, onConfirm }) {
  const { expireSession } = useAuth();
  const [breadcrumbs, setBreadcrumbs] = useState(rootBreadcrumbs);
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [operationError, setOperationError] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [progress, setProgress] = useState(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const controllerRef = useRef(null);
  const sequenceRef = useRef(0);
  const parentId = breadcrumbs.at(-1)?.objectId ?? null;
  const title = action === 'move' ? 'Move to folder' : 'Copy to folder';
  const sources = Array.isArray(source) ? source : source ? [source] : [];
  const isInvalidDestination = sources.some((item) => isFolderDestinationInvalid(action, item, parentId, breadcrumbs));

  const loadFolder = useCallback(async (targetParentId, cursor = null) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const sequence = ++sequenceRef.current;
    setStatus(cursor ? 'loading-more' : 'loading');
    setError('');
    try {
      const page = await listStorageObjects(storageId, { parentId: targetParentId, cursor, limit: 50, signal: controller.signal });
      if (controller.signal.aborted || sequence !== sequenceRef.current) return;
      const folders = page.items.filter((item) => item.type === 'folder');
      setItems((current) => cursor ? mergeStorageObjects(current, folders) : folders);
      setNextCursor(page.nextCursor);
      setStatus(page.nextCursor || folders.length ? 'ready' : 'empty');
    } catch (loadError) {
      if (controller.signal.aborted || sequence !== sequenceRef.current) return;
      if (loadError instanceof StorageApiError && loadError.status === 401) {
        expireSession();
        return;
      }
      setItems([]);
      setNextCursor(null);
      setStatus('error');
      setError(loadError instanceof Error ? loadError.message : 'Storage is temporarily unavailable. Try again.');
    }
  }, [storageId, expireSession]);

  useEffect(() => {
    if (!open || !storageId) return undefined;
    queueMicrotask(() => void loadFolder(null));
    return () => {
      sequenceRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [open, storageId, loadFolder]);

  const navigateTo = (nextBreadcrumbs) => {
    setBreadcrumbs(nextBreadcrumbs);
    void loadFolder(nextBreadcrumbs.at(-1)?.objectId ?? null);
  };

  const handleCreateFolder = async (name) => {
    const result = await onCreateFolder(name, parentId);
    if (result.ok) {
      setNewFolderOpen(false);
      await loadFolder(parentId);
    }
    return result;
  };

  const handleConfirm = async () => {
    if (!isAllowed || isPending || isInvalidDestination) return;
    setIsPending(true);
    setProgress({ completed: 0, total: Array.isArray(source) ? source.length : 1 });
    setOperationError('');
    try {
      const result = await onConfirm(parentId, (completed, total) => setProgress({ completed, total }));
      if (result?.error) {
        setOperationError(operationMessage(result.error));
        return;
      }
      onOpenChange(false);
    } finally {
      setIsPending(false);
      setProgress(null);
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={cx('max-w-lg')} aria-busy={isPending}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Choose a destination in this storage. Only folders are shown.</DialogDescription>
      </DialogHeader>

      <nav aria-label="Destination folder path" className={cx('flex min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-border p-2')}>
        {breadcrumbs.map((item, index) => <span key={item.objectId ?? 'root'} className={cx('flex shrink-0 items-center gap-1')}>
          {index > 0 && <ChevronRight className={cx('size-3.5 text-muted-foreground')} aria-hidden="true" />}
          <Button type="button" variant="ghost" size="sm" aria-current={index === breadcrumbs.length - 1 ? 'location' : undefined} onClick={() => navigateTo(breadcrumbs.slice(0, index + 1))}>
            {item.label}
          </Button>
        </span>)}
      </nav>

      <div className={cx('flex items-center justify-between gap-2')}>
        <Button type="button" variant="outline" size="sm" disabled={breadcrumbs.length === 1 || isPending} onClick={() => navigateTo(breadcrumbs.slice(0, -1))}>
          <ChevronLeft aria-hidden="true" />Back
        </Button>
        <Button type="button" size="sm" disabled={!isAllowed || isInvalidDestination || isPending || status === 'loading' || status === 'error'} onClick={() => void handleConfirm()}>
          {isPending ? 'Working…' : action === 'move' ? 'Move here' : 'Copy here'}
        </Button>
      </div>

      {isPending && progress && progress.total > 1 && <p className={cx('text-sm text-muted-foreground')} role="status" aria-live="polite">Moving {progress.completed} of {progress.total}…</p>}

      {isInvalidDestination && <p className={cx('text-sm text-muted-foreground')} role="status">A folder cannot be moved into itself, one of its descendants, or its current location.</p>}
      {!isAllowed && <p className={cx('text-sm text-muted-foreground')} role="status">This operation is unavailable for the selected storage.</p>}
      {operationError && <p className={cx('text-sm text-destructive')} role="alert">{operationError}</p>}
      {status === 'loading' && <div className={cx('rounded-lg border border-border p-4 text-sm text-muted-foreground')} role="status" aria-live="polite">Loading folders…</div>}
      {status === 'error' && <div className={cx('flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3')} role="alert"><p className={cx('min-w-0 text-sm text-destructive')}>{error}</p><Button type="button" variant="outline" size="sm" onClick={() => void loadFolder(parentId)}>Try again</Button></div>}
      {status === 'empty' && <div className={cx('flex items-center gap-3 rounded-lg border border-border p-4 text-sm text-muted-foreground')} role="status"><FolderOpen className={cx('size-5 shrink-0')} aria-hidden="true" />No child folders here.</div>}
      {(status === 'ready' || status === 'loading-more') && <div className={cx('max-h-64 overflow-y-auto rounded-lg border border-border')} aria-label="Destination folders">
        {items.length === 0 && <p className={cx('p-4 text-sm text-muted-foreground')} role="status">No child folders here.</p>}
        {items.map((folder) => <div key={folder.objectId} className={cx('flex min-w-0 items-center gap-2 border-b border-border p-2 last:border-b-0')}>
          <Folder className={cx('size-4 shrink-0 text-amber-600')} aria-hidden="true" />
          <span className={cx('min-w-0 flex-1 truncate text-sm')} title={folder.name}>{folder.name}</span>
          <Button type="button" variant="outline" size="sm" aria-label={`Open folder ${folder.name}`} disabled={isPending} onClick={() => navigateTo(appendBreadcrumb(breadcrumbs, folder))}>
            Open
          </Button>
        </div>)}
        {nextCursor && <div className={cx('flex justify-center p-2')}><Button type="button" variant="ghost" size="sm" disabled={status === 'loading-more'} onClick={() => void loadFolder(parentId, nextCursor)}>{status === 'loading-more' ? 'Loading…' : 'Load more folders'}</Button></div>}
      </div>}

      {newFolderOpen && <NewFolderDialog open onOpenChange={setNewFolderOpen} onCreate={handleCreateFolder} />}
      <div className={cx('-mx-4 -mb-4 flex items-center justify-between gap-2 rounded-b-xl border-t bg-muted/50 p-4')}>
        <Button type="button" variant="outline" disabled={!canCreateFolder || isPending || status === 'loading' || status === 'error'} onClick={() => setNewFolderOpen(true)}>
          <FolderPlus aria-hidden="true" />New folder
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

export default FolderDestinationDialog;
