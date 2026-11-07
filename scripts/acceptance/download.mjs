import { createHash } from 'node:crypto';
import { check } from './support.mjs';

// Acceptance client only. Stream/hash incrementally; no total deadline while bytes
// keep arriving. A stalled connection/read still has a bounded lifetime.
export async function verifyStreamingDownload({ url, headers, size, sha256, signal, fetchImpl = fetch,
  interruptAfter = 0, connectionTimeoutMs = 30000, idleTimeoutMs = 60000 }) {
  const hash = createHash('sha256');
  let offset = 0, etag, interruptedAt = 0;
  const request = async (method, extra = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), connectionTimeoutMs);
    try {
      const response = await fetchImpl(url, { method, headers: { ...headers, ...extra }, redirect: 'error',
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal });
      return { response, controller };
    } finally { clearTimeout(timer); }
  };
  const head = await request('HEAD');
  try {
    etag = head.response.headers.get('ETag');
    check(head.response.status === 200 && head.response.headers.get('Content-Length') === String(size)
      && /^"[a-f0-9]{64}"$/u.test(etag || '') && head.response.headers.get('Accept-Ranges') === 'bytes', 'DOWNLOAD_HEAD_INVALID');
  } finally { head.controller.abort(); await head.response.body?.cancel(); }
  do {
    const start = offset;
    const { response, controller } = await request('GET', start ? { Range: `bytes=${start}-`, 'If-Range': etag } : {});
    let reader;
    try {
      check(response.status === (start ? 206 : 200) && response.headers.get('ETag') === etag
        && response.headers.get('Accept-Ranges') === 'bytes'
        && response.headers.get('Content-Length') === String(size - start)
        && (!response.headers.has('Content-Encoding') || response.headers.get('Content-Encoding') === 'identity')
        && (start ? response.headers.get('Content-Range') === `bytes ${start}-${size - 1}/${size}` : !response.headers.has('Content-Range')),
      'DOWNLOAD_RESPONSE_INVALID');
      check(response.body, 'DOWNLOAD_BODY_MISSING');
      reader = response.body.getReader();
      for (;;) {
        const timer = setTimeout(() => controller.abort(), idleTimeoutMs);
        let result;
        try { result = await reader.read(); } finally { clearTimeout(timer); }
        if (result.done) { check(offset === size, 'DOWNLOAD_TRUNCATED'); break; }
        check(result.value instanceof Uint8Array && offset + result.value.length <= size, 'DOWNLOAD_OVERSIZE');
        offset += result.value.length; hash.update(result.value);
        if (interruptAfter > 0 && !interruptedAt && offset >= interruptAfter && offset < size) {
          interruptedAt = offset;
          // Abort the active HTTP response, then recover only with its original tag.
          controller.abort();
          break;
        }
      }
    } finally {
      controller.abort();
      if (reader) await reader.cancel().catch(() => {});
      else await response.body?.cancel().catch(() => {});
    }
  } while (offset < size);
  check(!interruptAfter || interruptedAt > 0, 'DOWNLOAD_INTERRUPTION_NOT_OBSERVED');
  check(offset === size && hash.digest('hex') === sha256, 'FULL_FILE_CHECKSUM_MISMATCH');
  return { sizeBytes: offset, fullSha256Verified: true, interruptedAt, originalIfRangeVerified: interruptedAt > 0 };
}

export async function verifyIfRangeFallback({ url, headers, size, signal, fetchImpl = fetch }) {
  // A valid but nonmatching strong tag must yield a full 200, never appendable 206.
  const response = await fetchImpl(url, { headers: { ...headers, Range: 'bytes=1-', 'If-Range': '"acceptance-stale-version"' },
    redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
  try { check(response.status === 200 && response.headers.get('Content-Length') === String(size)
    && !response.headers.has('Content-Range'), 'STALE_IF_RANGE_DID_NOT_RESTART'); }
  finally { await response.body?.cancel().catch(() => {}); }
  return { staleIfRangeReturnsFull200: true, partialBytesAppended: false };
}
