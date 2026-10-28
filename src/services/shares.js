import { getStoragePreviewSpec } from '../utils/storage-preview.js';
const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const SECRET = /^[A-Za-z0-9_-]{43}$/u;
export const SHARE_UNAVAILABLE = 'This shared item is unavailable.';
export class ShareApiError extends Error {
  constructor(status, isPublic = false) {
    super(isPublic ? SHARE_UNAVAILABLE : status === 401 ? 'Your session has expired.' : status === 409 ? 'The share changed. Refresh and try again.' : 'Sharing is temporarily unavailable. Try again.');
    this.status = status;
  }
}
export function parseShareCapability(id, secret) { return ID.test(id || '') && SECRET.test(secret || '') ? { id, secret } : null; }
export function publicSharePath(id, secret) {
  if (!parseShareCapability(id, secret)) throw new ShareApiError(404, true);
  return `/s/${id}/${secret}`;
}
function publicApi(capability) {
  if (!parseShareCapability(capability?.id, capability?.secret)) throw new ShareApiError(404, true);
  return `/api/public/shares/${capability.id}/${capability.secret}`;
}
export function publicObjectUrl(capability, objectId, action = 'download') {
  if (!ID.test(objectId || '') || !['download', 'preview'].includes(action)) throw new ShareApiError(404, true);
  return `${publicApi(capability)}/objects/${objectId}/${action}`;
}
function object(value) {
  if (!value || !ID.test(value.objectId || '') || !['file', 'folder'].includes(value.type) || typeof value.name !== 'string') return null;
  return { objectId: value.objectId, type: value.type, name: value.name,
    mimeType: typeof value.mimeType === 'string' ? value.mimeType : null,
    sizeBytes: Number.isSafeInteger(value.sizeBytes) && value.sizeBytes >= 0 ? value.sizeBytes : null,
    ...(value.parentId === null || ID.test(value.parentId || '') ? { parentId: value.parentId } : {}) };
}
function share(value) {
  if (!value || !ID.test(value.id || '') || !ID.test(value.storageId || '') || !ID.test(value.objectId || '')) throw new ShareApiError(502);
  return { id: value.id, storageId: value.storageId, objectId: value.objectId, storageName: typeof value.storageName === 'string' ? value.storageName : 'Storage',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '', expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : null,
    status: ['active', 'expired', 'revoked', 'unavailable'].includes(value.status) ? value.status : 'unavailable', object: object(value.object) };
}
async function request(path, { method = 'GET', body, signal, fetchImpl = fetch, isPublic = false } = {}) {
  let response;
  try { response = await fetchImpl(path, { method, credentials: isPublic ? 'omit' : 'same-origin', referrerPolicy: 'no-referrer', cache: 'no-store', signal,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new ShareApiError(0, isPublic); }
  if (!response.ok) throw new ShareApiError(response.status, isPublic);
  try { const p = await response.json(); if (!p?.data) throw new Error(); return p.data; }
  catch { throw new ShareApiError(502, isPublic); }
}
function result(p) {
  const safe = { share: share(p.share) };
  if (typeof p.publicPath === 'string') {
    const match = /^\/s\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{43})$/u.exec(p.publicPath);
    if (!match || match[1] !== safe.share.id) throw new ShareApiError(502);
    safe.publicPath = publicSharePath(match[1], match[2]);
  }
  return safe;
}
export async function listShares({ cursor, storageId, objectId, ...options } = {}) {
  const query = new URLSearchParams();
  if (cursor) query.set('cursor', cursor); if (storageId) query.set('storageId', storageId); if (objectId) query.set('objectId', objectId);
  const p = await request(`/api/shares${query.size ? `?${query}` : ''}`, options);
  if (!Array.isArray(p.shares)) throw new ShareApiError(502);
  return { shares: p.shares.map(share), nextCursor: ID.test(p.nextCursor || '') ? p.nextCursor : null };
}
export async function getShare(id, options) { return result(await request(`/api/shares/${encodeURIComponent(id)}`, options)); }
export async function createShare(storageId, objectId, expiresIn, options) { return result(await request('/api/shares', { ...options, method: 'POST', body: { storageId, objectId, expiresIn } })); }
export async function replaceShare(id, expiresIn, options) { return result(await request(`/api/shares/${encodeURIComponent(id)}/replace`, { ...options, method: 'POST', body: { expiresIn } })); }
export async function revokeShare(id, options) { const p = await request(`/api/shares/${encodeURIComponent(id)}`, { ...options, method: 'DELETE' }); if (p.revoked !== true) throw new ShareApiError(502); }
export async function getPublicShare(capability, options) {
  const p = await request(publicApi(capability), { ...options, isPublic: true });
  const root = object(p.object); if (!root) throw new ShareApiError(502, true);
  return { object: root, download: p.download === true };
}
export async function listPublicObjects(capability, { parentId, cursor, ...options } = {}) {
  const q = new URLSearchParams({ limit: '50' }); if (parentId) q.set('parentId', parentId); if (cursor) q.set('cursor', cursor);
  const p = await request(`${publicApi(capability)}/objects?${q}`, { ...options, isPublic: true });
  if (!Array.isArray(p.items)) throw new ShareApiError(502, true);
  return { items: p.items.map(object).filter(Boolean), nextCursor: typeof p.nextCursor === 'string' ? p.nextCursor : null };
}
export async function fetchPublicPreview(capability, file, { signal, fetchImpl = fetch } = {}) {
  const spec = getStoragePreviewSpec(file); if (!spec) throw new ShareApiError(415, true);
  let response;
  try { response = await fetchImpl(publicObjectUrl(capability, file.objectId, 'preview'), { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal }); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new ShareApiError(0, true); }
  if (!response.ok) throw new ShareApiError(response.status, true);
  const received = getStoragePreviewSpec({ ...file, mimeType: response.headers.get('Content-Type') });
  if (!received || received.kind !== spec.kind) throw new ShareApiError(415, true);
  const blob = await response.blob(); if (blob.size > spec.maxBytes) throw new ShareApiError(413, true);
  return { blob, ...received };
}

export function shareFilesDestination(share) {
  if (!share?.object || !ID.test(share.storageId || '')) return null;
  const folderId = share.object.type === 'folder' ? share.object.objectId : share.object.parentId;
  if (folderId === null) return { to: '/files', state: { fileBrowser: { storageId: share.storageId, breadcrumbs: [{ objectId: null, label: 'My Files' }] } }, folderId: null };
  if (!ID.test(folderId || '')) return null;
  return { to: `/files?folder=${encodeURIComponent(folderId)}`, folderId,
    state: { fileBrowser: { storageId: share.storageId, abbreviated: true, breadcrumbs: [{ objectId: null, label: 'My Files' }, { objectId: folderId, label: share.object.type === 'folder' ? share.object.name : 'Containing folder' }] } } };
}
