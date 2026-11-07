import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createMultipartUploadClient, MultipartUploadError } from '../services/multipart-upload';
import { selectUploadStrategy } from '../utils/upload-strategy';
import { uploadRecoveryStore, normalizeRecoveryRecord, matchesOriginalFile } from '../services/upload-recovery';

const TRANSIENT = new Set(['NETWORK_INTERRUPTION', 'REQUEST_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'RATE_LIMITED', 'VERSION_CONFLICT', 'AMBIGUOUS_COMPLETION']);
const AUTH = new Set(['UNAUTHENTICATED', 'AUTHENTICATION_FAILURE']);
const FINISHED = new Set(['success', 'error', 'expired', 'cancelled']);
const MAX_RETRIES = 2;

function taskRecord(task) {
  return { schemaVersion: 1, id: task.id, userScope: task.userScope, transferId: task.transferId ?? null,
    idempotencyKey: task.key, storageId: task.storageId, parentId: task.parentId,
    name: task.name, sizeBytes: task.sizeBytes, mimeType: task.metadata.mimeType, lastModified: task.lastModified,
    partSizeBytes: task.limits.partSizeBytes, partCount: Math.ceil(task.sizeBytes / task.limits.partSizeBytes),
    createdAt: task.createdAt, expiresAt: task.expiresAt, updatedAt: Date.now(), lastState: task.status, intent: task.intent };
}

function displayTask(task) {
  return { id: task.id, scopeKey: task.scopeKey, name: task.name, sizeBytes: task.sizeBytes, parentId: task.parentId,
    strategy: task.strategy, status: task.status, acknowledgedBytes: 0, completedParts: 0,
    partCount: task.partCount ?? null, retryable: false, error: null, recovered: task.recovered === true,
    needsFile: !task.file && task.strategy === 'multipart', pendingAction: task.intent || null };
}

function errorMessage(error) {
  const messages = {
    NAME_CONFLICT: 'A file or folder with this name already exists here.',
    UPLOAD_TOO_LARGE: 'This file is too large for the connected storage.',
    INVALID_INPUT: 'Check the file name and size.',
    FORBIDDEN: 'Upload permission is unavailable. Check storage access or maintenance status.',
    PERMISSION_REVOKED: 'Upload permission is unavailable. Check storage access or maintenance status.',
    CAPABILITY_UNAVAILABLE: 'Uploads are unavailable for this storage.',
    VALIDATION_FAILURE: 'The server rejected this upload. Check storage capabilities and destination.',
    NOT_FOUND: 'The destination folder no longer exists.',
    SESSION_UNAVAILABLE: 'The upload session is no longer accessible.',
    SESSION_EXPIRED: 'The upload session expired. Select the file again to start a new upload.',
    SESSION_CANCELLED: 'The server cancelled this upload session.',
    CHECKSUM_MISMATCH: 'Part verification failed. Select the original file again.',
    FILE_MISMATCH: 'This file does not match the upload session.',
    RECEIPT_CONFLICT: 'Server receipts are inconsistent. Upload stopped safely.',
    INVALID_RESPONSE: 'Storage returned an invalid response. Upload stopped safely.',
    RATE_LIMITED: 'Storage is temporarily busy. Retry shortly.',
    QUOTA_EXCEEDED: 'The storage limit has been reached.',
    UNAUTHENTICATED: 'Your session has expired. Sign in again to continue.',
    AUTHENTICATION_FAILURE: 'Your session has expired. Sign in again to continue.',
    AMBIGUOUS_COMPLETION: 'Finalization is unconfirmed. Retry to check the same session.',
    VERSION_CONFLICT: 'The session changed. Retry to reconcile its status.',
    NETWORK_INTERRUPTION: 'Connection interrupted. Retry to reconcile the same session.',
    REQUEST_TIMEOUT: 'The request timed out. Retry to check the same session.',
  };
  return messages[error?.code] || 'Upload failed. Retry when storage is available.';
}

function retryDelay(attempt, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new MultipartUploadError('ABORTED')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 500 * 2 ** attempt * (0.5 + Math.random() * 0.5));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export default function useUploadQueue({ uploadFile, onComplete, onUnauthorized, canUpload = () => true,
  scopeKey = 'workspace', maxConcurrency = 3, autoClear = true,
  createClient = createMultipartUploadClient, waitForRetry = retryDelay,
  recoveryScope = null, recoveryStorageId = null, recoveryStore = uploadRecoveryStore } = {}) {
  const [items, setItems] = useState([]);
  const [recoveryNotice, setRecoveryNotice] = useState(null);
  const tasksRef = useRef(new Map());
  const pendingRef = useRef([]);
  const activeRef = useRef(new Map());
  const timersRef = useRef(new Map());
  const epochRef = useRef(0);
  const mountedRef = useRef(false);
  const blockedRef = useRef(false);
  const writeBlockedRef = useRef(false);
  const optionsRef = useRef(null);
  const processRef = useRef(null);
  const concurrency = [1, 2, 3, 5].includes(maxConcurrency) ? maxConcurrency : 3;
  useLayoutEffect(() => {
    optionsRef.current = { uploadFile, onComplete, onUnauthorized, canUpload, scopeKey, concurrency, autoClear, createClient, waitForRetry, recoveryScope, recoveryStore };
    for (const task of activeRef.current.values()) {
      if (task.intent !== 'cancel' && !canUpload(task.storageId)) {
        task.permissionRevoked = true;
        task.controller?.abort();
      }
    }
  });

  const alive = useCallback(task => mountedRef.current && task.epoch === epochRef.current
    && task.scopeKey === optionsRef.current.scopeKey && tasksRef.current.get(task.id) === task, []);
  const persist = useCallback(async (task, remove = false) => {
    if (task.strategy !== 'multipart' || !task.userScope || task.localOnly || (task.persistenceFailed && !remove && !['success','cancelled','expired'].includes(task.status))) return;
    const removing = remove || ['success','cancelled','expired'].includes(task.status);
    try {
      if (removing) await task.recoveryStore.remove(task.userScope, task.id);
      else await task.recoveryStore.save(taskRecord(task));
    } catch {
      task.persistenceFailed = true;
      if (mountedRef.current && task.epoch === epochRef.current && task.scopeKey === optionsRef.current.scopeKey) {
        setRecoveryNotice({ scopeKey: task.scopeKey, warning: removing
          ? 'Local upload history could not be cleared on this device. It may reappear after reload.'
          : 'Upload recovery could not be saved on this device. Keep this page open to retain the original file.' });
      }
    }
  }, []);
  const update = useCallback((task, changes) => {
    if (!alive(task)) return;
    Object.assign(task, changes);
    void persist(task);
    // Only public display metadata enters React state, never File/controller/client/key.
    setItems(current => current.map(item => item.id === task.id ? { ...item, ...changes } : item));
  }, [alive, persist]);

  const dispose = useCallback(() => {
    epochRef.current++;
    for (const task of tasksRef.current.values()) { task.controller?.abort(); task.file = null; task.candidateFile = null; task.client = null; }
    tasksRef.current.clear(); activeRef.current.clear(); pendingRef.current = [];
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  useLayoutEffect(() => {
    mountedRef.current = true;
    blockedRef.current = false;
    writeBlockedRef.current = false;
    const epoch = epochRef.current;
    queueMicrotask(() => {
      if (epoch === epochRef.current && mountedRef.current) {
        setItems(current => current.filter(item => tasksRef.current.has(item.id)));
      }
    });
    return () => { mountedRef.current = false; dispose(); };
  }, [scopeKey, dispose]);

  useEffect(() => {
    if (!autoClear) {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    }
  }, [autoClear]);

  const finish = useCallback((task, result) => {
    if (!alive(task) || task.notified) return;
    task.notified = true;
    update(task, { status: 'success', error: null, retryable: false,
      ...(task.strategy === 'multipart' ? { acknowledgedBytes: task.sizeBytes, completedParts: task.partCount } : {}) });
    try { optionsRef.current.onComplete?.(task, result); } catch { /* A refresh cannot undo confirmed publication. */ }
    task.file = null; task.client = null;
    if (optionsRef.current.autoClear) {
      const timer = setTimeout(() => {
        timersRef.current.delete(task.id);
        if (!alive(task)) return;
        tasksRef.current.delete(task.id);
        setItems(current => current.filter(item => item.id !== task.id));
      }, 5000);
      timersRef.current.set(task.id, timer);
    }
  }, [alive, update]);

  const run = useCallback(async task => {
    let retries = 0;
    const check = () => { if (!alive(task) || task.controller.signal.aborted) throw new MultipartUploadError('ABORTED'); };
    const allowed = () => {
      check();
      if (writeBlockedRef.current || !optionsRef.current.canUpload(task.storageId)) throw new MultipartUploadError('PERMISSION_REVOKED');
    };
    const snapshot = (session, firstPage = false) => {
      check();
      if (session.sizeBytes !== task.sizeBytes || session.partSizeBytes !== task.limits.partSizeBytes
        || session.partCount !== Math.ceil(task.sizeBytes / session.partSizeBytes) || session.partCount > task.limits.maxParts) {
        throw new MultipartUploadError('INVALID_RESPONSE');
      }
      task.partCount = session.partCount; task.expiresAt = session.expiresAt;
      update(task, firstPage ? { partCount: session.partCount }
        : { acknowledgedBytes: session.acknowledgedBytes, completedParts: session.parts.length, partCount: session.partCount });
    };
    while (alive(task) && !blockedRef.current) {
      task.controller = new AbortController();
      const handling = task.intent;
      const operationMode = task.mode;
      try {
        const client = task.strategy === 'multipart' ? optionsRef.current.createClient({ storageId: task.storageId,
          signal: task.controller.signal, maxRetries: 0 }) : null;
        task.client = client;
        if (operationMode === 'check' || operationMode === 'select') {
          update(task, { status: operationMode === 'check' ? 'checking_server' : 'verifying', error: null });
          if (!task.transferId) {
            // Unknown creation: retain identity, but never issue POST during startup restore.
            if (operationMode === 'select') task.file = task.candidateFile;
            task.candidateFile = null; task.mode = null;
            task.intent = handling === 'cancel' ? 'cancel' : 'pause';
            update(task, { status: handling === 'cancel' ? 'error' : task.file ? 'paused' : 'waiting_file',
              needsFile: !task.file, pendingAction: handling === 'cancel' ? 'cancel' : null,
              retryable: handling === 'cancel', error: handling === 'cancel' ? 'Creation outcome is unknown. Retry cancellation using the original identity.' : null });
            return;
          }
          const session = operationMode === 'select'
            ? await client.reconcile(task.transferId, task.candidateFile) : await client.getCompletedParts(task.transferId);
          snapshot(session);
          if (session.state === 'completed') { finish(task, { file: session.object }); return; }
          if (session.state === 'expired' || session.state === 'cancelled') throw new MultipartUploadError(session.state === 'expired' ? 'SESSION_EXPIRED' : 'SESSION_CANCELLED');
          task.mode = null;
          if (handling === 'cancel') {
            update(task, { status: 'error', pendingAction: 'cancel', retryable: true, error: 'Cancellation is pending. Retry cancellation; this upload will not resume.' }); return;
          }
          if (operationMode === 'select') { task.file = task.candidateFile; task.candidateFile = null; task.intent = 'pause'; }
          update(task, { status: task.file ? 'paused' : 'waiting_file', needsFile: !task.file, pendingAction: null, error: null });
          return;
        }
        if (task.strategy === 'legacy') {
          allowed();
          update(task, { status: 'uploading', error: null });
          const result = await optionsRef.current.uploadFile({ file: task.file, storageId: task.storageId,
            parentId: task.parentId, maxUploadBytes: task.maxUploadBytes, signal: task.controller.signal });
          check(); finish(task, result); return;
        }
        if (handling) update(task, { status: handling === 'cancel' ? 'cancelling' : 'pausing', error: null });
        else { allowed(); update(task, { status: retries || task.transferId ? 'reconciling' : 'uploading', error: null }); }
        if (!task.transferId) {
          // If a create response was lost, only this exact key/metadata may recover its ID.
          task.started = true;
          await persist(task); check();
          const session = await client.createSession(task.metadata, task.key);
          check(); task.transferId = session.transferId;
          snapshot(session, true);
          await persist(task); check();
        }
        if (handling) {
          await persist(task); check();
          if (handling === 'pause') allowed();
          let result;
          try { result = handling === 'cancel' ? await client.cancelSession(task.transferId) : await client.pauseSession(task.transferId); }
          catch (error) {
            // Cancellation may race publication. Confirm server truth, never invent cancellation.
            if (!TRANSIENT.has(error?.code)) throw error;
            result = await client.getSession(task.transferId);
            if (result.state !== 'completed' && result.state !== (handling === 'cancel' ? 'cancelled' : 'paused')) throw error;
          }
          check();
          if (result.state === 'completed') { finish(task, { file: result.object }); return; }
          if (result.state !== (handling === 'cancel' ? 'cancelled' : 'paused')) throw new MultipartUploadError('INVALID_RESPONSE');
          if (handling === 'cancel') { task.file = null; task.candidateFile = null; task.client = null; }
          else {
            const paused = await client.getCompletedParts(task.transferId);
            check();
            if (paused.state !== 'paused') throw new MultipartUploadError('VERSION_CONFLICT');
            snapshot(paused);
          }
          update(task, { status: handling === 'cancel' ? 'cancelled' : 'paused', error: null, retryable: false });
          return;
        }
        if (!task.file) { task.mode = 'check'; continue; }
        update(task, { status: task.resumeRequested ? 'resuming' : retries ? 'reconciling' : 'verifying' });
        let session = await client.reconcile(task.transferId, task.file);
        snapshot(session);
        if (session.state === 'completed') { finish(task, { file: session.object }); return; }
        if (session.state === 'paused') {
          if (!task.resumeRequested) { task.intent = 'pause'; update(task, { status: 'paused' }); return; }
          allowed(); session = await client.resumeSession(task.transferId); check();
          if (session.state === 'completed') { finish(task, { file: session.object }); return; }
        }
        task.resumeRequested = false;
        if (session.state !== 'active' && session.state !== 'completing') throw new MultipartUploadError('SESSION_NOT_ACTIVE');
        const verified = new Set(session.parts.map(part => part.partNumber));
        if (session.state === 'active') {
          for (let number = 1; number <= session.partCount; number++) {
            if (verified.has(number)) continue;
            allowed(); update(task, { status: 'uploading' });
            const receipt = await client.uploadPart(task.transferId, task.file, number);
            check();
            if (receipt.state === 'completed') { finish(task, { file: receipt.object }); return; }
            // Use authoritative counters from all verified receipts, never local dispatch bytes.
            session = await client.getCompletedParts(task.transferId);
            snapshot(session);
            if (session.state === 'completed') { finish(task, { file: session.object }); return; }
            if (session.state !== 'active') throw new MultipartUploadError('VERSION_CONFLICT');
          }
        }
        allowed(); update(task, { status: 'finalizing' });
        const completed = await client.completeSession(task.transferId);
        check();
        if (completed.state !== 'completed' || !completed.object) throw new MultipartUploadError('AMBIGUOUS_COMPLETION');
        finish(task, { file: completed.object }); return;
      } catch (caughtError) {
        if (!alive(task)) return;
        const error = task.permissionRevoked ? new MultipartUploadError('PERMISSION_REVOKED') : caughtError;
        task.permissionRevoked = false;
        // An explicit intent takes precedence over retries; a changed intent restarts only control handling.
        if (task.strategy === 'multipart' && task.intent && task.intent !== handling) continue;
        if (AUTH.has(error?.code)) {
          blockedRef.current = true;
          for (const other of tasksRef.current.values()) {
            other.controller?.abort();
            if (other !== task && !FINISHED.has(other.status)) update(other, { status: 'error', retryable: false, error: errorMessage(error) });
          }
          pendingRef.current = [];
          update(task, { status: 'error', retryable: false, error: errorMessage(error), errorCode: error.code });
          optionsRef.current.onUnauthorized?.(); return;
        }
        if (blockedRef.current) return;
        if (operationMode === 'check' || operationMode === 'select') {
          task.mode = null; task.candidateFile = null;
          const terminal = error?.code === 'SESSION_EXPIRED' ? 'expired' : error?.code === 'SESSION_CANCELLED' ? 'cancelled' : null;
          update(task, { status: terminal || (error?.code === 'FILE_MISMATCH' ? 'file_mismatch' : 'recovery_error'),
            error: errorMessage(error), errorCode: error?.code, needsFile: !task.file, retryable: !terminal,
            pendingAction: task.intent === 'cancel' ? 'cancel' : null });
          return;
        }
        if (task.strategy === 'multipart' && error?.code === 'FILE_MISMATCH') {
          task.file = null; task.candidateFile = null; task.intent = 'pause';
          update(task, { status: 'file_mismatch', needsFile: true, pendingAction: null,
            error: errorMessage(error), errorCode: error.code, retryable: false });
          return;
        }
        if (['FORBIDDEN', 'PERMISSION_REVOKED', 'CAPABILITY_UNAVAILABLE'].includes(error?.code)) writeBlockedRef.current = true;
        if (task.strategy === 'multipart' && !handling && TRANSIENT.has(error?.code) && retries < MAX_RETRIES) {
          update(task, { status: 'retry_wait', error: errorMessage(error) });
          try { await optionsRef.current.waitForRetry(retries++, task.controller.signal); }
          catch {
            if (!alive(task)) return;
            if (!task.intent) { update(task, { status: 'error', error: errorMessage(error), retryable: true }); return; }
          }
          continue;
        }
        const cancelled = task.strategy === 'legacy' && task.intent === 'cancel';
        const status = cancelled ? 'cancelled' : error?.code === 'SESSION_EXPIRED' ? 'expired'
          : error?.code === 'SESSION_CANCELLED' ? 'cancelled' : 'error';
        if (status === 'expired' || status === 'cancelled') task.file = null;
        update(task, { status, error: cancelled ? null : handling === 'cancel'
          ? 'Cancellation is unconfirmed. Retry cancellation to check this session.'
          : handling === 'pause' ? 'Pause is unconfirmed. Retry pause before resuming.' : errorMessage(error),
        errorCode: error?.code, retryable: !cancelled && (TRANSIENT.has(error?.code) || (task.strategy === 'legacy' && !['FORBIDDEN', 'INVALID_INPUT', 'UPLOAD_TOO_LARGE', 'CAPABILITY_UNAVAILABLE'].includes(error?.code))),
        pendingAction: handling || null });
        return;
      }
    }
  }, [alive, update, finish, persist]);

  const processQueue = useCallback(() => {
    if (!mountedRef.current || blockedRef.current) return;
    while (activeRef.current.size < optionsRef.current.concurrency && pendingRef.current.length) {
      const task = pendingRef.current.shift();
      if (!alive(task) || activeRef.current.has(task.id)) continue;
      activeRef.current.set(task.id, task);
      void run(task).finally(() => {
        if (!alive(task)) return;
        activeRef.current.delete(task.id); task.controller = null;
        queueMicrotask(() => processRef.current?.());
      });
    }
  }, [alive, run]);
  useLayoutEffect(() => { processRef.current = processQueue; queueMicrotask(processQueue); }, [processQueue, concurrency]);

  const enqueue = useCallback(task => {
    if (!alive(task) || activeRef.current.has(task.id) || pendingRef.current.includes(task)) return;
    pendingRef.current.push(task);
    queueMicrotask(() => processRef.current?.());
  }, [alive]);

  useEffect(() => {
    if (!recoveryScope || !recoveryStorageId) return undefined;
    let cancelled = false;
    const epoch = epochRef.current;
    const current = () => !cancelled && mountedRef.current && epoch === epochRef.current;
    queueMicrotask(async () => {
      if (!current()) return;
      setRecoveryNotice({ scopeKey, loading: true });
      try {
        const records = await recoveryStore.list(recoveryScope, recoveryStorageId);
        if (!current()) return;
        const restored = [];
        const transferIds = new Set([...tasksRef.current.values()].map(task => task.transferId).filter(Boolean));
        const createKeys = new Set([...tasksRef.current.values()].map(task => task.key).filter(Boolean));
        for (const raw of records) {
          let record;
          try { record = normalizeRecoveryRecord(raw); } catch { continue; }
          if (record.userScope !== recoveryScope || record.storageId !== recoveryStorageId || tasksRef.current.has(record.id)) continue;
          if ((record.transferId && transferIds.has(record.transferId)) || createKeys.has(record.idempotencyKey)) {
            void recoveryStore.remove(recoveryScope, record.id).catch(() => {});
            continue;
          }
          const selected = selectUploadStrategy(record.sizeBytes, 0, { resumableUpload: true, maxFileBytes: 10 * 1024 ** 3,
            partSizeBytes: record.partSizeBytes, maxParts: 1280, maxParallelParts: 1, sessionTtlSeconds: 604800 });
          if (!selected.limits) continue;
          const task = { id: record.id, userScope: recoveryScope, storageId: record.storageId, parentId: record.parentId,
            transferId: record.transferId, key: record.idempotencyKey, name: record.name, sizeBytes: record.sizeBytes,
            lastModified: record.lastModified, createdAt: record.createdAt, expiresAt: record.expiresAt,
            metadata: { name: record.name, sizeBytes: record.sizeBytes, parentId: record.parentId, mimeType: record.mimeType },
            limits: selected.limits, partCount: record.partCount, strategy: 'multipart', maxUploadBytes: 25 * 1024 ** 2,
            epoch, scopeKey, recoveryStore, recovered: true, file: null, controller: null, notified: false,
            status: 'restoring', mode: 'check', intent: record.intent, started: true };
          tasksRef.current.set(task.id, task); createKeys.add(task.key); if (task.transferId) transferIds.add(task.transferId);
          restored.push(displayTask(task)); pendingRef.current.push(task);
        }
        setItems(items => [...items, ...restored]);
        setRecoveryNotice(previous => ({ ...(previous?.scopeKey === scopeKey ? previous : {}), scopeKey, loading: false }));
        queueMicrotask(() => processRef.current?.());
      } catch {
        if (current()) setRecoveryNotice({ scopeKey, warning: 'Upload recovery is unavailable on this device. Existing uploads can continue while this page stays open.' });
      }
    });
    return () => { cancelled = true; };
  }, [scopeKey, recoveryScope, recoveryStorageId, recoveryStore]);

  const retryReconciliation = useCallback(id => {
    const task = tasksRef.current.get(id);
    if (!task || !alive(task) || !['recovery_error','waiting_file','file_mismatch'].includes(task.status)
      || activeRef.current.has(id) || pendingRef.current.includes(task) || blockedRef.current) return;
    task.mode = 'check'; update(task, { status: 'checking_server', error: null }); enqueue(task);
  }, [alive, update, enqueue]);

  const selectOriginalFile = useCallback((id, file) => {
    const task = tasksRef.current.get(id);
    if (!task || !alive(task) || task.intent === 'cancel' || activeRef.current.has(id) || pendingRef.current.includes(task)
      || !['waiting_file','file_mismatch','recovery_error'].includes(task.status)) return;
    if (!matchesOriginalFile({ name: task.name, sizeBytes: task.sizeBytes, lastModified: task.lastModified }, file)) {
      update(task, { status: 'file_mismatch', needsFile: true, error: 'File name, size or modification time differs from the original. Select the original file.' }); return;
    }
    task.candidateFile = file; task.mode = 'select';
    update(task, { status: 'verifying', error: null }); enqueue(task);
  }, [alive, update, enqueue]);

  const clearLocalHistory = useCallback(() => {
    const removed = new Set();
    for (const task of tasksRef.current.values()) {
      if (activeRef.current.has(task.id) || pendingRef.current.includes(task)) continue;
      void persist(task, true); task.localOnly = true; task.file = null; task.candidateFile = null; task.client = null;
      clearTimeout(timersRef.current.get(task.id)); timersRef.current.delete(task.id);
      tasksRef.current.delete(task.id); removed.add(task.id);
    }
    setItems(items => items.filter(item => !removed.has(item.id)));
  }, [persist]);

  const addFiles = useCallback((files, { storageId, parentId = null, maxUploadBytes = null, transfers } = {}) => {
    if (!mountedRef.current || blockedRef.current || writeBlockedRef.current || !optionsRef.current.canUpload(storageId)) return [];
    const newItems = Array.from(files).map(file => {
      const selected = selectUploadStrategy(file.size, maxUploadBytes, transfers);
      const task = { id: crypto.randomUUID(), file, storageId, parentId, maxUploadBytes: selected.smallLimit,
        sizeBytes: file.size, name: file.name, strategy: selected.strategy || 'legacy', limits: selected.limits,
        epoch: epochRef.current, scopeKey: optionsRef.current.scopeKey, status: selected.error ? 'error' : 'queued',
        intent: null, controller: null, notified: false, retryable: false };
      if (task.strategy === 'multipart') {
        task.key = crypto.randomUUID();
        task.userScope = optionsRef.current.recoveryScope; task.recoveryStore = optionsRef.current.recoveryStore;
        task.createdAt = Date.now(); task.expiresAt = task.createdAt + task.limits.sessionTtlSeconds * 1000;
        task.lastModified = Number.isSafeInteger(file.lastModified) && file.lastModified >= 0 ? file.lastModified : null;
        task.metadata = { name: file.name, sizeBytes: file.size, parentId, mimeType: file.type || 'application/octet-stream' };
      }
      tasksRef.current.set(task.id, task);
      if (!selected.error) pendingRef.current.push(task);
      return { id: task.id, scopeKey: task.scopeKey, name: file.name, sizeBytes: file.size, parentId,
        strategy: task.strategy, status: task.status, acknowledgedBytes: 0, completedParts: 0, partCount: null,
        retryable: false, error: selected.error ? errorMessage({ code: selected.error }) : null };
    });
    setItems(current => [...current.filter(item => item.scopeKey === optionsRef.current.scopeKey), ...newItems]);
    queueMicrotask(() => processRef.current?.());
    return newItems.map(item => item.id);
  }, []);

  const cancelUpload = useCallback(id => {
    const task = tasksRef.current.get(id);
    if (!task || !alive(task) || ['success', 'expired', 'cancelled', 'cancelling'].includes(task.status)) return;
    task.intent = 'cancel'; task.mode = null; task.candidateFile = null;
    if (task.strategy === 'multipart' && (task.started || task.transferId)) {
      update(task, { status: 'cancelling', retryable: false });
      if (activeRef.current.has(id)) task.controller?.abort(); else enqueue(task);
    } else {
      pendingRef.current = pendingRef.current.filter(pending => pending !== task);
      task.controller?.abort(); task.file = null;
      update(task, { status: 'cancelled', error: null });
    }
  }, [alive, update, enqueue]);

  const pauseUpload = useCallback(id => {
    const task = tasksRef.current.get(id);
    if (!task || task.strategy !== 'multipart' || !['queued', 'uploading', 'verifying', 'retry_wait', 'reconciling'].includes(task.status)) return;
    task.intent = 'pause';
    if (!task.started) { pendingRef.current = pendingRef.current.filter(pending => pending !== task); update(task, { status: 'paused' }); }
    else { update(task, { status: 'pausing' }); if (activeRef.current.has(id)) task.controller?.abort(); else enqueue(task); }
  }, [update, enqueue]);

  const resumeUpload = useCallback(id => {
    const task = tasksRef.current.get(id);
    if (!task || !task.file || task.status !== 'paused' || blockedRef.current || writeBlockedRef.current || !optionsRef.current.canUpload(task.storageId)) return;
    task.intent = null; task.resumeRequested = true;
    update(task, { status: 'resuming', error: null }); enqueue(task);
  }, [update, enqueue]);

  const retryUpload = useCallback(id => {
    const task = tasksRef.current.get(id);
    if (!task || task.status !== 'error' || !task.retryable || blockedRef.current
      || (task.intent !== 'cancel' && (writeBlockedRef.current || !optionsRef.current.canUpload(task.storageId)))) return;
    update(task, { status: task.intent === 'cancel' ? 'cancelling' : task.intent === 'pause' ? 'pausing' : 'reconciling', error: null });
    enqueue(task);
  }, [update, enqueue]);

  const clearFinished = useCallback(() => {
    const finished = new Set();
    for (const task of tasksRef.current.values()) {
      if (!FINISHED.has(task.status) || activeRef.current.has(task.id)) continue;
      void persist(task, true); task.localOnly = true;
      finished.add(task.id); task.file = null; task.client = null; tasksRef.current.delete(task.id);
      clearTimeout(timersRef.current.get(task.id)); timersRef.current.delete(task.id);
    }
    setItems(current => current.filter(item => !finished.has(item.id)));
  }, [persist]);
  // Lifecycle shutdown is deliberately distinct from explicit server cancellation.
  const reset = useCallback(() => { dispose(); blockedRef.current = false; writeBlockedRef.current = false; if (mountedRef.current) setItems([]); }, [dispose]);
  const cancelAll = useCallback(() => { for (const task of tasksRef.current.values()) cancelUpload(task.id); }, [cancelUpload]);
  return { items: items.filter(item => item.scopeKey === scopeKey), addFiles, cancelUpload, pauseUpload, resumeUpload,
    retryUpload, clearFinished, cancelAll, reset, concurrency, selectOriginalFile, retryReconciliation, clearLocalHistory,
    restoring: recoveryNotice?.scopeKey === scopeKey && recoveryNotice.loading === true,
    persistenceWarning: recoveryNotice?.scopeKey === scopeKey ? recoveryNotice.warning : null };
}
