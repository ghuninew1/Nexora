import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyStreamingDownload, verifyIfRangeFallback } from '../scripts/acceptance/download.mjs';
import { webServer, closeServer } from '../scripts/acceptance/support.mjs';

const bytes = new Uint8Array(128 * 1024).map((_, i) => i % 251);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const tag = '"' + 'a'.repeat(64) + '"';
const options = { url: 'https://fixture.test/download', size: bytes.length, sha256 };
function fixture({ requests = [], wrongRange = false, wrongBytes = false, truncate = false } = {}) {
  return async (_url, init) => {
    const start = Number(/^bytes=(\d+)-$/u.exec(init.headers.Range || '')?.[1] || 0);
    requests.push({ method: init.method, start, tag: init.headers['If-Range'] });
    const headers = { ETag: tag, 'Content-Length': String(bytes.length - start), 'Accept-Ranges': 'bytes' };
    if (start) headers['Content-Range'] = `bytes ${start}-${bytes.length - 1}/${bytes.length}`;
    let offset = start;
    const body = init.method === 'HEAD' ? null : new ReadableStream({
      pull(c) {
        if (offset === bytes.length || (truncate && offset > start)) { c.close(); return; }
        const next = Math.min(offset + 8192, bytes.length);
        c.enqueue(wrongBytes ? new Uint8Array(next - offset) : bytes.slice(offset, next)); offset = next;
      },
    });
    return new Response(body, { status: start && !wrongRange ? 206 : 200, headers });
  };
}
test('acceptance streaming hashes all bytes and resumes an interrupted response with its original validator', async () => {
  const requests = [];
  const result = await verifyStreamingDownload({ ...options, interruptAfter: 16384, fetchImpl: fixture({ requests }) });
  assert.equal(result.fullSha256Verified, true);
  assert.equal(result.interruptedAt, 16384);
  assert.deepEqual(requests, [{ method: 'HEAD', start: 0, tag: undefined }, { method: 'GET', start: 0, tag: undefined }, { method: 'GET', start: 16384, tag }]);
});
test('acceptance never passes corruption, truncation or a full 200 response to a resume request', async () => {
  for (const [fixtureOptions, code] of [[{ wrongBytes: true }, 'FULL_FILE_CHECKSUM_MISMATCH'], [{ truncate: true }, 'DOWNLOAD_TRUNCATED'], [{ wrongRange: true }, 'DOWNLOAD_RESPONSE_INVALID']]) {
    await assert.rejects(verifyStreamingDownload({ ...options, interruptAfter: 16384, fetchImpl: fixture(fixtureOptions) }), { code });
  }
});
test('stale If-Range requires a full response and always cancels unused bytes', async () => {
  let cancelled = false;
  await verifyIfRangeFallback({ ...options, fetchImpl: async (_url, init) => {
    assert.equal(init.headers.Range, 'bytes=1-');
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Length': String(bytes.length) } });
  } });
  assert.equal(cancelled, true);
  await assert.rejects(verifyIfRangeFallback({ ...options, fetchImpl: async () => new Response(null, { status: 206 }) }), { code: 'STALE_IF_RANGE_DID_NOT_RESTART' });
});
test('acceptance uses actual loopback streaming, concurrent checksums, Range recovery and bounded idle cancellation', async () => {
  const requests = [];
  const server = await webServer(async request => {
    if (new URL(request.url).pathname === '/stall') return new Response(request.method === 'HEAD' ? null : new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 1)); } }), { headers: { ETag: tag, 'Content-Length': String(bytes.length), 'Accept-Ranges': 'bytes' } });
    return fixture({ requests })(request.url, { method: request.method, headers: Object.fromEntries(['Range', 'If-Range'].map(n => [n, request.headers.get(n)])) });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const results = await Promise.all([1, 2].map(() => verifyStreamingDownload({ ...options, url, interruptAfter: 16384 })));
    assert.ok(results.every(r => r.fullSha256Verified && r.interruptedAt > 0));
    await assert.rejects(verifyStreamingDownload({ ...options, url: url + '/stall', idleTimeoutMs: 25 }), /abort/iu);
  } finally { await closeServer(server); }
});
