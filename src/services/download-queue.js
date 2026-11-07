import { storageObjectDownloadUrl } from './storage.js';
import { verifyDownloadPrefix } from './download-recovery.js';

const MESSAGES = {
  NETWORK_INTERRUPTION: 'Connection interrupted. Resume uses only bytes already written.',
  INCOMPLETE: 'The response ended before all expected bytes arrived.',
  COOLDOWN: 'Storage requested a longer cooldown. Try again later.',
  TIMEOUT: 'The download stopped responding. Retry when the connection is ready.',
  AUTHENTICATION: 'Your session has expired. Sign in again.',
  PERMISSION: 'Download permission is no longer available.',
  UNAVAILABLE: 'The file or storage is no longer available.',
  INVALID_RESPONSE: 'The download response could not be verified. Restart is required.',
  FILE_CHANGED: 'The file version changed. Restart is required; previous temporary bytes were discarded.',
  RANGE_UNSATISFIABLE: 'The resume offset could not be verified. Restart is required.',
  WRITE_FAILED: 'Writing to disk failed. Check the destination; retry starts from zero.',
  DESTINATION_BUSY: 'This destination is already reserved by another download. Choose another file.',
  DESTINATION_UNAVAILABLE: 'The selected destination is unavailable. Retry or use browser download.',
  RECOVERY: 'Recovery needs destination access and verified original bytes. Use browser download for a new copy if recovery is unavailable.',
  OWNERSHIP: 'Another tab owns managed downloads. Close that workspace tab before recovering here.',
  LIMIT: 'Clear finished downloads before adding more (maximum 50).',
};
class DownloadError extends Error {
  constructor(code, retryable = false, retryAfterMs = 0) {
    super(MESSAGES[code] || MESSAGES.UNAVAILABLE);
    this.code = code; this.retryable = retryable; this.retryAfterMs = retryAfterMs;
  }
}
const terminal = status => ['success', 'cancelled', 'native'].includes(status);
const numberHeader = value => /^(0|[1-9]\d*)$/u.test(value || '') && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const validTag = value => /^"[a-f0-9]{64}"$/u.test(value || '');
export function supportsManagedDownloads(environment = globalThis) {
  return environment.isSecureContext === true && typeof environment.showSaveFilePicker === 'function'
    && typeof environment.ReadableStream === 'function';
}
function metadata(response) {
  const size = numberHeader(response.headers.get('Content-Length'));
  const etag = response.headers.get('ETag');
  if (response.status !== 200 || size === null || !validTag(etag)
    || response.headers.get('Accept-Ranges') !== 'bytes' || response.headers.has('Content-Range')
    || (response.headers.has('Content-Encoding') && response.headers.get('Content-Encoding') !== 'identity')) throw new DownloadError('INVALID_RESPONSE');
  return { size, etag };
}
function httpError(response) {
  if (response.status === 401) return new DownloadError('AUTHENTICATION');
  if ([403, 422].includes(response.status)) return new DownloadError('PERMISSION');
  const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
  const retryAfter = response.headers.get('Retry-After');
  const seconds = /^\d+$/u.test(retryAfter || '') ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now());
  return new DownloadError('UNAVAILABLE', retryable, Number.isNaN(seconds) ? 0 : Math.min(Number.MAX_SAFE_INTEGER, seconds));
}

// One streaming queue. React snapshots contain only safe primitives. Destination
// handles may enter the versioned recovery store; writers/readers/controllers stay private.
export function createDownloadQueue({
  fetchImpl = (...args) => fetch(...args),
  pickFile = options => globalThis.showSaveFilePicker(options),
  nativeDownload, onUnauthorized = () => {},
  concurrency = 2, online = globalThis.navigator?.onLine !== false,
  now = () => Date.now(), random = Math.random,
  setTimer = setTimeout, clearTimer = clearTimeout,
  recoveryStore, userScope, storageId: recoveryStorageId, locks = globalThis.navigator?.locks,
  checkpointBytes = 32 * 1024 ** 2,
  connectionTimeoutMs = 30_000, idleTimeoutMs = 60_000,
} = {}) {
  const tasks = new Map(), listeners = new Set();
  let snapshot = [], enabled = false, rangeEnabled = false, closed = false, admission = Promise.resolve(), lastPublish = 0;
  let maxConcurrency = [1, 2, 3, 5].includes(concurrency) ? concurrency : 2;
  let releaseOwnership, ownershipPending, ownsRecovery = false, generation = 0, recoveryWarning = null;
  const durable = Boolean(recoveryStore && recoveryStore.isAvailable?.() !== false && userScope && recoveryStorageId && locks?.request);
  const own = () => {
    if (!durable || ownsRecovery) return Promise.resolve(true);
    if (ownershipPending) return ownershipPending;
    const epoch = generation;
    ownershipPending = new Promise(resolve => {
      void locks.request('nexora-download-writer', { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock || closed || generation !== epoch) { resolve(false); return; }
        ownsRecovery = true;
        await new Promise(release => { releaseOwnership = release; resolve(true); });
        ownsRecovery = false;
      }).catch(() => resolve(false));
    }).finally(() => { ownershipPending = null; });
    return ownershipPending;
  };
  const removeRecord = async task => {
    if (!durable || !task.meta) return true;
    try { await recoveryStore.remove(userScope, task.id); task.recoveryWarning = null; return true; }
    catch { task.recoveryWarning = 'Recovery history could not be removed. Retry Cancel or Clear before leaving.'; return false; }
  };
  const saveRecord = async task => {
    if (!durable || !ownsRecovery || !task.meta || !task.handle || !current(task) || task.intent === 'cancel') return;
    try {
      await recoveryStore.save({ schemaVersion: 1, id: task.id, userScope, storageId: task.storageId, objectId: task.objectId,
        name: task.name, size: task.meta.size, etag: task.meta.etag, checkpoint: task.checkpoint ?? 0, handle: task.handle,
        createdAt: task.createdAt, updatedAt: now(), intent: task.intent === 'pause' ? 'pause' : 'run', state: task.status });
      task.recoveryWarning = null;
    } catch { task.recoveryWarning = 'Durable recovery unavailable: destination handle or metadata could not be saved.'; }
  };
  const current = task => !closed && tasks.get(task.id) === task;
  const publish = (force = true) => {
    if (!force && now() - lastPublish < 100) return;
    lastPublish = now();
    snapshot = [...tasks.values()].map(t => ({ id: t.id, name: t.name, storageId: t.storageId,
      status: t.status, sizeBytes: t.meta?.size ?? t.initialSize, writtenBytes: t.offset, receivedBytes: t.received,
      bytesPerSecond: t.status === 'downloading' ? t.speed : null,
      etaSeconds: t.status === 'downloading' && t.speed > 0 ? (t.meta.size - t.offset) / t.speed : null,
      recoverable: Boolean(t.recovering), recoveryWarning: t.recoveryWarning ?? null,
      error: t.error?.message ?? null, errorCode: t.error?.code ?? null, restartRequired: t.restartRequired,
      native: t.mode === 'native', busy: t.running || Boolean(t.nativeStarting), retryable: t.status === 'error' || t.status === 'cancelled',
    }));
    listeners.forEach(listener => listener());
  };
  const status = (task, value) => { task.status = value; if (value !== 'downloading') task.speed = null; if (current(task)) publish(); };
  const interrupt = task => {
    task.controller?.abort();
    void task.reader?.cancel().catch(() => {});
    if (task.retryTimer) clearTimer(task.retryTimer);
    task.retryTimer = null;
  };
  const discard = async task => {
    const writer = task.writer;
    task.writer = null;
    try { await writer?.abort(); } catch { /* A failed writable is already unusable; never reuse its offset. */ }
    task.offset = 0; task.meta = null; task.speed = null;
  };
  const runnable = task => current(task) && enabled && rangeEnabled && online && task.intent === 'run';
  const check = task => { if (!runnable(task) || task.controller?.signal.aborted) throw new DownloadError('NETWORK_INTERRUPTION', true); };
  const request = async (task, method, headers = {}) => {
    let response;
    const timer = setTimer(() => { task.timedOut = true; interrupt(task); }, connectionTimeoutMs);
    try {
      response = await fetchImpl(storageObjectDownloadUrl(task.storageId, task.objectId), {
        method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/octet-stream', ...headers }, signal: task.controller.signal,
      });
      check(task);
      if (response.status !== 200 && response.status !== 206 && response.status !== 416) throw httpError(response);
      return response;
    } catch (error) {
      void response?.body?.cancel().catch(() => {});
      if (error instanceof DownloadError) throw error;
      throw new DownloadError('NETWORK_INTERRUPTION', true);
    } finally { clearTimer(timer); }
  };
  const finishCancel = async task => {
    if (durable && task.meta && !await own()) { task.intent = 'pause'; task.error = new DownloadError('OWNERSHIP'); status(task, 'error'); return; }
    if (!await removeRecord(task)) { task.error = new DownloadError('RECOVERY'); status(task, 'error'); return; }
    await discard(task); task.handle = null; task.recovering = false; task.checkpoint = 0; task.error = null; task.restartRequired = false;
    if (current(task)) status(task, 'cancelled');
  };
  const finalize = async task => {
    check(task);
    try {
      await task.writer.truncate(task.meta.size);
      check(task);
      // Commit boundary: Pause/Cancel are unavailable while close is committing.
      status(task, 'finalizing');
      check(task);
      await task.writer.close();
      task.writer = null; task.handle = null;
      await removeRecord(task);
      if (current(task)) status(task, 'success');
    } catch (error) {
      if (!runnable(task) || task.controller.signal.aborted) throw error;
      throw new DownloadError('WRITE_FAILED');
    }
  };
  const checkpoint = async task => {
    if (!durable || !ownsRecovery || !task.writer || !current(task) || task.intent === 'cancel') return;
    // Geometric spacing bounds keepExistingData copy amplification for large files.
    // Commit only acknowledged contiguous writes. The next temporary writer preserves this prefix.
    const writer = task.writer;
    task.writer = null;
    try { await writer.truncate(task.offset); await writer.close(); }
    catch { await writer.abort().catch(() => {}); throw new DownloadError('WRITE_FAILED'); }
    task.checkpoint = task.offset; task.recovering = true;
    await saveRecord(task);
  };
  async function transfer(task) {
    let response, idleTimer;
    const arm = () => { clearTimer(idleTimer); idleTimer = setTimer(() => { task.timedOut = true; interrupt(task); }, idleTimeoutMs); };
    try {
      if (durable && !await own()) throw new DownloadError('OWNERSHIP');
      check(task);
      status(task, 'checking');
      response = await request(task, 'HEAD');
      const next = metadata(response);
      void response.body?.cancel().catch(() => {});
      if (task.meta && (next.etag !== task.meta.etag || next.size !== task.meta.size)) throw new DownloadError('FILE_CHANGED');
      task.meta = next;
      if (task.recovering) {
        if (!task.handle || typeof task.handle.getFile !== 'function') throw new DownloadError('RECOVERY');
        try {
          const local = await task.handle.getFile();
          if (local.size !== task.checkpoint) throw new DownloadError('RECOVERY');
          if (task.checkpoint > 0) {
            const proof = await request(task, 'GET', { Range: `bytes=0-${task.checkpoint - 1}`, 'If-Range': task.meta.etag });
            let timer;
            const verifyCheck = () => { check(task); clearTimer(timer); timer = setTimer(() => { task.timedOut = true; interrupt(task); }, idleTimeoutMs); };
            try { await verifyDownloadPrefix(local, proof, task.checkpoint, task.meta, verifyCheck); }
            finally { clearTimer(timer); void proof.body?.cancel().catch(() => {}); }
          }
          check(task);
          task.offset = task.checkpoint;
        } catch (error) { if (error instanceof DownloadError) throw error; throw new DownloadError('RECOVERY'); }
      }
      await saveRecord(task);
      if (!task.writer) {
        if (task.offset !== 0 && !(durable && task.checkpoint === task.offset)) throw new DownloadError('WRITE_FAILED');
        try { task.writer = await task.handle.createWritable({ keepExistingData: Boolean(durable && (task.recovering || task.checkpoint > 0)), mode: 'exclusive' }); }
        catch { throw new DownloadError('DESTINATION_UNAVAILABLE'); }
      }
      task.recovering = false;
      check(task);
      const offset = task.offset;
      response = await request(task, 'GET', offset > 0 ? { Range: `bytes=${offset}-`, 'If-Range': task.meta.etag } : {});
      const length = numberHeader(response.headers.get('Content-Length'));
      const etag = response.headers.get('ETag');
      if (response.headers.get('Accept-Ranges') !== 'bytes' || !validTag(etag)
        || (response.headers.has('Content-Encoding') && response.headers.get('Content-Encoding') !== 'identity')) throw new DownloadError('INVALID_RESPONSE');
      if (etag !== task.meta.etag) throw new DownloadError('FILE_CHANGED');
      if (response.status === 416) {
        if (offset > 0 && offset === task.meta.size && length === 0 && response.headers.get('Content-Range') === `bytes */${task.meta.size}`) {
          void response.body?.cancel().catch(() => {}); await finalize(task); return;
        }
        throw new DownloadError('RANGE_UNSATISFIABLE');
      }
      if (length !== task.meta.size - offset || (offset > 0
        ? response.status !== 206 || response.headers.get('Content-Range') !== `bytes ${offset}-${task.meta.size - 1}/${task.meta.size}`
        : response.status !== 200 || response.headers.has('Content-Range'))) throw new DownloadError('INVALID_RESPONSE');
      if (!response.body) {
        if (length === 0 && task.meta.size === 0) { await finalize(task); return; }
        throw new DownloadError('INCOMPLETE', true);
      }
      task.reader = response.body.getReader();
      let received = 0;
      const rateStart = now(), rateBytes = offset;
      status(task, 'downloading');
      while (true) {
        arm();
        const { value, done } = await task.reader.read();
        check(task);
        if (done) {
          if (received !== length) throw new DownloadError('INCOMPLETE', true);
          break;
        }
        if (!(value instanceof Uint8Array) || received + value.byteLength > length) throw new DownloadError('INVALID_RESPONSE');
        received += value.byteLength; task.received += value.byteLength;
        publish(false);
        try { await task.writer.write({ type: 'write', position: task.offset, data: value }); }
        catch { throw new DownloadError('WRITE_FAILED'); }
        // Even if Pause/offline happened during write, a fulfilled write is known.
        task.offset += value.byteLength;
        const elapsed = now() - rateStart;
        task.speed = elapsed >= 1000 ? (task.offset - rateBytes) * 1000 / elapsed : null;
        publish(false);
        check(task);
        if (durable && task.offset < task.meta.size && task.offset >= Math.max(checkpointBytes, 2 * (task.checkpoint ?? 0))) {
          await checkpoint(task); check(task);
          try { task.writer = await task.handle.createWritable({ keepExistingData: true, mode: 'exclusive' }); task.recovering = false; }
          catch { throw new DownloadError('DESTINATION_UNAVAILABLE'); }
        }
      }
      clearTimer(idleTimer);
      await finalize(task);
    } finally {
      clearTimer(idleTimer);
      if (task.reader) { await task.reader.cancel().catch(() => {}); task.reader = null; }
      else void response?.body?.cancel().catch(() => {});
    }
  }
  function schedule() {
    if (closed || !enabled || !rangeEnabled || !online) return;
    let slots = maxConcurrency - [...tasks.values()].filter(t => t.running).length;
    for (const task of tasks.values()) {
      if (slots <= 0) break;
      if (task.status !== 'queued' || task.running || task.intent !== 'run') continue;
      if (task.retryAt > now()) { wait(task); continue; }
      slots--; task.running = true;
      task.settled = worker(task);
    }
  }
  function wait(task) {
    if (task.retryTimer || !current(task)) return;
    if (online) {
      status(task, 'retry_wait');
      task.retryTimer = setTimer(() => {
        task.retryTimer = null;
        if (runnable(task)) { status(task, 'queued'); schedule(); }
      }, Math.max(0, task.retryAt - now()));
    } else status(task, 'waiting_network');
  }
  async function worker(task) {
    task.controller = new AbortController(); task.timedOut = false; task.error = null;
    try { await transfer(task); }
    catch (cause) {
      if (!current(task)) { await discard(task); return; }
      if (task.intent === 'cancel') { await finishCancel(task); return; }
      // A rejected write makes its offset uncertain, including during Pause/offline.
      const error = cause instanceof DownloadError ? cause : new DownloadError('NETWORK_INTERRUPTION', true);
      const fatal = !error.retryable;
      if (fatal) {
        if (durable) {
          const meta = task.meta; await discard(task); task.meta = meta; task.offset = task.checkpoint ?? 0; task.recovering = true; task.restartRequired = false;
        } else { await discard(task); task.restartRequired = true; }
        task.error = error;
        if (task.intent === 'pause') { status(task, 'error'); return; }
      }
      if (task.intent === 'pause') {
        try { await checkpoint(task); if (durable && !task.writer) task.recovering = true; await saveRecord(task); status(task, 'paused'); }
        catch { task.error = new DownloadError('WRITE_FAILED'); status(task, 'error'); }
        return;
      }
      if (!enabled) { task.error = new DownloadError('PERMISSION'); status(task, 'error'); return; }
      if (error.code === 'AUTHENTICATION') { status(task, 'error'); onUnauthorized(); return; }
      if (!fatal && task.attempts < 2 && error.retryAfterMs <= 300_000) {
        task.attempts++;
        task.error = null;
        task.retryAt = now() + Math.max(error.retryAfterMs, Math.min(10_000, 500 * 2 ** (task.attempts - 1)) * (0.5 + 0.5 * random()));
        wait(task);
      } else {
        task.retryAt = Math.min(Number.MAX_SAFE_INTEGER, now() + error.retryAfterMs);
        task.error = task.timedOut ? new DownloadError('TIMEOUT', true) : error;
        status(task, 'error');
      }
    } finally {
      task.controller?.abort(); task.controller = null; task.running = false;
      if (!current(task)) { if (task.status !== 'success') await discard(task); task.handle = null; }
      else {
        if (task.intent === 'cancel' && task.status !== 'cancelled' && task.status !== 'success') await finishCancel(task);
        publish(); schedule();
      }
    }
  }
  const choose = task => {
    // Invoke directly in the click's activation, before any network or await.
    let selection;
    try { selection = pickFile({ suggestedName: task.name }); }
    catch (error) { selection = Promise.reject(error); }
    return Promise.resolve(selection).then(handle => {
      const admit = async () => {
        if (!current(task) || task.intent === 'cancel') return;
        if (!handle || typeof handle.createWritable !== 'function' || typeof handle.isSameEntry !== 'function') throw new DownloadError('DESTINATION_UNAVAILABLE');
        for (const other of tasks.values()) {
          if (other !== task && other.handle && !terminal(other.status)
            && (handle === other.handle || await handle.isSameEntry(other.handle))) throw new DownloadError('DESTINATION_BUSY');
        }
        if (!current(task) || task.intent === 'cancel') return;
        task.handle = handle;
        if (durable && !await own()) throw new DownloadError('OWNERSHIP');
        status(task, task.intent === 'pause' ? 'paused' : !online ? 'waiting_network' : 'queued');
        schedule();
      };
      const pending = admission.then(admit);
      admission = pending.catch(() => {});
      return pending;
    }).catch(error => {
      if (!current(task)) return;
      if (error?.name === 'AbortError') { task.intent = 'cancel'; status(task, 'cancelled'); }
      else { task.error = error instanceof DownloadError ? error : new DownloadError('DESTINATION_UNAVAILABLE'); status(task, 'error'); }
    });
  };
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    getConcurrency: () => maxConcurrency,
    getRecoveryWarning: () => recoveryWarning,
    supportsRecovery: () => durable,
    activate() { closed = false; },
    async restore() {
      if (!durable || closed || !enabled || !rangeEnabled) return;
      const epoch = generation;
      let records;
      try { records = await recoveryStore.list(userScope, recoveryStorageId); } catch {
        if (!closed && epoch === generation) { recoveryWarning = 'Saved downloads could not be read. Recovery is unavailable; keep this page open for new downloads.'; publish(); }
        return;
      }
      recoveryWarning = null;
      if (closed || epoch !== generation) return;
      for (const record of records) {
        if (tasks.size >= 50 || tasks.has(record.id)) continue;
        tasks.set(record.id, { id: record.id, storageId: record.storageId, objectId: record.objectId, name: record.name, initialSize: record.size,
          meta: { size: record.size, etag: record.etag }, checkpoint: record.checkpoint, offset: record.checkpoint, handle: record.handle,
          createdAt: record.createdAt, status: 'paused', intent: 'pause', recovering: true, mode: 'managed', received: 0, attempts: 0, retryAt: 0,
          running: false, writer: null, error: null, restartRequired: false });
      }
      publish();
    },
    setEnabled(value, { rangeRead = false } = {}) {
      enabled = Boolean(value); rangeEnabled = rangeRead === true;
      if (!enabled || !rangeEnabled) for (const task of tasks.values()) {
        if (terminal(task.status) || task.status === 'finalizing' || task.intent === 'cancel') continue;
        task.intent = 'pause'; interrupt(task); task.error = new DownloadError('PERMISSION');
        if (!task.running) status(task, 'error'); else status(task, 'pausing');
      }
      schedule();
    },
    setConcurrency(value) { if ([1, 2, 3, 5].includes(value)) { maxConcurrency = value; publish(); schedule(); } },
    setOnline(value) {
      online = Boolean(value);
      for (const task of tasks.values()) {
        if (terminal(task.status) || task.status === 'finalizing' || task.intent !== 'run' || task.status === 'choosing' || task.status === 'error') continue;
        if (!online) { interrupt(task); status(task, 'waiting_network'); }
        else if (!task.running) { status(task, 'queued'); schedule(); }
      }
    },
    start(file, { managed = true } = {}) {
      if (closed || !enabled) return Promise.resolve({ error: 'PERMISSION' });
      if (tasks.size >= 50) return Promise.resolve({ error: 'LIMIT' });
      // Validate logical IDs before opening a destination or initiating I/O.
      if (!file || ![file.storageId, file.objectId].every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(id))) return Promise.resolve({ error: 'UNAVAILABLE' });
      const task = { id: crypto.randomUUID(), storageId: file.storageId, objectId: file.objectId, name: String(file.name || 'download'),
        createdAt: now(), checkpoint: 0, initialSize: Number.isSafeInteger(file.sizeBytes) ? file.sizeBytes : null, meta: null, offset: 0, received: 0, speed: null,
        mode: managed && rangeEnabled ? 'managed' : 'native', handle: null, writer: null, reader: null, running: false, intent: 'run', status: 'choosing', error: null, attempts: 0, retryAt: 0, restartRequired: false };
      tasks.set(task.id, task); publish();
      if (!managed || !rangeEnabled) return this.useNative(task.id);
      return choose(task).then(() => ({ id: task.id, managed: true }));
    },
    pause(id) {
      const task = tasks.get(id);
      if (!task || terminal(task.status) || ['error', 'finalizing', 'cancelling'].includes(task.status)) return;
      task.intent = 'pause'; interrupt(task); status(task, task.running ? 'pausing' : 'paused');
    },
    resume(id) {
      const task = tasks.get(id);
      if (!task || !enabled || !rangeEnabled || task.running || task.nativeStarting || !['paused', 'error', 'cancelled'].includes(task.status)) return;
      if (task.retryAt - now() > 300_000) { task.error = new DownloadError('COOLDOWN'); status(task, 'error'); return; }
      if (task.recovering) {
        task.intent = 'pause';
        // Permission request must begin in the user's click activation. Never invoke a new save picker here.
        let permission;
        try { permission = task.handle?.requestPermission?.({ mode: 'readwrite' }) ?? task.handle?.queryPermission?.({ mode: 'readwrite' }); }
        catch { permission = Promise.resolve('denied'); }
        task.running = true; status(task, 'checking');
        return Promise.resolve(permission).then(async grant => {
          if (!current(task) || task.intent === 'cancel') return;
          if (grant !== 'granted' || !enabled || !rangeEnabled) { task.error = new DownloadError('RECOVERY'); status(task, 'paused'); return; }
          if (!await own() || !current(task)) { task.error = new DownloadError('OWNERSHIP'); status(task, 'paused'); return; }
          task.intent = 'run'; task.attempts = 0; task.error = null; status(task, online ? 'queued' : 'waiting_network');
        }).catch(() => { if (current(task)) { task.error = new DownloadError('RECOVERY'); status(task, 'paused'); } })
          .finally(() => { task.running = false; if (current(task)) { if (task.intent === 'cancel') void finishCancel(task); publish(); schedule(); } });
      }
      task.mode = 'managed'; task.intent = 'run'; task.attempts = 0; task.error = null; task.restartRequired = false;
      if (!task.handle) { status(task, 'choosing'); return choose(task); }
      status(task, online ? 'queued' : 'waiting_network'); schedule();
    },
    cancel(id) {
      const task = tasks.get(id);
      if (!task || terminal(task.status) || task.status === 'finalizing') return;
      task.intent = 'cancel'; interrupt(task); status(task, 'cancelling');
      if (!task.running) return finishCancel(task);
    },
    async useNative(id) {
      const task = tasks.get(id);
      if (!task || !enabled || task.running || task.nativeStarting || task.status === 'finalizing' || task.status === 'success') return;
      const wasRecovering = task.recovering;
      task.recovering = false; task.nativeStarting = true; task.mode = 'native'; task.intent = 'cancel';
      interrupt(task); status(task, 'opening_native');
      try {
        if (durable && task.meta && !await own()) throw new DownloadError('OWNERSHIP');
        if (!await removeRecord(task)) throw new DownloadError('RECOVERY');
        await discard(task); task.handle = null;
        if (!current(task) || !enabled) return;
        task.controller = new AbortController();
        await nativeDownload(task.storageId, task.objectId, { signal: task.controller.signal });
        if (!current(task) || !enabled || task.controller.signal.aborted) return;
        task.handle = null; task.error = null;
        status(task, 'native');
        return { id, native: true };
      } catch (error) {
        if (!current(task) || task.controller?.signal.aborted) return;
        task.recovering = Boolean(wasRecovering && task.meta);
        task.error = error instanceof DownloadError ? error : new DownloadError(error?.status === 401 ? 'AUTHENTICATION' : 'UNAVAILABLE');
        status(task, 'error'); if (error?.status === 401) onUnauthorized();
      } finally {
        task.nativeStarting = false; task.controller?.abort(); task.controller = null;
        if (current(task)) publish();
      }
    },
    async clearFinished() {
      for (const task of tasks.values()) {
        if (task.running || task.nativeStarting || !['success', 'cancelled', 'error', 'native'].includes(task.status)) continue;
        if (durable && task.meta && !await own()) { task.error = new DownloadError('OWNERSHIP'); continue; }
        task.intent = 'cancel'; interrupt(task); if (!await removeRecord(task)) continue; await discard(task); task.handle = null;
        if (tasks.get(task.id) === task) tasks.delete(task.id);
      }
      publish();
    },
    dispose() {
      closed = true; enabled = false; generation++;
      const release = releaseOwnership; releaseOwnership = null; ownsRecovery = false;
      const pending = [];
      for (const task of tasks.values()) {
        task.intent = 'cancel'; interrupt(task);
        pending.push(task.running ? task.settled : discard(task));
      }
      tasks.clear(); publish();
      return Promise.allSettled(pending).finally(() => { release?.(); });
    },
  };
}
