import { createUser, normalizeDisplayName, normalizeEmail } from './auth.js';
import { ApiError, json, readJson } from './http.js';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
function safe(row) {
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role, active: Boolean(row.active), createdAt: row.created_at };
}
export async function handleAdminUsers({ request, env, user, parts }) {
  const db = env.DB;
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
