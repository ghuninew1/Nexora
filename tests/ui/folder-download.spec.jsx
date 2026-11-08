import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import useFolderDownload from '../../src/hooks/useFolderDownload';
import { downloadFolderZip } from '../../src/services/folder-download';
import { listStorageObjects, statStorageObject } from '../../src/services/storage';
vi.mock('../../src/services/storage', async original => ({ ...await original(), listStorageObjects: vi.fn(), statStorageObject: vi.fn() }));
const root = { objectId: 'root', name: 'ไทย', parentId: null, type: 'folder' };
let createURL, revokeURL, clicked;
beforeEach(() => {
  statStorageObject.mockReset().mockResolvedValue(root);
  listStorageObjects.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  createURL = vi.fn().mockReturnValue('blob:qa'); revokeURL = vi.fn(); clicked = vi.fn();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: createURL, revokeObjectURL: revokeURL }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clicked);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('uses existing same-origin authorized URLs sequentially, and rejects permission failures', async () => {
  listStorageObjects.mockResolvedValue({ items: [{ objectId: 'f', name: 'a.txt', parentId: 'root', type: 'file', sizeBytes: 5 }], nextCursor: null });
  const fetchImpl = vi.fn().mockResolvedValue(new Response('hello'));
  const result = await downloadFolderZip('mount', 'root', { fetchImpl });
  expect(result.name).toBe('ไทย.zip');
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/storage/v1/storages/mount/objects/f/download');
  expect(fetchImpl.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', redirect: 'error' });
  for (const status of [401, 403, 404, 503]) {
    await expect(downloadFolderZip('mount', 'root', { fetchImpl: vi.fn().mockResolvedValue(new Response('', { status })) })).rejects.toMatchObject({ status });
  }
  await expect(downloadFolderZip('mount', 'root', { fetchImpl: vi.fn().mockResolvedValue(new Response('hello', { headers: { 'Content-Length': '10' } })) })).rejects.toThrow('size changed');
});
it('saves a complete ZIP and cleans up object URLs on workspace teardown', async () => {
  const hook = renderHook(() => useFolderDownload({ scopeKey: 'owner:mount', storageId: 'mount', allowed: true }));
  await act(() => hook.result.current.start(root));
  expect(hook.result.current.state.stage).toBe('success'); expect(clicked).toHaveBeenCalledOnce();
  hook.unmount(); expect(revokeURL).toHaveBeenCalledWith('blob:qa');
});
it('cancel and storage/permission changes stop listing and prevent publication', async () => {
  let reject;
  statStorageObject.mockImplementation((s, id, { signal }) => new Promise((resolve, fail) => {
    reject = fail; signal.addEventListener('abort', () => fail(new DOMException('Cancelled', 'AbortError')), { once: true });
  }));
  const hook = renderHook(props => useFolderDownload(props), { initialProps: { scopeKey: 'a', storageId: 'mount', allowed: true } });
  let running;
  act(() => { running = hook.result.current.start(root); });
  act(() => hook.result.current.cancel()); await act(() => running);
  expect(hook.result.current.state.stage).toBe('cancelled'); expect(clicked).not.toHaveBeenCalled();
  act(() => { running = hook.result.current.start(root); });
  hook.rerender({ scopeKey: 'b', storageId: 'other', allowed: false });
  await act(() => running);
  expect(hook.result.current.state).toBe(null); expect(clicked).not.toHaveBeenCalled(); expect(reject).toBeTypeOf('function');
});
it('expired authorization invokes the existing session expiration handler', async () => {
  statStorageObject.mockRejectedValue(Object.assign(new Error('expired'), { status: 401, code: 'UNAUTHENTICATED' }));
  const onUnauthorized = vi.fn();
  const hook = renderHook(() => useFolderDownload({ scopeKey: 'a', storageId: 'mount', allowed: true, onUnauthorized }));
  await act(() => hook.result.current.start(root));
  await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce());
  expect(clicked).not.toHaveBeenCalled();
});
it('multiple roots refresh each item and reuse sequential same-origin downloads as Selected-Files.zip', async () => {
  const files = ['a', 'b'].map(objectId => ({ objectId, name: `${objectId}.txt`, parentId: null, type: 'file', sizeBytes: 5 }));
  statStorageObject.mockImplementation(async (mount, id) => files.find(file => file.objectId === id));
  const fetchImpl = vi.fn(() => Promise.resolve(new Response('hello')));
  const { downloadSelectedZip } = await import('../../src/services/folder-download');
  const progress = [];
  const result = await downloadSelectedZip('mount', ['a', 'b'], { fetchImpl, onProgress: p => progress.push(p) });
  expect(result).toMatchObject({ name: 'Selected-Files.zip', bytes: 10, discoveredEntries: 2 });
  expect(statStorageObject.mock.calls.map(args => args[1])).toEqual(['a', 'b']);
  expect(listStorageObjects).not.toHaveBeenCalled();
  expect(fetchImpl.mock.calls.map(args => args[0])).toEqual(files.map(file => `/api/storage/v1/storages/mount/objects/${file.objectId}/download`));
  expect(progress.at(-1)).toMatchObject({ transferred: 10, discoveredEntries: 2 });
});
it.each([403, 404])('failed later selection metadata (%s) prevents all content requests', async status => {
  statStorageObject.mockResolvedValueOnce({ objectId: 'a', name: 'a', type: 'file', parentId: null, sizeBytes: 1 })
    .mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status }));
  const fetchImpl = vi.fn();
  const { downloadSelectedZip } = await import('../../src/services/folder-download');
  await expect(downloadSelectedZip('mount', ['a', 'b'], { fetchImpl })).rejects.toMatchObject({ status });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it('a failed second file discards all accumulated content without creating a download URL', async () => {
  const files = ['a', 'b'].map(objectId => ({ objectId, name: `${objectId}.txt`, parentId: null, type: 'file', sizeBytes: 5 }));
  statStorageObject.mockImplementation(async (mount, id) => files.find(file => file.objectId === id));
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('hello')).mockResolvedValueOnce(new Response('', { status: 403 }));
  const hook = renderHook(() => useFolderDownload({ scopeKey: 'a', storageId: 'mount', allowed: true }));
  await act(() => hook.result.current.start(files));
  expect(hook.result.current.state).toMatchObject({ stage: 'error', selectedCount: 2, selectedFiles: 2, selectedFolders: 0, discoveredEntries: 2 });
  expect(createURL).not.toHaveBeenCalled(); expect(clicked).not.toHaveBeenCalled();
});
it('selection download saves once and reports selected/discovered counts and content bytes', async () => {
  const files = ['a', 'b'].map(objectId => ({ objectId, name: `${objectId}.txt`, parentId: null, type: 'file', sizeBytes: 5 }));
  statStorageObject.mockImplementation(async (mount, id) => files.find(file => file.objectId === id));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('hello'));
  const hook = renderHook(() => useFolderDownload({ scopeKey: 'a', storageId: 'mount', allowed: true }));
  await act(() => hook.result.current.start(files));
  expect(hook.result.current.state).toMatchObject({ stage: 'success', name: 'Selected-Files.zip', selectedCount: 2, discoveredEntries: 2, transferred: 10 });
  expect(clicked).toHaveBeenCalledOnce(); hook.unmount(); expect(revokeURL).toHaveBeenCalledWith('blob:qa');
});
it('Cancel during a selection file body aborts the request, cancels its reader and publishes nothing', async () => {
  const files = ['a', 'b'].map(objectId => ({ objectId, name: `${objectId}.txt`, parentId: null, type: 'file', sizeBytes: 5 }));
  statStorageObject.mockImplementation(async (mount, id) => files.find(file => file.objectId === id));
  let cancelled = false, signal;
  const fetchImpl = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  });
  const hook = renderHook(() => useFolderDownload({ scopeKey: 'a', storageId: 'mount', allowed: true }));
  let pending;
  act(() => { pending = hook.result.current.start(files); });
  await waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
  act(() => hook.result.current.cancel()); await act(() => pending);
  expect(signal.aborted).toBe(true); expect(cancelled).toBe(true);
  expect(hook.result.current.state.stage).toBe('cancelled'); expect(createURL).not.toHaveBeenCalled();
});
it('cancelled selection work cannot publish after owner/mount/permission teardown', async () => {
  const files = ['a', 'b'].map(objectId => ({ objectId, name: objectId, type: 'file' }));
  let signal;
  statStorageObject.mockImplementation((s, id, options) => new Promise((resolve, reject) => {
    signal = options.signal; signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const hook = renderHook(props => useFolderDownload(props), { initialProps: { scopeKey: 'owner:mount', storageId: 'mount', allowed: true } });
  let pending;
  act(() => { pending = hook.result.current.start(files); });
  hook.rerender({ scopeKey: 'other:mount', storageId: 'mount', allowed: false });
  await act(() => pending);
  expect(signal.aborted).toBe(true); expect(hook.result.current.state).toBe(null); expect(createURL).not.toHaveBeenCalled();
});
