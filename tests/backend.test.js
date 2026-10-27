import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createApiHandler } from '../functions/_lib/api.js';
import { createUser } from '../functions/_lib/auth.js';
import { requireAdmin } from '../functions/_lib/authorization.js';
import { ApiError } from '../functions/_lib/http.js';
import { sha256Hex, randomToken } from '../functions/_lib/password.js';

const migration = readFileSync(new URL('../migrations/0001_backend_foundation.sql', import.meta.url), 'utf8');
const origin = 'https://nexora.example.test';
const storageId = 'mount_alpha';
const projectId = 'private_project_alpha';
const objectId = 'object_alpha';
let sqlite;
let env;
let handler;
let user;
let otherUser;
let cookie;
let requests;

function d1(database) {
  return {
    prepare(sql) {
      return {
        async run(...values) { return { success: true, meta: database.prepare(sql).run(...values) }; },
        bind(...values) {
          return {
            async first() { return database.prepare(sql).get(...values) ?? null; },
            async all() { return { results: database.prepare(sql).all(...values) }; },
            async run() { return { success: true, meta: database.prepare(sql).run(...values) }; },
          };
        },
      };
    },
  };
}

function object(id = objectId, type = 'file') {
  return { objectId: id, parentId: null, type, name: `${type}.txt`, mimeType: 'text/plain', sizeBytes: 9,
    createdAt: '2026-10-27T00:00:00.000Z', modifiedAt: '2026-10-27T00:00:00.000Z', deletedAt: null };
}

function upstreamResponse(url, init = {}) {
  const path = new URL(url).pathname;
  requests.push({ url: String(url), init });
  if (path.endsWith('/capabilities')) return Response.json({ success: true, capabilities: {
    list: true, stat: true, upload: true, download: true, createFolder: true, rename: true,
    move: true, copy: true, trash: true, restore: true, permanentDelete: true,
    preview: false, share: false, rangeRead: false,
  } });
  if (path.endsWith('/download')) {
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('streamed')); }, cancel() { requests.at(-1).cancelled = true; } });
    return new Response(body, { headers: { 'Content-Type': 'text/plain', 'Content-Length': '8', 'Content-Disposition': "attachment; filename*=UTF-8''file.txt" } });
  }
  if (path.endsWith('/objects') && init.method !== 'POST') return Response.json({ success: true, items: [object()], nextCursor: 'next_cursor' });
  if (path.endsWith('/objects/folders')) return Response.json({ success: true, object: object('folder_new', 'folder') }, { status: 201 });
  if (path.endsWith('/files') && init.method === 'POST') return Response.json({ success: true, object: object('file_new'), operationId: 'operation_new' }, { status: 201 });
  if (path.endsWith('/operations/operation_alpha')) return Response.json({ success: true, operation: {
    operationId: 'operation_alpha', type: 'copy', status: 'completed', completedItems: 1, totalItems: 1, errorCode: null, details: 'sensitive',
  } });
  if (path.endsWith('/objects/object_alpha') && init.method === 'GET') return Response.json({ success: true, object: object() });
  if (path.endsWith('/objects/object_alpha/copy')) return Response.json({ success: true, object: object('object_copy'), operationId: 'operation_copy' }, { status: 201 });
  if (path.endsWith('/objects/object_alpha/move')) return Response.json({ success: true, object: { ...object(), parentId: 'folder_parent' } });
  if (path.endsWith('/objects/object_alpha') && init.method === 'PATCH') return Response.json({ success: true, object: { ...object(), name: 'renamed.txt' } });
  if (path.endsWith('/objects/object_alpha') && init.method === 'DELETE') return Response.json({ success: true, object: object() });
  if (path.endsWith('/trash')) return Response.json({ success: true, items: [object('object_trashed')], nextCursor: null });
  if (path.endsWith('/restore')) return Response.json({ success: true, object: object() });
  if (path.endsWith('/permanent')) return Response.json({ success: true, operationId: 'operation_delete' });
  return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'SQLite at internal-host leaked details' } }, { status: 404 });
}

async function request(path, { method = 'GET', body, headers = {}, fetchImpl = upstreamResponse } = {}) {
  const activeHandler = fetchImpl === upstreamResponse ? handler : createApiHandler({ fetchImpl });
  return activeHandler(new Request(`${origin}${path}`, {
    method,
    headers: { Cookie: cookie, ...headers },
    ...(body === undefined ? {} : { body }),
    ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
  }), env);
}

async function login(email = 'owner@example.test', password = 'correct horse battery staple') {
  const response = await handler(new Request(`${origin}/api/auth/login`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }), env);
  return response;
}

before(async () => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration);
  env = { DB: d1(sqlite), STORAGE_API_URL: 'https://storage.example.test', STORAGE_APP_SECRET: 'server-app-secret',
    CF_ACCESS_CLIENT_ID: 'server-access-id', CF_ACCESS_CLIENT_SECRET: 'server-access-secret' };
  handler = createApiHandler({ fetchImpl: upstreamResponse });
  requests = [];
  user = await createUser({ db: env.DB, email: 'owner@example.test', displayName: 'Storage Owner', password: 'correct horse battery staple' });
  otherUser = await createUser({ db: env.DB, email: 'other@example.test', displayName: 'Other Admin', password: 'another correct horse battery staple', role: 'admin' });
  sqlite.prepare(`INSERT INTO storage_mounts (id, owner_user_id, name, provider, status, read_only, shared_storage_project_id, created_at, updated_at)
    VALUES (?, ?, 'Private', 'garage', 'active', 0, ?, 1, 1)`).run(storageId, user.id, projectId);
  const response = await login();
  assert.equal(response.status, 200);
  cookie = response.headers.get('Set-Cookie').split(';')[0];
});

after(() => sqlite?.close());

test('D1 migration creates separate account, session, mount, favorite, and bounded recent tables', () => {
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
  for (const name of ['users', 'sessions', 'login_attempts', 'storage_mounts', 'favorites', 'recent_access']) assert.ok(tables.includes(name));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('storage_mounts') WHERE name = 'shared_storage_project_id'").get().count, 1);
});

test('login returns a secure HttpOnly cookie and stores only a hash of the random session token', async () => {
  const response = await login();
  const setCookie = response.headers.get('Set-Cookie');
  assert.match(setCookie, /HttpOnly/u);
  assert.match(setCookie, /Secure/u);
  assert.match(setCookie, /SameSite=Lax/u);
  assert.match(setCookie, /Path=\//u);
  const token = setCookie.match(/nexora_session=([^;]+)/u)[1];
  assert.equal(token.length, 43);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM sessions WHERE token_hash = ?').get(token).count, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM sessions WHERE token_hash = ?').get(await sha256Hex(token)).count, 1);
});

test('invalid credentials and inactive users cannot authenticate', async () => {
  const bad = await login('owner@example.test', 'wrong horse battery staple');
  assert.equal(bad.status, 401);
  assert.equal((await bad.json()).error.code, 'UNAUTHENTICATED');
  const inactive = await createUser({ db: env.DB, email: 'inactive@example.test', displayName: 'Inactive', password: 'correct horse battery staple' });
  sqlite.prepare('UPDATE users SET active = 0 WHERE id = ?').run(inactive.id);
  const denied = await login('inactive@example.test', 'correct horse battery staple');
  assert.equal(denied.status, 401);
});

test('login throttles repeated failures by hashed email or IP', async () => {
  const emailHash = await sha256Hex('owner@example.test');
  const ipHash = await sha256Hex('unknown');
  const now = Date.now();
  for (let index = 0; index < 8; index += 1) {
    sqlite.prepare('INSERT INTO login_attempts (email_hash, ip_hash, attempted_at, succeeded) VALUES (?, ?, ?, 0)')
      .run(emailHash, ipHash, now - index);
  }
  const response = await login('owner@example.test', 'wrong horse battery staple');
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, 'RATE_LIMITED');
  sqlite.prepare('DELETE FROM login_attempts WHERE email_hash = ? OR ip_hash = ?').run(emailHash, ipHash);
});

test('auth/me returns the session user; invalid and expired sessions fail closed', async () => {
  const response = await request('/api/auth/me');
  assert.deepEqual((await response.json()).data.user, { id: user.id, email: user.email, displayName: 'Storage Owner', role: 'user' });
  const token = cookie.split('=')[1];
  sqlite.prepare('UPDATE sessions SET expires_at = 1 WHERE token_hash = ?').run(await sha256Hex(token));
  const expired = await request('/api/auth/me');
  assert.equal(expired.status, 401);
  cookie = (await login()).headers.get('Set-Cookie').split(';')[0];
  const invalid = await handler(new Request(`${origin}/api/auth/me`, { headers: { Cookie: 'nexora_session=invalid' } }), env);
  assert.equal(invalid.status, 401);
});

test('logout invalidates the session and clears the cookie', async () => {
  const sessionCookie = (await login()).headers.get('Set-Cookie').split(';')[0];
  const response = await handler(new Request(`${origin}/api/auth/logout`, { method: 'POST', headers: { Origin: origin, Cookie: sessionCookie } }), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/u);
  const me = await handler(new Request(`${origin}/api/auth/me`, { headers: { Cookie: sessionCookie } }), env);
  assert.equal(me.status, 401);
});

test('CSRF origin and JSON content type are enforced on login and mutations', async () => {
  const noOrigin = await handler(new Request(`${origin}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env);
  assert.equal(noOrigin.status, 403);
  const noJson = await request(`/api/storage/v1/storages/${storageId}/folders`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(noJson.status, 415);
  const badOrigin = await request(`/api/storage/v1/storages/${storageId}/objects/${objectId}`, { method: 'DELETE', headers: { Origin: 'https://attacker.test' } });
  assert.equal(badOrigin.status, 403);
});

test('mounts are private to their owner, including for an admin', async () => {
  const noCalls = requests.length;
  const response = await handler(new Request(`${origin}/api/storage/v1/storages/${storageId}`, { headers: { Cookie: (await login(otherUser.email, 'another correct horse battery staple')).headers.get('Set-Cookie').split(';')[0] } }), env);
  assert.equal(response.status, 404);
  assert.equal(requests.length, noCalls);
  const rows = await env.DB.prepare('SELECT id FROM storage_mounts WHERE owner_user_id = ?').bind(otherUser.id).all();
  assert.deepEqual(rows.results, []);
});

test('requireAdmin distinguishes a normal user without granting mount access to admins', async () => {
  await assert.rejects(() => requireAdmin(new Request(`${origin}/`, { headers: { Cookie: cookie } }), env), (error) => error instanceof ApiError && error.code === 'FORBIDDEN');
  const adminCookie = (await login(otherUser.email, 'another correct horse battery staple')).headers.get('Set-Cookie').split(';')[0];
  const denied = await handler(new Request(`${origin}/api/storage/v1/storages/${storageId}`, { headers: { Cookie: adminCookie } }), env);
  assert.equal(denied.status, 404);
});

test('storage list, detail, and actual S2 capabilities never reveal project IDs or provider details', async () => {
  const list = await request('/api/storage/v1/storages');
  const listText = await list.text();
  assert.match(listText, /Private storage/u);
  assert.doesNotMatch(listText, new RegExp(projectId, 'u'));
  assert.doesNotMatch(listText, /provider_reference|bucket|Garage|SQLite/u);
  const detail = await request(`/api/storage/v1/storages/${storageId}`);
  assert.equal((await detail.json()).data.storage.storageId, storageId);
  const capabilities = await request(`/api/storage/v1/storages/${storageId}/capabilities`);
  const caps = (await capabilities.json()).data.capabilities;
  assert.equal(caps.copy, true);
  assert.equal(caps.trash, true);
  assert.equal(caps.preview, false);
  assert.equal(caps.share, false);
  assert.equal(caps.rangeRead, false);
});

test('object listing validates and forwards bounded pagination using the server mount project', async () => {
  requests = [];
  const response = await request(`/api/storage/v1/storages/${storageId}/objects?parentId=folder_parent&cursor=cursor_123&limit=25`);
  const payload = await response.json();
  assert.equal(payload.data.items[0].objectId, objectId);
  assert.equal(payload.data.nextCursor, 'next_cursor');
  const upstream = new URL(requests[0].url);
  assert.equal(upstream.pathname, `/v3/projects/${projectId}/objects`);
  assert.equal(upstream.searchParams.get('parentId'), 'folder_parent');
  assert.equal(upstream.searchParams.get('limit'), '25');
  assert.equal(requests[0].init.headers.get('Authorization'), 'Bearer server-app-secret');
  assert.equal(requests[0].init.headers.get('CF-Access-Client-Secret'), 'server-access-secret');
  assert.equal((await request(`/api/storage/v1/storages/${storageId}/objects?limit=1000`)).status, 400);
});

test('object stat is scoped and writes bounded recent-access state only after successful access', async () => {
  const response = await request(`/api/storage/v1/storages/${storageId}/objects/${objectId}`);
  assert.equal((await response.json()).data.object.objectId, objectId);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM recent_access WHERE user_id = ? AND object_id = ?').get(user.id, objectId).count, 1);
  const forged = await request(`/api/storage/v1/storages/${storageId}/objects/${objectId}/../../projects/${projectId}`);
  assert.equal(forged.status, 404);
});

test('unknown objects and foreign destination parents return safe errors', async () => {
  const missing = await request(`/api/storage/v1/storages/${storageId}/objects/object_missing`);
  assert.equal(missing.status, 404);
  assert.doesNotMatch(await missing.text(), /SQLite|Garage|project_alpha/u);
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  const foreignParentFetch = async () => Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'private project row' } }, { status: 404 });
  const moved = await request(`/api/storage/v1/storages/${storageId}/objects/${objectId}/move`, {
    method: 'POST', headers, body: JSON.stringify({ parentId: 'foreign_parent' }), fetchImpl: foreignParentFetch,
  });
  assert.equal(moved.status, 404);
  assert.doesNotMatch(await moved.text(), /private project/u);
  const copied = await request(`/api/storage/v1/storages/${storageId}/objects/${objectId}/copy`, {
    method: 'POST', headers, body: JSON.stringify({ parentId: 'foreign_parent' }), fetchImpl: foreignParentFetch,
  });
  assert.equal(copied.status, 404);
  assert.equal((await request(`/api/storage/v1/storages/${storageId}/objects/bad%2Fid`)).status, 404);
});

test('foreign mount and caller-supplied project routes are hidden', async () => {
  const beforeCalls = requests.length;
  assert.equal((await request('/api/storage/v1/storages/mount_other/objects')).status, 404);
  assert.equal((await request(`/api/storage/v1/projects/${projectId}/objects`)).status, 404);
  assert.equal(requests.length, beforeCalls);
});

test('folder create, rename, move, copy, Trash, restore, permanent delete, and operation status map to S2', async () => {
  const jsonHeaders = { Origin: origin, 'Content-Type': 'application/json' };
  const folder = await request(`/api/storage/v1/storages/${storageId}/folders`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ name: 'New folder', parentId: null }) });
  assert.equal(folder.status, 201);
  assert.equal((await folder.json()).data.folder.type, 'folder');
  const rename = await request(`/api/storage/v1/storages/${storageId}/objects/${objectId}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ name: 'renamed.txt' }) });
  assert.equal((await rename.json()).data.object.name, 'renamed.txt');
  const move = await request(`/api/storage/v1/storages/${storageId}/objects/${objectId}/move`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ parentId: 'folder_parent' }) });
  assert.equal((await move.json()).data.object.parentId, 'folder_parent');
  const copied = await request(`/api/storage/v1/storages/${storageId}/objects/${objectId}/copy`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ parentId: null }) });
  assert.equal((await copied.json()).data.operationId, 'operation_copy');
  assert.equal((await request(`/api/storage/v1/storages/${storageId}/objects/${objectId}`, { method: 'DELETE', headers: { Origin: origin } })).status, 200);
  assert.equal((await request(`/api/storage/v1/storages/${storageId}/trash`)).status, 200);
  const restored = await request(`/api/storage/v1/storages/${storageId}/trash/object_trashed/restore`, { method: 'POST', headers: jsonHeaders, body: '{}' });
  assert.equal((await restored.json()).data.object.objectId, objectId);
  const purged = await request(`/api/storage/v1/storages/${storageId}/trash/object_trashed/permanent`, { method: 'DELETE', headers: { Origin: origin } });
  assert.equal((await purged.json()).data.operationId, 'operation_delete');
  const operation = await request(`/api/storage/v1/storages/${storageId}/operations/operation_alpha`);
  const operationText = await operation.text();
  assert.match(operationText, /completed/u);
  assert.doesNotMatch(operationText, /sensitive|details|projectId/u);
});

test('normal delete and permanent delete use separate upstream routes', async () => {
  requests = [];
  await request(`/api/storage/v1/storages/${storageId}/objects/${objectId}`, { method: 'DELETE', headers: { Origin: origin } });
  await request(`/api/storage/v1/storages/${storageId}/trash/${objectId}/permanent`, { method: 'DELETE', headers: { Origin: origin } });
  assert.ok(requests.some((entry) => entry.url.endsWith(`/objects/${objectId}`) && entry.init.method === 'DELETE'));
  assert.ok(requests.some((entry) => entry.url.endsWith(`/trash/${objectId}/permanent`) && entry.init.method === 'DELETE'));
});

test('upload forwards a bounded stream without materializing file bytes in Nexora', async () => {
  const boundary = 'nexora-test-boundary';
  let upstreamBody;
  const fetchImpl = async (url, init) => {
    upstreamBody = init.body;
    assert.equal(init.headers.get('Content-Type'), `multipart/form-data; boundary=${boundary}`);
    assert.ok(init.body instanceof ReadableStream);
    await new Response(init.body).text();
    return Response.json({ success: true, object: object('file_new'), operationId: 'operation_upload' }, { status: 201 });
  };
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('--nexora-test-boundary\r\ncontent\r\n')); controller.close(); } });
  const response = await request(`/api/storage/v1/storages/${storageId}/files`, { method: 'POST', fetchImpl,
    headers: { Origin: origin, 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body });
  assert.equal(response.status, 201);
  assert.ok(upstreamBody instanceof ReadableStream);
  assert.equal((await response.json()).data.file.objectId, 'file_new');
  const tooLarge = await request(`/api/storage/v1/storages/${storageId}/files`, { method: 'POST', headers: {
    Origin: origin, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': String(27 * 1024 * 1024),
  }, body: new ReadableStream({ start(controller) { controller.close(); } }) });
  assert.equal(tooLarge.status, 413);
});

test('chunked upload limit is enforced while streaming and malformed JSON is rejected', async () => {
  env.STORAGE_MAX_UPLOAD_BYTES = '8';
  const boundary = 'bounded-stream';
  const chunks = [new Uint8Array(700_000), new Uint8Array(400_000)];
  const body = new ReadableStream({ start(controller) { chunks.forEach((chunk) => controller.enqueue(chunk)); controller.close(); } });
  const response = await request(`/api/storage/v1/storages/${storageId}/files`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body,
    fetchImpl: async (_url, init) => { await new Response(init.body).text(); return Response.json({ success: true, object: object('never') }); },
  });
  assert.equal(response.status, 413);
  delete env.STORAGE_MAX_UPLOAD_BYTES;
  const malformed = await request(`/api/storage/v1/storages/${storageId}/folders`, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{not json' });
  assert.equal(malformed.status, 400);
});

test('download streams with safe headers and cancels upstream when the browser cancels', async () => {
  requests = [];
  const response = await request(`/api/storage/v1/storages/${storageId}/files/${objectId}/download`);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Content-Type'), 'text/plain');
  const firstReader = response.body.getReader();
  assert.equal(await firstReader.read().then(({ value }) => new TextDecoder().decode(value)), 'streamed');
  await firstReader.cancel();
  const cancelResponse = await request(`/api/storage/v1/storages/${storageId}/objects/${objectId}/download`);
  const reader = cancelResponse.body.getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(requests.at(-1).cancelled, true);
});

test('Shared Storage errors are normalized and secrets or provider details are not forwarded', async () => {
  const fetchImpl = async () => Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'SQLite / Garage / Access secret' } }, { status: 500 });
  const response = await request(`/api/storage/v1/storages/${storageId}/objects?limit=10`, { fetchImpl });
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.match(text, /PROVIDER_UNAVAILABLE/u);
  assert.doesNotMatch(text, /SQLite|Garage|Access secret/u);
  const missingConfig = await request(`/api/storage/v1/storages/${storageId}/objects`, { fetchImpl: async () => { throw new Error('must not call'); } });
  assert.equal(missingConfig.status, 503);
});

test('upstream timeout is bounded and normalized', async () => {
  env.STORAGE_TIMEOUT_MS = '100';
  const fetchImpl = (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  const response = await request(`/api/storage/v1/storages/${storageId}/objects`, { fetchImpl });
  assert.equal(response.status, 504);
  assert.match(await response.text(), /PROVIDER_UNAVAILABLE/u);
  delete env.STORAGE_TIMEOUT_MS;
});

test('favorites verify mount ownership and object existence, and deduplicate', async () => {
  const response = await request(`/api/favorites/${storageId}/${objectId}`, { method: 'POST', headers: { Origin: origin } });
  assert.equal(response.status, 201);
  const repeated = await request(`/api/favorites/${storageId}/${objectId}`, { method: 'POST', headers: { Origin: origin } });
  assert.equal(repeated.status, 201);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM favorites WHERE user_id = ? AND object_id = ?').get(user.id, objectId).count, 1);
  assert.equal((await request('/api/favorites')).status, 200);
  assert.equal((await request('/api/favorites/mount_other/object_foreign', { method: 'POST', headers: { Origin: origin } })).status, 404);
});

test('D1 capabilities do not invent provider usage and mount read-only policy restricts mutations', async () => {
  const usage = await request(`/api/storage/v1/storages/${storageId}/usage`);
  assert.deepEqual((await usage.json()).data.usage, { status: 'unavailable', usedBytes: null, quotaBytes: null, objectCount: null, measuredAt: null });
  sqlite.prepare('UPDATE storage_mounts SET read_only = 1 WHERE id = ?').run(storageId);
  const response = await request(`/api/storage/v1/storages/${storageId}/folders`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Denied' }) });
  assert.equal(response.status, 403);
  sqlite.prepare('UPDATE storage_mounts SET read_only = 0 WHERE id = ?').run(storageId);
});

test('session values are cryptographically random and owner sessions can be revoked', () => {
  assert.notEqual(randomToken(), randomToken());
  assert.ok(sqlite.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?').get(user.id).count >= 1);
});

test('recent-access rows are capped at 100 objects per user', async () => {
  const fetchImpl = async (url) => {
    const id = new URL(url).pathname.split('/').at(-1);
    return Response.json({ success: true, object: object(id) });
  };
  for (let index = 0; index < 101; index += 1) {
    const response = await request(`/api/storage/v1/storages/${storageId}/objects/object_${index}`, { fetchImpl });
    assert.equal(response.status, 200);
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM recent_access WHERE user_id = ?').get(user.id).count, 100);
});
