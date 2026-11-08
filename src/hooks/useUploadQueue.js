import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createMultipartUploadClient, MultipartUploadError } from '../services/multipart-upload';
import { withUploadOwnership, withUploadBudget } from '../services/upload-coordination';
import { selectUploadStrategy } from '../utils/upload-strategy';
import { uploadRecoveryStore, normalizeRecoveryRecord, matchesOriginalFile } from '../services/upload-recovery';

const TRANSIENT = new Set(['NETWORK_INTERRUPTION', 'REQUEST_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'RATE_LIMITED', 'VERSION_CONFLICT', 'AMBIGUOUS_COMPLETION']);
const AUTH = new Set(['UNAUTHENTICATED', 'AUTHENTICATION_FAILURE']);
const FINISHED = new Set(['success', 'error', 'expired', 'cancelled']);
const MAX_RETRIES = 2;
const MAX_QUEUE_ITEMS = 50;

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
    MULTIPART_UNAVAILABLE: 'This file exceeds the direct upload limit. Multipart uploads are not available. Ask the administrator to enable compatible multipart uploads on Nexora and Shared Storage.',
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
    PROVIDER_UNAVAILABLE: 'Storage is temporarily unavailable. Retry connection shortly.',
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

function retryDelay(attempt, signal, retryAfterMs = 0) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new MultipartUploadError('ABORTED')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, Math.max(retryAfterMs, Math.min(30000, 1000 * 2 ** attempt) * (0.5 + Math.random())));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export default function useUploadQueue({ uploadFile, onComplete, onUnauthorized, onAdmissionError, canUpload = () => true,
  scopeKey = 'workspace', autoClear = true,
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
  const recoverNetworkRef = useRef(null);
  const offlineRef = useRef(globalThis.navigator?.onLine === false);
  const concurrency = 1;
  useLayoutEffect(() => {
    optionsRef.current = { uploadFile, onComplete, onUnauthorized, onAdmissionError, canUpload, scopeKey, concurrency, autoClear, createClient, waitForRetry, recoveryScope, recoveryStore };
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
      const writing = removing ? task.recoveryStore.remove(task.userScope, task.id) : task.recoveryStore.save(taskRecord(task));
      task.persistenceTail = Promise.allSettled([task.persistenceTail, writing]);
      await writing;
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
    // Measure only newly acknowledged bytes during an uninterrupted upload run.
    // Reconciliation/recovery counters are not network throughput samples.
    const now = performance.now();
    const nextStatus = changes.status ?? task.status;
    if (nextStatus !== 'uploading' || task.status !== 'uploading') {
      task.speedSample = nextStatus === 'uploading' ? { bytes: changes.acknowledgedBytes ?? task.acknowledgedBytes ?? 0, time: now } : null;
      changes.bytesPerSecond = null;
      changes.etaSeconds = null;
    } else if (changes.acknowledgedBytes !== undefined && task.speedSample) {
      const elapsed = (now - task.speedSample.time) / 1000;
      const delta = changes.acknowledgedBytes - task.speedSample.bytes;
      if (elapsed >= 1 && delta > 0) {
        changes.bytesPerSecond = delta / elapsed;
        changes.etaSeconds = Math.max(0, task.sizeBytes - changes.acknowledgedBytes) / changes.bytesPerSecond;
        task.speedSample = { bytes: changes.acknowledgedBytes, time: now };
      }
    }
    Object.assign(task, changes);
    if (!['other_tab', 'waiting_ownership'].includes(task.status)) void persist(task);
    // Only public display metadata enters React state, never File/controller/client/key.
    setItems(current => current.map(item => item.id === task.id ? { ...item, ...changes } : item));
  }, [alive, persist]);

  const dispose = useCallback(() => {
    epochRef.current++;
    for (const task of tasksRef.current.values()) { task.ownerController?.abort(); task.controller?.abort(); task.file = null; task.candidateFile = null; task.client = null; }
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
    let retries = task.retryAttempts || 0;
    const check = () => { if (!alive(task) || task.ownerController?.signal.aborted || task.controller.signal.aborted) throw new MultipartUploadError('ABORTED'); };
    const allowed = () => {
      check();
      if (task.strategy === 'multipart' && (offlineRef.current || globalThis.navigator?.onLine === false)) throw new MultipartUploadError('OFFLINE');
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
        if (task.reconnect) { task.reconnect = false; await optionsRef.current.waitForRetry(Math.max(0, retries - 1), task.controller.signal); check(); }
        if (task.strategy === 'multipart' && (offlineRef.current || globalThis.navigator?.onLine === false)) throw new MultipartUploadError('OFFLINE');
        const cooldown = (task.retryAfterUntil || 0) - Date.now();
        if (cooldown > 300000) throw new MultipartUploadError('RATE_LIMITED', 429, cooldown);
        if (cooldown > 0) { await optionsRef.current.waitForRetry(0, task.controller.signal, cooldown); check(); }
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
          await task.acquireTransfer?.(task.transferId); check();
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
        if (error?.retryAfterMs > 0) task.retryAfterUntil = Date.now() + error.retryAfterMs;
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
        if (task.strategy === 'multipart' && (error?.code === 'OFFLINE' || (task.networkInterrupted && error?.code === 'ABORTED'))) {
          task.networkInterrupted = false;
          task.networkResume = !task.intent && !task.mode && Boolean(task.file) && Boolean(task.started || task.transferId);
          update(task, { status: 'waiting_network', error: null });
          return;
        }
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
        if (task.strategy === 'multipart' && !handling && TRANSIENT.has(error?.code) && retries < MAX_RETRIES && !(error.retryAfterMs > 300000)) {
          update(task, { status: 'recovering_connection', error: errorMessage(error) });
          try { task.retryAttempts = ++retries; await optionsRef.current.waitForRetry(retries - 1, task.controller.signal, error.retryAfterMs); }
          catch {
            if (!alive(task)) return;
            if (task.permissionRevoked) {
              task.permissionRevoked = false; writeBlockedRef.current = true;
              update(task, { status: 'error', retryable: false, error: errorMessage({ code: 'PERMISSION_REVOKED' }), errorCode: 'PERMISSION_REVOKED' });
              return;
            }
            if (task.networkInterrupted) { task.networkInterrupted = false; task.networkResume = !task.intent && Boolean(task.file) && Boolean(task.started || task.transferId); update(task, { status: 'waiting_network', error: null }); return; }
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
      task.ownerController = new AbortController();
      const ownedRun = async () => {
        if (task.strategy !== 'multipart') return run(task);
        const releases = [];
        const held = [];
        task.acquireTransfer = async transferId => {
          let ready, failed;
          const acquired = new Promise((resolve, reject) => { ready = resolve; failed = reject; });
          const heldLock = withUploadOwnership({ userScope: task.userScope, identity: `transfer:${transferId}`,
            signal: task.ownerController.signal, onWaiting: () => update(task, { status: 'other_tab' }) },
          () => new Promise(resolve => { releases.push(resolve); ready(); }));
          heldLock.catch(failed);
          held.push(heldLock);
          await acquired;
        };
        try {
          return await withUploadOwnership({ userScope: task.userScope, identity: `create:${task.key}`,
            signal: task.ownerController.signal, onWaiting: () => update(task, { status: 'other_tab' }) }, async () => {
            if (task.transferId) await task.acquireTransfer(task.transferId);
            if (!alive(task)) return;
            try { await withUploadBudget(task.ownerController.signal, () => run(task)); }
            finally { await task.persistenceTail; }
          });
        } catch (error) {
          if (alive(task) && error.code !== 'ABORTED' && error.name !== 'AbortError') update(task, {
            status: 'waiting_ownership', retryable: false,
            error: 'Exclusive ownership cannot be proven. Use a browser with Web Locks support to continue.' });
        } finally {
          for (const release of releases) release();
          await Promise.allSettled(held);
          task.acquireTransfer = null;
        }
      };
      void ownedRun().finally(() => {
        if (!alive(task)) return;
        activeRef.current.delete(task.id); task.controller = null;
        queueMicrotask(() => { processRef.current?.(); if (!offlineRef.current) recoverNetworkRef.current?.(); });
      });
    }
  }, [alive, run, update]);
  useLayoutEffect(() => { processRef.current = processQueue; queueMicrotask(processQueue); }, [processQueue, concurrency]);

  const enqueue = useCallback(task => {
    if (!alive(task) || activeRef.current.has(task.id) || pendingRef.current.includes(task)) return;
    pendingRef.current.push(task);
    queueMicrotask(() => processRef.current?.());
  }, [alive]);

  useEffect(() => {
    const offline = () => {
      offlineRef.current = true;
      for (const task of activeRef.current.values()) {
        if (task.strategy !== 'multipart') continue;
        task.networkInterrupted = true;
        task.controller?.abort();
      }
    };
    const online = () => {
      if (globalThis.navigator?.onLine === false) return;
      offlineRef.current = false;
      for (const task of tasksRef.current.values()) {
        if (task.status !== 'waiting_network' || activeRef.current.has(task.id)) continue;
        // Controls reconcile their original intent; a user pause never becomes Resume.
        if (!task.networkResume && !task.intent && !task.mode) {
          // Work queued while already offline was never an active transfer.
          // Offer explicit Resume rather than creating a session automatically.
          task.intent = 'pause';
          update(task, { status: task.file ? 'paused' : 'waiting_file', needsFile: !task.file, error: null });
          continue;
        }
        if (blockedRef.current) continue;
        if (task.intent !== 'cancel' && (writeBlockedRef.current || !optionsRef.current.canUpload(task.storageId))) {
          update(task, { status: 'error', retryable: false, error: errorMessage({ code: 'PERMISSION_REVOKED' }) });
          continue;
        }
        if ((task.retryAttempts || 0) >= MAX_RETRIES) {
          update(task, { status: 'error', retryable: true, error: 'Connection recovery exhausted. Retry connection to reconcile this session.' });
          continue;
        }
        task.retryAttempts = (task.retryAttempts || 0) + 1;
        task.networkResume = false;
        task.reconnect = true;
        update(task, { status: 'recovering_connection' }); enqueue(task);
      }
    };
    recoverNetworkRef.current = online;
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => { recoverNetworkRef.current = null; window.removeEventListener('offline', offline); window.removeEventListener('online', online); };
  }, [enqueue, update]);

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
          if (tasksRef.current.size >= MAX_QUEUE_ITEMS) break;
          let record;
          try { record = normalizeRecoveryRecord(raw); } catch { continue; }
          if (record.userScope !== recoveryScope || record.storageId !== recoveryStorageId || tasksRef.current.has(record.id)) continue;
          if ((record.transferId && transferIds.has(record.transferId)) || createKeys.has(record.idempotencyKey)) {
            void recoveryStore.remove(recoveryScope, record.id).catch(() => {});
            continue;
          }
          const selected = selectUploadStrategy(Math.min(record.sizeBytes, 5_000_000_000), 0, { resumableUpload: true, maxFileBytes: 5_000_000_000,
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
    if (!task || !alive(task) || !['recovery_error','waiting_file','file_mismatch','waiting_ownership'].includes(task.status)
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
    // Reject the whole selection before retaining Files or starting requests. Do
    // not silently upload a prefix of a selection or materialize an unbounded list.
    const selectedFiles = [];
    for (const file of files) {
      if (tasksRef.current.size + selectedFiles.length >= MAX_QUEUE_ITEMS) {
        optionsRef.current.onAdmissionError?.('Upload queue is limited to 50 files. Clear finished uploads or choose a smaller selection. No files from this selection were added.');
        return [];
      }
      selectedFiles.push(file);
    }
    const newItems = selectedFiles.map(file => {
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
      task.ownerController?.abort(); task.controller?.abort(); task.file = null;
      update(task, { status: 'cancelled', error: null });
    }
  }, [alive, update, enqueue]);

  const pauseUpload = useCallback(id => {
    const task = tasksRef.current.get(id);
    if (!task || task.strategy !== 'multipart' || !['queued', 'uploading', 'verifying', 'retry_wait', 'reconciling', 'waiting_network', 'recovering_connection', 'other_tab'].includes(task.status)) return;
    task.intent = 'pause';
    if (!task.started) { task.ownerController?.abort(); pendingRef.current = pendingRef.current.filter(pending => pending !== task); update(task, { status: 'paused' }); }
    else { update(task, { status: 'pausing' }); if (activeRef.current.has(id)) task.controller?.abort(); else enqueue(task); }
  }, [update, enqueue]);

  const resumeUpload = useCallback(id => {
    const task = tasksRef.current.get(id);
    if (!task || !task.file || task.status !== 'paused' || blockedRef.current || writeBlockedRef.current || !optionsRef.current.canUpload(task.storageId)) return;
    task.intent = null; task.resumeRequested = true; task.retryAttempts = 0;
    update(task, { status: 'resuming', error: null }); enqueue(task);
  }, [update, enqueue]);

  const retryUpload = useCallback(id => {
    const task = tasksRef.current.get(id);
    if (!task || task.status !== 'error' || !task.retryable || blockedRef.current
      || (task.intent !== 'cancel' && (writeBlockedRef.current || !optionsRef.current.canUpload(task.storageId)))) return;
    task.retryAttempts = 0;
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
