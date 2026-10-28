import { handleSharesApi, handlePublicSharesApi } from './shares-api.js';
import { authenticate, login, sessionCookie, serializeUser, logout } from './auth.js';
import { requireUser } from './authorization.js';
import { ApiError, decodePath, fail, json, readJson, requireJsonContentType, requireSameOrigin } from './http.js';
import { handleFavoritesApi, handleRecentApi, handleStorageApi } from './storage-api.js';

async function handleAuth({ request, env, parts }) {
  const method = request.method.toUpperCase();
  const route = parts[2];
  if (parts.length === 3 && route === 'login' && method === 'POST') {
    requireSameOrigin(request);
    requireJsonContentType(request);
    const result = await login(request, env, await readJson(request));
    return json({ user: result.user }, 200, { 'Set-Cookie': sessionCookie(result.token) });
  }
  if (parts.length === 3 && route === 'logout' && method === 'POST') {
    requireSameOrigin(request);
    const cookie = await logout(request, env);
    return json({ loggedOut: true }, 200, { 'Set-Cookie': cookie });
  }
  if (parts.length === 3 && route === 'me' && method === 'GET') {
    const user = await authenticate(request, env);
    if (!user) throw new ApiError('UNAUTHENTICATED', 401);
    return json({ user: serializeUser(user) });
  }
  throw new ApiError('NOT_FOUND', 404);
}

export function createApiHandler({ fetchImpl = fetch, logger = console } = {}) {
  return async function handleApiRequest(request, env) {
    try {
      const parts = decodePath(new URL(request.url).pathname);
      if (parts[0] !== 'api') throw new ApiError('NOT_FOUND', 404);
      if (parts[1] === 'public' && parts[2] === 'shares') {
        const response = await handlePublicSharesApi({ request, env, parts, fetchImpl });
        response.headers.set('Referrer-Policy', 'no-referrer');
        response.headers.set('X-Content-Type-Options', 'nosniff');
        return response;
      }
      if (parts[1] === 'shares') {
        const user = await requireUser(request, env);
        if (['POST', 'DELETE'].includes(request.method.toUpperCase())) requireSameOrigin(request);
        return await handleSharesApi({ request, env, user, parts, fetchImpl });
      }
      if (parts[1] === 'auth') return await handleAuth({ request, env, parts });
      if (parts[1] === 'storage' && parts[2] === 'v1') {
        const user = await requireUser(request, env);
        if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method.toUpperCase())) requireSameOrigin(request);
        return await handleStorageApi({ request, env, user, parts, fetchImpl, logger });
      }
      if (parts[1] === 'favorites') {
        const user = await requireUser(request, env);
        if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method.toUpperCase())) requireSameOrigin(request);
        return await handleFavoritesApi({ request, env, user, parts, fetchImpl });
      }
      if (parts[1] === 'recent') {
        const user = await requireUser(request, env);
        if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method.toUpperCase())) requireSameOrigin(request);
        return await handleRecentApi({ request, env, user, parts, fetchImpl });
      }
      throw new ApiError('NOT_FOUND', 404);
    } catch (error) {
      if (new URL(request.url).pathname.startsWith('/api/public/shares')) return fail('SHARE_UNAVAILABLE', 404);
      if (error instanceof ApiError) return fail(error.code, error.status);
      return fail('INTERNAL_ERROR', 500);
    }
  };
}

export async function onRequest({ request, env }) {
  return createApiHandler()(request, env);
}
