import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createApiHandler } from '../functions/_lib/api.js';
import { randomToken, sha256Hex } from '../functions/_lib/password.js';

async function fixture() {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_backend_foundation.sql', '0002_public_shares.sql']) db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  const env = { DB: { prepare(sql) { return { bind(...args) { return {
    async first() { return db.prepare(sql).get(...args) ?? null; }, async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { return { meta: db.prepare(sql).run(...args) }; },
  }; } }; } }, STORAGE_API_URL: 'https://provider.test', STORAGE_APP_SECRET: 'private-secret', CF_ACCESS_CLIENT_ID: 'private-access', CF_ACCESS_CLIENT_SECRET: 'private-access-secret' };
  const cookies = {};
  for (const id of ['alice', 'bob']) {
    db.prepare("INSERT INTO users VALUES (?,?,?,'private-hash','user',1,1,1)").run(id, `${id}@example.test`, id);
    db.prepare("INSERT INTO storage_mounts VALUES (?,?,'Storage','garage','active',0,?,1,1)").run(`mount_${id}`, id, `private_project_${id}`);
    const token = randomToken(); cookies[id] = `nexora_session=${token}`;
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?)').run(`session_${id}`, id, await sha256Hex(token), Date.now() + 1000000, Date.now(), Date.now());
  }
  const objects = new Map();
  function add(id, parentId = null, type = 'file', extra = {}) { objects.set(id, { objectId: id, parentId, type, name: `${id}.txt`, mimeType: 'text/plain', sizeBytes: 4, deletedAt: null, providerReference: 'private-key', projectId: 'private-project', ...extra }); }
  add('above', null, 'folder'); add('root', 'above', 'folder'); add('nested', 'root', 'folder'); add('file', 'nested'); add('sibling', 'above'); add('foreign'); add('single');
  const caps = { stat: true, list: true, download: true };
  let failProvider = false;
  let listingOverride = null;
  let downloadHook = () => {};
  const calls = [];
  const handler = createApiHandler({ logger: { warn() {} }, fetchImpl: async (url, init) => {
    const u = new URL(url); calls.push({ url: u, init });
    if (failProvider) return Response.json({ error: { message: 'private-project private-key' } }, { status: 500 });
    if (u.pathname.endsWith('/capabilities')) return Response.json({ capabilities: caps });
    const match = /\/objects\/([^/]+)(\/download)?$/u.exec(u.pathname);
    if (match) {
      const o = objects.get(match[1]);
      if (!o || o.deletedAt) return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
      if (match[2]) { await downloadHook(); return new Response('safe', { headers: { 'Content-Type': o.mimeType, 'Content-Length': '4', 'X-Internal': 'private-key' } }); }
      return Response.json({ object: o });
    }
    return Response.json({ items: listingOverride ?? [...objects.values()].filter(o => o.parentId === u.searchParams.get('parentId') && !o.deletedAt), nextCursor: null });
  } });
  async function call(path, { user = 'alice', method = 'GET', body, origin = 'https://nexora.test' } = {}) {
    return handler(new Request(`https://nexora.test${path}`, { method, headers: { ...(user ? { Cookie: cookies[user] } : {}), Origin: origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
  }
  async function create(id = 'root', user = 'alice') { const r = await call('/api/shares', { method: 'POST', user, body: { storageId: `mount_${user}`, objectId: id } }); assert.equal(r.status, 201); return (await r.json()).data; }
  const publicApi = path => path.replace('/s/', '/api/public/shares/');
  return { db, call, create, objects, add, caps, calls, publicApi, onDownload: fn => { downloadHook = fn; }, fail: () => { failProvider = true; }, listing: items => { listingOverride = items; } };
}

test('share authentication, ownership, origin, missing object and capability checks', async () => {
  const f = await fixture();
  for (const method of ['GET', 'POST']) assert.equal((await f.call('/api/shares', { method, user: null, body: method === 'POST' ? {} : null })).status, 401);
  for (const storageId of ['mount_bob', 'unknown']) assert.equal((await f.call('/api/shares', { method: 'POST', body: { storageId, objectId: 'single' } })).status, 404);
  assert.equal((await f.call('/api/shares', { method: 'POST', origin: 'https://evil.test', body: {} })).status, 403);
  assert.equal((await f.call('/api/shares', { method: 'POST', body: { storageId: 'mount_alice', objectId: 'missing' } })).status, 404);
  f.caps.stat = false;
  assert.equal((await f.call('/api/shares', { method: 'POST', body: { storageId: 'mount_alice', objectId: 'single' } })).status, 422);
  f.caps.stat = true; f.caps.download = false;
  assert.equal((await f.call('/api/shares', { method: 'POST', body: { storageId: 'mount_alice', objectId: 'single' } })).status, 422);
  f.db.close();
});

test('create stores only hash, duplicates do not rotate, owner listing/get serialize safely', async () => {
  const f = await fixture(); const p = await f.create('single');
  const secret = p.publicPath.split('/').at(-1);
  assert.equal(secret.length, 43);
  const row = f.db.prepare('SELECT * FROM public_shares').get(); assert.equal(row.token_hash, await sha256Hex(secret)); assert.ok(!JSON.stringify(row).includes(secret));
  const dup = await f.call('/api/shares', { method: 'POST', body: { storageId: 'mount_alice', objectId: 'single' } }); assert.equal(dup.status, 200); assert.equal((await dup.json()).data.publicPath, undefined);
  const listed = await (await f.call('/api/shares')).json(); assert.equal(listed.data.shares.length, 1);
  assert.equal((await (await f.call('/api/shares', { user: 'bob' })).json()).data.shares.length, 0);
  for (const method of ['GET', 'DELETE']) assert.equal((await f.call(`/api/shares/${p.share.id}`, { user: 'bob', method })).status, 404);
  const serialized = JSON.stringify(listed); for (const word of ['private-', 'private_', 'token_hash', secret]) assert.ok(!serialized.includes(word));
  assert.equal((await f.call(`/api/shares/${p.share.id}`)).status, 200);
  f.db.close();
});

test('public file metadata/download/preview are anonymous, safe and never write Recent', async () => {
  const f = await fixture(); const p = await f.create('single'); const api = f.publicApi(p.publicPath);
  const meta = await f.call(api, { user: null }); assert.equal(meta.status, 200); const json = await meta.json(); assert.equal(json.data.object.parentId, undefined);
  for (const action of ['download', 'preview']) {
    const r = await f.call(`${api}/objects/single/${action}`, { user: null }); assert.equal(r.status, 200); assert.equal(await r.text(), 'safe');
    assert.match(r.headers.get('Cache-Control'), /no-store/u); assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff'); assert.equal(r.headers.get('X-Internal'), null);
    assert.match(r.headers.get('Content-Disposition'), action === 'preview' ? /^inline/u : /^attachment/u);
  }
  assert.equal((await f.call(`${api}/objects`, { user: null })).status, 404);
  assert.equal((await f.call(`${api}/objects/foreign/download`, { user: null })).status, 404);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM recent_access').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM favorites').get().n, 0);
  f.objects.get('single').mimeType = 'text/html'; assert.equal((await f.call(`${api}/objects/single/preview`, { user: null })).status, 404);
  f.objects.get('single').mimeType = 'text/plain'; f.objects.get('single').sizeBytes = 1048577; assert.equal((await f.call(`${api}/objects/single/preview`, { user: null })).status, 404);
  f.db.close();
});

test('folder root/nested pagination and bytes cannot escape shared logical subtree', async () => {
  const f = await fixture(); const p = await f.create(); const api = f.publicApi(p.publicPath);
  for (const id of ['root', 'nested']) { const r = await f.call(`${api}/objects?parentId=${id}&limit=1`, { user: null }); assert.equal(r.status, 200); const data = (await r.json()).data; assert.equal(data.items.length, 1); assert.equal(data.items[0].parentId, undefined); }
  assert.equal((await f.call(`${api}/objects/file/download`, { user: null })).status, 200);
  for (const id of ['above', 'sibling', 'foreign', 'missing']) {
    for (const suffix of [`/objects?parentId=${id}`, `/objects/${id}/download`, `/objects/${id}/preview`]) assert.equal((await f.call(api + suffix, { user: null })).status, 404);
  }
  f.objects.get('file').parentId = 'above'; assert.equal((await f.call(`${api}/objects/file/download`, { user: null })).status, 404);
  f.objects.get('file').parentId = 'nested'; f.objects.get('nested').parentId = 'nested'; assert.equal((await f.call(`${api}/objects/file/download`, { user: null })).status, 404);
  f.objects.get('nested').parentId = 'root'; f.listing([f.objects.get('foreign')]); assert.equal((await f.call(`${api}/objects`, { user: null })).status, 404);
  f.db.close();
});

test('rename/move preserve root link, Trash/delete fail generically and restore re-enables active share', async () => {
  const f = await fixture(); const p = await f.create(); const api = f.publicApi(p.publicPath);
  f.objects.get('root').name = 'renamed'; f.objects.get('root').parentId = null;
  assert.equal((await (await f.call(api, { user: null })).json()).data.object.name, 'renamed');
  f.objects.get('root').deletedAt = 'now'; const trashed = await f.call(api, { user: null }); assert.equal(trashed.status, 404); assert.equal((await trashed.json()).error.code, 'SHARE_UNAVAILABLE');
  f.objects.get('root').deletedAt = null; assert.equal((await f.call(api, { user: null })).status, 200);
  f.objects.delete('root'); assert.equal((await f.call(api, { user: null })).status, 404);
  f.db.close();
});

test('replace invalidates old capability; revoke is owner-only and idempotent', async () => {
  const f = await fixture(); const p = await f.create('single'); const api = f.publicApi(p.publicPath);
  assert.equal((await f.call(`/api/shares/${p.share.id}/replace`, { method: 'POST', user: 'bob' })).status, 404);
  const replaced = await f.call(`/api/shares/${p.share.id}/replace`, { method: 'POST' }); assert.equal(replaced.status, 200);
  const next = f.publicApi((await replaced.json()).data.publicPath); assert.equal((await f.call(api, { user: null })).status, 404); assert.equal((await f.call(next, { user: null })).status, 200);
  for (let i = 0; i < 2; i++) assert.equal((await f.call(`/api/shares/${p.share.id}`, { method: 'DELETE' })).status, 200);
  for (const suffix of ['', '/objects', '/objects/single/download', '/objects/single/preview']) assert.equal((await f.call(next + suffix, { user: null })).status, 404);
  assert.equal((await f.call(`/api/shares/${p.share.id}/replace`, { method: 'POST' })).status, 409);
  f.db.close();
});

test('invalid tokens, inactive mounts/users and provider failure expose the same generic public error', async () => {
  const f = await fixture(); const p = await f.create('single'); const api = f.publicApi(p.publicPath);
  const invalid = api.slice(0, -1) + (api.endsWith('A') ? 'B' : 'A');
  const result = await f.call(invalid, { user: null }); const expected = await result.text(); assert.equal(result.status, 404);
  f.db.prepare("UPDATE storage_mounts SET status = 'inactive' WHERE id = 'mount_alice'").run(); assert.equal(await (await f.call(api, { user: null })).text(), expected);
  f.db.prepare("UPDATE storage_mounts SET status = 'active' WHERE id = 'mount_alice'").run();
  f.db.prepare("UPDATE users SET active = 0 WHERE id = 'alice'").run(); assert.equal(await (await f.call(api, { user: null })).text(), expected);
  f.db.prepare("UPDATE users SET active = 1 WHERE id = 'alice'").run(); f.fail(); assert.equal(await (await f.call(api, { user: null })).text(), expected);
  f.db.close();
});

test('owner share hydration is bounded and cursor-paginated, filtered lookup is exact', async () => {
  const f = await fixture();
  for (let i = 0; i < 23; i++) { f.add(`extra_${i}`); await f.create(`extra_${i}`); }
  const first = (await (await f.call('/api/shares')).json()).data;
  assert.equal(first.shares.length, 20); assert.ok(first.nextCursor);
  const second = (await (await f.call(`/api/shares?cursor=${first.nextCursor}`)).json()).data;
  assert.equal(second.shares.length, 3); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.shares, ...second.shares].map(v => v.id)).size, 23);
  const filtered = (await (await f.call('/api/shares?storageId=mount_alice&objectId=extra_2')).json()).data;
  assert.equal(filtered.shares.length, 1); assert.equal(filtered.shares[0].objectId, 'extra_2');
  f.db.close();
});

test('read-only mount rejects creation/replacement, and public has no mutation routes', async () => {
  const f = await fixture(); const p = await f.create('single');
  f.db.prepare("UPDATE storage_mounts SET read_only = 1 WHERE id = 'mount_alice'").run();
  assert.equal((await f.call('/api/shares', { method: 'POST', body: { storageId: 'mount_alice', objectId: 'foreign' } })).status, 403);
  assert.equal((await f.call(`/api/shares/${p.share.id}/replace`, { method: 'POST' })).status, 403);
  for (const method of ['POST', 'DELETE', 'PATCH', 'PUT']) assert.equal((await f.call(f.publicApi(p.publicPath), { method, user: null })).status, 404);
  // Owner revocation remains available even when the mount is read-only.
  assert.equal((await f.call(`/api/shares/${p.share.id}`, { method: 'DELETE' })).status, 200);
  f.db.close();
});

test('public rejects malformed ancestry, oversized limits and invalid encodings; JSON leaks no internals', async () => {
  const f = await fixture(); const p = await f.create(); const api = f.publicApi(p.publicPath);
  const r = await f.call(api, { user: null }); const body = await r.text();
  for (const value of ['private', 'parentId', 'storageId', 'mount_', 'token_hash', 'user_id', 'projectId', 'providerReference']) assert.ok(!body.includes(value));
  assert.equal(r.headers.get('Referrer-Policy'), 'no-referrer');
  for (const limit of ['0', '101', '-1', 'bad']) assert.equal((await f.call(`${api}/objects?limit=${limit}`, { user: null })).status, 404);
  delete f.objects.get('nested').parentId;
  assert.equal((await f.call(`${api}/objects/file/download`, { user: null })).status, 404);
  assert.equal((await (await f.call('/api/public/shares/%ZZ/token', { user: null })).json()).error.code, 'SHARE_UNAVAILABLE');
  f.db.close();
});

test('public revalidates ancestry and revocation after fetching an upstream stream', async () => {
  const f = await fixture(); const p = await f.create(); const api = f.publicApi(p.publicPath);
  f.onDownload(() => { f.objects.get('file').parentId = 'above'; });
  assert.equal((await f.call(`${api}/objects/file/download`, { user: null })).status, 404);
  f.objects.get('file').parentId = 'nested';
  f.onDownload(() => { f.db.prepare('UPDATE public_shares SET revoked_at = 1 WHERE id = ?').run(p.share.id); });
  assert.equal((await f.call(`${api}/objects/file/preview`, { user: null })).status, 404);
  f.db.close();
});
