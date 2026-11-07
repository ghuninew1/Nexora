import { memoryWebLocks } from '../helpers/web-locks';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import useRemoteFilesState from '../../src/hooks/useRemoteFilesState';
const mocks = vi.hoisted(() => ({ storage: null, client: vi.fn(), expire: vi.fn() }));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ status: 'authenticated', user: { id: 'owner_a', email: 'owner@example.test' }, expireSession: mocks.expire }) }));
vi.mock('../../src/hooks/useStorage', () => ({ useStorage: () => mocks.storage }));
vi.mock('../../src/hooks/usePreferences', () => ({ usePreferences: () => ({ preferences: { uploadConcurrency: 2, autoClearUploads: false } }) }));
vi.mock('../../src/services/multipart-upload', async importOriginal => ({ ...await importOriginal(), createMultipartUploadClient: mocks.client }));
vi.mock('../../src/services/storage', async importOriginal => ({ ...await importOriginal(),
  listStorageObjects: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  listStorageFavorites: vi.fn().mockResolvedValue([]), listStorageRecent: vi.fn().mockResolvedValue([]) }));
beforeEach(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: memoryWebLocks() }));
afterEach(cleanup);
const transfers = { resumableUpload: true, partSizeBytes: 8 * 1024 ** 2, maxFileBytes: 10 * 1024 ** 3,
  maxParts: 1280, maxParallelParts: 1, sessionTtlSeconds: 604800 };
function ready(storageId = 'first') {
  return { status: 'ready', activeStorage: { storageId, readOnly: false, permissions: { upload: true, list: true } },
    capabilities: { upload: true, list: true, maxUploadBytes: 4, transfers } };
}
it('keeps the same queue through transient discovery and navigation, discarding it on a resolved mount change', async () => {
  mocks.storage = ready();
  const session = { transferId: 'session', state: 'active', version: 1, sizeBytes: 10, partSizeBytes: transfers.partSizeBytes,
    partCount: 1, expiresAt: Date.now() + 100000, acknowledgedBytes: 0, parts: [], nextCursor: null };
  const cancel = vi.fn();
  mocks.client.mockReturnValue({ createSession: vi.fn().mockResolvedValue(session),
    reconcile: vi.fn().mockResolvedValue({ ...session, state: 'paused' }), cancelSession: cancel });
  const hook = renderHook(() => ({ files: useRemoteFilesState(), navigate: useNavigate() }),
    { wrapper: ({ children }) => <MemoryRouter initialEntries={['/files']}>{children}</MemoryRouter> });
  act(() => hook.result.current.files.uploadFiles([new File(['abcdefghij'], 'large.bin')]));
  await waitFor(() => expect(hook.result.current.files.uploadQueue.items[0]?.status).toBe('paused'));
  const id = hook.result.current.files.uploadQueue.items[0].id;
  mocks.storage = { status: 'loading', activeStorage: null, capabilities: null };
  hook.rerender();
  expect(hook.result.current.files.uploadQueue.items[0].id).toBe(id);
  act(() => hook.result.current.navigate('/recent'));
  mocks.storage = ready(); hook.rerender();
  act(() => hook.result.current.navigate('/files'));
  expect(hook.result.current.files.uploadQueue.items[0].id).toBe(id);
  mocks.storage = ready('second'); hook.rerender();
  await waitFor(() => expect(hook.result.current.files.uploadQueue.items).toEqual([]));
  expect(cancel).not.toHaveBeenCalled();
});
