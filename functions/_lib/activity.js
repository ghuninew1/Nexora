import { ApiError, json } from './http.js';

export const ACTIVITY_ACTIONS = new Set([
  'upload', 'create_folder', 'rename', 'move', 'copy', 'trash', 'restore',
  'delete_permanent', 'favorite', 'unfavorite', 'share_create', 'share_replace', 'share_revoke',
]);

const RETENTION_DAYS = 180;
const MAX_EVENTS_PER_USER = 500;
const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const METADATA_KEYS = {
  rename: ['previousName', 'newName'],
  move: ['destinationName'],
  copy: ['destinationName'],
  share_create: ['shareId'],
  share_replace: ['shareId'],
  share_revoke: ['shareId'],
};

function safeText(value, maxLength) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const cleaned = Array.from(value, (character) => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
  return cleaned.trim().slice(0, maxLength) || null;
}

function safeId(value) {
  return typeof value === 'string' && ID.test(value) ? value : null;
}

function safeMetadata(action, metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const fields = {};
  for (const key of METADATA_KEYS[action] || []) {
    const value = safeText(metadata[key], 256);
    if (value) fields[key] = value;
  }
  const serialized = JSON.stringify(fields);
  return serialized === '{}' || new TextEncoder().encode(serialized).byteLength > 2048 ? null : serialized;
}

function logWriteFailure(logger, action, stage) {
  try { logger?.warn?.(`[activity] result=write-failed action=${action} stage=${stage}`); } catch { /* logging is best effort too */ }
}

export async function recordActivity(db, user, event, { logger = console, now = Date.now } = {}) {
  if (!user?.id || !ACTIVITY_ACTIONS.has(event?.action)) return false;
  const id = crypto.randomUUID();
  const timestamp = now();
  try {
    await db.prepare(`INSERT INTO activity_events
      (id,user_id,storage_mount_id,storage_name,action,object_id,object_name,object_type,parent_id,destination_parent_id,metadata_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id,
      user.id,
      safeId(event.storageMountId),
      safeText(event.storageName, 160),
      event.action,
      safeId(event.objectId),
      safeText(event.objectName, 512),
      ['file', 'folder'].includes(event.objectType) ? event.objectType : null,
      safeId(event.parentId),
      safeId(event.destinationParentId),
      safeMetadata(event.action, event.metadata),
      timestamp,
    ).run();
  } catch {
    logWriteFailure(logger, event.action, 'insert');
    return false;
  }

  const cutoff = timestamp - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  try {
    await db.prepare('DELETE FROM activity_events WHERE user_id = ? AND created_at < ?').bind(user.id, cutoff).run();
    await db.prepare(`DELETE FROM activity_events WHERE user_id = ? AND id NOT IN (
      SELECT id FROM activity_events WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
    )`).bind(user.id, user.id, MAX_EVENTS_PER_USER).run();
  } catch {
    logWriteFailure(logger, event.action, 'retention');
  }
  return true;
}

export async function findActivitySnapshot(db, userId, storageMountId, objectId) {
  try {
    return await db.prepare(`SELECT object_name, object_type, parent_id FROM activity_events
      WHERE user_id = ? AND storage_mount_id = ? AND object_id = ? AND object_name IS NOT NULL
      ORDER BY created_at DESC, id DESC LIMIT 1`).bind(userId, storageMountId, objectId).first();
  } catch {
    return null;
  }
}

function encodeCursor(createdAt, id) {
  return btoa(`${createdAt}\n${id}`).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function decodeCursor(cursor) {
  if (typeof cursor !== 'string' || cursor.length > 256 || !/^[A-Za-z0-9_-]+$/u.test(cursor)) throw new ApiError('INVALID_INPUT', 400);
  try {
    const value = atob(cursor.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - cursor.length % 4) % 4));
    const [time, id, ...extra] = value.split('\n');
    const createdAt = Number(time);
    if (extra.length || !Number.isSafeInteger(createdAt) || createdAt < 0 || !ID.test(id || '')) throw new Error('cursor');
    return { createdAt, id };
  } catch {
    throw new ApiError('INVALID_INPUT', 400);
  }
}

function parseLimit(value) {
  if (value === null) return 50;
  if (!/^\d{1,3}$/u.test(value)) throw new ApiError('INVALID_INPUT', 400);
  const limit = Number(value);
  if (limit < 1 || limit > 100) throw new ApiError('INVALID_INPUT', 400);
  return limit;
}

function normalizeEvent(row) {
  const metadata = (() => {
    try {
      const parsed = JSON.parse(row.metadata_json || 'null');
      const serialized = safeMetadata(row.action, parsed);
      return serialized ? JSON.parse(serialized) : null;
    } catch { return null; }
  })();
  return {
    id: row.id,
    action: ACTIVITY_ACTIONS.has(row.action) ? row.action : 'unknown',
    storageMountId: row.storage_mount_id || null,
    storageName: row.storage_name || null,
    objectId: row.object_id || null,
    objectName: row.object_name || null,
    objectType: ['file', 'folder'].includes(row.object_type) ? row.object_type : null,
    parentId: row.parent_id || null,
    destinationParentId: row.destination_parent_id || null,
    metadata,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function handleActivityApi({ request, env, user, parts }) {
  if (parts.length !== 2 || parts[0] !== 'api' || parts[1] !== 'activity' || request.method.toUpperCase() !== 'GET') {
    throw new ApiError('NOT_FOUND', 404);
  }
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get('limit'));
  const cursor = url.searchParams.has('cursor') ? decodeCursor(url.searchParams.get('cursor')) : null;
  const rows = await env.DB.prepare(`SELECT id, storage_mount_id, storage_name, action, object_id, object_name, object_type,
      parent_id, destination_parent_id, metadata_json, created_at
    FROM activity_events WHERE user_id = ? AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
    ORDER BY created_at DESC, id DESC LIMIT ?`)
    .bind(user.id, cursor?.createdAt ?? null, cursor?.createdAt ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1).all();
  const rawPage = (rows.results || []).slice(0, limit);
  const page = rawPage.map(normalizeEvent);
  const last = rawPage.at(-1);
  return json({ items: page, nextCursor: rows.results?.length > limit && last ? encodeCursor(last.created_at, last.id) : null });
}

export const ACTIVITY_RETENTION = { days: RETENTION_DAYS, maxPerUser: MAX_EVENTS_PER_USER };
