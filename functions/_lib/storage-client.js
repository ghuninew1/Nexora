import { ApiError, normalizeUpstreamError, statusFor } from './http.js';

const DEFAULT_TIMEOUT_MS = 15_000;

function safeBaseUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new ApiError('PROVIDER_UNAVAILABLE', 503);
  let url;
  try { url = new URL(raw); } catch { throw new ApiError('PROVIDER_UNAVAILABLE', 503); }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) throw new ApiError('PROVIDER_UNAVAILABLE', 503);
  if (url.username || url.password || url.search || url.hash) throw new ApiError('PROVIDER_UNAVAILABLE', 503);
  return url;
}

function timeoutMs(env) {
  const value = Number(env.STORAGE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(value) || value < 100 || value > 30_000) return DEFAULT_TIMEOUT_MS;
  return value;
}

function safeProject(projectId) {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(projectId)) throw new ApiError('NOT_FOUND', 404);
  return encodeURIComponent(projectId);
}

export function createStorageClient({ env, fetchImpl = fetch }) {
  async function request({ request: incomingRequest, projectId, path, method = 'GET', body, contentType, accept = 'application/json' }) {
    const base = safeBaseUrl(env.STORAGE_API_URL);
    if (!env.STORAGE_APP_SECRET || !env.CF_ACCESS_CLIENT_ID || !env.CF_ACCESS_CLIENT_SECRET) {
      throw new ApiError('PROVIDER_UNAVAILABLE', 503);
    }
    const project = safeProject(projectId);
    const url = new URL(`/v3/projects/${project}${path}`, base);
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort(incomingRequest.signal.reason);
    if (incomingRequest.signal.aborted) cancel();
    else incomingRequest.signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(new Error('timeout')); }, timeoutMs(env));
    const headers = new Headers({
      Accept: accept,
      Authorization: `Bearer ${env.STORAGE_APP_SECRET}`,
      'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID,
      'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET,
    });
    if (contentType) headers.set('Content-Type', contentType);
    let response;
    try {
      response = await fetchImpl(url, { method, headers, body, signal: controller.signal, redirect: 'error' });
    } catch (error) {
      clearTimeout(timer);
      incomingRequest.signal.removeEventListener('abort', cancel);
      if (error instanceof ApiError) throw error;
      throw new ApiError(timedOut ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_UNAVAILABLE', timedOut ? 504 : 503);
    }
    return {
      response,
      timedOut: () => timedOut,
      cleanup: () => {
        clearTimeout(timer);
        incomingRequest.signal.removeEventListener('abort', cancel);
      },
      abort: () => controller.abort(),
    };
  }

  async function jsonRequest(args) {
    const result = await request(args);
    try {
      if (!result.response.ok) {
        const payload = await readBoundedJson(result.response);
        throw new ApiError(normalizeUpstreamError(payload, result.response.status), statusFor(normalizeUpstreamError(payload, result.response.status)));
      }
      try { return await result.response.json(); }
      catch { throw new ApiError('PROVIDER_UNAVAILABLE', 502); }
    } finally { result.cleanup(); }
  }

  return { request, jsonRequest };
}

export async function readBoundedJson(response, maxBytes = 16_384) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } catch { return null; }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

export function normalizeObject(object) {
  if (!object || typeof object !== 'object') return null;
  const id = typeof object.objectId === 'string' ? object.objectId : (typeof object.id === 'string' ? object.id : null);
  if (!id) return null;
  return {
    objectId: id,
    parentId: typeof object.parentId === 'string' ? object.parentId : null,
    type: object.type === 'folder' ? 'folder' : 'file',
    name: typeof object.name === 'string' ? object.name : '',
    mimeType: typeof object.mimeType === 'string' ? object.mimeType : (typeof object.contentType === 'string' ? object.contentType : null),
    sizeBytes: Number.isSafeInteger(object.sizeBytes) ? object.sizeBytes : null,
    createdAt: typeof object.createdAt === 'string' ? object.createdAt : null,
    modifiedAt: typeof object.modifiedAt === 'string' ? object.modifiedAt : (typeof object.updatedAt === 'string' ? object.updatedAt : null),
    deletedAt: typeof object.deletedAt === 'string' ? object.deletedAt : null,
  };
}

export function normalizeCapabilities(value, mount, maxUploadBytes = null) {
  const caps = value && typeof value === 'object' ? value : {};
  return {
    list: Boolean(caps.list), stat: Boolean(caps.stat), upload: Boolean(caps.upload) && !mount.read_only,
    download: Boolean(caps.download), createFolder: Boolean(caps.createFolder) && !mount.read_only,
    rename: Boolean(caps.rename) && !mount.read_only, move: Boolean(caps.move) && !mount.read_only,
    copy: Boolean(caps.copy) && !mount.read_only, trash: Boolean(caps.trash) && !mount.read_only,
    restore: Boolean(caps.restore) && !mount.read_only, permanentDelete: Boolean(caps.permanentDelete) && !mount.read_only,
    preview: false, share: false, rangeRead: false, readOnly: Boolean(mount.read_only),
    maxUploadBytes: Number.isSafeInteger(caps.maxUploadBytes) && maxUploadBytes !== null
      ? Math.min(caps.maxUploadBytes, maxUploadBytes)
      : (Number.isSafeInteger(caps.maxUploadBytes) ? caps.maxUploadBytes : maxUploadBytes),
  };
}
