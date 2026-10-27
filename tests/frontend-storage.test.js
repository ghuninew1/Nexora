import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStorageCapabilities,
  getStorageUsage,
  listStorages,
  normalizeStorageCapabilities,
  normalizeStorageUsage,
  StorageApiError,
} from '../src/services/storage.js';

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
