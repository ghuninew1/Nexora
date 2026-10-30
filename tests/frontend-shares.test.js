import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createShare, getShare, listShares, replaceShare, revokeShare, getPublicShare, listPublicObjects, publicObjectUrl, parseShareCapability, publicSharePath, fetchPublicPreview, SHARE_UNAVAILABLE } from '../src/services/shares.js';
const cap = { id: 'share_test', secret: 'a'.repeat(43) };
const object = { objectId: 'file_test', type: 'file', name: 'sample.txt', mimeType: 'text/plain', sizeBytes: 4, providerReference: 'private-key' };
const share = { id: cap.id, storageId: 'mount_test', objectId: object.objectId, object, storageName: 'Private storage', createdAt: '2026-10-28', status: 'active', token_hash: 'private-hash' };

test('owner share service contracts normalize fields and enforce same-origin credentials', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return Response.json({ data: init.method === 'DELETE' ? { revoked: true } : url.startsWith('/api/shares?') || url === '/api/shares' && init.method === 'GET'
      ? { shares: [share], nextCursor: null } : { share, ...(init.method === 'POST' ? { publicPath: publicSharePath(cap.id, cap.secret) } : {}) } });
  };
  const options = { fetchImpl };
  const p = await listShares({ storageId: 'mount_test', objectId: 'file_test', ...options }); assert.equal(p.shares[0].token_hash, undefined); assert.equal(p.shares[0].object.providerReference, undefined);
  await createShare('mount_test', 'file_test', 'never', options); await getShare(cap.id, options); await replaceShare(cap.id, 'never', options); await revokeShare(cap.id, options);
  assert.deepEqual(calls.map(c => c.init.method), ['GET', 'POST', 'GET', 'POST', 'DELETE']);
  assert.equal(calls[3].url, '/api/shares/share_test/replace'); assert.deepEqual(JSON.parse(calls[1].init.body), { storageId: 'mount_test', objectId: 'file_test', expiresIn: 'never' });
  assert.ok(calls.every(c => c.init.credentials === 'same-origin' && c.init.cache === 'no-store'));
});

test('public service contracts omit credentials and normalize metadata and cursor listing', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return Response.json({ data: url.includes('/objects?') ? { items: [object], nextCursor: 'next' } : { object, download: true } }); };
  assert.equal((await getPublicShare(cap, { fetchImpl })).object.providerReference, undefined);
  const p = await listPublicObjects(cap, { parentId: 'nested', cursor: 'a+b', fetchImpl }); assert.equal(p.nextCursor, 'next');
  const query = new URL(calls[1].url, 'https://example.test').searchParams; assert.equal(query.get('parentId'), 'nested'); assert.equal(query.get('cursor'), 'a+b');
  assert.ok(calls.every(c => c.init.credentials === 'omit' && c.init.referrerPolicy === 'no-referrer'));
});

test('capability parsing and URL construction reject injection and unsupported actions', () => {
  assert.deepEqual(parseShareCapability(cap.id, cap.secret), cap);
  for (const [id, secret] of [['../other', cap.secret], [cap.id, 'short'], [null, cap.secret], [cap.id, '<script>']]) assert.equal(parseShareCapability(id, secret), null);
  assert.equal(publicObjectUrl(cap, 'logical_id', 'preview'), `/api/public/shares/${cap.id}/${cap.secret}/objects/logical_id/preview`);
  assert.equal(publicObjectUrl(cap, 'logical_id'), `/api/public/shares/${cap.id}/${cap.secret}/objects/logical_id/download`);
  assert.throws(() => publicObjectUrl(cap, '../outside')); assert.throws(() => publicObjectUrl(cap, 'file', 'delete'));
});

test('public errors are generic; owner errors include session expiry and conflicts; AbortError survives', async () => {
  for (const status of [404, 503, 401]) await assert.rejects(getPublicShare(cap, { fetchImpl: async () => Response.json({ error: 'private-provider' }, { status }) }), e => e.message === SHARE_UNAVAILABLE);
  await assert.rejects(listShares({ fetchImpl: async () => new Response(null, { status: 401 }) }), e => e.status === 401);
  await assert.rejects(replaceShare(cap.id, 'never', { fetchImpl: async () => new Response(null, { status: 409 }) }), e => e.status === 409);
  await assert.rejects(getPublicShare(cap, { fetchImpl: async () => { throw new Error('internal-host'); } }), e => e.message === SHARE_UNAVAILABLE);
  await assert.rejects(getPublicShare(cap, { fetchImpl: async () => { throw new DOMException('aborted', 'AbortError'); } }), e => e.name === 'AbortError');
});

test('public preview enforces MIME and size before handing bytes to renderer', async () => {
  const p = await fetchPublicPreview(cap, object, { fetchImpl: async () => new Response('safe', { headers: { 'Content-Type': 'text/plain' } }) }); assert.equal(await p.blob.text(), 'safe');
  await assert.rejects(fetchPublicPreview(cap, object, { fetchImpl: async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }) }));
  await assert.rejects(fetchPublicPreview(cap, object, { fetchImpl: async () => new Response('a'.repeat(1048577), { headers: { 'Content-Type': 'text/plain' } }) }));
});

test('public route source remains outside auth/workspace wrappers and invalid capability has generic state', () => {
  // Structural regression guard; rendered interaction remains a separate browser QA requirement.
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const publicRoute = app.indexOf('path="/s/:shareId/:secret"');
  assert.ok(publicRoute > app.indexOf('function App()'));
  assert.ok(app.includes('path="/s/*" element={<PublicSharePage />}'));
  const page = readFileSync(new URL('../src/pages/PublicSharePage.jsx', import.meta.url), 'utf8');
  assert.ok(page.includes('capability ? <PublicContent'));
  assert.ok(page.includes('role="alert">{SHARE_UNAVAILABLE}'));
  assert.ok(!page.includes('useAuth') && !page.includes('useStorage') && !page.includes('/login'));
});

test('Shared Open in Files supplies valid abbreviated folder route state instead of falling back to root', async () => {
  const { shareFilesDestination } = await import('../src/services/shares.js');
  const { normalizeFileBrowserRouteState } = await import('../src/utils/storage-files.js');
  const destination = shareFilesDestination({ ...share, object: { ...object, type: 'folder' } });
  assert.equal(destination.to, '/files?folder=file_test');
  assert.ok(normalizeFileBrowserRouteState(destination.state.fileBrowser, share.storageId, 'file_test'));
  const parent = shareFilesDestination({ ...share, object: { ...object, parentId: 'parent_test' } });
  assert.equal(parent.to, '/files?folder=parent_test');
  assert.ok(normalizeFileBrowserRouteState(parent.state.fileBrowser, share.storageId, 'parent_test'));
  assert.equal(shareFilesDestination({ ...share, object: { ...object, parentId: null } }).to, '/files');
});
