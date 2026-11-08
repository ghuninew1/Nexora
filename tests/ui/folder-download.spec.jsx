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
