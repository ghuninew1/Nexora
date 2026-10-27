import { requireStorageMount, requireObjectId } from './authorization.js';
import { ApiError, json, normalizeUpstreamError, readJson, statusFor } from './http.js';
import { createStorageClient, normalizeCapabilities, normalizeObject, readBoundedJson } from './storage-client.js';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD = 1024 * 1024;
function resourcePath(suffix = '') { return `/objects${suffix}`; }

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
      await requireCapability(client, request, writable, 'copy');
      const payload = await callJson(client, request, writable, `/objects/${encodeURIComponent(objectId)}/copy`, { method: 'POST', body: JSON.stringify({ parentId }), contentType: 'application/json' });
      const object = normalizeObject(payload?.object);
      if (!object) throw new ApiError('PROVIDER_UNAVAILABLE', 502);
      return json({ object, operationId: typeof payload?.operationId === 'string' ? payload.operationId : null }, 201);
    }
    if (suffix.length === 0 && method === 'DELETE') {
      const payload = await callJson(client, request, writable, `/objects/${encodeURIComponent(objectId)}`, { method: 'DELETE' });
      return json({ object: normalizeObject(payload?.object) });
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
    return json({ items: (Array.isArray(payload?.items) ? payload.items : []).map(normalizeObject).filter(Boolean), nextCursor: payload?.nextCursor || null });
  }
  if (route === 'trash' && restTail.length === 2 && restTail[1] === 'restore' && method === 'POST') {
    const writable = await requireStorageMount(env.DB, user, mountId, { mutation: true });
    const objectId = requireObjectId(restTail[0]);
    const body = await readJson(request);
    if (body.parentId !== undefined && body.parentId !== null) requireObjectId(body.parentId);
    const payload = await callJson(client, request, writable, `/trash/${encodeURIComponent(objectId)}/restore`, { method: 'POST', body: JSON.stringify(body), contentType: 'application/json' });
    const object = normalizeObject(payload?.object);
    if (!object) throw new ApiError('PROVIDER_UNAVAILABLE', 502);
    return json({ object });
  }
  if (route === 'trash' && restTail.length === 2 && restTail[1] === 'permanent' && method === 'DELETE') {
    const writable = await requireStorageMount(env.DB, user, mountId, { mutation: true });
    const objectId = requireObjectId(restTail[0]);
    const payload = await callJson(client, request, writable, `/trash/${encodeURIComponent(objectId)}/permanent`, { method: 'DELETE' });
    return json({ operationId: payload?.operationId || null, deleted: true });
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
