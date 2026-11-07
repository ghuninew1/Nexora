import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../src/context/AuthProvider';
import { useAuth } from '../../src/hooks/useAuth';
import useUploadQueue from '../../src/hooks/useUploadQueue';
const mocks = vi.hoisted(() => ({ me: vi.fn(), signOut: vi.fn() }));
vi.mock('../../src/services/auth', () => ({ getCurrentUser: mocks.me, signOut: mocks.signOut, signIn: vi.fn(), updateDisplayName: vi.fn() }));
afterEach(cleanup);
it('logout initiation immediately aborts active queue even while server logout is pending', async () => {
  mocks.me.mockResolvedValue({ email: 'owner@example.test' });
  let finishLogout; mocks.signOut.mockImplementation(() => new Promise(resolve => { finishLogout = resolve; }));
  let signal;
  const upload = vi.fn(args => { signal = args.signal; return new Promise(() => {}); });
  const h = renderHook(() => {
    const auth = useAuth();
    const queue = useUploadQueue({ scopeKey: JSON.stringify([auth.status, auth.signingOut, auth.user?.email]), uploadFile: upload,
      canUpload: () => auth.status === 'authenticated' && !auth.signingOut });
    return { auth, queue };
  }, { wrapper: AuthProvider });
  await waitFor(() => expect(h.result.current.auth.status).toBe('authenticated'));
  act(() => h.result.current.queue.addFiles([new File(['abc'], 'small.txt')], { storageId: 'storage' }));
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  let logout;
  act(() => { logout = h.result.current.auth.logout(); });
  expect(h.result.current.auth.signingOut).toBe(true);
  expect(signal.aborted).toBe(true);
  expect(h.result.current.queue.items).toEqual([]);
  await act(async () => { finishLogout(); await logout; });
  expect(h.result.current.auth.status).toBe('unauthenticated');
});
