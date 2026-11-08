import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMultipartUploadClient, hashUploadPart, classifyMultipartError } from '../src/services/multipart-upload.js';

const digest = value => createHash('sha256').update(value).digest('base64');
const file = new Blob(['abcdefghij']);
function fixture(overrides = {}) {
  const session = { transferId: 'transfer_test', state: 'active', version: 1, sizeBytes: 10,
    partSizeBytes: 4, partCount: 3, expiresAt: Date.now() + 100000, acknowledgedBytes: 0, parts: [], nextCursor: null };
  const calls = [];
  let hook;
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init });
    const response = await hook?.(url, init);
    if (response) return response;
    if (init.method === 'PUT') {
      const number = Number(url.split('/').at(-1));
      const bytes = new Uint8Array(await init.body.arrayBuffer());
      const receipt = { partNumber: number, sizeBytes: bytes.length, sha256: digest(bytes) };
      if (!session.parts.some(p => p.partNumber === number)) {
        session.parts.push(receipt); session.parts.sort((a, b) => a.partNumber - b.partNumber);
        session.acknowledgedBytes += bytes.length;
      }
      return Response.json({ data: receipt });
    }
    if (url.endsWith('/complete')) {
      session.state = 'completed';
      session.object = { objectId: 'file_test', name: 'test.bin', type: 'file', parentId: null, sizeBytes: session.sizeBytes };
    }
    if (url.endsWith('/pause')) { session.state = 'paused'; session.version++; }
    if (url.endsWith('/resume')) { session.state = 'active'; session.version++; }
    if (init.method === 'DELETE') session.state = 'cancelled';
    return Response.json({ data: session });
  };
  const client = createMultipartUploadClient({ storageId: 'mount_test', fetchImpl, sleep: async () => {}, ...overrides });
  return { client, session, calls, hook: value => { hook = value; } };
}

test('stable create key and body survive a lost acknowledgement; session IDs are logical', async () => {
  const f = fixture(); let first = true;
  f.hook((url, init) => { if (init.method === 'POST' && first) { first = false; throw new TypeError('offline'); } });
  const key = f.client.newIdempotencyKey();
  const s = await f.client.createSession({ name: 'test.bin', sizeBytes: 10 }, key);
  assert.equal(s.transferId, 'transfer_test');
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].headers['Idempotency-Key'], key);
  assert.equal(f.calls[0].body, f.calls[1].body);
  assert.equal(f.calls[0].credentials, 'same-origin');
});

test('exact Blob boundaries, base64 SHA-256 and raw multipart headers', async () => {
  const f = fixture();
  assert.equal(await hashUploadPart(new Blob(['abc'])), digest('abc'));
  for (let n = 1; n <= 3; n++) await f.client.uploadPart('transfer_test', file, n);
  const puts = f.calls.filter(c => c.method === 'PUT');
  assert.deepEqual(await Promise.all(puts.map(c => c.body.text())), ['abcd', 'efgh', 'ij']);
  for (const call of puts) {
    assert.equal(call.headers['Content-Type'], 'application/octet-stream');
    assert.equal(call.headers['X-Part-SHA256'], digest(await call.body.text()));
    assert.equal(call.headers['Content-Length'], undefined);
  }
});

test('pagination discovers more than 100 verified parts without trusting counters alone', async () => {
  const f = fixture();
  Object.assign(f.session, { sizeBytes: 404, partCount: 101, acknowledgedBytes: 404 });
  const parts = Array.from({ length: 101 }, (_, i) => ({ partNumber: i + 1, sizeBytes: 4, sha256: digest('abcd') }));
  f.hook(url => Response.json({ data: { ...f.session, parts: url.includes('partsCursor=100') ? parts.slice(100) : parts.slice(0, 100),
    nextCursor: url.includes('partsCursor=100') ? null : '100' } }));
  assert.equal((await f.client.getCompletedParts('transfer_test')).parts.length, 101);
  assert.equal(f.calls.length, 2);
});

test('resume skips only verified identical bytes; duplicate acknowledgements do not reupload', async () => {
  const f = fixture();
  await f.client.uploadPart('transfer_test', file, 1);
  await f.client.pauseSession('transfer_test');
  await f.client.resumeSession('transfer_test');
  await f.client.uploadPart('transfer_test', file, 1);
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 1);
  await assert.rejects(f.client.reconcile('transfer_test', new Blob(['xxxxxxxxxx'])), { code: 'FILE_MISMATCH' });
});

test('lost part response reconciles durable receipt before retry and recovers without duplicate bytes', async () => {
  const f = fixture(); let first = true;
  f.hook((url, init) => {
    if (init.method === 'PUT' && first) {
      first = false;
      f.session.parts = [{ partNumber: 1, sizeBytes: 4, sha256: digest('abcd') }]; f.session.acknowledgedBytes = 4;
      throw new TypeError('lost acknowledgement');
    }
  });
  await f.client.uploadPart('transfer_test', file, 1);
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 1);
  const g = fixture(); let interrupted = true;
  g.hook((url, init) => { if (init.method === 'PUT' && interrupted) { interrupted = false; throw new TypeError('offline'); } });
  await g.client.uploadPart('transfer_test', file, 1);
  assert.deepEqual(g.calls.map(c => c.method), ['GET', 'PUT', 'GET', 'PUT']);
});

test('stale version is refreshed before safe bounded transition retry', async () => {
  const f = fixture(); let first = true;
  f.hook((url, init) => {
    if (url.endsWith('/pause') && first) { first = false; f.session.version = 2; return Response.json({ error: { code: 'UPLOAD_CONFLICT' } }, { status: 409 }); }
    if (url.endsWith('/pause')) assert.equal(JSON.parse(init.body).version, 2);
  });
  assert.equal((await f.client.pauseSession('transfer_test')).state, 'paused');
});

test('ambiguous complete reconciles same completed object; unresolved completion is classified', async () => {
  const f = fixture();
  f.hook(url => {
    if (url.endsWith('/complete')) {
      f.session.state = 'completed';
      f.session.object = { objectId: 'file_test', parentId: null, name: 'test.bin', type: 'file', sizeBytes: 10 };
      throw new TypeError('lost response');
    }
  });
  assert.equal((await f.client.completeSession('transfer_test')).object.objectId, 'file_test');
  assert.equal((await f.client.completeSession('transfer_test')).object.objectId, 'file_test');
  assert.equal(f.calls.filter(c => c.url.endsWith('/complete')).length, 1);
  const g = fixture({ maxRetries: 1 });
  g.hook(url => { if (url.endsWith('/complete')) throw new TypeError('offline'); });
  await assert.rejects(g.client.completeSession('transfer_test'), { code: 'AMBIGUOUS_COMPLETION' });
});

test('expired/cancelled sessions, auth and permission failures are terminal', async () => {
  for (const [state, code] of [['expired', 'SESSION_EXPIRED'], ['cancelled', 'SESSION_CANCELLED']]) {
    const f = fixture(); f.session.state = state;
    await assert.rejects(f.client.uploadPart('transfer_test', file, 1), { code });
    assert.equal(f.calls.length, 1);
  }
  for (const [status, code] of [[401, 'AUTHENTICATION_FAILURE'], [403, 'PERMISSION_REVOKED'], [410, 'SESSION_EXPIRED'], [422, 'CHECKSUM_MISMATCH']]) {
    const f = fixture();
    f.hook(() => Response.json({ error: { code: 'UPLOAD_CHECKSUM_MISMATCH' } }, { status }));
    await assert.rejects(f.client.getSession('transfer_test'), { code });
    assert.equal(f.calls.length, 1);
  }
  const f = fixture();
  assert.deepEqual(await f.client.cancelSession('transfer_test'), { transferId: 'transfer_test', state: 'cancelled' });
  assert.deepEqual(f.calls.map(c => c.method), ['DELETE']);
});

test('malformed geometry, receipt metadata, counters and pagination changes fail closed', async () => {
  for (const patch of [{ partCount: 4 }, { partSizeBytes: 0 }, { acknowledgedBytes: 4 },
    { parts: [{ partNumber: 1, sizeBytes: 3, sha256: digest('abc') }] },
    { parts: [{ partNumber: 1, sizeBytes: 4, sha256: 'invalid' }] }, { nextCursor: '1' }]) {
    const f = fixture(); Object.assign(f.session, patch);
    await assert.rejects(f.client.getCompletedParts('transfer_test'));
  }
  const f = fixture();
  f.hook(() => Response.json({ data: { providerUploadId: 'private' } }));
  await assert.rejects(f.client.getSession('transfer_test'), { code: 'INVALID_RESPONSE' });
});

test('memory bounded: source whole-file arrayBuffer is never called and reads are sequential parts', async () => {
  const f = fixture(); let reads = 0, active = 0, peak = 0;
  const source = { size: 10, arrayBuffer() { assert.fail('whole file read'); }, slice(start, end) {
    assert.ok(end - start <= 4);
    const blob = file.slice(start, end); const read = blob.arrayBuffer.bind(blob);
    blob.arrayBuffer = async () => { reads++; active++; peak = Math.max(peak, active); try { return await read(); } finally { active--; } };
    return blob;
  } };
  for (let n = 1; n <= 3; n++) await f.client.uploadPart('transfer_test', source, n);
  assert.ok(reads >= 3); assert.equal(peak, 1);
});

test('timeouts, caller aborts, bounded retry and same-session operation lock', async () => {
  const f = fixture({ timeoutMs: 5, maxRetries: 0 });
  f.hook((url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))));
  const first = f.client.getSession('transfer_test');
  await assert.rejects(f.client.getSession('transfer_test'), { code: 'SESSION_BUSY' });
  await assert.rejects(first, { code: 'REQUEST_TIMEOUT' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fixture({ signal: controller.signal }).client.getSession('transfer_test'), { code: 'ABORTED' });
  assert.equal(classifyMultipartError(429), 'RATE_LIMITED');
  assert.equal(classifyMultipartError(503), 'PROVIDER_UNAVAILABLE');
});

test('pagination rejects changing snapshots and duplicate/stale receipts', async () => {
  for (const stale of [true, false]) {
    const f = fixture();
    f.hook(url => {
      const second = url.includes('partsCursor=1');
      return Response.json({ data: { ...f.session, version: second && stale ? 2 : 1,
        acknowledgedBytes: 8, parts: [{ partNumber: second && stale ? 2 : 1, sizeBytes: 4, sha256: digest('abcd') }],
        nextCursor: second ? null : '1' } });
    });
    await assert.rejects(f.client.getCompletedParts('transfer_test'), { code: stale ? 'VERSION_CONFLICT' : 'RECEIPT_CONFLICT' });
  }
});

test('missing receipts are resent; conflicting acknowledged bytes stop before writes', async () => {
  const f = fixture();
  f.session.parts = [{ partNumber: 1, sizeBytes: 4, sha256: digest('xxxx') }]; f.session.acknowledgedBytes = 4;
  await assert.rejects(f.client.uploadPart('transfer_test', file, 2), { code: 'FILE_MISMATCH' });
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 0);
  f.session.parts = []; f.session.acknowledgedBytes = 0;
  await f.client.uploadPart('transfer_test', file, 1);
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 1);
});

test('transient reads have bounded exponential jitter; validation never retries', async () => {
  const waits = [];
  const f = fixture({ sleep: async ms => waits.push(ms), random: () => 0 });
  f.hook(() => Response.json({ error: {} }, { status: 503 }));
  await assert.rejects(f.client.getSession('transfer_test'), { code: 'PROVIDER_UNAVAILABLE' });
  assert.deepEqual(waits, [250, 500]); assert.equal(f.calls.length, 3);
  const g = fixture(); g.hook(() => Response.json({ error: {} }, { status: 400 }));
  await assert.rejects(g.client.pauseSession('transfer_test'), { code: 'VALIDATION_FAILURE' });
  assert.equal(g.calls.length, 1);
});

test('lost cancellation acknowledgement reads status before returning success', async () => {
  const f = fixture();
  f.hook((url, init) => { if (init.method === 'DELETE') { f.session.state = 'cancelled'; throw new TypeError('lost'); } });
  assert.equal((await f.client.cancelSession('transfer_test')).state, 'cancelled');
  assert.deepEqual(f.calls.map(c => c.method), ['DELETE', 'GET']);
});

test('rate limit Retry-After suppresses immediate uncertain-write reconciliation and retains delay', async () => {
  const f = fixture({ maxRetries: 0 });
  f.hook((url, init) => init.method === 'PUT' ? Response.json({ error: { code: 'RATE_LIMITED' } },
    { status: 429, headers: { 'Retry-After': '3' } }) : null);
  await assert.rejects(f.client.uploadPart('transfer_test', file, 1), error => error.code === 'RATE_LIMITED' && error.retryAfterMs > 2000);
  assert.equal(f.calls.length, 2); // one reconciliation GET and PUT; no immediate follow-up GET
  await assert.rejects(f.client.getSession('transfer_test'), { code: 'RATE_LIMITED' });
  assert.equal(f.calls.length, 2);
});

test('completion uncertainty preserves provider Retry-After and does not issue an early status request', async () => {
  const f = fixture({ maxRetries: 0 });
  f.hook(url => url.endsWith('/complete') ? Response.json({ error: { code: 'UNAVAILABLE' } },
    { status: 503, headers: { 'Retry-After': '600' } }) : null);
  await assert.rejects(f.client.completeSession('transfer_test'), error => error.code === 'AMBIGUOUS_COMPLETION' && error.retryAfterMs > 599000);
  assert.equal(f.calls.length, 2);
});


test('multipart responses preserve quota, capability and size errors without retry or direct fallback', async () => {
  for (const [status, code] of [[429, 'QUOTA_EXCEEDED'], [422, 'CAPABILITY_UNAVAILABLE'], [413, 'UPLOAD_TOO_LARGE']]) {
    const f = fixture();
    f.hook(() => Response.json({ error: { code } }, { status }));
    await assert.rejects(f.client.createSession({ name: 'garage 2.zip', sizeBytes: 182_700_000 }, 'test_key'), { code, status });
    assert.equal(f.calls.length, 1);
  }
});
