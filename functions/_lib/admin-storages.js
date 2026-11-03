import { ApiError, json, readJson } from './http.js';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
export async function handleAdminStorages({ request, env, parts }) {
  if (parts.length === 3 && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT id, name, description, status, read_only FROM storage_mounts ORDER BY name, id LIMIT 501').bind().all();
    return json({ storages: rows.results.slice(0, 500).map(row => ({ storageId: row.id, name: row.name, description: row.description, status: row.status, readOnly: Number(row.read_only) === 1 })), truncated: rows.results.length > 500 });
  }
  if (parts.length !== 4 || !ID.test(parts[3]) || request.method !== 'PATCH') throw new ApiError('NOT_FOUND', 404);
  const body = await readJson(request);
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => !['name', 'description'].includes(key)) || typeof body.name !== 'string' || typeof body.description !== 'string') throw new ApiError('INVALID_INPUT', 400);
  const name = body.name.trim();
  const description = body.description.trim();
  const invalidControls = (value, allowNewlines) => Array.from(value).some(char => {
    const code = char.charCodeAt(0);
    return code === 127 || (code < 32 && !(allowNewlines && [9, 10, 13].includes(code)));
  });
  if (!name || name.length > 100 || description.length > 500 || invalidControls(name, false) || invalidControls(description, true)) throw new ApiError('INVALID_INPUT', 400);
  const existing = await env.DB.prepare('SELECT id, owner_user_id FROM storage_mounts WHERE id = ?').bind(parts[3]).first();
  if (!existing) throw new ApiError('NOT_FOUND', 404);
  try {
    const result = await env.DB.prepare('UPDATE storage_mounts SET name = ?, description = ?, updated_at = ? WHERE id = ?').bind(name, description, Date.now(), existing.id).run();
    if (!result.meta.changes) throw new ApiError('NOT_FOUND', 404);
  } catch (error) {
    const duplicate = await env.DB.prepare('SELECT id FROM storage_mounts WHERE owner_user_id = ? AND name = ? AND id != ?').bind(existing.owner_user_id, name, existing.id).first();
    if (duplicate) throw new ApiError('NAME_CONFLICT', 409);
    throw error;
  }
  return json({ storage: { storageId: existing.id, name, description } });
}
