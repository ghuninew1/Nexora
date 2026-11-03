import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { StorageProvider } from '../../src/context/StorageProvider';
import { useStorage } from '../../src/hooks/useStorage';

const mocks = vi.hoisted(() => ({ preference: 'first', list: vi.fn(), caps: vi.fn(), usage: vi.fn(), expire: vi.fn() }));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ status: 'authenticated', expireSession: mocks.expire }) }));
vi.mock('../../src/hooks/usePreferences', () => ({ usePreferences: () => ({ preferences: { defaultStorageId: mocks.preference }, status: 'ready' }) }));
vi.mock('../../src/services/storage', () => ({ listStorages: mocks.list, getStorageCapabilities: mocks.caps, getStorageUsage: mocks.usage, StorageApiError: class extends Error {} }));
const mounts = [{ storageId: 'first', name: 'First', status: 'active' }, { storageId: 'second', name: 'Second', status: 'active' }];
function Probe() { const storage = useStorage(); return <p>{storage.status}:{storage.activeStorage?.name}</p>; }
function view() { return <MemoryRouter><StorageProvider><Probe /></StorageProvider></MemoryRouter>; }
beforeEach(() => { mocks.preference = 'first'; mocks.list.mockReset(); mocks.caps.mockReset(); mocks.usage.mockReset(); mocks.list.mockResolvedValue(mounts); mocks.caps.mockResolvedValue({ list: true }); mocks.usage.mockResolvedValue({ status: 'unavailable' }); });
afterEach(cleanup);
it('ignores a stale discovery response after rapid preference change', async () => {
  let finishOld; mocks.list.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
  const rendered = render(view());
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
  const oldSignal = mocks.list.mock.calls[0][0].signal;
  mocks.preference = 'second'; rendered.rerender(view());
  await screen.findByText('ready:Second');
  expect(oldSignal.aborted).toBe(true);
  await act(async () => finishOld([mounts[0]]));
  expect(screen.getByText('ready:Second')).toBeTruthy();
});
it('aborts a discovery request on unmount and does not request capabilities after a late result', async () => {
  let finish; mocks.list.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const rendered = render(view()); await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
  const signal = mocks.list.mock.calls[0][0].signal; rendered.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(mounts));
  expect(mocks.caps).not.toHaveBeenCalled();
});

it('rapid route navigation discards the earlier storage request', async () => {
  let finishOld;
  mocks.list.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
  function Navigate() { const navigate = useNavigate(); return <button onClick={() => navigate('/files', { state: { fileBrowser: { storageId: 'second' } } })}>Open second</button>; }
  render(<MemoryRouter initialEntries={['/storage']}><StorageProvider><Navigate /><Probe /></StorageProvider></MemoryRouter>);
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Open second' }));
  await screen.findByText('ready:Second');
  await act(async () => finishOld([mounts[0]]));
  expect(screen.getByText('ready:Second')).toBeTruthy();
});
