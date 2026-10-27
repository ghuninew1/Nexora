import { getCurrentUser } from './auth.js';
import { getStoragePreviewSpec } from '../utils/storage-preview.js';

const SAFE_MESSAGES = {
  UNAUTHENTICATED: 'Your session has expired. Sign in again to continue.',
  FORBIDDEN: 'You do not have access to this storage.',
  NOT_FOUND: 'This storage is no longer available.',
  NAME_CONFLICT: 'An item with this name already exists.',
  INVALID_INPUT: 'Check the folder name and try again.',
  UPLOAD_TOO_LARGE: 'This file is too large for the connected storage.',
  CAPABILITY_UNAVAILABLE: 'This operation is unavailable for this storage.',
  PREVIEW_UNSUPPORTED: 'Preview is not available for this file.',
  PREVIEW_TOO_LARGE: 'File is too large to preview.',
  OPERATION_TOO_LARGE: 'This folder contains too many items for a synchronous copy.',
  QUOTA_EXCEEDED: 'The storage limit has been reached.',
  TRANSFER_INCOMPLETE: 'The transfer did not complete. Try again.',
  RATE_LIMITED: 'Storage is temporarily busy. Try again shortly.',
  PROVIDER_UNAVAILABLE: 'Storage is temporarily unavailable. Try again later.',
  INTERNAL_ERROR: 'Storage could not be reached. Try again later.',
};

export class StorageApiError extends Error {
  constructor(code, status = 0) {
    super(SAFE_MESSAGES[code] ?? SAFE_MESSAGES.INTERNAL_ERROR);
    this.name = 'StorageApiError';
    this.code = SAFE_MESSAGES[code] ? code : 'INTERNAL_ERROR';
    this.status = status;
  }
}

function safeErrorCode(body, status) {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'NAME_CONFLICT';
  if (status === 413) {
    if (body?.error?.code === 'OPERATION_TOO_LARGE') return 'OPERATION_TOO_LARGE';
    if (body?.error?.code === 'PREVIEW_TOO_LARGE') return 'PREVIEW_TOO_LARGE';
    return 'UPLOAD_TOO_LARGE';
  }
  if (status === 422) return 'CAPABILITY_UNAVAILABLE';
  if (status === 429) return body?.error?.code === 'QUOTA_EXCEEDED' ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED';
  if (status === 400) return 'INVALID_INPUT';
  const bodyCode = body?.error?.code;
  if (SAFE_MESSAGES[bodyCode]) return bodyCode;
  if (status >= 500 || status === 0) return 'PROVIDER_UNAVAILABLE';
  return 'INTERNAL_ERROR';
}

async function request(path, { fetchImpl = fetch, signal, method = 'GET', body: requestBody } = {}) {
  const headers = { Accept: 'application/json' };
  const isFormData = typeof FormData !== 'undefined' && requestBody instanceof FormData;
  if (requestBody !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetchImpl(path, {
      method,
      credentials: 'same-origin',
      headers,
      ...(requestBody !== undefined ? { body: isFormData ? requestBody : JSON.stringify(requestBody) } : {}),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new StorageApiError('PROVIDER_UNAVAILABLE', 0);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw new StorageApiError(safeErrorCode(body, response.status), response.status);
  if (!body || typeof body !== 'object' || !body.data || typeof body.data !== 'object') {
    throw new StorageApiError('PROVIDER_UNAVAILABLE', 502);
  }
  return body.data;
}

function safeStorage(value) {
  if (!value || typeof value !== 'object'
    || typeof value.storageId !== 'string' || !value.storageId.trim()
    || typeof value.name !== 'string' || !value.name.trim()
    || !['active', 'inactive'].includes(value.status)) return null;
  return {
    storageId: value.storageId,
    name: value.name,
    providerLabel: typeof value.providerLabel === 'string' ? value.providerLabel : 'Private storage',
    status: value.status,
    readOnly: value.readOnly === true || value.readOnly === 1,
  };
}

const capabilityNames = [
  'list', 'stat', 'upload', 'download', 'createFolder', 'rename', 'move', 'copy',
  'trash', 'restore', 'permanentDelete', 'preview', 'share', 'rangeRead', 'readOnly',
];

export function normalizeStorageCapabilities(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StorageApiError('PROVIDER_UNAVAILABLE', 502);
  }
  const capabilities = Object.fromEntries(capabilityNames.map((name) => [name, value[name] === true]));
  if (Number.isSafeInteger(value.maxUploadBytes) && value.maxUploadBytes >= 0) {
    capabilities.maxUploadBytes = value.maxUploadBytes;
  }
  return capabilities;
}

export function canUseStorageCapability(capabilities, storage, capability) {
  return Boolean(capabilities?.[capability] && storage && !storage.readOnly && !capabilities.readOnly);
}

export function normalizeStorageUsage(value) {
  if (!value || typeof value !== 'object' || value.status !== 'available') {
    return { status: 'unavailable', usedBytes: null, quotaBytes: null, objectCount: null, measuredAt: null };
  }
  return {
    status: 'available',
    usedBytes: Number.isSafeInteger(value.usedBytes) && value.usedBytes >= 0 ? value.usedBytes : null,
    quotaBytes: Number.isSafeInteger(value.quotaBytes) && value.quotaBytes >= 0 ? value.quotaBytes : null,
    objectCount: Number.isSafeInteger(value.objectCount) && value.objectCount >= 0 ? value.objectCount : null,
    measuredAt: typeof value.measuredAt === 'string' ? value.measuredAt : null,
  };
}

export async function listStorages(options) {
  const data = await request('/api/storage/v1/storages', options);
  if (!Array.isArray(data.storages)) throw new StorageApiError('PROVIDER_UNAVAILABLE', 502);
  const storages = data.storages.map(safeStorage);
  if (storages.some((storage) => !storage)) throw new StorageApiError('PROVIDER_UNAVAILABLE', 502);
  return storages;
}

export async function getStorageCapabilities(storageId, options) {
  const data = await request(`/api/storage/v1/storages/${encodeURIComponent(storageId)}/capabilities`, options);
  return normalizeStorageCapabilities(data.capabilities);
}

export async function getStorageUsage(storageId, options) {
  const data = await request(`/api/storage/v1/storages/${encodeURIComponent(storageId)}/usage`, options);
  return normalizeStorageUsage(data.usage);
}

const OBJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;

export function normalizeStorageObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.objectId !== 'string' || !OBJECT_ID_PATTERN.test(value.objectId)
    || (value.parentId !== null && typeof value.parentId !== 'string')
    || (value.parentId !== null && !OBJECT_ID_PATTERN.test(value.parentId))
    || typeof value.name !== 'string' || !value.name.trim()
    || !['folder', 'file'].includes(value.type)) {
    throw new StorageApiError('PROVIDER_UNAVAILABLE', 502);
  }
  return {
    objectId: value.objectId,
    parentId: value.parentId ?? null,
    name: value.name,
    type: value.type,
    sizeBytes: Number.isSafeInteger(value.sizeBytes) && value.sizeBytes >= 0 ? value.sizeBytes : null,
    mimeType: typeof value.mimeType === 'string' ? value.mimeType : null,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null,
    modifiedAt: typeof value.modifiedAt === 'string' ? value.modifiedAt : null,
  };
}

function normalizeTrashObject(value) {
  return { ...normalizeStorageObject(value), deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : null };
}

export function mergeStorageObjects(current, incoming) {
  const byId = new Map(current.map((item) => [item.objectId, item]));
  incoming.forEach((item) => byId.set(item.objectId, item));
  return [...byId.values()];
}

export async function listStorageObjects(storageId, { parentId = null, cursor = null, limit = 50, ...options } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new StorageApiError('INVALID_INPUT', 400);
  const query = new URLSearchParams({ limit: String(limit) });
  if (parentId !== null) query.set('parentId', parentId);
  if (cursor !== null) query.set('cursor', cursor);
  const data = await request(`/api/storage/v1/storages/${encodeURIComponent(storageId)}/objects?${query}`, options);
  if (!Array.isArray(data.items) || (data.nextCursor !== null && typeof data.nextCursor !== 'string')) {
    throw new StorageApiError('PROVIDER_UNAVAILABLE', 502);
  }
  return {
    items: data.items.map(normalizeStorageObject),
    nextCursor: data.nextCursor,
  };
}

export async function listStorageTrash(storageId, { cursor = null, limit = 50, ...options } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new StorageApiError('INVALID_INPUT', 400);
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor !== null) query.set('cursor', cursor);
  const data = await request(`/api/storage/v1/storages/${encodeURIComponent(storageId)}/trash?${query}`, options);
  if (!Array.isArray(data.items) || (data.nextCursor !== null && typeof data.nextCursor !== 'string')) {
    throw new StorageApiError('PROVIDER_UNAVAILABLE', 502);
  }
  return { items: data.items.map(normalizeTrashObject), nextCursor: data.nextCursor };
}

export async function createStorageFolder(storageId, { name, parentId = null }, options = {}) {
  const data = await request(`/api/storage/v1/storages/${encodeURIComponent(storageId)}/folders`, {
    ...options,
    method: 'POST',
    body: { name, parentId },
  });
  return normalizeStorageObject(data.folder);
}

export function validateStorageObjectName(value) {
  if (typeof value !== 'string' || !value.trim() || new TextEncoder().encode(value).length > 255) return false;
  return ![...value].some((character) => {
    const code = character.codePointAt(0);
    return code <= 31 || (code >= 127 && code <= 159) || character === '/' || character === '\\';
  });
}

export async function uploadStorageFile(storageId, file, parentId, { maxUploadBytes = null, ...options } = {}) {
  if (!file || typeof file.name !== 'string' || !Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new StorageApiError('INVALID_INPUT', 400);
  }
  if (Number.isSafeInteger(maxUploadBytes) && maxUploadBytes >= 0 && file.size > maxUploadBytes) {
    throw new StorageApiError('UPLOAD_TOO_LARGE', 413);
  }
  const form = new FormData();
  form.append('file', file, file.name);
  if (parentId !== null && parentId !== undefined) form.append('parentId', parentId);
  const data = await request(`/api/storage/v1/storages/${encodeURIComponent(storageId)}/files`, {
    ...options,
    method: 'POST',
    body: form,
  });
  const uploaded = normalizeStorageObject(data.file);
  if (uploaded.type !== 'file') throw new StorageApiError('PROVIDER_UNAVAILABLE', 502);
  return { file: uploaded, operationId: typeof data.operationId === 'string' ? data.operationId : null };
}

export async function renameStorageObject(storageId, objectId, name, options = {}) {
  if (!validateStorageObjectName(name)) throw new StorageApiError('INVALID_INPUT', 400);
  const data = await request(`/api/storage/v1/storages/${encodeURIComponent(storageId)}/objects/${encodeURIComponent(objectId)}`, {
    ...options,
    method: 'PATCH',
    body: { name: name.trim() },
  });
  const object = normalizeStorageObject(data.object);
  if (object.objectId !== objectId) throw new StorageApiError('PROVIDER_UNAVAILABLE', 502);
  return object;
}

export async function moveStorageObject(storageId, objectId, parentId, options = {}) {
  const data = await request(`/api/storage/v1/storages/${encodeURIComponent(storageId)}/objects/${encodeURIComponent(objectId)}/move`, {
    ...options,
    method: 'POST',
    body: { parentId },
  });
  const object = normalizeStorageObject(data.object);
  if (object.objectId !== objectId) throw new StorageApiError('PROVIDER_UNAVAILABLE', 502);
  return object;
}

export async function copyStorageObject(storageId, objectId, parentId, options = {}) {
  const data = await request(`/api/storage/v1/storages/${encodeURIComponent(storageId)}/objects/${encodeURIComponent(objectId)}/copy`, {
    ...options,
    method: 'POST',
    body: { parentId },
  });
  const object = normalizeStorageObject(data.object);
  if (object.objectId === objectId) throw new StorageApiError('PROVIDER_UNAVAILABLE', 502);
  return { object, operationId: typeof data.operationId === 'string' ? data.operationId : null };
}

export async function trashStorageObject(storageId, objectId, options = {}) {
  const data = await request(`/api/storage/v1/storages/${encodeURIComponent(storageId)}/objects/${encodeURIComponent(objectId)}`, {
    ...options,
    method: 'DELETE',
  });
  const object = normalizeStorageObject(data.object);
  if (object.objectId !== objectId) throw new StorageApiError('PROVIDER_UNAVAILABLE', 502);
  return object;
}

export async function restoreStorageObject(storageId, objectId, options = {}) {
  const data = await request(`/api/storage/v1/storages/${encodeURIComponent(storageId)}/trash/${encodeURIComponent(objectId)}/restore`, {
    ...options,
    method: 'POST',
    body: {},
  });
  const object = normalizeStorageObject(data.object);
  if (object.objectId !== objectId) throw new StorageApiError('PROVIDER_UNAVAILABLE', 502);
  return object;
}

export async function permanentlyDeleteStorageObject(storageId, objectId, options = {}) {
  const data = await request(`/api/storage/v1/storages/${encodeURIComponent(storageId)}/trash/${encodeURIComponent(objectId)}/permanent`, {
    ...options,
    method: 'DELETE',
  });
  if (data.deleted !== true) throw new StorageApiError('PROVIDER_UNAVAILABLE', 502);
  return { deleted: true, operationId: typeof data.operationId === 'string' ? data.operationId : null };
}

export function storageObjectDownloadUrl(storageId, objectId) {
  return `/api/storage/v1/storages/${encodeURIComponent(storageId)}/objects/${encodeURIComponent(objectId)}/download`;
}

export function storageObjectPreviewUrl(storageId, objectId) {
  return `/api/storage/v1/storages/${encodeURIComponent(storageId)}/objects/${encodeURIComponent(objectId)}/preview`;
}

export async function fetchStorageObjectPreview(storageId, object, { fetchImpl = fetch, signal, maxBytes, kind } = {}) {
  let response;
  try {
    response = await fetchImpl(storageObjectPreviewUrl(storageId, object.objectId), {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/octet-stream' },
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new StorageApiError('PROVIDER_UNAVAILABLE', 0);
  }

  if (!response.ok) {
    let body;
    try { body = await response.json(); } catch { body = null; }
    throw new StorageApiError(safeErrorCode(body, response.status), response.status);
  }
  const mimeType = (response.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
  const resolved = getStoragePreviewSpec({ type: 'file', name: object.name, mimeType });
  if (!resolved || resolved.kind !== kind) throw new StorageApiError('PREVIEW_UNSUPPORTED', 415);
  const blob = await response.blob();
  if (blob.size > maxBytes) throw new StorageApiError('PREVIEW_TOO_LARGE', 413);
  return { blob, kind: resolved.kind, mimeType: resolved.mimeType };
}

export async function startStorageObjectDownload(storageId, objectId, { fetchImpl = fetch, signal, navigate = (url) => window.location.assign(url) } = {}) {
  const user = await getCurrentUser({ fetchImpl, signal });
  if (!user) throw new StorageApiError('UNAUTHENTICATED', 401);
  const url = storageObjectDownloadUrl(storageId, objectId);
  navigate(url);
  return url;
}
