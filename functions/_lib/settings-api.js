import { ApiError, json, readJson } from './http.js';
import { requireStorageMount } from './authorization.js';
import { validateNewUserPassword } from './auth.js';
import { hashPassword, verifyPassword } from './password.js';

const fields = {
  theme: ['theme', 'dark', ['dark', 'light', 'system']],
  fileSort: ['file_sort', 'name', ['name', 'modified', 'size', 'type']],
  fileSortDirection: ['file_sort_direction', 'asc', ['asc', 'desc']],
  confirmDelete: ['confirm_delete', true, [true, false]],
  uploadConflictBehavior: ['upload_conflict_behavior', 'ask', ['ask']],
  uploadConcurrency: ['upload_concurrency', 3, [1, 2, 3, 5]],
  autoClearUploads: ['auto_clear_uploads', true, [true, false]],
  defaultStorageId: ['default_storage_id', null, null],
  shareExpiration: ['share_expiration', '7d', ['never', '1d', '7d', '30d']],
};

async function preferences(db, user) {
  const row = await db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').bind(user.id).first();
  return Object.fromEntries(Object.entries(fields).map(([key, [column, fallback]]) => {
    const value = key === 'uploadConflictBehavior' ? 'ask' : row?.[column] ?? fallback;
    return [key, typeof fallback === 'boolean' ? Boolean(value) : value];
  }));
}

export async function handleSettingsApi({ request, env, user, parts }) {
  const method = request.method.toUpperCase();
  if (parts.length !== 3) throw new ApiError('NOT_FOUND', 404);
  if (parts[2] === 'preferences' && method === 'GET') return json(await preferences(env.DB, user));
  if (parts[2] === 'preferences' && method === 'PATCH') {
    const body = await readJson(request);
    const entries = Object.entries(body);
    if (!entries.length) throw new ApiError('INVALID_INPUT', 400);
    for (const [key, value] of entries) {
      if (!Object.hasOwn(fields, key)) throw new ApiError('INVALID_INPUT', 400);
      const allowed = fields[key][2];
      if (allowed && !allowed.includes(value)) throw new ApiError('INVALID_INPUT', 400);
      if (key === 'defaultStorageId' && value !== null) {
        if (typeof value !== 'string') throw new ApiError('INVALID_INPUT', 400);
        await requireStorageMount(env.DB, user, value);
      }
    }
    const now = Date.now();
    const columns = entries.map(([key]) => fields[key][0]);
    const values = entries.map(([, value]) => typeof value === 'boolean' ? Number(value) : value);
    await env.DB.prepare(`INSERT INTO user_preferences (user_id, created_at, updated_at, ${columns.join(', ')}) VALUES (?, ?, ?, ${columns.map(() => '?').join(', ')}) ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at, ${columns.map(column => `${column} = excluded.${column}`).join(', ')}`)
      .bind(user.id, now, now, ...values).run();
    return json(await preferences(env.DB, user));
  }
  if (parts[2] === 'logout-other-sessions' && method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(user.id, user.sessionId).run();
    return json({ success: true });
  }
  if (parts[2] === 'change-password' && method === 'POST') {
    const body = await readJson(request);
    if (Object.keys(body).some(key => !['currentPassword', 'newPassword'].includes(key)) || typeof body.currentPassword !== 'string' || !body.currentPassword || new TextEncoder().encode(body.currentPassword).length > 1024) throw new ApiError('INVALID_INPUT', 400);
    const password = validateNewUserPassword(body.newPassword);
    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first();
    if (!row || !(await verifyPassword(body.currentPassword, row.password_hash))) throw new ApiError('FORBIDDEN', 403);
    const hash = await hashPassword(password);
    const result = await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND password_hash = ?').bind(hash, Date.now(), user.id, row.password_hash),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND password_hash = ?)').bind(user.id, user.sessionId, user.id, hash),
    ]);
    if (!result[0]?.meta?.changes) throw new ApiError('INVALID_INPUT', 400);
    return json({ changed: true });
  }
  throw new ApiError('NOT_FOUND', 404);
}
