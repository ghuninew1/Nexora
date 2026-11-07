// This database is owned exclusively by Nexora upload recovery. No bytes/handles/secrets.
export const UPLOAD_RECOVERY_DB = 'nexora-upload-recovery';
export const UPLOAD_RECOVERY_VERSION = 1;
export const MAX_RECOVERY_RECORDS = 50;
const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const STATES = new Set(['queued','uploading','verifying','finalizing','pausing','paused','resuming','cancelling',
  'waiting_network','recovering_connection','other_tab','waiting_ownership','retry_wait','reconciling','error','restoring','checking_server','waiting_file','file_mismatch','recovery_error']);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const validId = value => typeof value === 'string' && ID.test(value);

export class UploadRecoveryError extends Error {
  constructor(code) { super(`Upload recovery: ${code}`); this.name = 'UploadRecoveryError'; this.code = code; }
}

export function normalizeRecoveryRecord(value) {
  const p = value;
  if (!p || p.schemaVersion !== UPLOAD_RECOVERY_VERSION || !validId(p.id) || !validId(p.userScope)
    || !validId(p.storageId) || (p.transferId !== null && !validId(p.transferId)) || !validId(p.idempotencyKey)
    || (p.parentId !== null && !validId(p.parentId)) || typeof p.name !== 'string' || !p.name.trim()
    || new TextEncoder().encode(p.name).length > 255 || /[\p{Cc}\\/]/u.test(p.name)
    || !integer(p.sizeBytes) || !p.sizeBytes || p.sizeBytes > 10 * 1024 ** 3
    || typeof p.mimeType !== 'string' || p.mimeType.length > 160 || !/^[\w.+-]+\/[\w.+-]+$/u.test(p.mimeType)
    || (p.lastModified !== null && !integer(p.lastModified)) || p.partSizeBytes !== 8 * 1024 ** 2
    || p.partCount !== Math.ceil(p.sizeBytes / p.partSizeBytes) || p.partCount > 1280
    || !integer(p.createdAt) || !integer(p.expiresAt) || p.expiresAt <= p.createdAt
    || !integer(p.updatedAt) || !STATES.has(p.lastState) || ![null,'pause','cancel'].includes(p.intent)) {
    throw new UploadRecoveryError('INVALID_RECORD');
  }
  return Object.fromEntries(['schemaVersion','id','userScope','transferId','idempotencyKey','storageId','parentId',
    'name','sizeBytes','mimeType','lastModified','partSizeBytes','partCount','createdAt','expiresAt','updatedAt','lastState','intent']
    .map(key => [key, p[key]]));
}

export function matchesOriginalFile(record, file) {
  return Boolean(file && file.name === record.name && file.size === record.sizeBytes && typeof file.slice === 'function'
    && (record.lastModified === null || file.lastModified === record.lastModified));
}

function safeError(error) {
  if (error instanceof UploadRecoveryError) return error;
  return new UploadRecoveryError(error?.name === 'QuotaExceededError' ? 'QUOTA_EXCEEDED' : 'UNAVAILABLE');
}

export function createUploadRecoveryStore({ indexedDB: factory = globalThis.indexedDB, databaseName = UPLOAD_RECOVERY_DB,
  maxRecords = MAX_RECOVERY_RECORDS, timeoutMs = 3000 } = {}) {
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > MAX_RECOVERY_RECORDS
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) throw new UploadRecoveryError('INVALID_OPTIONS');
  let opening;
  let openFailed = false;
  let chain = Promise.resolve();
  function open() {
    if (openFailed || !factory) return Promise.reject(new UploadRecoveryError('UNAVAILABLE'));
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => { settled = true; reject(new UploadRecoveryError('UNAVAILABLE')); }, timeoutMs);
      let request;
      try { request = factory.open(databaseName, UPLOAD_RECOVERY_VERSION); } catch (error) { clearTimeout(timer); reject(safeError(error)); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('uploads')) {
          db.createObjectStore('uploads', { keyPath: ['userScope','id'] }).createIndex('userScope','userScope');
        }
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        if (settled) { request.result.close(); return; }
        settled = true;
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
      request.onerror = request.onblocked = () => { clearTimeout(timer); settled = true; reject(new UploadRecoveryError('UNAVAILABLE')); };
    }).catch(error => { opening = null; openFailed = true; throw error; });
    return opening;
  }
  // Serialize mutations/reads so terminal deletion cannot be overtaken by older writes.
  function transaction(mode, operation) {
    const result = chain.then(async () => {
      const db = await open();
      return new Promise((resolve, reject) => {
        let tx, result;
        const timer = setTimeout(() => { try { tx?.abort(); } catch { /* already closed */ } reject(new UploadRecoveryError('UNAVAILABLE')); }, timeoutMs);
        try {
          tx = db.transaction('uploads', mode);
          tx.oncomplete = () => { clearTimeout(timer); resolve(result); };
          tx.onerror = tx.onabort = () => { clearTimeout(timer); reject(safeError(tx.error)); };
          operation(tx.objectStore('uploads'), value => { result = value; });
        } catch (error) { clearTimeout(timer); try { tx?.abort(); } catch { /* no transaction */ } reject(safeError(error)); }
      });
    });
    chain = result.catch(() => {});
    return result;
  }
  function requireScope(scope) { if (!validId(scope)) throw new UploadRecoveryError('INVALID_SCOPE'); }
  function prune(store, scope) {
    const request = store.index('userScope').openCursor(scope);
    const rows = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        try { rows.push({ key: cursor.primaryKey, value: normalizeRecoveryRecord(cursor.value) }); } catch { /* unknown/corrupt data is never trusted */ }
        cursor.continue(); return;
      }
      rows.sort((a,b) => b.value.updatedAt - a.value.updatedAt || a.value.id.localeCompare(b.value.id));
      for (const row of rows.slice(maxRecords)) store.delete(row.key);
    };
  }
  return {
    async save(value) {
      const record = normalizeRecoveryRecord(value);
      await transaction('readwrite', store => { store.put(record); prune(store, record.userScope); });
    },
    async list(userScope, storageId) {
      requireScope(userScope); if (!validId(storageId)) throw new UploadRecoveryError('INVALID_SCOPE');
      return transaction('readwrite', (store, done) => {
        const request = store.index('userScope').openCursor(userScope);
        const rows = [];
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { done(rows.sort((a,b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)).slice(0,maxRecords).filter(row => row.storageId === storageId)); return; }
          try {
            const row = normalizeRecoveryRecord(cursor.value);
            if (row.userScope === userScope) rows.push(row);
          } catch {
            // Only remove corrupt known-v1 records in this owner's own namespace.
            if (cursor.value?.schemaVersion === 1 && Array.isArray(cursor.primaryKey) && cursor.primaryKey[0] === userScope) cursor.delete();
          }
          cursor.continue();
        };
        prune(store, userScope);
      });
    },
    async remove(userScope, recordId) {
      requireScope(userScope); if (!validId(recordId)) throw new UploadRecoveryError('INVALID_RECORD');
      await transaction('readwrite', store => store.delete([userScope,recordId]));
    },
    async close() { await chain; if (opening) { try { (await opening).close(); } catch { /* unavailable */ } opening = null; } openFailed = false; },
  };
}

export const uploadRecoveryStore = createUploadRecoveryStore();
