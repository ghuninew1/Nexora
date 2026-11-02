import { createUser, normalizeDisplayName, normalizeEmail } from './auth.js';
import { STORAGE_PERMISSION_NAMES, validateStoragePermissions } from './storage-permissions.js';
import { ApiError, json, readJson } from './http.js';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
function safe(row) {
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role, active: Boolean(row.active), createdAt: row.created_at };
}
export async function handleAdminUsers({ request, env, user, parts }) {
  const db = env.DB;
  if (user.role !== 'admin') throw new ApiError('FORBIDDEN', 403);
  if (parts[4] === 'storages' && [5, 6].includes(parts.length)) {
    const targetId = parts[3];
    if (!ID.test(targetId) || !(await db.prepare('SELECT id FROM users WHERE id = ?').bind(targetId).first())) throw new ApiError('NOT_FOUND', 404);
    if (request.method === 'GET' && parts.length === 5) {
      const rows = await db.prepare('SELECT a.*, m.name FROM storage_access a JOIN storage_mounts m ON m.id = a.storage_id WHERE a.user_id = ?').bind(targetId).all();
      return json({ assignments: rows.results.map(row => ({ storageId: row.storage_id, name: row.name, isDefault: Boolean(row.is_default), permissions: Object.fromEntries(STORAGE_PERMISSION_NAMES.map(name => [name, Boolean(row['can_' + name.replace(/[A-Z]/gu, c => '_' + c.toLowerCase())])])) })) });
    }
    const body = request.method === 'DELETE' ? {} : await readJson(request);
    if (Object.keys(body).some(key => !['storageId', 'permissions', 'isDefault'].includes(key))) throw new ApiError('INVALID_INPUT', 400);
    const storageId = parts[5] || body.storageId;
    if (!ID.test(storageId || '') || !(await db.prepare('SELECT id FROM storage_mounts WHERE id = ?').bind(storageId).first())) throw new ApiError('NOT_FOUND', 404);
    const existing = await db.prepare('SELECT storage_id FROM storage_access WHERE user_id = ? AND storage_id = ?').bind(targetId, storageId).first();
    if (request.method === 'DELETE' && parts.length === 6) {
      await db.batch([
        db.prepare('DELETE FROM storage_access WHERE user_id = ? AND storage_id = ?').bind(targetId, storageId),
        db.prepare('UPDATE user_preferences SET default_storage_id = NULL WHERE user_id = ? AND default_storage_id = ?').bind(targetId, storageId),
      ]);
      return json({ revoked: true });
    }
    if (!((request.method === 'POST' && parts.length === 5) || (request.method === 'PATCH' && parts.length === 6))) throw new ApiError('NOT_FOUND', 404);
    if (request.method === 'POST' && existing) throw new ApiError('NAME_CONFLICT', 409);
    if (request.method === 'PATCH' && !existing) throw new ApiError('NOT_FOUND', 404);
    if (typeof body.isDefault !== 'boolean') throw new ApiError('INVALID_INPUT', 400);
    const permissions = validateStoragePermissions(body.permissions);
    const columns = STORAGE_PERMISSION_NAMES.map(name => 'can_' + name.replace(/[A-Z]/gu, c => '_' + c.toLowerCase()));
    const now = Date.now();
    const statements = [];
    if (body.isDefault) statements.push(db.prepare('UPDATE storage_access SET is_default = 0 WHERE user_id = ?').bind(targetId));
    if (request.method === 'POST') statements.push(db.prepare(`INSERT INTO storage_access (user_id, storage_id, ${columns.join(',')}, is_default, created_at, updated_at, created_by) VALUES (${Array(columns.length + 6).fill('?').join(',')})`).bind(targetId, storageId, ...Object.values(permissions).map(Number), Number(body.isDefault), now, now, user.id));
    else statements.push(db.prepare(`UPDATE storage_access SET ${columns.map(c => c + ' = ?').join(',')}, is_default = ?, updated_at = ? WHERE user_id = ? AND storage_id = ?`).bind(...Object.values(permissions).map(Number), Number(body.isDefault), now, targetId, storageId));
    await db.batch(statements);
    return json({ saved: true }, request.method === 'POST' ? 201 : 200);
  }
  if (parts.length === 3 && request.method === 'GET') {
    const rows = await db.prepare('SELECT id, email, display_name, role, active, created_at FROM users ORDER BY email LIMIT 501').bind().all();
    return json({ users: rows.results.slice(0, 500).map(safe), truncated: rows.results.length > 500 });
  }
  if (parts.length === 3 && request.method === 'POST') {
    const body = await readJson(request);
    if (Object.keys(body).some(key => !['email', 'displayName', 'password'].includes(key))) throw new ApiError('INVALID_INPUT', 400);
    const email = normalizeEmail(body.email);
    if (await db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').bind(email).first()) throw new ApiError('NAME_CONFLICT', 409);
    try {
      const created = await createUser({ db, email, displayName: body.displayName, password: body.password, role: 'user' });
      return json({ user: { ...created, active: true } }, 201);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (await db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').bind(email).first()) throw new ApiError('NAME_CONFLICT', 409);
      throw error;
    }
  }
  if (parts.length !== 4 || !ID.test(parts[3])) throw new ApiError('NOT_FOUND', 404);
  const id = parts[3];
  const target = await db.prepare('SELECT id, email, display_name, role, active, created_at FROM users WHERE id = ?').bind(id).first();
  if (!target) throw new ApiError('NOT_FOUND', 404);
  // Admin accounts are provisioned through the existing operator workflow.
  if (target.role !== 'user' || id === user.id) throw new ApiError('FORBIDDEN', 403);
  if (request.method === 'PATCH') {
    const body = await readJson(request);
    if (Object.keys(body).some(key => !['email', 'displayName', 'active'].includes(key)) || !Object.keys(body).length) throw new ApiError('INVALID_INPUT', 400);
    const email = Object.hasOwn(body, 'email') ? normalizeEmail(body.email) : target.email;
    const displayName = Object.hasOwn(body, 'displayName') ? normalizeDisplayName(body.displayName) : target.display_name;
    if (Object.hasOwn(body, 'active') && typeof body.active !== 'boolean') throw new ApiError('INVALID_INPUT', 400);
    const active = Object.hasOwn(body, 'active') ? body.active : Boolean(target.active);
    if (await db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id != ?').bind(email, id).first()) throw new ApiError('NAME_CONFLICT', 409);
    // Clear prior sessions before either transition so reactivation cannot revive them.
    if (active !== Boolean(target.active)) await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
    try { await db.prepare("UPDATE users SET email = ?, display_name = ?, active = ?, updated_at = ? WHERE id = ? AND role = 'user'").bind(email, displayName, Number(active), Date.now(), id).run(); }
    catch (error) { if (await db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id != ?').bind(email, id).first()) throw new ApiError('NAME_CONFLICT', 409); throw error; }
    return json({ user: safe({ ...target, email, display_name: displayName, active }) });
  }
  if (request.method === 'DELETE') {
    const result = await db.prepare("DELETE FROM users WHERE id = ? AND role = 'user' AND NOT EXISTS (SELECT 1 FROM storage_mounts WHERE owner_user_id = users.id)").bind(id).run();
    if (!result.meta.changes) throw new ApiError('USER_HAS_STORAGE', 409);
    return json({ deleted: true });
  }
  throw new ApiError('NOT_FOUND', 404);
}
