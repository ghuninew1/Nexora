import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStorageFolder,
  getStorageCapabilities,
  getStorageUsage,
  listStorageObjects,
  listStorages,
  mergeStorageObjects,
  normalizeStorageObject,
  normalizeStorageCapabilities,
  normalizeStorageUsage,
  StorageApiError,
} from '../src/services/storage.js';
import { appendBreadcrumb, normalizeFileBrowserRouteState, rootBreadcrumbs } from '../src/utils/storage-files.js';

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
