import test from 'node:test';
import assert from 'node:assert/strict';
import { createDownloadRecoveryStore, normalizeDownloadRecord, verifyDownloadPrefix } from '../src/services/download-recovery.js';
import { createDownloadQueue } from '../src/services/download-queue.js';
import { memoryIndexedDB } from './helpers/memory-indexeddb.js';
const tag = '"' + 'a'.repeat(64) + '"';
const record = patch => ({ schemaVersion: 1, id: 'download_a', userScope: 'user_a', storageId: 'mount_a', objectId: 'object_a', name: 'file.bin', size: 10,
  etag: tag, checkpoint: 3, handle: null, createdAt: 1, updatedAt: 2, intent: 'pause', state: 'paused', ...patch });
const tick = () => new Promise(resolve => setTimeout(resolve, 1));
async function until(fn) { for (let i = 0; i < 1500; i++) { if (fn()) return; await tick(); } assert.fail('Timed out'); }
const headers = { 'Content-Length': '10', 'Accept-Ranges': 'bytes', ETag: tag };
function locks() {
  let busy = false;
  return { async request(name, options, callback) { assert.equal(name, 'nexora-download-writer'); assert.equal(options.ifAvailable, true);
    if (busy) return callback(null); busy = true; try { return await callback({ name }); } finally { busy = false; } } };
}
function fixture({ permission = 'granted', local = '012', checkpoint = 3, version = tag, missing = false, suppliedLocks = locks(), storeFailure = false } = {}) {
  let bytes = local, opened = 0, permissions = 0;
  const handle = { kind: 'file', async requestPermission() { permissions++; return permission; }, async getFile() { if (missing) throw Error('deleted'); return new Blob([bytes]); },
    async isSameEntry(other) { return other === handle; }, async createWritable(options) {
      opened++; assert.equal(options.keepExistingData, true); assert.equal(options.mode, 'exclusive'); let temp = bytes;
      return { async write({ position, data }) { temp = temp.slice(0, position) + new TextDecoder().decode(data); }, async truncate(size) { temp = temp.slice(0, size); }, async close() { bytes = temp; }, async abort() {} };
    } };
  const rows = new Map([['download_a', record({ handle, checkpoint })]]), calls = [];
  const store = { async list(user, mount) { return [...rows.values()].filter(r => r.userScope === user && r.storageId === mount); }, async save(r) { if (storeFailure) throw Error('clone'); rows.set(r.id, r); }, async remove(user, id) { if (rows.get(id)?.userScope === user) rows.delete(id); } };
  const queue = createDownloadQueue({ userScope: 'user_a', storageId: 'mount_a', locks: suppliedLocks, recoveryStore: store, pickFile: () => { throw Error('Recovery must never pick a new destination'); },
    fetchImpl: async (url, init) => {
      calls.push(init); if (init.method === 'HEAD') return new Response(null, { headers: { ...headers, ETag: version } });
      assert.equal(init.headers['If-Range'], tag);
      const [, startText, endText] = /^bytes=(\d+)-(\d*)$/u.exec(init.headers.Range); const start = Number(startText), end = endText ? Number(endText) : 9;
      if (start === 10) return new Response(null, { status: 416, headers: { ...headers, 'Content-Length': '0', 'Content-Range': 'bytes */10' } });
      return new Response('0123456789'.slice(start, end + 1), { status: 206, headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/10` } });
    } });
  queue.setEnabled(true, { rangeRead: true });
  return { queue, rows, calls, handle, store, suppliedLocks, get bytes() { return bytes; }, get opened() { return opened; }, get permissions() { return permissions; } };
}
test('download IndexedDB CRUD, owner/mount isolation, strict allowlist and invalid schema', async () => {
  const db = memoryIndexedDB(), store = createDownloadRecoveryStore({ indexedDB: db });
  await store.save(record({ token: 'secret', bytes: new Blob(['secret']), providerId: 'secret' }));
  await store.save(record({ userScope: 'user_b' }));
  assert.deepEqual(await store.list('user_a', 'mount_a'), [record()]);
  assert.deepEqual(await store.list('user_a', 'other_mount'), []);
  assert.deepEqual(await store.list('other_user', 'mount_a'), []);
  assert.equal(JSON.stringify(db.rows()).includes('secret'), false);
  await store.remove('user_b', 'download_a'); assert.equal((await store.list('user_a', 'mount_a')).length, 1);
  await store.remove('user_a', 'download_a'); assert.deepEqual(await store.list('user_a', 'mount_a'), []);
  for (const patch of [{ schemaVersion: 2 }, { checkpoint: 11 }, { etag: 'W/"weak"' }, { size: -1 }, { userScope: 'email@test' }, { intent: 'cancel' }]) assert.throws(() => normalizeDownloadRecord(record(patch)));
});
test('initial schema upgrade creates only the dedicated download store and owner index', async () => {
  const created = [];
  const factory = { open(name, version) { assert.equal(name, 'nexora-download-recovery'); assert.equal(version, 1); const request = {};
    queueMicrotask(() => { request.result = { objectStoreNames: { contains: () => false }, createObjectStore(name, options) { created.push([name, options]); return { createIndex: (...args) => created.push(args) }; }, transaction() { throw Error('stop after upgrade'); } };
      request.onupgradeneeded(); request.onsuccess(); }); return request; } };
  await assert.rejects(createDownloadRecoveryStore({ indexedDB: factory }).list('user_a', 'mount_a'));
  assert.deepEqual(created, [['downloads', { keyPath: ['userScope', 'id'] }], ['owner', 'userScope']]);
});
test('reload restores paused, does not request permission or network until explicit Recover', async () => {
  const f = fixture(); await f.queue.restore(); assert.equal(f.calls.length, 0); assert.equal(f.permissions, 0);
  assert.equal(f.queue.getSnapshot()[0].recoverable, true); assert.equal(f.queue.getSnapshot()[0].status, 'paused');
  await f.queue.resume('download_a'); await until(() => f.queue.getSnapshot()[0].status === 'success');
  assert.deepEqual(f.calls.map(c => c.method === 'HEAD' ? 'HEAD' : c.headers.Range), ['HEAD', 'bytes=0-2', 'bytes=3-']);
  assert.equal(f.bytes, '0123456789'); assert.equal(f.rows.size, 0); await f.queue.dispose();
});
test('full destination requires authenticated full-byte comparison and416 before success', async () => {
  const f = fixture({ local: '0123456789', checkpoint: 10 }); await f.queue.restore(); await f.queue.resume('download_a');
  await until(() => f.queue.getSnapshot()[0].status === 'success'); assert.equal(f.calls.at(-1).headers.Range, 'bytes=10-'); await f.queue.dispose();
});
test('permission denial/lost handle never opens writer or silently chooses a new file', async () => {
  for (const permission of ['denied', 'prompt']) { const f = fixture({ permission }); await f.queue.restore(); await f.queue.resume('download_a'); assert.equal(f.opened, 0); assert.equal(f.calls.length, 0); assert.equal(f.queue.getSnapshot()[0].status, 'paused'); await f.queue.dispose(); }
  const f = fixture(); f.rows.get('download_a').handle = null; await f.queue.restore(); await f.queue.resume('download_a'); assert.equal(f.calls.length, 0); assert.equal(f.opened, 0); await f.queue.dispose();
});
test('deleted destination, size/checkpoint mismatch, equal-size modified bytes and changed ETag fail closed', async () => {
  for (const options of [{ missing: true }, { local: '0' }, { checkpoint: 2 }, { local: 'BAD' }, { version: '"' + 'b'.repeat(64) + '"' }]) {
    const f = fixture(options); await f.queue.restore(); await f.queue.resume('download_a'); await until(() => f.queue.getSnapshot()[0].status === 'error' && !f.queue.getSnapshot()[0].busy);
    assert.equal(f.opened, 0); assert.equal(f.rows.size, 1); assert.notEqual(f.queue.getSnapshot()[0].status, 'success'); await f.queue.dispose();
  }
});
test('two tabs cannot own recovered writers; Cancel removes metadata without touching destination', async () => {
  const shared = locks(), a = fixture({ suppliedLocks: shared }), b = fixture({ suppliedLocks: shared });
  await a.queue.restore(); await a.queue.resume('download_a'); await until(() => a.queue.getSnapshot()[0].status === 'success');
  await b.queue.restore(); await b.queue.resume('download_a'); assert.equal(b.opened, 0); assert.equal(b.queue.getSnapshot()[0].errorCode, 'OWNERSHIP');
  await b.queue.cancel('download_a'); assert.equal(b.rows.size, 1); assert.equal(b.bytes, '012'); await a.queue.dispose(); await tick(); await b.queue.cancel('download_a'); assert.equal(b.rows.size, 0); await b.queue.dispose();
});
test('unavailable durable APIs restore nothing; native browser fallback has no persisted bytes', async () => {
  const queue = createDownloadQueue({ userScope: 'user_a', storageId: 'mount_a', recoveryStore: { list() { throw Error('must not read'); } }, locks: null, nativeDownload: async () => {} });
  queue.setEnabled(true); await queue.restore(); assert.deepEqual(queue.getSnapshot(), []);
  await queue.start({ storageId: 'mount_a', objectId: 'object_a', name: 'file' }, { managed: false }); assert.equal(queue.getSnapshot()[0].status, 'native'); await queue.dispose();
});
test('verification rejects unexpected200 and truncated prefix without reading a large Blob', async () => {
  const meta = { size: 10, etag: tag }, file = new Blob(['012']);
  await assert.rejects(verifyDownloadPrefix(file, new Response('012'), 3, meta));
  await assert.rejects(verifyDownloadPrefix(file, new Response('01', { status: 206, headers: { ETag: tag, 'Content-Length': '3', 'Content-Range': 'bytes 0-2/10' } }), 3, meta));
});
test('active download commits periodic and explicit Pause checkpoints; crash loses only uncommitted bytes', async () => {
  const f = fixture({ local: '', checkpoint: 0 }); f.rows.clear();
  let savedPause;
  const originalSave = f.store.save;
  f.store.save = async row => { await originalSave(row); if (row.intent === 'pause') savedPause = row; };
  let currentBytes = '', writes = 0;
  let queue;
  const handle = { ...f.handle, async getFile() { return new Blob([currentBytes]); }, async createWritable({ keepExistingData }) {
    let temp = keepExistingData ? currentBytes : '';
    return { async write({ position, data }) { temp = temp.slice(0, position) + new TextDecoder().decode(data); writes++; if (writes === 2) queue.pause(queue.getSnapshot()[0].id); },
      async truncate(size) { temp = temp.slice(0, size); }, async close() { currentBytes = temp; }, async abort() {} };
  } };
  queue = createDownloadQueue({ userScope: 'user_a', storageId: 'mount_a', locks: locks(), recoveryStore: f.store, checkpointBytes: 2, pickFile: () => handle,
    fetchImpl: async (url, init) => init.method === 'HEAD' ? new Response(null, { headers }) : new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('012')); c.enqueue(new TextEncoder().encode('345')); } }), { headers }) });
  queue.setEnabled(true, { rangeRead: true }); await queue.start({ storageId: 'mount_a', objectId: 'object_a', name: 'file.bin' });
  await until(() => queue.getSnapshot()[0].status === 'paused' && !queue.getSnapshot()[0].busy);
  assert.equal(currentBytes, '012345'); assert.equal(savedPause.checkpoint, 6); assert.equal(savedPause.intent, 'pause');
  await queue.dispose(); assert.equal(f.rows.size, 1); assert.equal(currentBytes, '012345');
  // A new engine restores only this owner's current mount, without resuming.
  const next = createDownloadQueue({ userScope: 'user_a', storageId: 'mount_a', locks: locks(), recoveryStore: f.store });
  next.setEnabled(true, { rangeRead: true }); await next.restore(); assert.equal(next.getSnapshot()[0].writtenBytes, 6); assert.equal(next.getSnapshot()[0].status, 'paused');
  await next.cancel(next.getSnapshot()[0].id); assert.equal(f.rows.size, 0); assert.equal(currentBytes, '012345'); await next.dispose(); await f.queue.dispose();
});
test('quota/handle-clone failure is reported; unsupported schemas ignored; unavailable database fails safely', async () => {
  const db = memoryIndexedDB(), store = createDownloadRecoveryStore({ indexedDB: db });
  db.seed(record({ schemaVersion: 2 })); assert.deepEqual(await store.list('user_a', 'mount_a'), []);
  db.failWrite = true; await assert.rejects(store.save(record())); db.failWrite = false;
  await store.save(record()); assert.equal((await store.list('user_a', 'mount_a')).length, 1);
  await assert.rejects(createDownloadRecoveryStore({ indexedDB: null }).list('user_a', 'mount_a'));
  await assert.rejects(createDownloadRecoveryStore({ indexedDB: { open() { throw Error('unavailable'); } } }).list('user_a', 'mount_a'));
  const f = fixture({ storeFailure: true }); await f.queue.restore(); await f.queue.resume('download_a'); await until(() => f.queue.getSnapshot()[0].status === 'success'); await f.queue.dispose();
});
test('revoked permission and account changes prohibit recovery; logout during permission prompt cannot start a request', async () => {
  const f = fixture(); await f.queue.restore(); f.queue.setEnabled(false); await f.queue.resume('download_a'); assert.equal(f.calls.length, 0); await f.queue.dispose();
  const other = createDownloadQueue({ userScope: 'user_b', storageId: 'mount_a', locks: locks(), recoveryStore: f.store }); other.setEnabled(true, { rangeRead: true }); await other.restore(); assert.deepEqual(other.getSnapshot(), []); await other.dispose();
  let grant; const g = fixture(); g.handle.requestPermission = () => new Promise(resolve => { grant = resolve; }); await g.queue.restore(); const pending = g.queue.resume('download_a'); await g.queue.dispose(); grant('granted'); await pending;
  assert.deepEqual(g.queue.getSnapshot(), []); assert.equal(g.calls.length, 0);
});

test('failed Cancel cleanup stays visible and can be retried; committed bytes remain untouched', async () => {
  const f = fixture(); await f.queue.restore();
  const remove = f.store.remove; f.store.remove = async () => { throw Error('unavailable'); };
  await f.queue.cancel('download_a'); assert.equal(f.rows.size, 1); assert.equal(f.bytes, '012');
  assert.equal(f.queue.getSnapshot()[0].status, 'error'); assert.match(f.queue.getSnapshot()[0].recoveryWarning, /could not be removed/);
  f.store.remove = remove; await f.queue.cancel('download_a'); assert.equal(f.rows.size, 0);
  assert.equal(f.queue.getSnapshot()[0].status, 'cancelled'); assert.equal(f.queue.getSnapshot()[0].recoverable, false); await f.queue.dispose();
});
test('interrupted run intent restores only the committed prefix as paused and never auto-resumes', async () => {
  const f = fixture(); const row = f.rows.get('download_a'); row.intent = 'run'; row.state = 'downloading';
  await f.queue.restore(); assert.equal(f.calls.length, 0); assert.equal(f.queue.getSnapshot()[0].status, 'paused'); assert.equal(f.queue.getSnapshot()[0].writtenBytes, 3);
  await f.queue.resume('download_a'); await until(() => f.queue.getSnapshot()[0].status === 'success'); assert.equal(f.bytes, '0123456789'); await f.queue.dispose();
});
