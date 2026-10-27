const SAFE_MESSAGES = {
  UNAUTHENTICATED: 'Your session has expired. Sign in again to continue.',
  FORBIDDEN: 'You do not have access to this storage.',
  NOT_FOUND: 'This storage is no longer available.',
  NAME_CONFLICT: 'A folder with that name already exists here.',
  INVALID_INPUT: 'Check the folder name and try again.',
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
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500 || status === 0) return 'PROVIDER_UNAVAILABLE';
  return SAFE_MESSAGES[body?.error?.code] ? body.error.code : 'INTERNAL_ERROR';
}

async function request(path, { fetchImpl = fetch, signal, method = 'GET', body: requestBody } = {}) {
  const headers = { Accept: 'application/json' };
  if (requestBody !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetchImpl(path, {
      method,
      credentials: 'same-origin',
      headers,
      ...(requestBody !== undefined ? { body: JSON.stringify(requestBody) } : {}),
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

export async function createStorageFolder(storageId, { name, parentId = null }, options = {}) {
  const data = await request(`/api/storage/v1/storages/${encodeURIComponent(storageId)}/folders`, {
    ...options,
    method: 'POST',
    body: { name, parentId },
  });
  return normalizeStorageObject(data.folder);
}
