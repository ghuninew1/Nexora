import assert from 'node:assert/strict';
import test from 'node:test';
import {
  copyStorageObject,
  canUseStorageCapability,
  createStorageFolder,
  getStorageCapabilities,
  getStorageUsage,
  listStorageObjects,
  listStorages,
  mergeStorageObjects,
  moveStorageObject,
  normalizeStorageObject,
  normalizeStorageCapabilities,
  normalizeStorageUsage,
  renameStorageObject,
  startStorageObjectDownload,
  storageObjectDownloadUrl,
  uploadStorageFile,
  validateStorageObjectName,
  StorageApiError,
} from '../src/services/storage.js';
import { appendBreadcrumb, normalizeFileBrowserRouteState, rootBreadcrumbs } from '../src/utils/storage-files.js';
import { FOLDER_LIST_CACHE_TTL_MS, MAX_FOLDER_CACHE_ENTRIES, RemoteFilesCache } from '../src/utils/remote-files-cache.js';

const mount = {
  storageId: 'mount_123',
  name: 'Personal files',
  providerLabel: 'Private storage',
  status: 'active',
  readOnly: false,
};

test('storage discovery uses the same-origin endpoint and keeps only public mount fields', async () => {
  let call;
  const storages = await listStorages({ fetchImpl: async (url, options) => {
    call = { url, options };
    return Response.json({ data: { storages: [{ ...mount, shared_storage_project_id: 'private-project', provider: 'garage', provider_reference: 'secret-ref', bucket: 'private-bucket' }] } });
  } });

  assert.equal(call.url, '/api/storage/v1/storages');
  assert.equal(call.options.credentials, 'same-origin');
  assert.deepEqual(storages, [mount]);
  assert.equal(Object.hasOwn(storages[0], 'shared_storage_project_id'), false);
  assert.equal(Object.hasOwn(storages[0], 'provider'), false);
  assert.equal(Object.hasOwn(storages[0], 'provider_reference'), false);
  assert.equal(Object.hasOwn(storages[0], 'bucket'), false);
});

test('storage discovery rejects malformed envelopes and malformed entries', async () => {
  await assert.rejects(listStorages({ fetchImpl: async () => Response.json({ data: { storage: mount } }) }), {
    code: 'PROVIDER_UNAVAILABLE',
  });
  await assert.rejects(listStorages({ fetchImpl: async () => Response.json({ data: { storages: [null] } }) }), {
    code: 'PROVIDER_UNAVAILABLE',
  });
  assert.deepEqual(await listStorages({ fetchImpl: async () => Response.json({ data: { storages: [] } }) }), []);
});

test('capabilities use the selected public storage ID and whitelist actual capability fields', async () => {
  let call;
  const capabilities = await getStorageCapabilities('mount/with space', { fetchImpl: async (url, options) => {
    call = { url, options };
    return Response.json({ data: { capabilities: {
      list: true, stat: true, upload: true, download: true, createFolder: true, rename: true,
      move: true, copy: true, trash: true, restore: true, permanentDelete: true,
      preview: false, share: false, rangeRead: false, readOnly: false, maxUploadBytes: 1024,
      shared_storage_project_id: 'hidden', provider_reference: 'hidden', provider: 'garage',
    } } });
  } });

  assert.equal(call.url, '/api/storage/v1/storages/mount%2Fwith%20space/capabilities');
  assert.equal(call.options.credentials, 'same-origin');
  assert.equal(capabilities.upload, true);
  assert.equal(capabilities.maxUploadBytes, 1024);
  assert.equal(Object.hasOwn(capabilities, 'shared_storage_project_id'), false);
  assert.equal(Object.hasOwn(capabilities, 'provider_reference'), false);
  assert.equal(Object.hasOwn(capabilities, 'provider'), false);
});

test('capabilities reject malformed data and normalize unknown/unsafe flags to false', () => {
  assert.throws(() => normalizeStorageCapabilities(null), { code: 'PROVIDER_UNAVAILABLE' });
  assert.deepEqual(normalizeStorageCapabilities({ list: 1, upload: 'yes', download: true, projectId: 'secret' }), {
    list: false, stat: false, upload: false, download: true, createFolder: false, rename: false,
    move: false, copy: false, trash: false, restore: false, permanentDelete: false,
    preview: false, share: false, rangeRead: false, readOnly: false,
  });
});

test('file operation capability gating also respects mount and capability read-only state', () => {
  const capabilities = { upload: true, download: true, rename: true, move: true, copy: true, readOnly: false };
  assert.equal(canUseStorageCapability(capabilities, mount, 'upload'), true);
  assert.equal(canUseStorageCapability(capabilities, mount, 'download'), true);
  assert.equal(canUseStorageCapability(capabilities, mount, 'rename'), true);
  assert.equal(canUseStorageCapability({ ...capabilities, copy: false }, mount, 'copy'), false);
  assert.equal(canUseStorageCapability(capabilities, { ...mount, readOnly: true }, 'move'), false);
  assert.equal(canUseStorageCapability({ ...capabilities, readOnly: true }, mount, 'copy'), false);
});

test('usage unavailable response and malformed optional usage remain honest', async () => {
  const usage = await getStorageUsage('mount_123', { fetchImpl: async () => Response.json({ data: { usage: {
    status: 'unavailable', usedBytes: null, quotaBytes: null, objectCount: null, measuredAt: null,
    provider_reference: 'hidden',
  } } }) });
  assert.deepEqual(usage, { status: 'unavailable', usedBytes: null, quotaBytes: null, objectCount: null, measuredAt: null });
  assert.deepEqual(normalizeStorageUsage({ status: 'available', usedBytes: '123', quotaBytes: -1, objectCount: 4, measuredAt: 'now', projectId: 'secret' }), {
    status: 'available', usedBytes: null, quotaBytes: null, objectCount: 4, measuredAt: 'now',
  });
});

test('storage API classifies authentication, authorization, missing, rate-limit, and server errors safely', async () => {
  for (const [status, code] of [[401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [429, 'RATE_LIMITED'], [503, 'PROVIDER_UNAVAILABLE']]) {
    await assert.rejects(listStorages({ fetchImpl: async () => Response.json({ error: { code, message: 'private provider details' } }, { status }) }), (error) => {
      assert.ok(error instanceof StorageApiError);
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.ok(!error.message.includes('private provider details'));
      return true;
    });
  }
});

test('storage API classifies malformed JSON and network failures without exposing raw detail', async () => {
  await assert.rejects(listStorages({ fetchImpl: async () => new Response('{', { status: 200 }) }), {
    code: 'PROVIDER_UNAVAILABLE',
  });
  await assert.rejects(listStorages({ fetchImpl: async () => { throw new TypeError('private network detail'); } }), (error) => {
    assert.equal(error.code, 'PROVIDER_UNAVAILABLE');
    assert.ok(!error.message.includes('private network detail'));
    return true;
  });
});

test('aborted storage requests preserve AbortError for provider cancellation', async () => {
  await assert.rejects(listStorages({ fetchImpl: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; } }), { name: 'AbortError' });
});

test('root object listing omits parentId and uses the backend default page size contract', async () => {
  let request;
  const result = await listStorageObjects('mount_123', { fetchImpl: async (url, options) => {
    request = { url, options };
    return Response.json({ data: { items: [{ objectId: 'folder_a', parentId: null, name: 'A', type: 'folder' }], nextCursor: null } });
  } });
  const parsed = new URL(request.url, 'https://nexora.test');
  assert.equal(parsed.pathname, '/api/storage/v1/storages/mount_123/objects');
  assert.equal(parsed.searchParams.get('parentId'), null);
  assert.equal(parsed.searchParams.get('limit'), '50');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(result.items[0].objectId, 'folder_a');
});

test('child listing safely encodes parentId and forwards opaque cursor and requested limit', async () => {
  let requestUrl;
  const cursor = 'cursor_part-02';
  await listStorageObjects('mount_123', {
    parentId: 'folder/a ?', cursor, limit: 25,
    fetchImpl: async (url) => {
      requestUrl = url;
      return Response.json({ data: { items: [], nextCursor: null } });
    },
  });
  const parsed = new URL(requestUrl, 'https://nexora.test');
  assert.equal(parsed.searchParams.get('parentId'), 'folder/a ?');
  assert.equal(parsed.searchParams.get('cursor'), cursor);
  assert.equal(parsed.searchParams.get('limit'), '25');
  await assert.rejects(listStorageObjects('mount_123', { limit: 101, fetchImpl: async () => { throw new Error('must not request'); } }), { code: 'INVALID_INPUT' });
});

test('real object normalization validates file/folder model and strips provider internals', () => {
  const object = normalizeStorageObject({
    objectId: 'file_a', parentId: 'folder_a', name: 'Report.pdf', type: 'file',
    sizeBytes: 128, mimeType: 'application/pdf', createdAt: '2026-10-27T00:00:00.000Z', modifiedAt: '2026-10-27T01:00:00.000Z',
    provider_reference: 'secret', object_key: 'secret', bucket: 'secret', project_id: 'secret',
  });
  assert.deepEqual(Object.keys(object).sort(), ['createdAt', 'mimeType', 'modifiedAt', 'name', 'objectId', 'parentId', 'sizeBytes', 'type']);
  assert.equal(object.objectId, 'file_a');
  assert.equal(Object.hasOwn(object, 'provider_reference'), false);
  assert.equal(Object.hasOwn(object, 'object_key'), false);
  assert.throws(() => normalizeStorageObject({ objectId: 'bad', parentId: null, name: 'Folder', type: 'unknown' }), { code: 'PROVIDER_UNAVAILABLE' });
  assert.throws(() => normalizeStorageObject({ objectId: 'bad/id', parentId: null, name: 'File', type: 'file' }), { code: 'PROVIDER_UNAVAILABLE' });
});

test('malformed listing pages fail safely and cursor pages deduplicate logical object IDs', async () => {
  await assert.rejects(listStorageObjects('mount_123', { fetchImpl: async () => Response.json({ data: { items: [{ objectId: 'x', name: 'No type' }], nextCursor: null } }) }), { code: 'PROVIDER_UNAVAILABLE' });
  const merged = mergeStorageObjects([{ objectId: 'a', name: 'old' }, { objectId: 'b', name: 'B' }], [{ objectId: 'a', name: 'updated' }, { objectId: 'c', name: 'C' }]);
  assert.deepEqual(merged.map((item) => item.objectId), ['a', 'b', 'c']);
  assert.equal(merged[0].name, 'updated');
});

test('create-folder posts the Phase 8 request contract and normalizes the public response', async () => {
  let request;
  const folder = await createStorageFolder('mount_123', { name: 'QA Folder', parentId: 'parent_a' }, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return Response.json({ data: { folder: { objectId: 'folder_new', parentId: 'parent_a', name: 'QA Folder', type: 'folder', provider_reference: 'hidden', object_key: 'hidden' } } }, { status: 201 });
    },
  });
  assert.equal(request.url, '/api/storage/v1/storages/mount_123/folders');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.options.body), { name: 'QA Folder', parentId: 'parent_a' });
  assert.equal(folder.objectId, 'folder_new');
  assert.equal(Object.hasOwn(folder, 'provider_reference'), false);
});

test('create-folder duplicate and backend validation errors are mapped to safe messages', async () => {
  await assert.rejects(createStorageFolder('mount_123', { name: 'Duplicate', parentId: null }, {
    fetchImpl: async () => Response.json({ error: { code: 'NAME_CONFLICT', message: 'provider secret detail' } }, { status: 409 }),
  }), (error) => error.code === 'NAME_CONFLICT' && !error.message.includes('provider secret detail'));
  await assert.rejects(createStorageFolder('mount_123', { name: 'bad/name', parentId: null }, {
    fetchImpl: async () => Response.json({ error: { code: 'INVALID_INPUT' } }, { status: 400 }),
  }), { code: 'INVALID_INPUT' });
});

test('upload sends multipart file and logical parent through the same-origin API without setting its boundary header', async () => {
  let call;
  const file = new Blob(['sample bytes'], { type: 'text/plain' });
  Object.defineProperty(file, 'name', { value: 'qa.txt' });
  const result = await uploadStorageFile('mount_123', file, 'folder_a', {
    maxUploadBytes: 64,
    fetchImpl: async (url, options) => {
      call = { url, options };
      return Response.json({ data: { file: {
        objectId: 'file_new', parentId: 'folder_a', name: 'qa.txt', type: 'file', sizeBytes: 12,
        provider_reference: 'private', projectId: 'private',
      }, operationId: 'operation_upload' } }, { status: 201 });
    },
  });

  assert.equal(call.url, '/api/storage/v1/storages/mount_123/files');
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.credentials, 'same-origin');
  assert.equal(call.options.headers['Content-Type'], undefined);
  assert.ok(call.options.body instanceof FormData);
  assert.equal(call.options.body.get('file').name, 'qa.txt');
  assert.equal(call.options.body.get('parentId'), 'folder_a');
  assert.deepEqual(result, {
    file: { objectId: 'file_new', parentId: 'folder_a', name: 'qa.txt', type: 'file', sizeBytes: 12, mimeType: null, createdAt: null, modifiedAt: null },
    operationId: 'operation_upload',
  });
  assert.doesNotMatch(JSON.stringify(result), /provider_reference|private/u);
});

test('upload enforces the advertised UX size limit and safely maps backend upload errors', async () => {
  const file = new Blob(['12345']);
  Object.defineProperty(file, 'name', { value: 'large.bin' });
  let calls = 0;
  await assert.rejects(uploadStorageFile('mount_123', file, null, {
    maxUploadBytes: 4,
    fetchImpl: async () => { calls += 1; },
  }), { code: 'UPLOAD_TOO_LARGE', status: 413 });
  assert.equal(calls, 0);

  for (const [status, code] of [[413, 'UPLOAD_TOO_LARGE'], [409, 'NAME_CONFLICT'], [401, 'UNAUTHENTICATED'], [503, 'PROVIDER_UNAVAILABLE']]) {
    await assert.rejects(uploadStorageFile('mount_123', file, null, {
      fetchImpl: async () => Response.json({ error: { code, message: 'private provider details' } }, { status }),
    }), (error) => error.code === code && !error.message.includes('private provider details'));
  }
});

test('rename and move use logical object IDs and preserve identity; copy creates a new ID', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const object = calls.length === 1
      ? { objectId: 'object_a', parentId: null, name: 'renamed.txt', type: 'file' }
      : calls.length === 2
        ? { objectId: 'object_a', parentId: 'folder_b', name: 'renamed.txt', type: 'file' }
        : { objectId: 'object_copy', parentId: 'folder_b', name: 'renamed.txt', type: 'file' };
    return Response.json({ data: { object, operationId: calls.length === 3 ? 'operation_copy' : undefined } });
  };
  const renamed = await renameStorageObject('mount_123', 'object_a', 'renamed.txt', { fetchImpl });
  const moved = await moveStorageObject('mount_123', 'object_a', 'folder_b', { fetchImpl });
  const copied = await copyStorageObject('mount_123', 'object_a', 'folder_b', { fetchImpl });

  assert.equal(calls[0].url, '/api/storage/v1/storages/mount_123/objects/object_a');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[0].options.body), { name: 'renamed.txt' });
  assert.equal(renamed.objectId, 'object_a');
  assert.equal(calls[1].url, '/api/storage/v1/storages/mount_123/objects/object_a/move');
  assert.deepEqual(JSON.parse(calls[1].options.body), { parentId: 'folder_b' });
  assert.equal(moved.objectId, 'object_a');
  assert.equal(moved.parentId, 'folder_b');
  assert.equal(calls[2].url, '/api/storage/v1/storages/mount_123/objects/object_a/copy');
  assert.deepEqual(JSON.parse(calls[2].options.body), { parentId: 'folder_b' });
  assert.equal(copied.object.objectId, 'object_copy');
  assert.notEqual(copied.object.objectId, 'object_a');
  assert.equal(copied.operationId, 'operation_copy');
});

test('operation clients reject invalid names and identity-breaking rename/move/copy responses', async () => {
  for (const name of ['', '   ', 'bad/name', `x${'a'.repeat(255)}`]) assert.equal(validateStorageObjectName(name), false);
  assert.equal(validateStorageObjectName('valid name.txt'), true);
  const sameObject = { objectId: 'object_a', parentId: null, name: 'A', type: 'file' };
  const wrongObject = { ...sameObject, objectId: 'other_object' };
  await assert.rejects(renameStorageObject('mount_123', 'object_a', 'B', {
    fetchImpl: async () => Response.json({ data: { object: wrongObject } }),
  }), { code: 'PROVIDER_UNAVAILABLE' });
  await assert.rejects(moveStorageObject('mount_123', 'object_a', 'folder_a', {
    fetchImpl: async () => Response.json({ data: { object: wrongObject } }),
  }), { code: 'PROVIDER_UNAVAILABLE' });
  await assert.rejects(copyStorageObject('mount_123', 'object_a', null, {
    fetchImpl: async () => Response.json({ data: { object: sameObject } }),
  }), { code: 'PROVIDER_UNAVAILABLE' });
});

test('copy keeps known S2 error classifications instead of flattening operation failures', async () => {
  for (const [status, code] of [
    [400, 'INVALID_INPUT'], [404, 'NOT_FOUND'], [409, 'NAME_CONFLICT'],
    [413, 'OPERATION_TOO_LARGE'], [500, 'INTERNAL_ERROR'], [502, 'PROVIDER_UNAVAILABLE'],
  ]) {
    await assert.rejects(copyStorageObject('mount_123', 'object_a', null, {
      fetchImpl: async () => Response.json({ error: { code, message: 'private upstream details' } }, { status }),
    }), (error) => error.code === code && !error.message.includes('private upstream details'));
  }
});

test('download uses an authenticated Nexora path and leaves the response body to the browser stream', async () => {
  let authRequest;
  let downloadUrl;
  const url = await startStorageObjectDownload('mount_123', 'object_a', {
    fetchImpl: async (path, options) => {
      authRequest = { path, options };
      return Response.json({ data: { user: { email: 'user@example.test', displayName: 'User', role: 'user' } } });
    },
    navigate: (target) => { downloadUrl = target; },
  });
  assert.equal(authRequest.path, '/api/auth/me');
  assert.equal(authRequest.options.credentials, 'same-origin');
  assert.equal(url, '/api/storage/v1/storages/mount_123/objects/object_a/download');
  assert.equal(downloadUrl, storageObjectDownloadUrl('mount_123', 'object_a'));
  assert.doesNotMatch(downloadUrl, /garage|project|provider/u);
  await assert.rejects(startStorageObjectDownload('mount_123', 'object_a', {
    fetchImpl: async () => Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 }),
    navigate() { assert.fail('must not start a download without a session'); },
  }), { code: 'UNAUTHENTICATED', status: 401 });
});

test('folder breadcrumbs use logical IDs and reject route state from another storage or malformed paths', () => {
  const root = rootBreadcrumbs();
  const folderPath = appendBreadcrumb(root, { objectId: 'folder_a', name: 'Folder A' });
  const nestedPath = appendBreadcrumb(folderPath, { objectId: 'folder_b', name: 'Folder B' });
  const routeState = { storageId: 'mount_123', breadcrumbs: nestedPath };
  assert.equal(normalizeFileBrowserRouteState(routeState, 'mount_123', 'folder_b').at(-1).label, 'Folder B');
  assert.equal(normalizeFileBrowserRouteState(routeState, 'mount_other', 'folder_b'), null);
  assert.equal(normalizeFileBrowserRouteState(routeState, 'mount_123', 'folder_c'), null);
  assert.equal(normalizeFileBrowserRouteState({ ...routeState, breadcrumbs: [...nestedPath, nestedPath[1]] }, 'mount_123', 'folder_a'), null);
});

function listingItem(objectId, parentId, name = objectId, type = 'folder') {
  return { objectId, parentId, name, type, sizeBytes: null, mimeType: null, createdAt: null, modifiedAt: null };
}

test('folder cache scopes root and folders by storage and returns a fresh listing without fetching', async () => {
  let now = 1_000;
  const cache = new RemoteFilesCache({ now: () => now });
  const page = { items: [listingItem('folder_a', null, 'Projects')], nextCursor: null };
  let calls = 0;
  await cache.fetchPage('mount_a', null, null, async () => { calls += 1; return page; });
  assert.deepEqual(cache.get('mount_a', null).items, page.items);
  assert.equal(cache.isFresh(cache.get('mount_a', null)), true);
  assert.equal(cache.get('mount_b', null), null);
  assert.equal(cache.get('mount_a', 'folder_a'), null);
  now += FOLDER_LIST_CACHE_TTL_MS;
  assert.equal(cache.isFresh(cache.get('mount_a', null)), false);
  assert.equal(calls, 1);
});

test('same-folder and same-cursor requests share one in-flight fetch', async () => {
  const cache = new RemoteFilesCache();
  let calls = 0;
  let resolveRequest;
  const loader = () => {
    calls += 1;
    return new Promise((resolve) => { resolveRequest = resolve; });
  };
  const first = cache.fetchPage('mount_a', 'folder_a', 'cursor_1', loader);
  const second = cache.fetchPage('mount_a', 'folder_a', 'cursor_1', loader);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveRequest({ items: [listingItem('file_a', 'folder_a', 'A.txt', 'file')], nextCursor: null });
  assert.deepEqual(await first, await second);
  assert.equal(cache.get('mount_a', 'folder_a').items.length, 1);
});

test('different cursors for the same folder never share an in-flight request', async () => {
  const cache = new RemoteFilesCache();
  let calls = 0;
  const resolvers = [];
  const loader = () => {
    calls += 1;
    return new Promise((resolve) => resolvers.push(resolve));
  };
  const first = cache.fetchPage('mount_a', 'folder_a', 'cursor_1', loader);
  const second = cache.fetchPage('mount_a', 'folder_a', 'cursor_2', loader);
  await Promise.resolve();
  assert.equal(calls, 2);
  resolvers[0]({ items: [listingItem('file_a', 'folder_a', 'A.txt', 'file')], nextCursor: 'cursor_2' });
  resolvers[1]({ items: [listingItem('file_b', 'folder_a', 'B.txt', 'file')], nextCursor: null });
  await Promise.all([first, second]);
  assert.deepEqual(cache.get('mount_a', 'folder_a').items.map((item) => item.objectId), ['file_a', 'file_b']);
});

test('pagination keeps cursor pages when the first-page anchor is stable and resets when it changes', () => {
  let now = 1;
  const cache = new RemoteFilesCache({ now: () => now });
  cache.setPage('mount_a', null, null, { items: [listingItem('folder_a', null)], nextCursor: 'cursor_1' });
  cache.setPage('mount_a', null, 'cursor_1', { items: [listingItem('folder_b', null)], nextCursor: 'cursor_2' });
  assert.deepEqual(cache.get('mount_a', null).items.map((item) => item.objectId), ['folder_a', 'folder_b']);
  now += 1;
  cache.setPage('mount_a', null, null, { items: [listingItem('folder_a', null, 'Renamed')], nextCursor: 'cursor_1' });
  assert.deepEqual(cache.get('mount_a', null).items.map((item) => item.name), ['Renamed', 'folder_b']);
  cache.setPage('mount_a', null, null, { items: [listingItem('folder_a', null, 'Latest')], nextCursor: 'cursor_new' });
  assert.deepEqual(cache.get('mount_a', null).items.map((item) => item.objectId), ['folder_a']);
  assert.equal(cache.get('mount_a', null).nextCursor, 'cursor_new');
});

test('cache exposes only known logical breadcrumb metadata and isolates metadata by storage', () => {
  const cache = new RemoteFilesCache();
  cache.rememberObjects('mount_a', [
    listingItem('folder_a', null, 'Projects'),
    listingItem('folder_b', 'folder_a', 'Nexora'),
  ]);
  assert.deepEqual(cache.getBreadcrumbs('mount_a', 'folder_b', rootBreadcrumbs()[0]), [
    { objectId: null, label: 'My Files' },
    { objectId: 'folder_a', label: 'Projects' },
    { objectId: 'folder_b', label: 'Nexora' },
  ]);
  assert.equal(cache.getBreadcrumbs('mount_b', 'folder_b', rootBreadcrumbs()[0]), null);
  assert.equal(cache.getBreadcrumbs('mount_a', 'unknown', rootBreadcrumbs()[0]), null);
});

test('cache invalidation and clear remove listings, metadata and prevent late requests from repopulating after logout', async () => {
  const cache = new RemoteFilesCache();
  cache.setPage('mount_a', null, null, { items: [listingItem('folder_a', null)], nextCursor: null });
  cache.setPage('mount_a', 'folder_a', null, { items: [listingItem('folder_b', 'folder_a')], nextCursor: null });
  cache.invalidate('mount_a', null);
  assert.equal(cache.get('mount_a', null), null);
  assert.notEqual(cache.get('mount_a', 'folder_a'), null);

  let resolveRequest;
  const pending = cache.fetchPage('mount_a', null, null, () => new Promise((resolve) => { resolveRequest = resolve; }));
  await Promise.resolve();
  cache.clear();
  resolveRequest({ items: [listingItem('folder_c', null)], nextCursor: null });
  await pending;
  assert.equal(cache.get('mount_a', null), null);
  assert.equal(cache.getBreadcrumbs('mount_a', 'folder_a', rootBreadcrumbs()[0]), null);
});

test('folder cache uses a bounded least-recently-used entry count', () => {
  const cache = new RemoteFilesCache({ maxEntries: 2 });
  cache.setPage('mount_a', null, null, { items: [], nextCursor: null });
  cache.setPage('mount_a', 'folder_a', null, { items: [], nextCursor: null });
  cache.get('mount_a', null);
  cache.setPage('mount_a', 'folder_b', null, { items: [], nextCursor: null });
  assert.equal(cache.get('mount_a', null) !== null, true);
  assert.equal(cache.get('mount_a', 'folder_a'), null);
  assert.equal(cache.get('mount_a', 'folder_b') !== null, true);
  assert.equal(MAX_FOLDER_CACHE_ENTRIES, 60);
});
