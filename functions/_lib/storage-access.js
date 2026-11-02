import { ApiError } from './http.js';
import { createStorageClient } from './storage-client.js';
import { getSystemSettings } from './system-settings.js';
import { intersectStoragePermissions, STORAGE_PERMISSION_NAMES } from './storage-permissions.js';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const columns = Object.freeze({
  read: 'can_read', preview: 'can_preview', download: 'can_download', upload: 'can_upload',
  createFolder: 'can_create_folder', rename: 'can_rename', move: 'can_move', copy: 'can_copy',
  delete: 'can_delete', permanentDelete: 'can_permanent_delete', share: 'can_share',
  manageShare: 'can_manage_share', favorite: 'can_favorite',
});

// The caller must supply the user resolved from the authenticated session.
// Never accept a user id, project id, or grants from the browser.
export async function getStorageAccessForUser(db, user, storageId) {
  if (!user?.id || !ID.test(storageId || '')) return null;
  const row = await db.prepare(`SELECT m.id, m.owner_user_id, m.name, m.provider, m.status, m.read_only,
    m.shared_storage_project_id, a.* FROM storage_access a
    JOIN storage_mounts m ON m.id = a.storage_id WHERE a.user_id = ? AND m.id = ?`)
    .bind(user.id, storageId).first();
  if (!row) return null;
  const grants = Object.fromEntries(STORAGE_PERMISSION_NAMES.map(name => [name, Number(row[columns[name]]) === 1]));
  return { mount: { id: row.id, owner_user_id: row.owner_user_id, name: row.name, provider: row.provider,
    status: row.status, read_only: Number(row.read_only) === 1, shared_storage_project_id: row.shared_storage_project_id },
  grants, isDefault: Number(row.is_default) === 1 };
}

export async function requireStorageAccess({ request, env, user, storageId, fetchImpl = fetch }) {
  const access = await getStorageAccessForUser(env.DB, user, storageId);
  if (!access || access.mount.status !== 'active') throw new ApiError('NOT_FOUND', 404);
  if (access.mount.provider !== 'garage') throw new ApiError('PROVIDER_UNAVAILABLE', 503);
  const client = createStorageClient({ env, fetchImpl });
  const [response, policy] = await Promise.all([
    client.jsonRequest({ request, projectId: access.mount.shared_storage_project_id, path: '/capabilities' }),
    getSystemSettings(env.DB),
  ]);
  const payload = response?.data && typeof response.data === 'object' ? response.data : response;
  if (!payload?.capabilities || typeof payload.capabilities !== 'object' || Array.isArray(payload.capabilities)) {
    throw new ApiError('PROVIDER_UNAVAILABLE', 502);
  }
  const permissions = intersectStoragePermissions(access.grants, payload.capabilities, {
    readOnly: access.mount.read_only,
    maintenance: user.role !== 'admin' && policy.maintenanceMode,
  });
  if (!policy.publicSharingEnabled) { permissions.share = false; permissions.manageShare = false; }
  return { ...access, permissions };
}

export async function requireStoragePermission(context, required) {
  const permissions = Array.isArray(required) ? required : [required];
  if (permissions.some(name => !STORAGE_PERMISSION_NAMES.includes(name))) throw new ApiError('NOT_FOUND', 404);
  const access = await requireStorageAccess(context);
  if (permissions.some(name => !access.permissions[name])) throw new ApiError('FORBIDDEN', 403);
  return access;
}
