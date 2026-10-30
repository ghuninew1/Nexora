import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_UPLOAD_CONCURRENCY = 2;
const SUCCESS_DISMISS_DELAY_MS = 5000;

function errorMessage(error) {
  if (error?.code === 'NAME_CONFLICT') return 'A file or folder with this name already exists here.';
  if (error?.code === 'UPLOAD_TOO_LARGE') return 'This file is too large for the connected storage.';
  if (error?.code === 'INVALID_INPUT') return 'This file could not be uploaded. Check its name and size.';
  if (error?.code === 'FORBIDDEN' || error?.code === 'CAPABILITY_UNAVAILABLE') return 'Uploads are unavailable for this storage.';
  if (error?.code === 'NOT_FOUND') return 'The destination folder no longer exists.';
  if (error?.code === 'RATE_LIMITED') return 'Storage is temporarily busy. Try again shortly.';
  if (error?.code === 'QUOTA_EXCEEDED') return 'The storage limit has been reached.';
  if (error?.code === 'UNAUTHENTICATED') return 'Your session has expired. Sign in again to continue.';
  if (error?.code === 'TRANSFER_INCOMPLETE') return 'The upload did not complete. Try again.';
  return 'Upload failed. Try again later.';
}

export default function useUploadQueue({ uploadFile, onComplete, onUnauthorized, maxConcurrency = MAX_UPLOAD_CONCURRENCY } = {}) {
  const [items, setItems] = useState([]);
  const tasksRef = useRef(new Map());
  const pendingRef = useRef([]);
  const activeRef = useRef(new Map());
  const dismissTimersRef = useRef(new Map());
  const mountedRef = useRef(true);
  const uploadFileRef = useRef(uploadFile);
  const onCompleteRef = useRef(onComplete);
  const onUnauthorizedRef = useRef(onUnauthorized);
  const processQueueRef = useRef(null);

  useEffect(() => { uploadFileRef.current = uploadFile; }, [uploadFile]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onUnauthorizedRef.current = onUnauthorized; }, [onUnauthorized]);

  const updateItem = useCallback((id, changes) => {
    if (!mountedRef.current) return;
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  }, []);

  const processQueue = useCallback(() => {
    while (activeRef.current.size < maxConcurrency && pendingRef.current.length > 0) {
      const task = pendingRef.current.shift();
      if (!task || task.cancelled) continue;
      task.status = 'uploading';
      const controller = new AbortController();
      task.controller = controller;
      activeRef.current.set(task.id, task);
      updateItem(task.id, { status: 'uploading', error: null });

      Promise.resolve()
        .then(() => uploadFileRef.current({
          file: task.file,
          storageId: task.storageId,
          parentId: task.parentId,
          maxUploadBytes: task.maxUploadBytes,
          signal: controller.signal,
        }))
        .then((result) => {
          if (controller.signal.aborted) throw new DOMException('Upload cancelled', 'AbortError');
          task.status = 'success';
          updateItem(task.id, { status: 'success', result });
          if (mountedRef.current) {
            const timer = setTimeout(() => {
              dismissTimersRef.current.delete(task.id);
              tasksRef.current.delete(task.id);
              setItems((current) => current.filter((item) => item.id !== task.id));
            }, SUCCESS_DISMISS_DELAY_MS);
            dismissTimersRef.current.set(task.id, timer);
          }
          try { onCompleteRef.current?.(task, result); } catch { /* refresh errors must not turn a completed upload into a failed transfer */ }
        })
        .catch((error) => {
          const cancelled = controller.signal.aborted || error?.name === 'AbortError';
          task.status = cancelled ? 'cancelled' : 'error';
          updateItem(task.id, { status: cancelled ? 'cancelled' : 'error', error: cancelled ? null : errorMessage(error) });
          if (error?.code === 'UNAUTHENTICATED') {
            onUnauthorizedRef.current?.();
            const pending = pendingRef.current.splice(0);
            for (const queued of pending) {
              queued.cancelled = true;
              updateItem(queued.id, { status: 'cancelled' });
            }
            for (const [id, running] of activeRef.current) {
              if (id !== task.id) running.controller?.abort();
            }
          }
        })
        .finally(() => {
          activeRef.current.delete(task.id);
          task.controller = null;
          queueMicrotask(() => processQueueRef.current?.());
        });
    }
  }, [maxConcurrency, updateItem]);

  useEffect(() => { processQueueRef.current = processQueue; }, [processQueue]);

  useEffect(() => {
    mountedRef.current = true;
    const active = activeRef.current;
    const tasks = tasksRef.current;
    const dismissTimers = dismissTimersRef.current;
    return () => {
      mountedRef.current = false;
      pendingRef.current = [];
      for (const task of active.values()) task.controller?.abort();
      active.clear();
      tasks.clear();
      for (const timer of dismissTimers.values()) clearTimeout(timer);
      dismissTimers.clear();
    };
  }, []);

  const addFiles = useCallback((files, { storageId, parentId = null, maxUploadBytes = null } = {}) => {
    const tasks = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      storageId,
      parentId,
      maxUploadBytes,
      cancelled: false,
      controller: null,
    }));
    const newItems = tasks.map((task) => {
      tasksRef.current.set(task.id, task);
      const tooLarge = Number.isSafeInteger(maxUploadBytes) && maxUploadBytes >= 0 && task.file.size > maxUploadBytes;
      const invalid = !Number.isSafeInteger(task.file.size) || task.file.size <= 0;
      return {
        id: task.id,
        name: task.file.name,
        sizeBytes: task.file.size,
        parentId,
        status: tooLarge || invalid ? 'error' : 'queued',
        error: tooLarge ? errorMessage({ code: 'UPLOAD_TOO_LARGE' }) : invalid ? errorMessage({ code: 'INVALID_INPUT' }) : null,
      };
    });
    newItems.forEach((item, index) => { tasks[index].status = item.status; });
    const validTasks = tasks.filter((task) => task.file.size > 0
      && !(Number.isSafeInteger(maxUploadBytes) && maxUploadBytes >= 0 && task.file.size > maxUploadBytes));
    pendingRef.current.push(...validTasks);
    if (mountedRef.current) setItems((current) => [...current, ...newItems]);
    queueMicrotask(() => processQueueRef.current?.());
    return newItems.map(({ id }) => id);
  }, []);

  const cancelUpload = useCallback((id) => {
    const task = tasksRef.current.get(id);
    if (!task) return;
    if (task.controller) {
      task.controller.abort();
      return;
    }
    if (task.status !== 'queued') return;
    task.cancelled = true;
    task.status = 'cancelled';
    pendingRef.current = pendingRef.current.filter((pending) => pending.id !== id);
    updateItem(id, { status: 'cancelled', error: null });
  }, [updateItem]);

  const retryUpload = useCallback((id) => {
    const task = tasksRef.current.get(id);
    if (!task || task.status !== 'error' || activeRef.current.has(id) || pendingRef.current.some((pending) => pending.id === id)) return;
    task.cancelled = false;
    task.status = 'queued';
    pendingRef.current.push(task);
    updateItem(id, { status: 'queued', error: null });
    queueMicrotask(() => processQueueRef.current?.());
  }, [updateItem]);

  const clearFinished = useCallback(() => {
    const finished = new Set(items.filter((item) => ['success', 'error', 'cancelled'].includes(item.status)).map((item) => item.id));
    for (const id of finished) {
      tasksRef.current.delete(id);
      clearTimeout(dismissTimersRef.current.get(id));
      dismissTimersRef.current.delete(id);
    }
    if (mountedRef.current) setItems((current) => current.filter((item) => !finished.has(item.id)));
  }, [items]);

  const cancelAll = useCallback(() => {
    const pending = pendingRef.current.splice(0);
    for (const task of pending) {
      task.cancelled = true;
      task.status = 'cancelled';
      updateItem(task.id, { status: 'cancelled', error: null });
    }
    for (const task of activeRef.current.values()) task.controller?.abort();
  }, [updateItem]);

  return { items, addFiles, cancelUpload, retryUpload, clearFinished, cancelAll, concurrency: maxConcurrency };
}
