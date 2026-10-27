import { authenticate } from './auth.js';
import { ApiError } from './http.js';

export async function requireUser(request, env) {
  const user = await authenticate(request, env);
  if (!user) throw new ApiError('UNAUTHENTICATED', 401);
  return user;
}

export async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (user.role !== 'admin') throw new ApiError('FORBIDDEN', 403);
  return user;
}

export async function requireStorageMount(db, user, storageId, { mutation = false, allowInactive = false } = {}) {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(storageId || '')) throw new ApiError('NOT_FOUND', 404);
  const mount = await db.prepare(`SELECT id, owner_user_id, name, provider, status, read_only, shared_storage_project_id
    FROM storage_mounts WHERE id = ? AND owner_user_id = ?`).bind(storageId, user.id).first();
  if (!mount || (!allowInactive && mount.status !== 'active')) throw new ApiError('NOT_FOUND', 404);
  if (mount.provider !== 'garage') throw new ApiError('PROVIDER_UNAVAILABLE', 503);
  if (mutation && Number(mount.read_only) === 1) throw new ApiError('FORBIDDEN', 403);
  return { ...mount, read_only: Number(mount.read_only) === 1 };
}

export function requireObjectId(objectId) {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(objectId || '')) throw new ApiError('NOT_FOUND', 404);
  return objectId;
}
