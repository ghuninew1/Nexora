const messages = {
  UNAUTHENTICATED: 'Sign in to continue.',
  FORBIDDEN: 'You do not have access to this resource.',
  NOT_FOUND: 'The requested resource was not found.',
  INVALID_INPUT: 'The request is invalid.',
  NAME_CONFLICT: 'An item with that name already exists.',
  CAPABILITY_UNAVAILABLE: 'This operation is unavailable for this storage.',
  QUOTA_EXCEEDED: 'The storage quota has been reached.',
  UPLOAD_TOO_LARGE: 'The upload exceeds the configured limit.',
  PREVIEW_TOO_LARGE: 'The file exceeds the preview limit.',
  PREVIEW_UNSUPPORTED: 'Preview is not available for this file.',
  OPERATION_TOO_LARGE: 'This operation exceeds the supported synchronous size.',
  PROVIDER_UNAVAILABLE: 'Storage is temporarily unavailable.',
  TRANSFER_INCOMPLETE: 'The storage transfer did not complete.',
  RATE_LIMITED: 'Too many attempts. Try again later.',
  INTERNAL_ERROR: 'The request could not be completed.',
};

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', ...headers },
  });
}

export function fail(code, status) {
  const safeCode = messages[code] ? code : 'INTERNAL_ERROR';
  return new Response(JSON.stringify({ error: { code: safeCode, message: messages[safeCode] } }), {
    status: status || statusFor(safeCode),
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

export function statusFor(code) {
  return ({ UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, INVALID_INPUT: 400, NAME_CONFLICT: 409,
    CAPABILITY_UNAVAILABLE: 422, QUOTA_EXCEEDED: 429, UPLOAD_TOO_LARGE: 413, OPERATION_TOO_LARGE: 413, PROVIDER_UNAVAILABLE: 503,
    TRANSFER_INCOMPLETE: 502, RATE_LIMITED: 429, INTERNAL_ERROR: 500 })[code] || 500;
}

export function requireSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) throw new ApiError('FORBIDDEN', 403);
}

export function requireJsonContentType(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    throw new ApiError('INVALID_INPUT', 415);
  }
}

export async function readJson(request, maxBytes = 8192) {
  requireJsonContentType(request);
  const length = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > maxBytes) throw new ApiError('INVALID_INPUT', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError('INVALID_INPUT', 400);
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ApiError('INVALID_INPUT', 413);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('INVALID_INPUT', 400);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value;
  } catch {
    throw new ApiError('INVALID_INPUT', 400);
  }
}

export function decodePath(pathname) {
  try { return pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part)); }
  catch { throw new ApiError('INVALID_INPUT', 400); }
}

export function normalizeUpstreamError(payload, status) {
  const allowed = new Set(['NOT_FOUND', 'INVALID_INPUT', 'NAME_CONFLICT', 'CAPABILITY_UNAVAILABLE', 'UPLOAD_TOO_LARGE', 'OPERATION_TOO_LARGE', 'QUOTA_EXCEEDED', 'TRANSFER_INCOMPLETE']);
  const code = payload?.error?.code;
  if (allowed.has(code)) return code;
  if (status === 404) return 'NOT_FOUND';
  if (status === 413) return 'UPLOAD_TOO_LARGE';
  if (status === 422) return 'CAPABILITY_UNAVAILABLE';
  return status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'INTERNAL_ERROR';
}
