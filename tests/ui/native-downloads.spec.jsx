import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import useRemoteFilesState from '../../src/hooks/useRemoteFilesState';
import { startStorageObjectDownload } from '../../src/services/storage';

const mocks = vi.hoisted(() => ({ auth: null, storage: null, me: vi.fn(), expire: vi.fn() }));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../src/hooks/useStorage', () => ({ useStorage: () => mocks.storage }));
vi.mock('../../src/hooks/usePreferences', () => ({ usePreferences: () => ({ preferences: {} }) }));
vi.mock('../../src/services/auth.js', () => ({ getCurrentUser: mocks.me }));
vi.mock('../../src/services/storage', async original => ({ ...await original(),
  listStorageObjects: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  listStorageFavorites: vi.fn().mockResolvedValue([]), listStorageRecent: vi.fn().mockResolvedValue([]),
}));
let clicks;
const file = { storageId: 'mount_a', objectId: 'file_a', type: 'file', name: 'original.txt' };
beforeEach(() => {
  mocks.auth = { status: 'authenticated', user: { id: 'owner_a', email: 'owner@example.test' }, signingOut: false, expireSession: mocks.expire };
  mocks.storage = { status: 'ready', activeStorage: { storageId: 'mount_a', permissions: { download: true, list: true } }, capabilities: { download: true, list: true, rangeRead: false } };
  mocks.me.mockReset().mockResolvedValue(mocks.auth.user); mocks.expire.mockClear(); clicks = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { clicks.push({ href: this.getAttribute('href'), filename: this.download, connected: this.isConnected }); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const setup = () => renderHook(() => useRemoteFilesState(), { wrapper: ({ children }) => <MemoryRouter initialEntries={['/files']}>{children}</MemoryRouter> });

it('starts independent native downloads without Range/picker support or any transfer entries', async () => {
  const hook = setup();
  await act(async () => {
    const result = await Promise.all([hook.result.current.downloadObject(file), hook.result.current.downloadObject({ ...file, objectId: 'file_b' })]);
    expect(result).toEqual([{ ok: true }, { ok: true }]);
  });
  expect(clicks.map(c => c.href)).toEqual(['/api/storage/v1/storages/mount_a/objects/file_a/download', '/api/storage/v1/storages/mount_a/objects/file_b/download']);
  expect(clicks.every(c => c.filename === '' && c.connected)).toBe(true);
  expect(document.querySelector('a[download]')).toBeNull();
  expect(hook.result.current.uploadQueue.items).toEqual([]);
  expect(hook.result.current).not.toHaveProperty('downloadQueue');
  expect(hook.result.current.operationFeedback.message).toContain('Check your browser downloads');
});
it('blocks folders, invalid IDs, foreign mounts and known download permission loss before initiation', async () => {
  const hook = setup();
  await act(async () => {
    for (const entry of [{ ...file, type: 'folder' }, { ...file, objectId: '../bad' }, { ...file, storageId: 'foreign' }]) expect(await hook.result.current.downloadObject(entry)).toEqual({ error: 'FORBIDDEN' });
  });
  mocks.storage = { ...mocks.storage, activeStorage: { ...mocks.storage.activeStorage, permissions: { download: false } } }; hook.rerender();
  await act(async () => { expect(await hook.result.current.downloadObject(file)).toEqual({ error: 'FORBIDDEN' }); });
  expect(mocks.me).not.toHaveBeenCalled(); expect(clicks).toEqual([]);
});
it('reports expired authentication without starting a native download', async () => {
  mocks.me.mockResolvedValue(null); const hook = setup();
  await act(async () => { expect(await hook.result.current.downloadObject(file)).toEqual({ error: 'UNAUTHENTICATED' }); });
  expect(mocks.expire).toHaveBeenCalledOnce(); expect(clicks).toEqual([]);
});
it.each(['logout', 'owner', 'mount', 'permission', 'unmount'])('blocks late session replies after %s', async change => {
  let resolve; mocks.me.mockImplementation(() => new Promise(done => { resolve = done; }));
  const hook = setup(); let pending;
  act(() => { pending = hook.result.current.downloadObject(file); });
  if (change === 'logout') mocks.auth = { ...mocks.auth, signingOut: true };
  if (change === 'owner') mocks.auth = { ...mocks.auth, user: { id: 'owner_b', email: 'other@example.test' } };
  if (change === 'mount') mocks.storage = { ...mocks.storage, activeStorage: { ...mocks.storage.activeStorage, storageId: 'mount_b' } };
  if (change === 'permission') mocks.storage = { ...mocks.storage, capabilities: { download: false } };
  if (change === 'unmount') hook.unmount(); else hook.rerender();
  await act(async () => { resolve(mocks.auth.user); expect(await pending).toEqual({ error: 'CANCELLED' }); });
  expect(clicks).toEqual([]);
});
it('cleans up the native link even if the browser rejects initiation', async () => {
  HTMLAnchorElement.prototype.click.mockImplementation(() => { throw new Error('blocked'); });
  await expect(startStorageObjectDownload('mount_a', 'file_a')).rejects.toThrow('blocked');
  expect(document.querySelector('a[download]')).toBeNull();
});
it('folder ZIP requires read and download grants plus list/stat/download capabilities', () => {
  mocks.storage.activeStorage.permissions.read = true;
  mocks.storage.capabilities.stat = true;
  const hook = setup();
  expect(hook.result.current.canDownloadFolder).toBe(true);
  mocks.storage = { ...mocks.storage, activeStorage: { ...mocks.storage.activeStorage, permissions: { ...mocks.storage.activeStorage.permissions, read: false } } };
  hook.rerender();
  expect(hook.result.current.canDownloadFolder).toBe(false);
});
