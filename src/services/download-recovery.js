// Dedicated, versioned metadata store. Never stores response bytes or credentials.
export const DOWNLOAD_RECOVERY_VERSION = 1;
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
export function normalizeDownloadRecord(p) {
  if (!p || p.schemaVersion !== 1 || !['id', 'userScope', 'storageId', 'objectId'].every(key => id(p[key]))
    || typeof p.name !== 'string' || !p.name || p.name.length > 1024
    || !integer(p.size) || !integer(p.checkpoint) || p.checkpoint > p.size
    || !/^"[a-f0-9]{64}"$/u.test(p.etag || '') || !integer(p.createdAt) || !integer(p.updatedAt)
    || !['run', 'pause'].includes(p.intent) || typeof p.state !== 'string' || p.state.length > 40) throw Error('Invalid download recovery record');
  return Object.fromEntries(['schemaVersion', 'id', 'userScope', 'storageId', 'objectId', 'name', 'size', 'etag',
    'checkpoint', 'handle', 'createdAt', 'updatedAt', 'intent', 'state'].map(key => [key, p[key]]));
}
export function createDownloadRecoveryStore({ indexedDB = globalThis.indexedDB, databaseName = 'nexora-download-recovery' } = {}) {
  let opening, chain = Promise.resolve();
  const open = () => opening ??= new Promise((resolve, reject) => {
    if (!indexedDB) { reject(Error('Download recovery storage unavailable')); return; }
    const request = indexedDB.open(databaseName, DOWNLOAD_RECOVERY_VERSION);
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(Error('Download recovery storage timeout')); }, 3000);
    request.onblocked = () => { expired = true; clearTimeout(timer); reject(Error('Download recovery storage blocked')); };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('downloads')) request.result.createObjectStore('downloads', { keyPath: ['userScope', 'id'] }).createIndex('owner', 'userScope');
    };
    request.onerror = () => { clearTimeout(timer); reject(Error('Download recovery storage unavailable')); };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (expired) { request.result.close(); return; }
      request.result.onversionchange = () => { request.result.close(); opening = null; };
      resolve(request.result);
    };
  }).catch(error => { opening = null; throw error; });
  const transaction = (mode, action) => {
    const result = chain.then(async () => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('downloads', mode);
        let result;
        const timer = setTimeout(() => { tx.abort(); }, 3000);
        tx.oncomplete = () => { clearTimeout(timer); resolve(result); };
        tx.onerror = tx.onabort = () => { clearTimeout(timer); reject(Error('Download recovery storage unavailable')); };
        try { action(tx.objectStore('downloads'), value => { result = value; }); } catch { tx.abort(); }
      });
    });
    chain = result.catch(() => {});
    return result;
  };
  return {
    isAvailable: () => Boolean(indexedDB),
    save(value) {
      const record = normalizeDownloadRecord(value);
      return transaction('readwrite', store => {
        store.put(record);
        const rows = [], request = store.index('owner').openCursor(record.userScope);
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            try { rows.push(normalizeDownloadRecord(cursor.value)); } catch { /* Preserve future schemas. */ }
            cursor.continue(); return;
          }
          rows.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
          for (const row of rows.slice(50)) store.delete([row.userScope, row.id]);
        };
      });
    },
    list(userScope, storageId) {
      if (!id(userScope) || !id(storageId)) return Promise.resolve([]);
      return transaction('readonly', (store, done) => {
        const rows = [], request = store.index('owner').openCursor(userScope);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { done(rows.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50)); return; }
          try { const row = normalizeDownloadRecord(cursor.value); if (row.userScope === userScope && row.storageId === storageId) rows.push(row); } catch { /* Unknown/corrupt schemas fail closed. */ }
          cursor.continue();
        };
      });
    },
    remove(userScope, recordId) {
      if (!id(userScope) || !id(recordId)) return Promise.resolve();
      return transaction('readwrite', store => store.delete([userScope, recordId]));
    },
  };
}
export const downloadRecoveryStore = createDownloadRecoveryStore();

// Compare the entire committed prefix against the original authenticated representation.
// Bounded local slices, no whole-file buffer and no assumption that equal sizes imply equal bytes.
export async function verifyDownloadPrefix(file, response, checkpoint, meta, check = () => {}) {
  if (file.size !== checkpoint || checkpoint > meta.size) throw Error('Destination size differs from the committed checkpoint.');
  if (!checkpoint) return;
  if (response.status !== 206 || response.headers.get('ETag') !== meta.etag
    || response.headers.get('Content-Range') !== `bytes 0-${checkpoint - 1}/${meta.size}`
    || response.headers.get('Content-Length') !== String(checkpoint)
    || (response.headers.has('Content-Encoding') && response.headers.get('Content-Encoding') !== 'identity') || !response.body) throw Error('Original file bytes could not be verified.');
  const reader = response.body.getReader();
  let offset = 0;
  try {
    while (true) {
      check();
      const { value, done } = await reader.read();
      check();
      if (done) break;
      if (!(value instanceof Uint8Array) || offset + value.length > checkpoint) throw Error('Invalid verification response.');
      for (let start = 0; start < value.length; start += 65536) {
        const part = value.subarray(start, start + 65536);
        const local = new Uint8Array(await file.slice(offset, offset + part.length).arrayBuffer());
        check();
        if (local.length !== part.length || local.some((byte, index) => byte !== part[index])) throw Error('Destination content differs from the original file.');
        offset += part.length;
      }
    }
    if (offset !== checkpoint) throw Error('Incomplete destination verification.');
  } finally { await reader.cancel().catch(() => {}); }
}
