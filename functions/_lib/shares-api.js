import { requireObjectId, requireStorageMount } from './authorization.js';
import { ApiError, fail, json, readJson } from './http.js';
import { randomToken, sha256Hex } from './password.js';
import { createStorageClient, normalizeObject } from './storage-client.js';
import { previewObjectResponse, streamResponse } from './storage-api.js';
import { findActivitySnapshot, recordActivity } from './activity.js';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const SECRET = /^[A-Za-z0-9_-]{43}$/u;
const unavailable = () => new ApiError('NOT_FOUND', 404);
const unwrap = (p) => p?.data && typeof p.data === 'object' ? p.data : p;
async function upstream(ctx, path) {
  return unwrap(await ctx.client.jsonRequest({ request: ctx.request, projectId: ctx.mount.shared_storage_project_id, path }));
}
async function stat(ctx, id) {
  requireObjectId(id);
  const p = await upstream(ctx, `/objects/${encodeURIComponent(id)}`);
  const raw = p?.object || p?.item || p;
  const object = normalizeObject(raw);
  if (!object || object.objectId !== id || (raw.deletedAt !== undefined && raw.deletedAt !== null) || !['file', 'folder'].includes(raw.type)
    || !(raw.parentId === null || (typeof raw.parentId === 'string' && ID.test(raw.parentId)))) throw unavailable();
  return object;
}
async function capabilities(ctx) {
  const p = await upstream(ctx, '/capabilities');
  if (p?.capabilities?.stat !== true) throw new ApiError('CAPABILITY_UNAVAILABLE', 422);
  return p.capabilities;
}
function required(caps, object) {
  if (caps[object.type === 'folder' ? 'list' : 'download'] !== true) throw new ApiError('CAPABILITY_UNAVAILABLE', 422);
}
function safeObject(object) {
  return { objectId: object.objectId, type: object.type, name: object.name, mimeType: object.mimeType,
    sizeBytes: object.sizeBytes, createdAt: object.createdAt, modifiedAt: object.modifiedAt };
}
function ownerShare(row, object = null, status = 'active') {
  return { id: row.id, storageId: row.storage_mount_id, storageName: row.storage_name,
    objectId: row.object_id, object, createdAt: new Date(row.created_at).toISOString(), status: row.revoked_at !== null ? 'revoked' : status };
}
async function owned(db, user, id) {
  requireObjectId(id);
  const row = await db.prepare(`SELECT s.*, m.name AS storage_name FROM public_shares s
    JOIN storage_mounts m ON m.id = s.storage_mount_id WHERE s.id = ? AND s.user_id = ?`).bind(id, user.id).first();
  if (!row) throw unavailable();
  return row;
}
async function hydrate(ctx, row) {
  try {
    const mount = await requireStorageMount(ctx.env.DB, ctx.user, row.storage_mount_id);
    const object = await stat({ ...ctx, mount }, row.object_id);
    return ownerShare(row, object);
  } catch { return ownerShare(row, null, 'unavailable'); }
}
export async function handleSharesApi({ request, env, user, parts, fetchImpl }) {
  const ctx = { request, env, user, client: createStorageClient({ env, fetchImpl }) };
  const method = request.method;
  const url = new URL(request.url);
  if (parts.length === 2 && method === 'GET') {
    const storageId = url.searchParams.get('storageId');
    const objectId = url.searchParams.get('objectId');
    if (storageId || objectId) {
      await requireStorageMount(env.DB, user, storageId);
      requireObjectId(objectId);
      const row = await env.DB.prepare(`SELECT s.*, m.name AS storage_name FROM public_shares s JOIN storage_mounts m ON m.id = s.storage_mount_id
        WHERE s.user_id = ? AND s.storage_mount_id = ? AND s.object_id = ? AND s.revoked_at IS NULL`).bind(user.id, storageId, objectId).first();
      return json({ shares: row ? [await hydrate(ctx, row)] : [], nextCursor: null });
    }
    const cursor = url.searchParams.get('cursor');
    if (cursor && !ID.test(cursor)) throw new ApiError('INVALID_INPUT', 400);
    const after = cursor ? await owned(env.DB, user, cursor) : null;
    const rows = await env.DB.prepare(`SELECT s.*, m.name AS storage_name FROM public_shares s
      JOIN storage_mounts m ON m.id = s.storage_mount_id WHERE s.user_id = ? AND s.revoked_at IS NULL
      AND (? IS NULL OR s.created_at < ? OR (s.created_at = ? AND s.id > ?))
      ORDER BY s.created_at DESC, s.id ASC LIMIT 21`)
      .bind(user.id, after?.id ?? null, after?.created_at ?? null, after?.created_at ?? null, after?.id ?? null).all();
    const page = rows.results.slice(0, 20);
    const shares = [];
    // Bounded hydration; no recursive listings and no file bytes.
    for (let i = 0; i < page.length; i += 4) shares.push(...await Promise.all(page.slice(i, i + 4).map(row => hydrate(ctx, row))));
    return json({ shares, nextCursor: rows.results.length > 20 ? page.at(-1).id : null });
  }
  if (parts.length === 2 && method === 'POST') {
    const body = await readJson(request);
    const mount = await requireStorageMount(env.DB, user, body.storageId, { mutation: true });
    const objectId = requireObjectId(body.objectId);
    const scope = { ...ctx, mount };
    const caps = await capabilities(scope);
    const object = await stat(scope, objectId);
    required(caps, object);
    const secret = randomToken();
    const hash = await sha256Hex(secret);
    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(`INSERT INTO public_shares (id,user_id,storage_mount_id,object_id,token_hash,created_at,updated_at,revoked_at)
      VALUES (?,?,?,?,?,?,?,NULL) ON CONFLICT(user_id,storage_mount_id,object_id) WHERE revoked_at IS NULL DO NOTHING`)
      .bind(id, user.id, mount.id, objectId, hash, now, now).run();
    const row = await env.DB.prepare('SELECT * FROM public_shares WHERE user_id = ? AND storage_mount_id = ? AND object_id = ? AND revoked_at IS NULL')
      .bind(user.id, mount.id, objectId).first();
    if (!row) throw unavailable();
    if (row.id === id) await recordActivity(env.DB, user, { storageMountId: mount.id, storageName: mount.name, action: 'share_create',
      objectId: object.objectId, objectName: object.name, objectType: object.type, parentId: object.parentId, metadata: { shareId: row.id } });
    return json({ share: ownerShare({ ...row, storage_name: mount.name }, object),
      ...(row.id === id ? { publicPath: `/s/${id}/${secret}` } : {}) }, row.id === id ? 201 : 200);
  }
  if (parts.length >= 3) {
    const row = await owned(env.DB, user, parts[2]);
    if (parts.length === 3 && method === 'GET') return json({ share: await hydrate(ctx, row) });
    if (parts.length === 3 && method === 'DELETE') {
      const snapshot = await findActivitySnapshot(env.DB, user.id, row.storage_mount_id, row.object_id);
      await env.DB.prepare('UPDATE public_shares SET revoked_at = COALESCE(revoked_at, ?), updated_at = ? WHERE id = ? AND user_id = ?')
        .bind(Date.now(), Date.now(), row.id, user.id).run();
      if (row.revoked_at === null) await recordActivity(env.DB, user, { storageMountId: row.storage_mount_id, storageName: row.storage_name,
        action: 'share_revoke', objectId: row.object_id, objectName: snapshot?.object_name ?? null,
        objectType: snapshot?.object_type ?? null, parentId: snapshot?.parent_id ?? null, metadata: { shareId: row.id } });
      return json({ revoked: true });
    }
    if (parts.length === 4 && parts[3] === 'replace' && method === 'POST') {
      const mount = await requireStorageMount(env.DB, user, row.storage_mount_id, { mutation: true });
      const object = await stat({ ...ctx, mount }, row.object_id);
      required(await capabilities({ ...ctx, mount }), object);
      const secret = randomToken();
      const hash = await sha256Hex(secret);
      // Compare-and-swap prevents two concurrent replacements both succeeding.
      const result = await env.DB.prepare('UPDATE public_shares SET token_hash = ?, updated_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND token_hash = ?')
        .bind(hash, Date.now(), row.id, user.id, row.token_hash).run();
      if (!result.meta?.changes) throw new ApiError('NAME_CONFLICT', 409);
      await recordActivity(env.DB, user, { storageMountId: mount.id, storageName: mount.name, action: 'share_replace',
        objectId: object.objectId, objectName: object.name, objectType: object.type, parentId: object.parentId, metadata: { shareId: row.id } });
      return json({ share: ownerShare(row, object), publicPath: `/s/${row.id}/${secret}` });
    }
  }
  throw unavailable();
}

// Every request walks authoritative logical parent relationships, never paths or client breadcrumbs.
async function within(ctx, root, id) {
  const target = id === root.objectId ? root : await stat(ctx, id);
  if (target.objectId === root.objectId) return target;
  if (root.type !== 'folder') throw unavailable();
  let current = target;
  const seen = new Set();
  for (let depth = 0; depth < 64; depth++) {
    if (!current.parentId || seen.has(current.objectId)) throw unavailable();
    seen.add(current.objectId);
    if (current.parentId === root.objectId) return target;
    current = await stat(ctx, current.parentId);
    if (current.type !== 'folder') throw unavailable();
  }
  throw unavailable();
}
export async function handlePublicSharesApi({ request, env, parts, fetchImpl }) {
  try {
    if (request.method !== 'GET' || !ID.test(parts[3] || '') || !SECRET.test(parts[4] || '')) throw unavailable();
    const hash = await sha256Hex(parts[4]);
    const row = await env.DB.prepare(`SELECT s.* FROM public_shares s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.token_hash = ? AND s.revoked_at IS NULL AND u.active = 1`).bind(parts[3], hash).first();
    if (!row) throw unavailable();
    const mount = await requireStorageMount(env.DB, { id: row.user_id }, row.storage_mount_id);
    const ctx = { request, mount, client: createStorageClient({ env, fetchImpl }) };
    const caps = await capabilities(ctx);
    const root = await stat(ctx, row.object_id);
    required(caps, root);
    const stillActive = async () => {
      const active = await env.DB.prepare('SELECT id FROM public_shares WHERE id = ? AND token_hash = ? AND revoked_at IS NULL').bind(row.id, hash).first();
      if (!active) throw unavailable();
    };
    if (parts.length === 5) { await stillActive(); return json({ object: safeObject(root), download: caps.download === true }); }
    if (parts[5] === 'objects' && parts.length === 6 && root.type === 'folder') {
      const url = new URL(request.url);
      const parentId = url.searchParams.get('parentId') || root.objectId;
      const parent = await within(ctx, root, parentId);
      if (parent.type !== 'folder' || caps.list !== true) throw unavailable();
      const limit = url.searchParams.get('limit') || '50';
      if (!/^[0-9]{1,3}$/u.test(limit) || Number(limit) < 1 || Number(limit) > 100) throw unavailable();
      const query = new URLSearchParams({ parentId, limit });
      const cursor = url.searchParams.get('cursor');
      if (cursor) { if (cursor.length > 2048) throw unavailable(); query.set('cursor', cursor); }
      const p = await upstream(ctx, `/objects?${query}`);
      if (!Array.isArray(p.items) || p.items.length > Number(limit)) throw unavailable();
      const items = p.items.map(raw => {
        const o = normalizeObject(raw);
        if (!o || !ID.test(o.objectId) || o.parentId !== parentId || o.deletedAt) throw unavailable();
        return safeObject(o);
      });
      // Recheck ancestry after listing to reject a concurrently moved parent.
      await within(ctx, await stat(ctx, root.objectId), parentId);
      await stillActive();
      return json({ items, nextCursor: typeof p.nextCursor === 'string' && p.nextCursor.length <= 2048 ? p.nextCursor : null });
    }
    if (parts[5] === 'objects' && parts.length === 8 && ['download', 'preview'].includes(parts[7])) {
      const object = await within(ctx, root, parts[6]);
      if (object.type !== 'file' || caps.download !== true) throw unavailable();
      let response;
      if (parts[7] === 'preview') response = await previewObjectResponse(ctx.client, request, mount, object);
      else {
        const result = await ctx.client.request({ request, projectId: mount.shared_storage_project_id, path: `/objects/${encodeURIComponent(object.objectId)}/download` });
        if (!result.response.ok) { await result.response.body?.cancel(); result.cleanup(); throw unavailable(); }
        response = streamResponse(result);
        response.headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(object.name).replaceAll("'", '%27')}`);
        response.headers.set('Content-Security-Policy', "sandbox; default-src 'none'");
      }
      try { await within(ctx, await stat(ctx, root.objectId), object.objectId); await stillActive(); }
      catch (error) { await response.body?.cancel(); throw error; }
      return response;
    }
    throw unavailable();
  } catch { return fail('SHARE_UNAVAILABLE', 404); }
}
