import { retryAfterMilliseconds } from './upload-coordination.js';
import { normalizeStorageObject, validateStorageObjectName } from './storage.js';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const DIGEST = /^[A-Za-z0-9+/]{43}=$/u;
const STATES = ['creating', 'active', 'paused', 'completing', 'completed', 'cancelling', 'cancelled', 'expired'];
const TRANSIENT = new Set(['NETWORK_INTERRUPTION', 'REQUEST_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'RATE_LIMITED', 'VERSION_CONFLICT']);

export class MultipartUploadError extends Error {
  constructor(code, status = 0, retryAfterMs = 0) {
    super(`Multipart upload: ${code}`);
    this.name = 'MultipartUploadError';
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}
const fail = (code = 'INVALID_RESPONSE') => { throw new MultipartUploadError(code); };
const integer = value => Number.isSafeInteger(value) && value >= 0;
const id = value => typeof value === 'string' && ID.test(value) ? value : fail('INVALID_INPUT');

export function classifyMultipartError(status, code) {
  if (status === 401) return 'AUTHENTICATION_FAILURE';
  if (status === 403) return 'PERMISSION_REVOKED';
  if (status === 404) return 'SESSION_UNAVAILABLE';
  if (status === 410) return 'SESSION_EXPIRED';
  if (status === 409) return 'VERSION_CONFLICT';
  if (status === 422 && code === 'UPLOAD_CHECKSUM_MISMATCH') return 'CHECKSUM_MISMATCH';
  if (status === 422 && code === 'CAPABILITY_UNAVAILABLE') return 'CAPABILITY_UNAVAILABLE';
  if (status === 413 && code === 'UPLOAD_TOO_LARGE') return 'UPLOAD_TOO_LARGE';
  if (status === 429 && code === 'QUOTA_EXCEEDED') return 'QUOTA_EXCEEDED';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'PROVIDER_UNAVAILABLE';
  return 'VALIDATION_FAILURE';
}

function normalizeSession(p, expectedId) {
  if (!p || typeof p.transferId !== 'string' || !ID.test(p.transferId) || (expectedId && p.transferId !== expectedId)
    || !STATES.includes(p.state) || !integer(p.version) || !integer(p.sizeBytes) || p.sizeBytes === 0
    || p.sizeBytes > 10 * 1024 ** 3 || !integer(p.partSizeBytes) || !p.partSizeBytes || p.partSizeBytes > 8 * 1024 ** 2
    || p.partCount !== Math.ceil(p.sizeBytes / p.partSizeBytes) || p.partCount > 1280
    || !integer(p.expiresAt) || !integer(p.acknowledgedBytes) || p.acknowledgedBytes > p.sizeBytes
    || !Array.isArray(p.parts) || p.parts.length > 100
    || (p.nextCursor !== null && (typeof p.nextCursor !== 'string' || !/^[1-9][0-9]{0,3}$/u.test(p.nextCursor)))) fail();
  let last = 0;
  const parts = p.parts.map(part => {
    if (!part || !integer(part.partNumber) || part.partNumber <= last || part.partNumber > p.partCount
      || part.sizeBytes !== partLength(p, part.partNumber) || !DIGEST.test(part.sha256 || '')) fail();
    last = part.partNumber;
    return { partNumber: last, sizeBytes: part.sizeBytes, sha256: part.sha256 };
  });
  let object;
  if (p.state === 'completed') {
    try { object = normalizeStorageObject(p.object); } catch { fail(); }
    if (object.type !== 'file' || object.sizeBytes !== p.sizeBytes) fail();
  }
  return { transferId: p.transferId, state: p.state, version: p.version, sizeBytes: p.sizeBytes,
    partSizeBytes: p.partSizeBytes, partCount: p.partCount, expiresAt: p.expiresAt,
    acknowledgedBytes: p.acknowledgedBytes, parts, nextCursor: p.nextCursor, ...(object ? { object } : {}) };
}
function partLength(session, number) {
  return Math.min(session.partSizeBytes, session.sizeBytes - (number - 1) * session.partSizeBytes);
}
function checkFile(file, session) {
  if (!file || file.size !== session.sizeBytes || typeof file.slice !== 'function') fail('FILE_MISMATCH');
}

export async function hashUploadPart(blob, cryptoImpl = globalThis.crypto) {
  const bytes = await blob.arrayBuffer();
  if (bytes.byteLength !== blob.size) fail('FILE_MISMATCH');
  const digest = new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', bytes));
  return btoa(String.fromCharCode(...digest));
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new MultipartUploadError('ABORTED')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/** One client per authenticated owner lifecycle. No bytes or keys are persisted. */
export function createMultipartUploadClient({ storageId, fetchImpl = fetch, cryptoImpl = globalThis.crypto,
  signal, timeoutMs = 285000, maxRetries = 2, sleep = delay, random = Math.random } = {}) {
  const base = `/api/storage/v1/storages/${id(storageId)}/uploads`;
  if (!integer(maxRetries) || maxRetries > 5 || !integer(timeoutMs) || !timeoutMs) fail('INVALID_INPUT');
  const busy = new Set();
  let cooldown = null;
  const fileHashes = new WeakMap();
  async function fileDigest(file, start, length) {
    // Browser Blob/File bytes are immutable. Metadata-only cache avoids quadratic rehashing
    // when uploadPart reconciles every write; custom slice sources are never cached.
    const cacheable = file instanceof Blob;
    let hashes = cacheable ? fileHashes.get(file) : null;
    if (!hashes) { hashes = new Map(); if (cacheable) fileHashes.set(file, hashes); }
    const key = `${start}:${length}`;
    if (hashes.has(key)) return hashes.get(key);
    const blob = file.slice(start, start + length);
    if (blob.size !== length) fail('FILE_MISMATCH');
    const digest = await hashUploadPart(blob, cryptoImpl);
    if (signal?.aborted) fail('ABORTED');
    if (cacheable) hashes.set(key, digest);
    return digest;
  }
  const exclusive = async (key, operation) => {
    if (busy.has(key)) fail('SESSION_BUSY');
    busy.add(key);
    try { return await operation(); } finally { busy.delete(key); }
  };
  const wait = (attempt, retryAfterMs = 0) => sleep(Math.max(retryAfterMs, Math.min(10000, 500 * 2 ** attempt) * (0.5 + random() * 0.5)), signal);
  async function request(path, method = 'GET', body, extraHeaders = {}) {
    if (signal?.aborted) fail('ABORTED');
    if (globalThis.navigator?.onLine === false) fail('OFFLINE');
    if (cooldown?.until > Date.now()) throw new MultipartUploadError(cooldown.code, cooldown.status, cooldown.until - Date.now());
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(base + path, { method, credentials: 'same-origin', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': body instanceof Blob ? 'application/octet-stream' : 'application/json' }), ...extraHeaders },
        ...(body === undefined ? {} : { body: body instanceof Blob ? body : JSON.stringify(body) }) });
      const responseError = code => {
        const error = new MultipartUploadError(classifyMultipartError(response.status, code), response.status,
          retryAfterMilliseconds(response.headers.get('Retry-After')));
        if (error.retryAfterMs && TRANSIENT.has(error.code)) cooldown = { until: Date.now() + error.retryAfterMs, code: error.code, status: error.status };
        return error;
      };
      let payload;
      try { payload = await response.json(); } catch {
        if (!response.ok) throw responseError();
        fail();
      }
      if (!response.ok) throw responseError(payload?.error?.code);
      if (!payload?.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) fail();
      return payload.data;
    } catch (error) {
      if (signal?.aborted) fail('ABORTED');
      if (timedOut) fail('REQUEST_TIMEOUT');
      if (error instanceof MultipartUploadError) throw error;
      fail('NETWORK_INTERRUPTION');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  async function read(transferId, cursor = '0') {
    id(transferId);
    for (let attempt = 0; ; attempt++) {
      try { return normalizeSession(await request(`/${transferId}?partsCursor=${cursor}&limit=100`), transferId); }
      catch (error) {
        if (!TRANSIENT.has(error.code) || error.code === 'VERSION_CONFLICT' || (attempt >= maxRetries || error.retryAfterMs > 300000)) throw error;
        await wait(attempt, error.retryAfterMs);
      }
    }
  }
  async function discover(transferId) {
    const first = await read(transferId);
    const parts = new Map();
    let page = first, cursor = 0;
    for (;;) {
      for (const part of page.parts) {
        if (part.partNumber <= cursor || parts.has(part.partNumber)) fail('RECEIPT_CONFLICT');
        parts.set(part.partNumber, part);
      }
      if (page.nextCursor === null) break;
      const next = Number(page.nextCursor);
      if (next <= cursor || next > first.partCount || next !== page.parts.at(-1)?.partNumber) fail();
      cursor = next;
      page = await read(transferId, String(cursor));
      for (const key of ['state', 'version', 'sizeBytes', 'partSizeBytes', 'partCount', 'expiresAt', 'acknowledgedBytes']) {
        if (page[key] !== first[key]) fail('VERSION_CONFLICT');
      }
    }
    const receipts = [...parts.values()];
    if (receipts.reduce((sum, part) => sum + part.sizeBytes, 0) !== first.acknowledgedBytes) fail('RECEIPT_CONFLICT');
    return { ...first, parts: receipts, nextCursor: null };
  }
  function usable(session) {
    if (session.state === 'expired' || (session.state !== 'completed' && session.expiresAt <= Date.now())) fail('SESSION_EXPIRED');
    if (session.state === 'cancelled' || session.state === 'cancelling') fail('SESSION_CANCELLED');
  }
  async function reconcile(transferId, file) {
    const session = await discover(transferId);
    usable(session);
    checkFile(file, session);
    if (session.state === 'completed') return session;
    for (const part of session.parts) {
      const start = (part.partNumber - 1) * session.partSizeBytes;
      if (await fileDigest(file, start, part.sizeBytes) !== part.sha256) fail('FILE_MISMATCH');
    }
    return session;
  }
  async function transition(transferId, action) {
    let current = await read(transferId);
    for (let attempt = 0; ; attempt++) {
      usable(current);
      const target = { pause: 'paused', resume: 'active', complete: 'completed' }[action];
      if (current.state === 'completed' || (target && current.state === target)) return current;
      try {
        const value = await request(`/${transferId}/${action}`, 'POST', { version: current.version });
        const result = normalizeSession(value, transferId);
        if (result.state !== target) fail();
        return result;
      } catch (error) {
        if (!TRANSIENT.has(error.code) && error.code !== 'INVALID_RESPONSE') throw error;
        try { current = await read(transferId); } catch (readError) {
          if (action === 'complete' && TRANSIENT.has(readError.code)) throw new MultipartUploadError('AMBIGUOUS_COMPLETION', readError.status, readError.retryAfterMs);
          throw readError;
        }
        if (current.state === target) return current;
        if (attempt >= maxRetries || error.retryAfterMs > 300000) {
          if (action === 'complete') fail('AMBIGUOUS_COMPLETION');
          throw error;
        }
        await wait(attempt, error.retryAfterMs);
      }
    }
  }
  async function put(transferId, file, number) {
    let session = await reconcile(transferId, file);
    if (!integer(number) || number < 1 || number > session.partCount) fail('INVALID_INPUT');
    if (session.state === 'completed') return session;
    if (session.state !== 'active') fail('SESSION_NOT_ACTIVE');
    const start = (number - 1) * session.partSizeBytes, length = partLength(session, number);
    const blob = file.slice(start, start + length);
    if (blob.size !== length) fail('FILE_MISMATCH');
    const sha256 = await fileDigest(file, start, length);
    for (let attempt = 0; ; attempt++) {
      const existing = session.parts.find(part => part.partNumber === number);
      if (existing) {
        if (existing.sha256 !== sha256) fail('RECEIPT_CONFLICT');
        return existing;
      }
      try {
        const receipt = await request(`/${transferId}/parts/${number}`, 'PUT', blob, { 'X-Part-SHA256': sha256 });
        if (receipt.partNumber !== number || receipt.sizeBytes !== length || receipt.sha256 !== sha256) fail();
        return { partNumber: number, sizeBytes: length, sha256 };
      } catch (error) {
        if (!TRANSIENT.has(error.code) && error.code !== 'INVALID_RESPONSE') throw error;
        session = await reconcile(transferId, file);
        if (session.state === 'completed') return session;
        if (session.state !== 'active') fail('SESSION_NOT_ACTIVE');
        const verified = session.parts.find(part => part.partNumber === number);
        if (verified) return verified;
        if (attempt >= maxRetries || error.retryAfterMs > 300000) throw error;
        await wait(attempt, error.retryAfterMs);
      }
    }
  }
  return {
    newIdempotencyKey: () => cryptoImpl.randomUUID(),
    async createSession(metadata, idempotencyKey) {
      id(idempotencyKey);
      if (!metadata || !validateStorageObjectName(metadata.name) || !integer(metadata.sizeBytes) || !metadata.sizeBytes) fail('INVALID_INPUT');
      if (metadata.parentId != null) id(metadata.parentId);
      const body = { name: metadata.name, parentId: metadata.parentId ?? null, sizeBytes: metadata.sizeBytes,
        mimeType: metadata.mimeType || 'application/octet-stream' };
      return exclusive(`create:${idempotencyKey}`, async () => {
        for (let attempt = 0; ; attempt++) {
          try {
            const session = normalizeSession(await request('', 'POST', body, { 'Idempotency-Key': idempotencyKey }));
            if (session.sizeBytes !== body.sizeBytes) fail();
            return session;
          } catch (error) {
            // No transfer ID exists yet: replay only the SAME immutable key/body.
            if ((!TRANSIENT.has(error.code) || error.code === 'VERSION_CONFLICT') && error.code !== 'INVALID_RESPONSE') throw error;
            if (attempt >= maxRetries || error.retryAfterMs > 300000) throw error;
            await wait(attempt, error.retryAfterMs);
          }
        }
      });
    },
    getSession: transferId => exclusive(id(transferId), () => read(transferId)),
    getCompletedParts: transferId => exclusive(id(transferId), () => discover(transferId)),
    reconcile: (transferId, file) => exclusive(id(transferId), () => reconcile(transferId, file)),
    uploadPart: (transferId, file, number) => exclusive(id(transferId), () => put(transferId, file, number)),
    pauseSession: transferId => exclusive(id(transferId), () => transition(transferId, 'pause')),
    resumeSession: transferId => exclusive(id(transferId), () => transition(transferId, 'resume')),
    completeSession: transferId => exclusive(id(transferId), () => transition(transferId, 'complete')),
    // Cancel does not require a preliminary authorized GET: cleanup survives revoked permissions.
    cancelSession: transferId => exclusive(id(transferId), async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const value = await request(`/${transferId}`, 'DELETE');
          if (value.transferId !== transferId || value.state !== 'cancelled') fail();
          return { transferId, state: 'cancelled' };
        } catch (error) {
          if (!TRANSIENT.has(error.code) && error.code !== 'INVALID_RESPONSE') throw error;
          // A revoked grant may deny status while still permitting creator cleanup.
          // In that case stop rather than blindly repeating an uncertain write.
          const current = await read(transferId);
          if (current.state === 'cancelled') return { transferId, state: 'cancelled' };
          if (attempt >= maxRetries || error.retryAfterMs > 300000) throw error;
          await wait(attempt, error.retryAfterMs);
        }
      }
    }),
  };
}
