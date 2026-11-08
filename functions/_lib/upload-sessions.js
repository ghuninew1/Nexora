import { ApiError, json, readJson } from './http.js';
import { createStorageClient, normalizeObject } from './storage-client.js';
import { getStorageAccessForUser } from './storage-access.js';
import { intersectStoragePermissions } from './storage-permissions.js';
import { getSystemSettings } from './system-settings.js';
import { sha256Hex } from './password.js';
import { recordActivity } from './activity.js';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const DIGEST = /^[A-Za-z0-9+/]{43}=$/u;
export const RESUMABLE_LIMITS = Object.freeze({ maxFileBytes: 5_000_000_000, partSizeBytes: 8 * 1024 ** 2,
  maxParts: 1280, maxParallelParts: 1, sessionTtlSeconds: 7 * 86400 });
const STATES = new Set(['creating', 'active', 'paused', 'completing', 'completed', 'cancelling', 'cancelled', 'expired']);

export function publicTransferCapabilities(caps, enabled) {
  const value = caps?.transfers;
  if (!enabled || value?.resumableUpload !== true) return { resumableUpload: false };
  // Version-one geometry is deliberately fixed until end-to-end limits are verified.
  if (Object.entries(RESUMABLE_LIMITS).some(([key, expected]) => key === 'maxFileBytes'
    ? !Number.isSafeInteger(value[key]) || value[key] <= 0
    : value[key] !== expected)) {
    throw new ApiError('PROVIDER_UNAVAILABLE', 502);
  }
  return { resumableUpload: true, ...RESUMABLE_LIMITS,
    maxFileBytes: Math.min(value.maxFileBytes, RESUMABLE_LIMITS.maxFileBytes) };
}

export function isUploadCancellation(method, parts) {
  return method === 'DELETE' && parts.length === 7 && parts[1] === 'storage' && parts[2] === 'v1'
    && parts[3] === 'storages' && ID.test(parts[4] || '') && parts[5] === 'uploads' && ID.test(parts[6] || '');
}

function validName(name) {
  return typeof name === 'string' && name === name.toWellFormed() && name.trim() && new TextEncoder().encode(name).length <= 255
    && !/[\p{Cc}\\/]/u.test(name);
}

function safeSession(payload, row) {
  const p = payload?.data ?? payload;
  if (!p || !ID.test(p.uploadSessionId || '') || !STATES.has(p.state)
    || !Number.isSafeInteger(p.version) || p.version < 0 || p.sizeBytes !== row.size_bytes
    || p.partSizeBytes !== RESUMABLE_LIMITS.partSizeBytes || p.partCount !== Math.ceil(row.size_bytes / p.partSizeBytes)
    || !Number.isSafeInteger(p.expiresAt) || p.expiresAt > row.expires_at
    || !Number.isSafeInteger(p.acknowledgedBytes) || p.acknowledgedBytes < 0 || p.acknowledgedBytes > row.size_bytes
    || !Array.isArray(p.parts) || p.parts.length > 100
    || (p.nextCursor !== null && !/^[1-9][0-9]{0,3}$/u.test(p.nextCursor || ''))
    || (row.shared_session_id && p.uploadSessionId !== row.shared_session_id)) throw new ApiError('PROVIDER_UNAVAILABLE', 502);
  let last = 0;
  const parts = p.parts.map(part => {
    if (!Number.isInteger(part.partNumber) || part.partNumber <= last || part.partNumber > p.partCount || !DIGEST.test(part.sha256 || '')) throw new ApiError('PROVIDER_UNAVAILABLE', 502);
    last = part.partNumber;
    const expected = last === p.partCount ? row.size_bytes - (last - 1) * p.partSizeBytes : p.partSizeBytes;
    if (part.sizeBytes !== expected) throw new ApiError('PROVIDER_UNAVAILABLE', 502);
    return { partNumber: last, sizeBytes: expected, sha256: part.sha256 };
  });
  const object = p.state === 'completed' ? normalizeObject(p.object) : null;
  if (p.state === 'completed' && (!object || !ID.test(object.objectId) || object.type !== 'file' || object.sizeBytes !== row.size_bytes
    || object.parentId !== row.parent_id)) throw new ApiError('PROVIDER_UNAVAILABLE', 502);
  return { safe: { transferId: row.id, state: p.state, version: p.version, sizeBytes: row.size_bytes,
    partSizeBytes: p.partSizeBytes, partCount: p.partCount, expiresAt: p.expiresAt,
    acknowledgedBytes: p.acknowledgedBytes, parts, nextCursor: p.nextCursor, ...(object ? { object } : {}) }, sharedId: p.uploadSessionId };
}

// Bound each raw part without materializing a file (or a part) inside Pages.
export function exactPartStream(body, expected) {
  if (!body) throw new ApiError('INVALID_INPUT', 400);
  const reader = body.getReader();
  let bytes = 0;
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (bytes !== expected) throw new ApiError('TRANSFER_INCOMPLETE', 502);
          controller.close();
          return;
        }
        bytes += value.byteLength;
        if (bytes > expected) throw new ApiError('UPLOAD_TOO_LARGE', 413);
        controller.enqueue(value);
      } catch (error) { await reader.cancel().catch(() => {}); controller.error(error); }
    },
    async cancel(reason) { await reader.cancel(reason); },
  });
}

export async function handleUploadSessions({ request, env, user, storageId, tail, fetchImpl = fetch, logger = console }) {
  const method = request.method.toUpperCase();
  const cancellation = method === 'DELETE' && tail.length === 2;
  if (env.STORAGE_RESUMABLE_UPLOADS_ENABLED !== 'true' && (!cancellation
    || !(await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'transfer_sessions'").bind().first()))) throw new ApiError('CAPABILITY_UNAVAILABLE', 422);
  if (!ID.test(storageId || '')) throw new ApiError('NOT_FOUND', 404);
  const db = env.DB;
  const access = await getStorageAccessForUser(db, user, storageId);
  // Cancellation intentionally survives grant revocation and maintenance, but only
  // for the authenticated creator and the original, unchanged server mapping.
  const mount = cancellation ? await db.prepare('SELECT * FROM storage_mounts WHERE id = ?').bind(storageId).first() : access?.mount;
  if (!mount || mount.provider !== 'garage' || (!cancellation && mount.status !== 'active')) throw new ApiError('NOT_FOUND', 404);
  if (!cancellation && !access.grants.upload) throw new ApiError('FORBIDDEN', 403);
  const client = createStorageClient({ env, fetchImpl, logger });
  const call = (path, options = {}) => client.jsonRequest({ request, projectId: mount.shared_storage_project_id, path,
    operation: 'upload-session', maxResponseBytes: 65536, ...options });
  async function authorizeUpload() {
    const current = await getStorageAccessForUser(db, user, storageId);
    if (!current || current.mount.status !== 'active' || current.mount.shared_storage_project_id !== mount.shared_storage_project_id) throw new ApiError('NOT_FOUND', 404);
    const response = await call('/capabilities');
    const caps = (response?.data ?? response)?.capabilities;
    const policy = await getSystemSettings(db);
    if (!intersectStoragePermissions(current.grants, caps, { readOnly: current.mount.read_only,
      maintenance: user.role !== 'admin' && policy.maintenanceMode }).upload) throw new ApiError('FORBIDDEN', 403);
    const transfers = publicTransferCapabilities(caps, true);
    if (!transfers.resumableUpload) throw new ApiError('CAPABILITY_UNAVAILABLE', 422);
    return transfers;
  }
  const transfers = !cancellation ? await authorizeUpload() : null;
  const url = new URL(request.url);
  let row;
  const id = tail[1];
  if (id) {
    if (!ID.test(id)) throw new ApiError('NOT_FOUND', 404);
    row = await db.prepare('SELECT * FROM transfer_sessions WHERE id = ? AND user_id = ? AND storage_id = ?').bind(id, user.id, storageId).first();
    if (!row) throw new ApiError('NOT_FOUND', 404);
    if (row.project_id !== mount.shared_storage_project_id) throw new ApiError('UPLOAD_CONFLICT', 409);
  }
  async function receive(payload, status = 200) {
    const { safe, sharedId } = safeSession(payload, row);
    await db.prepare(`UPDATE transfer_sessions SET shared_session_id = ?, state = ? WHERE id = ?
      AND (shared_session_id IS NOT ? OR state IS NOT ?)`)
      .bind(sharedId, safe.state, row.id, sharedId, safe.state).run();
    if (safe.state === 'completed') await recordActivity(db, user, { storageMountId: storageId, storageName: mount.name,
      action: 'upload', objectId: safe.object.objectId, objectName: safe.object.name, objectType: 'file', parentId: safe.object.parentId },
    { logger, eventId: row.id });
    return json(safe, status);
  }
  async function createUpstream(status = 201) {
    const payload = await call('/uploads', { method: 'POST', contentType: 'application/json',
      requestHeaders: { 'Idempotency-Key': row.id }, body: JSON.stringify({ name: row.name, parentId: row.parent_id, sizeBytes: row.size_bytes, mimeType: row.mime_type, expiresAt: row.expires_at }) });
    return receive(payload, status);
  }
  if (method === 'POST' && tail.length === 1) {
    const key = request.headers.get('Idempotency-Key');
    if (!ID.test(key || '')) throw new ApiError('INVALID_INPUT', 400);
    const body = await readJson(request);
    if (Object.keys(body).some(k => !['name','parentId','sizeBytes','mimeType'].includes(k)) || !validName(body.name)
      || (body.parentId != null && !ID.test(body.parentId)) || !Number.isSafeInteger(body.sizeBytes) || body.sizeBytes <= 0
      || (body.mimeType !== undefined && (typeof body.mimeType !== 'string' || body.mimeType.length > 160 || !/^[\w.+-]+\/[\w.+-]+$/u.test(body.mimeType)))) throw new ApiError('INVALID_INPUT', 400);
    if (body.sizeBytes > transfers.maxFileBytes) throw new ApiError('UPLOAD_TOO_LARGE', 413);
    const name = body.name.normalize('NFC').trim(), parentId = body.parentId ?? null, mimeType = body.mimeType ?? 'application/octet-stream';
    const keyHash = await sha256Hex(key), fingerprint = await sha256Hex(JSON.stringify([name, parentId, body.sizeBytes, mimeType]));
    await db.prepare(`INSERT OR IGNORE INTO transfer_sessions
      (id,user_id,storage_id,project_id,request_key_hash,fingerprint,name,parent_id,mime_type,size_bytes,created_at,expires_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM transfer_sessions WHERE user_id = ? AND state NOT IN ('completed','cancelled','expired')) < 10`)
      .bind(crypto.randomUUID(), user.id, storageId, mount.shared_storage_project_id, keyHash, fingerprint, name, parentId, mimeType,
        body.sizeBytes, Date.now(), Date.now() + RESUMABLE_LIMITS.sessionTtlSeconds * 1000, user.id).run();
    row = await db.prepare('SELECT * FROM transfer_sessions WHERE user_id = ? AND storage_id = ? AND request_key_hash = ?').bind(user.id, storageId, keyHash).first();
    if (!row) throw new ApiError('UPLOAD_BUSY', 429);
    if (row.fingerprint !== fingerprint || row.project_id !== mount.shared_storage_project_id) throw new ApiError('UPLOAD_CONFLICT', 409);
    if (row.expires_at <= Date.now() && !['completed','cancelled'].includes(row.state)) throw new ApiError('UPLOAD_EXPIRED', 410);
    return createUpstream();
  }
  if (method === 'GET' && tail.length === 1) {
    const cursor = url.searchParams.get('cursor') || '';
    if (cursor && !ID.test(cursor)) throw new ApiError('INVALID_INPUT', 400);
    const limit = Number(url.searchParams.get('limit') || 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError('INVALID_INPUT', 400);
    const rows = await db.prepare(`SELECT id,name,size_bytes,state,expires_at FROM transfer_sessions
      WHERE user_id = ? AND storage_id = ? AND project_id = ? AND id > ? ORDER BY id LIMIT ?`)
      .bind(user.id, storageId, mount.shared_storage_project_id, cursor, limit + 1).all();
    const selected = rows.results.slice(0, limit);
    return json({ sessions: selected.map(r => ({ transferId: r.id, name: r.name, sizeBytes: r.size_bytes, state: r.state,
      expiresAt: r.expires_at, statusSource: 'broker-snapshot' })), nextCursor: rows.results.length > limit ? selected.at(-1).id : null });
  }
  if (!row) throw new ApiError('NOT_FOUND', 404);
  // Keep status and cancellation available for sessions created under an older limit.
  if (transfers && row.size_bytes > transfers.maxFileBytes && (method === 'PUT' || method === 'POST')) {
    throw new ApiError('UPLOAD_TOO_LARGE', 413);
  }
  if (!row.shared_session_id) {
    // A create acknowledgement can be lost; stable upstream idempotency recovers it.
    if (method === 'GET' && tail.length === 2) {
      if (row.size_bytes > transfers.maxFileBytes) throw new ApiError('UPLOAD_TOO_LARGE', 413);
      return createUpstream(200);
    }
    if (!cancellation) throw new ApiError('UPLOAD_CONFLICT', 409);
    await call(`/uploads/by-key/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
    await db.prepare("UPDATE transfer_sessions SET state = 'cancelled' WHERE id = ?").bind(row.id).run();
    return json({ transferId: row.id, state: 'cancelled' });
  }
  const base = `/uploads/${encodeURIComponent(row.shared_session_id)}`;
  if (method === 'GET' && tail.length === 2) {
    const cursor = url.searchParams.get('partsCursor') || '0', limit = url.searchParams.get('limit') || '100';
    if (!/^[0-9]{1,4}$/u.test(cursor) || Number(cursor) > 1280 || !/^[0-9]{1,3}$/u.test(limit) || Number(limit) < 1 || Number(limit) > 100) throw new ApiError('INVALID_INPUT', 400);
    return receive(await call(`${base}?partsCursor=${cursor}&limit=${limit}`));
  }
  if (cancellation) {
    const payload = await call(base, { method: 'DELETE' });
    const response = await receive(payload);
    // No provider metadata is forwarded by receive, including cleanup responses.
    return response;
  }
  if (method === 'PUT' && tail.length === 4 && tail[2] === 'parts') {
    const number = Number(tail[3]), count = Math.ceil(row.size_bytes / RESUMABLE_LIMITS.partSizeBytes);
    const digest = request.headers.get('X-Part-SHA256');
    if (!/^[1-9][0-9]{0,3}$/u.test(tail[3]) || !Number.isInteger(number) || number > count || !DIGEST.test(digest || '')
      || request.headers.get('Content-Type') !== 'application/octet-stream') throw new ApiError('INVALID_INPUT', 400);
    const expected = number === count ? row.size_bytes - (number - 1) * RESUMABLE_LIMITS.partSizeBytes : RESUMABLE_LIMITS.partSizeBytes;
    const declared = request.headers.get('Content-Length');
    if (declared !== null && Number(declared) !== expected) throw new ApiError('INVALID_INPUT', 400);
    const payload = await call(`${base}/parts/${number}`, { method: 'PUT', contentType: 'application/octet-stream',
      requestHeaders: { 'X-Part-SHA256': digest }, body: exactPartStream(request.body, expected) });
    const part = payload?.data ?? payload;
    if (part?.partNumber !== number || part.sizeBytes !== expected || part.sha256 !== digest) throw new ApiError('PROVIDER_UNAVAILABLE', 502);
    return json({ partNumber: number, sizeBytes: expected, sha256: digest });
  }
  if (method === 'POST' && tail.length === 3 && ['complete','pause','resume'].includes(tail[2])) {
    const body = await readJson(request);
    if (Object.keys(body).some(k => k !== 'version') || !Number.isInteger(body.version) || body.version < 0) throw new ApiError('INVALID_INPUT', 400);
    // Refresh authorization immediately before publication, never trust creation grants.
    if (tail[2] === 'complete') {
      const current = await authorizeUpload();
      if (row.size_bytes > current.maxFileBytes) throw new ApiError('UPLOAD_TOO_LARGE', 413);
    }
    return receive(await call(`${base}/${tail[2]}`, { method: 'POST', contentType: 'application/json', body: JSON.stringify(body) }));
  }
  throw new ApiError('NOT_FOUND', 404);
}
