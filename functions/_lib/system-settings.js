import { ApiError, json, readJson } from './http.js';

const defaults = Object.freeze({
  maintenanceMode: false,
  maintenanceMessage: 'Nexora is currently undergoing maintenance.',
  publicSharingEnabled: true,
  publicDownloadEnabled: true,
  requireShareExpiration: false,
  maxShareLifetimeDays: null,
});

function normalize(key, value) {
  if (['maintenanceMode', 'publicSharingEnabled', 'publicDownloadEnabled', 'requireShareExpiration'].includes(key) && typeof value === 'boolean') return value;
  if (key === 'maxShareLifetimeDays' && [null, 1, 7, 30, 90].includes(value)) return value;
  if (key === 'maintenanceMessage' && typeof value === 'string' && value.trim().length > 0 && value.length <= 300 && [...value].every(character => character.codePointAt(0) >= 32 && character.codePointAt(0) !== 127)) return value.trim();
  throw new ApiError('INVALID_INPUT', 400);
}

export async function getSystemSettings(db) {
  const rows = await db.prepare('SELECT key, value FROM system_settings').bind().all();
  const settings = { ...defaults };
  for (const row of rows.results) {
    if (!Object.hasOwn(defaults, row.key)) continue;
    try { settings[row.key] = normalize(row.key, JSON.parse(row.value)); }
    catch { throw new ApiError('INTERNAL_ERROR', 500); }
  }
  return settings;
}

export async function handleAdminSettings({ request, env, user, parts }) {
  if (parts.length !== 3 || parts[2] !== 'settings') throw new ApiError('NOT_FOUND', 404);
  if (request.method === 'GET') return json(await getSystemSettings(env.DB));
  if (request.method !== 'PATCH') throw new ApiError('NOT_FOUND', 404);
  const body = await readJson(request);
  const entries = Object.entries(body);
  if (entries.length !== 1 || !Object.hasOwn(defaults, entries[0][0])) throw new ApiError('INVALID_INPUT', 400);
  const [key, raw] = entries[0];
  const value = normalize(key, raw);
  await env.DB.prepare(`INSERT INTO system_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(key, JSON.stringify(value), Date.now(), user.id).run();
  return json(await getSystemSettings(env.DB));
}

export async function requireWritableSystem(env, user) {
  if (user.role !== 'admin' && (await getSystemSettings(env.DB)).maintenanceMode) throw new ApiError('MAINTENANCE', 503);
}
