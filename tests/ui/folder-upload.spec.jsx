import { memoryWebLocks } from '../helpers/web-locks';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import useUploadQueue from '../../src/hooks/useUploadQueue';
beforeEach(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: memoryWebLocks() }));
afterEach(cleanup);
const error = code => Object.assign(new Error(code), { code });
const entries = () => [{ kind: 'folder', path: 'root/empty' }, { kind: 'file', path: 'root/sub/ไทย.txt', file: new File(['x'], 'ไทย.txt') }];
it('creates ancestors before children, uses the same upload queue, and retains success on retry', async () => {
  let fail = true;
  const createFolder = vi.fn(async ({ name, parentId }) => ({ objectId: `${parentId || ''}_${name}` }));
  const uploadFile = vi.fn(async () => { if (fail) throw error('PROVIDER_UNAVAILABLE'); return {}; });
  const hook = renderHook(() => useUploadQueue({ createFolder, uploadFile, autoClear: true }));
  act(() => hook.result.current.addFiles([], { storageId: 'mount', maxUploadBytes: 100, entries: entries() }));
  await waitFor(() => expect(hook.result.current.items.at(-1).status).toBe('error'));
  expect(createFolder).toHaveBeenCalledTimes(3);
  expect(uploadFile.mock.calls[0][0].parentId).toBe('_root_sub');
  fail = false;
  act(() => hook.result.current.retryUpload(hook.result.current.items.at(-1).id));
  await waitFor(() => expect(hook.result.current.items.at(-1).status).toBe('success'));
  expect(createFolder).toHaveBeenCalledTimes(3);
});
it('parent failure blocks children; retrying in dependency order recovers without flattening', async () => {
  let fail = true;
  const createFolder = vi.fn(async ({ name }) => { if (name === 'root' && fail) throw error('PROVIDER_UNAVAILABLE'); return { objectId: name }; });
  const uploadFile = vi.fn().mockResolvedValue({});
  const hook = renderHook(() => useUploadQueue({ createFolder, uploadFile, autoClear: false }));
  act(() => hook.result.current.addFiles([], { storageId: 'm', maxUploadBytes: 100, entries: entries() }));
  await waitFor(() => expect(hook.result.current.items.every(i => i.status === 'error')).toBe(true));
  expect(uploadFile).not.toHaveBeenCalled(); fail = false;
  act(() => hook.result.current.items.forEach(i => hook.result.current.retryUpload(i.id)));
  await waitFor(() => expect(hook.result.current.items.every(i => i.status === 'success')).toBe(true));
  expect(uploadFile).toHaveBeenCalledTimes(1);
});
it('cancellation blocks descendants, and scope changes discard pending work', async () => {
  const createFolder = vi.fn(() => new Promise(() => {}));
  const uploadFile = vi.fn();
  const hook = renderHook(({ scopeKey }) => useUploadQueue({ createFolder, uploadFile, scopeKey }), { initialProps: { scopeKey: 'one' } });
  act(() => { const ids = hook.result.current.addFiles([], { storageId: 'm', maxUploadBytes: 100, entries: entries() }); ids.forEach(hook.result.current.cancelUpload); });
  await waitFor(() => expect(hook.result.current.items.every(i => i.status === 'cancelled')).toBe(true));
  expect(createFolder).not.toHaveBeenCalled(); expect(uploadFile).not.toHaveBeenCalled();
  hook.rerender({ scopeKey: 'two' });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(0));
});
it('folder files use multipart strategy and reject sizes above 5 GB without a request', async () => {
  const createFolder = vi.fn().mockResolvedValue({ objectId: 'root' });
  const uploadFile = vi.fn();
  const createClient = vi.fn(() => { throw error('PROVIDER_UNAVAILABLE'); });
  const hook = renderHook(() => useUploadQueue({ createFolder, uploadFile, createClient, recoveryScope: 'owner', waitForRetry: async () => {}, autoClear: false }));
  const large = { name: 'large.bin', size: 30 * 1024 ** 2 };
  const huge = { name: 'huge.bin', size: 5_000_000_001 };
  act(() => hook.result.current.addFiles([], { storageId: 'm', maxUploadBytes: 25 * 1024 ** 2,
    transfers: { resumableUpload: true, maxFileBytes: 5_000_000_000, partSizeBytes: 8 * 1024 ** 2, maxParts: 1280, maxParallelParts: 1, sessionTtlSeconds: 604800 },
    entries: [large, huge].map(file => ({ kind: 'file', path: `root/${file.name}`, file })) }));
  await waitFor(() => expect(createClient).toHaveBeenCalled());
  expect(hook.result.current.items.find(i => i.name === 'large.bin').strategy).toBe('multipart');
  expect(hook.result.current.items.find(i => i.name === 'huge.bin').status).toBe('error');
  expect(uploadFile).not.toHaveBeenCalled();
});
it('authorization failure stops children and invokes the existing session handler', async () => {
  const onUnauthorized = vi.fn(); const uploadFile = vi.fn();
  const hook = renderHook(() => useUploadQueue({ createFolder: async () => { throw error('UNAUTHENTICATED'); }, uploadFile, onUnauthorized }));
  act(() => hook.result.current.addFiles([], { storageId: 'm', maxUploadBytes: 100, entries: entries() }));
  await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce());
  expect(uploadFile).not.toHaveBeenCalled();
});
it('does not persist a paused multipart child before its parent destination is resolved', async () => {
  let resolve;
  const recoveryStore = { save: vi.fn().mockResolvedValue(), remove: vi.fn().mockResolvedValue() };
  const createFolder = vi.fn(() => new Promise(done => { resolve = done; }));
  const hook = renderHook(() => useUploadQueue({ createFolder, recoveryScope: 'owner', recoveryStore }));
  act(() => hook.result.current.addFiles([], { storageId: 'm', maxUploadBytes: 25 * 1024 ** 2,
    transfers: { resumableUpload: true, maxFileBytes: 5_000_000_000, partSizeBytes: 8 * 1024 ** 2, maxParts: 1280, maxParallelParts: 1, sessionTtlSeconds: 604800 },
    entries: [{ kind: 'file', path: 'root/large.bin', file: { name: 'large.bin', size: 30 * 1024 ** 2 } }] }));
  await waitFor(() => expect(createFolder).toHaveBeenCalledOnce());
  act(() => hook.result.current.pauseUpload(hook.result.current.items.at(-1).id));
  expect(hook.result.current.items.at(-1).status).toBe('paused');
  expect(recoveryStore.save).not.toHaveBeenCalled();
  hook.unmount(); resolve({ objectId: 'root' });
});
