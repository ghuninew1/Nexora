import { ApiError } from './http.js';

export function downloadRequestHeaders(request) {
  const headers = {};
  for (const name of ['Range', 'If-Range']) {
    const value = request.headers.get(name);
    if (value && value.length <= 256) headers[name] = value;
  }
  return headers;
}

function integer(value) {
  if (!/^(0|[1-9]\d*)$/u.test(value || '')) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

// Upstream is server-owned, but transfer metadata is still validated before release.
export function rangeDownloadResponse(result, request, { contentType = 'application/octet-stream', disposition = null } = {}) {
  const { response, abort, cleanup } = result;
  const reject = () => { abort(); cleanup(); void response.body?.cancel().catch(() => {}); throw new ApiError('PROVIDER_UNAVAILABLE', 502); };
  if (response.headers.has('Content-Encoding') && response.headers.get('Content-Encoding') !== 'identity') return reject();
  if (![200, 206, 416].includes(response.status)) return reject();
  const headers = new Headers({
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Type': contentType,
  });
  const length = integer(response.headers.get('Content-Length'));
  if (response.headers.has('Content-Length') && length === null) return reject();
  const contentRange = response.headers.get('Content-Range');
  const rangeSupported = response.headers.get('Accept-Ranges') === 'bytes';
  const etag = response.headers.get('ETag');
  if (rangeSupported) {
    // This contract accepts only the Shared API's opaque SHA-256 identity token.
    if (!/^"[a-f0-9]{64}"$/u.test(etag || '') || length === null) return reject();
    headers.set('Accept-Ranges', 'bytes'); headers.set('ETag', etag);
    const modified = response.headers.get('Last-Modified');
    if (modified && new Date(modified).toUTCString() === modified) headers.set('Last-Modified', modified);
  }
  if (response.status === 206) {
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/u.exec(contentRange || '');
    if (!rangeSupported || request.method === 'HEAD' || !request.headers.get('Range') || !match) return reject();
    const [start, end, total] = match.slice(1).map(integer);
    if ([start, end, total].includes(null) || start > end || end >= total || length !== end - start + 1) return reject();
    // Verify the returned interval is the requested interval, after clipping.
    const requested = /^bytes=(\d*)-(\d*)$/u.exec(request.headers.get('Range'));
    if (request.headers.get('Range').length > 256 || !requested || (!requested[1] && !requested[2])) return reject();
    const a = requested[1] ? BigInt(requested[1]) : null;
    const b = requested[2] ? BigInt(requested[2]) : null;
    const expectedStart = a === null ? (b >= BigInt(total) ? 0n : BigInt(total) - b) : a;
    const expectedEnd = a === null || b === null || b >= BigInt(total) ? BigInt(total) - 1n : b;
    if (BigInt(start) !== expectedStart || BigInt(end) !== expectedEnd) return reject();
    if (request.headers.has('If-Range') && request.headers.get('If-Range') !== etag) return reject();
    headers.set('Content-Range', contentRange);
  } else if (response.status === 416) {
    const match = /^bytes \*\/(\d+)$/u.exec(contentRange || '');
    if (!rangeSupported || !match || integer(match[1]) === null || length !== 0 || request.method === 'HEAD') return reject();
    const requested = request.headers.get('Range') || '';
    const interval = requested.length <= 256 && /^bytes=(\d*)-(\d*)$/u.exec(requested);
    if (!interval || (!interval[1] && !interval[2]) || (request.headers.has('If-Range') && request.headers.get('If-Range') !== etag)) return reject();
    const total = BigInt(match[1]);
    const a = interval[1] ? BigInt(interval[1]) : null;
    const b = interval[2] ? BigInt(interval[2]) : null;
    if (!(total === 0n || (a === null ? b === 0n : a >= total || (b !== null && b < a)))) return reject();
    headers.set('Content-Range', contentRange);
  } else if (contentRange) return reject();
  if (length !== null) headers.set('Content-Length', String(length));
  // Preserve only sanitized attachment metadata; callers never forward raw headers.
  if (disposition) headers.set('Content-Disposition', disposition);
  if (request.method === 'HEAD' || response.status === 416) {
    abort(); cleanup(); void response.body?.cancel().catch(() => {});
    return new Response(null, { status: response.status, headers });
  }
  const reader = response.body?.getReader();
  if (!reader) return reject();
  let received = 0, finished = false, timer;
  const finish = () => { finished = true; clearTimeout(timer); cleanup(); };
  let target;
  const fail = () => {
    if (finished) return;
    finish(); abort(); void reader.cancel().catch(() => {});
    target.error(new ApiError('TRANSFER_INCOMPLETE', 502));
  };
  const arm = () => { clearTimeout(timer); timer = setTimeout(fail, 60_000); timer.unref?.(); };
  const body = new ReadableStream({
    start(controller) { target = controller; arm(); },
    async pull(controller) {
      try {
        arm();
        const { done, value } = await reader.read();
        if (finished) return;
        if (done) {
          if (length !== null && received !== length) return fail();
          finish(); controller.close(); return;
        }
        received += value.byteLength;
        if (length !== null && received > length) return fail();
        arm(); controller.enqueue(value);
      } catch { fail(); }
    },
    cancel() { finish(); abort(); return reader.cancel().catch(() => {}); },
  });
  return new Response(body, { status: response.status, headers });
}
