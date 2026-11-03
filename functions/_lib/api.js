import { handleAdminStorages } from './admin-storages.js';
import { handleSharesApi, handlePublicSharesApi } from './shares-api.js';
import { authenticate, login, sessionCookie, serializeUser, logout, normalizeDisplayName } from './auth.js';
import { requireAdmin, requireUser } from './authorization.js';
import { ApiError, decodePath, fail, json, readJson, requireJsonContentType, requireSameOrigin } from './http.js';
import { handleFavoritesApi, handleRecentApi, handleStorageApi } from './storage-api.js';
import { handleActivityApi } from './activity.js';
import { handleSettingsApi } from './settings-api.js';
import { getPublicConfig, handleAdminSettings, requireWritableSystem } from './system-settings.js';
import { handleAdminUsers } from './admin-users.js';

async function handleAuth({ request, env, parts }) {
  const method = request.method.toUpperCase();
  const route = parts[2];
  if (parts.length === 3 && route === 'login' && method === 'POST') {
    requireSameOrigin(request);
    requireJsonContentType(request);
    const result = await login(request, env, await readJson(request));
    return json({ user: result.user }, 200, { 'Set-Cookie': sessionCookie(result.token, result.sessionSeconds) });
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
  if (parts.length === 3 && route === 'me' && method === 'PATCH') {
    requireSameOrigin(request);
    const user = await requireUser(request, env);
    const body = await readJson(request);
    if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'displayName')) throw new ApiError('INVALID_INPUT', 400);
    const displayName = normalizeDisplayName(body.displayName);
    await env.DB.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').bind(displayName, Date.now(), user.id).run();
    return json({ user: serializeUser({ ...user, displayName }) });
  }
  throw new ApiError('NOT_FOUND', 404);
}

export function createApiHandler({ fetchImpl = fetch, logger = console } = {}) {
  return async function handleApiRequest(request, env) {
    let response;
    try {
      const parts = decodePath(new URL(request.url).pathname);
      if (parts[0] !== 'api') throw new ApiError('NOT_FOUND', 404);
      if (parts[1] === 'public' && parts[2] === 'shares') {
        response = await handlePublicSharesApi({ request, env, parts, fetchImpl });
        response.headers.set('Referrer-Policy', 'no-referrer');
      } else if (parts[1] === 'shares') {
        const user = await requireUser(request, env);
        if (['POST', 'DELETE'].includes(request.method.toUpperCase())) { requireSameOrigin(request); await requireWritableSystem(env, user); }
        response = await handleSharesApi({ request, env, user, parts, fetchImpl });
      } else if (parts[1] === 'config' && parts.length === 2 && request.method === 'GET') {
        response = json(await getPublicConfig(env.DB));
      } else if (parts[1] === 'admin') {
        const user = await requireAdmin(request, env);
        if (['POST', 'PATCH', 'DELETE'].includes(request.method)) requireSameOrigin(request);
        response = parts[2] === 'storages' ? await handleAdminStorages({ request, env, parts })
          : parts[2] === 'users' ? await handleAdminUsers({ request, env, user, parts }) : await handleAdminSettings({ request, env, user, parts });
      } else if (parts[1] === 'settings') {
        const user = await requireUser(request, env);
        if (['POST', 'PATCH'].includes(request.method.toUpperCase())) requireSameOrigin(request);
        response = await handleSettingsApi({ request, env, user, parts });
      } else if (parts[1] === 'auth') response = await handleAuth({ request, env, parts });
      else if (parts[1] === 'activity') {
        const user = await requireUser(request, env);
        response = await handleActivityApi({ request, env, user, parts });
      } else if (parts[1] === 'storage' && parts[2] === 'v1') {
        const user = await requireUser(request, env);
        if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method.toUpperCase())) { requireSameOrigin(request); await requireWritableSystem(env, user); }
        response = await handleStorageApi({ request, env, user, parts, fetchImpl, logger });
      } else if (parts[1] === 'favorites') {
        const user = await requireUser(request, env);
        if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method.toUpperCase())) { requireSameOrigin(request); await requireWritableSystem(env, user); }
        response = await handleFavoritesApi({ request, env, user, parts, fetchImpl });
      } else if (parts[1] === 'recent') {
        const user = await requireUser(request, env);
        if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method.toUpperCase())) requireSameOrigin(request);
        response = await handleRecentApi({ request, env, user, parts, fetchImpl });
      } else throw new ApiError('NOT_FOUND', 404);
    } catch (error) {
      if (new URL(request.url).pathname.startsWith('/api/public/shares')) response = fail('SHARE_UNAVAILABLE', 404);
      else if (error instanceof ApiError) response = fail(error.code, error.status);
      else response = fail('INTERNAL_ERROR', 500);
    }
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (!response.headers.has('Content-Security-Policy')) {
      response.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    }
    return response;
  };
}

export async function onRequest({ request, env }) {
  return createApiHandler()(request, env);
}
