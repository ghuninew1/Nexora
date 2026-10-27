import { requireStorageMount, requireObjectId } from './authorization.js';
import { ApiError, json, normalizeUpstreamError, readJson, statusFor } from './http.js';
import { createStorageClient, normalizeCapabilities, normalizeObject, readBoundedJson } from './storage-client.js';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;
const MAX_MEDIA_PREVIEW_BYTES = 20 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD = 1024 * 1024;
const COPY_DIAGNOSTIC_CODES = new Set([
  'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'INVALID_INPUT', 'NAME_CONFLICT',
  'CAPABILITY_UNAVAILABLE', 'QUOTA_EXCEEDED', 'UPLOAD_TOO_LARGE', 'OPERATION_TOO_LARGE',
  'PROVIDER_UNAVAILABLE', 'TRANSFER_INCOMPLETE', 'RATE_LIMITED', 'INTERNAL_ERROR',
]);
function resourcePath(suffix = '') { return `/objects${suffix}`; }

function copyDiagnostic(logger, message) {
  try { logger?.warn?.(`[storage-upstream] operation=copy ${message}`); } catch { /* diagnostics must not affect API behavior */ }
}

function limitStream(body, maxBytes) {
  const reader = body.getReader();
  let total = 0;
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          controller.error(new ApiError('UPLOAD_TOO_LARGE', 413));
          return;
        }
        controller.enqueue(value);
      } catch { controller.error(new ApiError('UPLOAD_TOO_LARGE', 413)); }
    },
    async cancel(reason) { await reader.cancel(reason); },
  });
}

function upstreamPayload(payload) { return payload?.data && typeof payload.data === 'object' ? payload.data : payload; }

function validateName(name) {
  const hasControl = typeof name === 'string' && [...name].some((character) => {
    const code = character.codePointAt(0);
    return code <= 31 || (code >= 127 && code <= 159);
  });
  if (typeof name !== 'string' || !name.trim() || new TextEncoder().encode(name).length > 255 || hasControl || name.includes('/') || name.includes('\\')) {
    throw new ApiError('INVALID_INPUT', 400);
  }
  return name;
}

function parseLimit(value) {
  if (value === null) return 50;
  if (!/^[0-9]{1,3}$/u.test(value)) throw new ApiError('INVALID_INPUT', 400);
  const limit = Number(value);
  if (limit < 1 || limit > 100) throw new ApiError('INVALID_INPUT', 400);
  return limit;
}

async function callJson(client, request, mount, path, options = {}) {
  const payload = await client.jsonRequest({ request, projectId: mount.shared_storage_project_id, path, ...options });
  return upstreamPayload(payload);
}

async function requireCapability(client, request, mount, capability) {
  const payload = await callJson(client, request, mount, '/capabilities');
  if (payload?.capabilities?.[capability] !== true) throw new ApiError('CAPABILITY_UNAVAILABLE', 422);
}

async function recordRecent(db, user, mount, objectId, now = Date.now()) {
  const existing = await db.prepare('SELECT accessed_at FROM recent_access WHERE user_id = ? AND storage_mount_id = ? AND object_id = ?')
    .bind(user.id, mount.id, objectId).first();
  if (existing && Number(existing.accessed_at) > now - 60_000) return;
  await db.prepare(`INSERT INTO recent_access (user_id, storage_mount_id, object_id, accessed_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, storage_mount_id, object_id) DO UPDATE SET accessed_at = excluded.accessed_at`)
    .bind(user.id, mount.id, objectId, now).run();
  await db.prepare('DELETE FROM recent_access WHERE user_id = ? AND accessed_at < ?').bind(user.id, now - 90 * 24 * 60 * 60 * 1000).run();
  await db.prepare(`DELETE FROM recent_access WHERE user_id = ? AND (storage_mount_id, object_id) NOT IN
    (SELECT storage_mount_id, object_id FROM recent_access WHERE user_id = ? ORDER BY accessed_at DESC LIMIT 100)`)
    .bind(user.id, user.id).run();
}

async function getObject(client, request, mount, objectId) {
  const payload = await callJson(client, request, mount, resourcePath(`/${encodeURIComponent(objectId)}`));
  return normalizeObject(payload?.object || payload?.item || payload);
}

function safeContentType(value) {
  return typeof value === 'string' && value.length <= 160 && /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+(?:\s*;\s*[\w!#$&^_.+-]+=(?:[\w!#$&^_.+-]+|"[\w .!#$&^_+-]*"))*$/u.test(value)
    ? value : 'application/octet-stream';
}

function safeDisposition(value) {
  if (typeof value !== 'string' || value.length > 512 || value.includes('\r') || value.includes('\n') || value.includes('\0')) return null;
  return /^attachment;\s*filename\*=UTF-8''[A-Za-z0-9%._~!$&'()+,-]+$/u.test(value) ? value : null;
}

const SAFE_PREVIEW_MIME_TYPES = new Map([
  ['image/jpeg', 'image'], ['image/png', 'image'], ['image/webp', 'image'],
  ['image/gif', 'image'], ['image/avif', 'image'], ['application/pdf', 'pdf'],
  ['text/plain', 'text'], ['text/markdown', 'text'], ['text/x-markdown', 'text'],
  ['text/csv', 'text'], ['application/csv', 'text'], ['application/json', 'text'],
  ['text/json', 'text'], ['application/xml', 'text'], ['text/xml', 'text'],
  ['text/css', 'text'], ['text/javascript', 'text'], ['application/javascript', 'text'],
  ['text/typescript', 'text'], ['application/typescript', 'text'],
  ['text/x-python', 'text'], ['text/x-java-source', 'text'], ['text/x-shellscript', 'text'],
]);

const SAFE_PREVIEW_EXTENSIONS = new Map([
  ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp'],
  ['gif', 'image/gif'], ['avif', 'image/avif'], ['pdf', 'application/pdf'], ['txt', 'text/plain'],
  ['md', 'text/markdown'], ['markdown', 'text/markdown'], ['csv', 'text/csv'], ['json', 'application/json'],
  ['log', 'text/plain'], ['yaml', 'text/plain'], ['yml', 'text/plain'], ['toml', 'text/plain'],
  ['ini', 'text/plain'], ['env', 'text/plain'], ['js', 'text/javascript'], ['jsx', 'text/javascript'],
  ['mjs', 'text/javascript'], ['ts', 'text/typescript'], ['tsx', 'text/typescript'], ['css', 'text/css'],
  ['py', 'text/x-python'], ['sh', 'text/x-shellscript'], ['java', 'text/x-java-source'],
  ['c', 'text/plain'], ['h', 'text/plain'], ['cpp', 'text/plain'], ['go', 'text/plain'],
  ['rs', 'text/plain'], ['sql', 'text/plain'],
]);

function previewSpec(object) {
  const mimeType = typeof object?.mimeType === 'string'
    ? object.mimeType.split(';', 1)[0].trim().toLowerCase()
    : '';
  let safeMime = mimeType;
  if (!SAFE_PREVIEW_MIME_TYPES.has(safeMime)) {
    if (safeMime && safeMime !== 'application/octet-stream') return null;
    const extension = typeof object?.name === 'string' && object.name.includes('.')
      ? object.name.split('.').pop().toLowerCase()
      : '';
    safeMime = SAFE_PREVIEW_EXTENSIONS.get(extension);
  }
  const kind = SAFE_PREVIEW_MIME_TYPES.get(safeMime);
  if (!kind) return null;
  return { kind, mimeType: safeMime, maxBytes: kind === 'text' ? MAX_TEXT_PREVIEW_BYTES : MAX_MEDIA_PREVIEW_BYTES };
}

function streamResponse(result) {
  const { response, cleanup, abort, timedOut } = result;
  const reader = response.body?.getReader();
  if (!reader) { cleanup(); throw new ApiError('PROVIDER_UNAVAILABLE', 502); }
  const body = new ReadableStream({
    async pull(controller) {
      try {
        if (timedOut()) throw new Error('timeout');
        const { done, value } = await reader.read();
        if (done) { cleanup(); controller.close(); return; }
        controller.enqueue(value);
      } catch {
        abort(); cleanup();
        controller.error(new ApiError('TRANSFER_INCOMPLETE', 502));
      }
    },
    async cancel(reason) { try { await reader.cancel(reason); } finally { abort(); cleanup(); } },
  });
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': safeContentType(response.headers.get('Content-Type')),
  });
  const size = response.headers.get('Content-Length');
  if (size && /^(0|[1-9][0-9]{0,15})$/u.test(size)) headers.set('Content-Length', size);
  const disposition = safeDisposition(response.headers.get('Content-Disposition'));
  if (disposition) headers.set('Content-Disposition', disposition);
  return new Response(body, { status: 200, headers });
}

function streamPreviewResponse(result, { mimeType, maxBytes }) {
  const { response, cleanup, abort, timedOut } = result;
  const reader = response.body?.getReader();
  if (!reader) { cleanup(); throw new ApiError('PROVIDER_UNAVAILABLE', 502); }
  let totalBytes = 0;
  const body = new ReadableStream({
    async pull(controller) {
      try {
        if (timedOut()) throw new Error('timeout');
        const { done, value } = await reader.read();
        if (done) { cleanup(); controller.close(); return; }
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          abort(); cleanup();
          controller.error(new ApiError('PREVIEW_TOO_LARGE', 413));
          return;
        }
        controller.enqueue(value);
      } catch {
        abort(); cleanup();
        controller.error(new ApiError('TRANSFER_INCOMPLETE', 502));
      }
    },
    async cancel(reason) { try { await reader.cancel(reason); } finally { abort(); cleanup(); } },
  });
  return new Response(body, { status: 200, headers: {
    'Cache-Control': 'private, no-store',
    'Content-Disposition': 'inline',
    'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data: blob:",
    'Content-Type': mimeType,
    'X-Content-Type-Options': 'nosniff',
  } });
}

export async function handleStorageApi({ request, env, user, parts, fetchImpl = fetch, logger = console }) {
  const client = createStorageClient({ env, fetchImpl, logger });
  const method = request.method.toUpperCase();
  const [api, version, storages, storageId, ...rest] = parts;
  if (api !== 'api' || version !== 'storage' || storages !== 'v1') throw new ApiError('NOT_FOUND', 404);

  if (storageId === 'storages' && rest.length === 0 && method === 'GET') {
    const rows = await env.DB.prepare(`SELECT id, name, provider, status, read_only FROM storage_mounts
      WHERE owner_user_id = ? ORDER BY name, id`).bind(user.id).all();
    return json({ storages: (rows.results || []).map((mount) => ({ storageId: mount.id, name: mount.name,
      providerLabel: 'Private storage', status: mount.status, readOnly: Number(mount.read_only) === 1 })) });
  }

  const storageIdIsRoute = storageId === 'storages';
  if (!storageIdIsRoute) throw new ApiError('NOT_FOUND', 404);
  if (rest.length === 0) throw new ApiError('NOT_FOUND', 404);
  const [mountId, ...tail] = rest;
  if (!mountId) throw new ApiError('NOT_FOUND', 404);
  const knownSubroutes = ['capabilities', 'usage', 'objects', 'trash', 'operations'];
  if (!knownSubroutes.includes(tail[0])) {
    const mount = await requireStorageMount(env.DB, user, mountId, { allowInactive: tail.length === 0 && method === 'GET' });
    if (tail.length === 0 && method === 'GET') return json({ storage: { storageId: mount.id, name: mount.name,
      providerLabel: 'Private storage', status: mount.status, readOnly: mount.read_only } });
  }
  const route = tail[0];
  const mount = await requireStorageMount(env.DB, user, mountId, {
    diagnosticOperation: route === 'capabilities' ? 'capabilities' : undefined,
    logger,
  });
  const restTail = tail.slice(1);
  if (route === 'objects' && restTail[1] === 'copy' && method === 'POST') {
    copyDiagnostic(logger, 'stage=mount-resolved');
  }

  if (route === 'capabilities' && method === 'GET' && restTail.length === 0) {
    const payload = await callJson(client, request, mount, '/capabilities', { operation: 'capabilities' });
    if (!payload?.capabilities || typeof payload.capabilities !== 'object' || Array.isArray(payload.capabilities)) {
      try { logger?.warn?.('[storage-upstream] operation=capabilities result=schema-error status=200'); } catch { /* diagnostics must not affect response handling */ }
    }
    const configuredLimit = Number(env.STORAGE_MAX_UPLOAD_BYTES || MAX_UPLOAD_BYTES);
    const maxUploadBytes = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 ? Math.min(configuredLimit, MAX_UPLOAD_BYTES) : MAX_UPLOAD_BYTES;
    return json({ capabilities: normalizeCapabilities(payload?.capabilities, mount, maxUploadBytes) });
  }
  if (route === 'usage' && method === 'GET' && restTail.length === 0) {
    return json({ usage: { status: 'unavailable', usedBytes: null, quotaBytes: null, objectCount: null, measuredAt: null } });
  }
  if (route === 'objects' && restTail.length === 0 && method === 'GET') {
    const url = new URL(request.url);
    const parentId = url.searchParams.get('parentId');
    const cursor = url.searchParams.get('cursor');
    const limit = parseLimit(url.searchParams.get('limit'));
    if (parentId) requireObjectId(parentId);
    if (cursor && (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(cursor))) throw new ApiError('INVALID_INPUT', 400);
    const query = new URLSearchParams({ limit: String(limit) });
    if (parentId) query.set('parentId', parentId);
    if (cursor) query.set('cursor', cursor);
    const payload = await callJson(client, request, mount, `/objects?${query}`);
    return json({ items: (Array.isArray(payload?.items) ? payload.items : []).map(normalizeObject).filter(Boolean),
      nextCursor: typeof payload?.nextCursor === 'string' ? payload.nextCursor : null });
  }
  if (route === 'objects' && restTail.length === 1 && method === 'GET') {
    const objectId = requireObjectId(restTail[0]);
    const object = await getObject(client, request, mount, objectId);
    if (!object) throw new ApiError('PROVIDER_UNAVAILABLE', 502);
    await recordRecent(env.DB, user, mount, objectId);
    return json({ object });
  }
  if (route === 'folders' && method === 'POST' && restTail.length === 0) {
    const writable = await requireStorageMount(env.DB, user, mountId, { mutation: true });
    const body = await readJson(request);
    const name = validateName(body.name);
    const parentId = body.parentId ?? null;
    if (parentId !== null) requireObjectId(parentId);
    await requireCapability(client, request, writable, 'createFolder');
    const payload = await callJson(client, request, writable, '/objects/folders', { method: 'POST', body: JSON.stringify({ name, parentId }), contentType: 'application/json' });
    const object = normalizeObject(payload?.object);
    if (!object) throw new ApiError('PROVIDER_UNAVAILABLE', 502);
    return json({ folder: object }, 201);
  }
  if (route === 'files' && method === 'POST' && restTail.length === 0) {
    const writable = await requireStorageMount(env.DB, user, mountId, { mutation: true });
    const contentType = request.headers.get('Content-Type') || '';
    if (!/^multipart\/form-data;\s*boundary=/i.test(contentType) || !request.body) throw new ApiError('INVALID_INPUT', 415);
    const maxUploadBytes = Number(env.STORAGE_MAX_UPLOAD_BYTES || MAX_UPLOAD_BYTES);
    const safeMaximum = Number.isSafeInteger(maxUploadBytes) && maxUploadBytes > 0 ? Math.min(maxUploadBytes, MAX_UPLOAD_BYTES) : MAX_UPLOAD_BYTES;
    const contentLength = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(contentLength) && contentLength > safeMaximum + MAX_MULTIPART_OVERHEAD) throw new ApiError('UPLOAD_TOO_LARGE', 413);
    await requireCapability(client, request, writable, 'upload');
    const payload = await callJson(client, request, writable, '/files', { method: 'POST', body: limitStream(request.body, safeMaximum + MAX_MULTIPART_OVERHEAD), contentType });
    const object = normalizeObject(payload?.object);
    if (!object) throw new ApiError('PROVIDER_UNAVAILABLE', 502);
    return json({ file: object, operationId: typeof payload?.operationId === 'string' ? payload.operationId : null }, 201);
  }
  if (route === 'files' && restTail.length === 2 && restTail[1] === 'download' && method === 'GET') {
    const objectId = requireObjectId(restTail[0]);
    await requireCapability(client, request, mount, 'download');
    const result = await client.request({ request, projectId: mount.shared_storage_project_id, path: `/objects/${encodeURIComponent(objectId)}/download` });
    if (!result.response.ok) {
      const payload = await readBoundedJson(result.response);
      result.cleanup();
      const code = normalizeUpstreamError(payload, result.response.status);
      throw new ApiError(code, statusFor(code));
    }
    await recordRecent(env.DB, user, mount, objectId);
    return streamResponse(result);
  }
  if (route === 'objects' && restTail.length >= 1) {
    const objectId = requireObjectId(restTail[0]);
    const suffix = restTail.slice(1);
    const writable = method === 'GET' ? mount : await requireStorageMount(env.DB, user, mountId, { mutation: true });
    if (suffix.length === 0 && method === 'PATCH') {
      const body = await readJson(request);
      const name = validateName(body.name);
      await requireCapability(client, request, writable, 'rename');
      const payload = await callJson(client, request, writable, `/objects/${encodeURIComponent(objectId)}`, { method: 'PATCH', body: JSON.stringify({ name }), contentType: 'application/json' });
      const object = normalizeObject(payload?.object);
      if (!object) throw new ApiError('PROVIDER_UNAVAILABLE', 502);
      return json({ object });
    }
    if (suffix[0] === 'download' && suffix.length === 1 && method === 'GET') {
      await requireCapability(client, request, mount, 'download');
      const result = await client.request({ request, projectId: mount.shared_storage_project_id, path: `/objects/${encodeURIComponent(objectId)}/download` });
      if (!result.response.ok) {
        const payload = await readBoundedJson(result.response);
        result.cleanup();
        const code = normalizeUpstreamError(payload, result.response.status);
        throw new ApiError(code, statusFor(code));
      }
      await recordRecent(env.DB, user, mount, objectId);
      return streamResponse(result);
    }
    if (suffix[0] === 'preview' && suffix.length === 1 && method === 'GET') {
      await requireCapability(client, request, mount, 'download');
      const object = await getObject(client, request, mount, objectId);
      if (!object) throw new ApiError('NOT_FOUND', 404);
      if (object.type !== 'file') throw new ApiError('PREVIEW_UNSUPPORTED', 415);
      const spec = previewSpec(object);
      if (!spec) throw new ApiError('PREVIEW_UNSUPPORTED', 415);
      if (!Number.isSafeInteger(object.sizeBytes) || object.sizeBytes < 0) throw new ApiError('PREVIEW_UNSUPPORTED', 415);
      if (object.sizeBytes > spec.maxBytes) throw new ApiError('PREVIEW_TOO_LARGE', 413);
      const result = await client.request({ request, projectId: mount.shared_storage_project_id, path: `/objects/${encodeURIComponent(objectId)}/download` });
      if (!result.response.ok) {
        const payload = await readBoundedJson(result.response);
        result.cleanup();
        const code = normalizeUpstreamError(payload, result.response.status);
        throw new ApiError(code, statusFor(code));
      }
      const upstreamMimeType = (result.response.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
      const upstreamKind = SAFE_PREVIEW_MIME_TYPES.get(upstreamMimeType);
      if (upstreamMimeType && upstreamMimeType !== 'application/octet-stream' && upstreamKind !== spec.kind) {
        result.cleanup();
        throw new ApiError('PREVIEW_UNSUPPORTED', 415);
      }
      const contentLength = result.response.headers.get('Content-Length');
      if (contentLength && /^(0|[1-9][0-9]{0,15})$/u.test(contentLength) && Number(contentLength) > spec.maxBytes) {
        result.cleanup();
        throw new ApiError('PREVIEW_TOO_LARGE', 413);
      }
      await recordRecent(env.DB, user, mount, objectId);
      return streamPreviewResponse(result, spec);
    }
    if (suffix[0] === 'move' && suffix.length === 1 && method === 'POST') {
      const body = await readJson(request);
      if (body.targetStorageId !== undefined && body.targetStorageId !== mount.id) throw new ApiError('CAPABILITY_UNAVAILABLE', 422);
      if (!Object.hasOwn(body, 'parentId') || (body.parentId !== null && typeof body.parentId !== 'string')) throw new ApiError('INVALID_INPUT', 400);
      if (body.parentId) requireObjectId(body.parentId);
      await requireCapability(client, request, writable, 'move');
      const payload = await callJson(client, request, writable, `/objects/${encodeURIComponent(objectId)}/move`, { method: 'POST', body: JSON.stringify({ parentId: body.parentId }), contentType: 'application/json' });
      const object = normalizeObject(payload?.object);
      if (!object) throw new ApiError('PROVIDER_UNAVAILABLE', 502);
      return json({ object });
    }
    if (suffix[0] === 'copy' && suffix.length === 1 && method === 'POST') {
      const body = await readJson(request);
      if (body.targetStorageId !== undefined && body.targetStorageId !== mount.id) throw new ApiError('CAPABILITY_UNAVAILABLE', 422);
      const parentId = body.parentId ?? null;
      if (parentId !== null) requireObjectId(parentId);
      copyDiagnostic(logger, 'stage=capability-check');
      try { await requireCapability(client, request, writable, 'copy'); }
      catch (error) {
        const code = COPY_DIAGNOSTIC_CODES.has(error?.code) ? error.code : 'INTERNAL_ERROR';
        copyDiagnostic(logger, `result=operation-error code=${code} stage=capability-check`);
        throw error;
      }
      const payload = await callJson(client, request, writable, `/objects/${encodeURIComponent(objectId)}/copy`, {
        method: 'POST', body: JSON.stringify({ parentId }), contentType: 'application/json', operation: 'copy',
      });
      const object = normalizeObject(payload?.object);
      if (!object || object.objectId === objectId || object.parentId !== parentId) {
        copyDiagnostic(logger, 'result=invalid-response');
        throw new ApiError('PROVIDER_UNAVAILABLE', 502);
      }
      copyDiagnostic(logger, 'result=success');
      return json({ object, operationId: typeof payload?.operationId === 'string' ? payload.operationId : null }, 201);
    }
    if (suffix.length === 0 && method === 'DELETE') {
      await requireCapability(client, request, writable, 'trash');
      const payload = await callJson(client, request, writable, `/objects/${encodeURIComponent(objectId)}`, { method: 'DELETE' });
      const object = normalizeObject(payload?.object);
      if (!object || object.objectId !== objectId) throw new ApiError('PROVIDER_UNAVAILABLE', 502);
      return json({ object });
    }
  }
  if (route === 'trash' && restTail.length === 0 && method === 'GET') {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const limit = parseLimit(url.searchParams.get('limit'));
    if (cursor && (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(cursor))) throw new ApiError('INVALID_INPUT', 400);
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set('cursor', cursor);
    const payload = await callJson(client, request, mount, `/trash?${query}`);
    const nextCursor = payload?.nextCursor ?? null;
    if (nextCursor !== null && (typeof nextCursor !== 'string' || nextCursor.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(nextCursor))) {
      throw new ApiError('PROVIDER_UNAVAILABLE', 502);
    }
    return json({ items: (Array.isArray(payload?.items) ? payload.items : []).map(normalizeObject).filter(Boolean), nextCursor });
  }
  if (route === 'trash' && restTail.length === 2 && restTail[1] === 'restore' && method === 'POST') {
    const writable = await requireStorageMount(env.DB, user, mountId, { mutation: true });
    const objectId = requireObjectId(restTail[0]);
    const body = await readJson(request);
    if (body.parentId !== undefined && body.parentId !== null) requireObjectId(body.parentId);
    await requireCapability(client, request, writable, 'restore');
    const payload = await callJson(client, request, writable, `/trash/${encodeURIComponent(objectId)}/restore`, { method: 'POST', body: JSON.stringify(body), contentType: 'application/json' });
    const object = normalizeObject(payload?.object);
    if (!object || object.objectId !== objectId) throw new ApiError('PROVIDER_UNAVAILABLE', 502);
    return json({ object });
  }
  if (route === 'trash' && restTail.length === 2 && restTail[1] === 'permanent' && method === 'DELETE') {
    const writable = await requireStorageMount(env.DB, user, mountId, { mutation: true });
    const objectId = requireObjectId(restTail[0]);
    await requireCapability(client, request, writable, 'permanentDelete');
    const payload = await callJson(client, request, writable, `/trash/${encodeURIComponent(objectId)}/permanent`, { method: 'DELETE' });
    const operationId = typeof payload?.operationId === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(payload.operationId)
      ? payload.operationId : null;
    return json({ operationId, deleted: true });
  }
  if (route === 'operations' && restTail.length === 1 && method === 'GET') {
    const operationId = requireObjectId(restTail[0]);
    const payload = await callJson(client, request, mount, `/operations/${encodeURIComponent(operationId)}`);
    const operation = payload?.operation;
    if (!operation || typeof operation !== 'object') throw new ApiError('PROVIDER_UNAVAILABLE', 502);
    return json({ operation: { operationId: operation.operationId || operation.id || operationId,
      type: operation.type || null, status: operation.status || 'unknown', createdAt: operation.createdAt || null,
      updatedAt: operation.updatedAt || null, completedCount: Number.isSafeInteger(operation.completedItems) ? operation.completedItems : null,
      totalCount: Number.isSafeInteger(operation.totalItems) ? operation.totalItems : null,
      errorCode: ['NAME_CONFLICT', 'OPERATION_TOO_LARGE', 'CAPABILITY_UNAVAILABLE', 'INVALID_INPUT', 'NOT_FOUND', 'PROVIDER_UNAVAILABLE', 'TRANSFER_INCOMPLETE', 'INTERNAL_ERROR'].includes(operation.errorCode) ? operation.errorCode : null } });
  }
  throw new ApiError('NOT_FOUND', 404);
}

export async function handleFavoritesApi({ request, env, user, parts, fetchImpl = fetch }) {
  const client = createStorageClient({ env, fetchImpl });
  const method = request.method.toUpperCase();
  if (parts.length === 2 && parts[0] === 'api' && parts[1] === 'favorites' && method === 'GET') {
    const rows = await env.DB.prepare(`SELECT f.storage_mount_id, f.object_id, f.created_at, m.name AS storage_name
      FROM favorites f JOIN storage_mounts m ON m.id = f.storage_mount_id
      WHERE f.user_id = ? AND m.owner_user_id = ? AND m.status = 'active' ORDER BY f.created_at DESC LIMIT 100`)
      .bind(user.id, user.id).all();
    return json({ favorites: (rows.results || []).map((row) => ({ storageId: row.storage_mount_id, objectId: row.object_id,
      storageName: row.storage_name, createdAt: new Date(Number(row.created_at)).toISOString() })) });
  }
  if (parts.length !== 4 || parts[0] !== 'api' || parts[1] !== 'favorites') throw new ApiError('NOT_FOUND', 404);
  const storageId = parts[2];
  const objectId = requireObjectId(parts[3]);
  const mount = await requireStorageMount(env.DB, user, storageId);
  if (!['POST', 'DELETE'].includes(method)) throw new ApiError('NOT_FOUND', 404);
  if (method === 'POST') {
    const payload = await client.jsonRequest({ request, projectId: mount.shared_storage_project_id, path: `/objects/${encodeURIComponent(objectId)}` });
    const object = normalizeObject(payload?.object || payload?.data?.object);
    if (!object) throw new ApiError('NOT_FOUND', 404);
    await env.DB.prepare('INSERT INTO favorites (user_id, storage_mount_id, object_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING')
      .bind(user.id, mount.id, objectId, Date.now()).run();
    return json({ favorite: { storageId: mount.id, objectId, createdAt: new Date().toISOString() } }, 201);
  }
  await env.DB.prepare('DELETE FROM favorites WHERE user_id = ? AND storage_mount_id = ? AND object_id = ?').bind(user.id, mount.id, objectId).run();
  return json({ removed: true });
}

export async function handleRecentApi({ env, user }) {
  const rows = await env.DB.prepare(`SELECT r.storage_mount_id, r.object_id, r.accessed_at, m.name AS storage_name
    FROM recent_access r JOIN storage_mounts m ON m.id = r.storage_mount_id
    WHERE r.user_id = ? AND m.owner_user_id = ? AND m.status = 'active'
    ORDER BY r.accessed_at DESC LIMIT 100`).bind(user.id, user.id).all();
  return json({ items: (rows.results || []).map((row) => ({ storageId: row.storage_mount_id, objectId: row.object_id,
    storageName: row.storage_name, accessedAt: new Date(Number(row.accessed_at)).toISOString() })) });
}
