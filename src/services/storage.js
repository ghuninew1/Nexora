const SAFE_MESSAGES = {
  UNAUTHENTICATED: 'Your session has expired. Sign in again to continue.',
  FORBIDDEN: 'You do not have access to this storage.',
  NOT_FOUND: 'This storage is no longer available.',
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
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500 || status === 0) return 'PROVIDER_UNAVAILABLE';
  return SAFE_MESSAGES[body?.error?.code] ? body.error.code : 'INTERNAL_ERROR';
}

async function request(path, { fetchImpl = fetch, signal } = {}) {
  let response;
  try {
    response = await fetchImpl(path, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
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
