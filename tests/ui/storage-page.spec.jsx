import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import WorkspacePage from '../../src/pages/WorkspacePage';

const mocks = vi.hoisted(() => ({ storage: null, user: { role: 'user' }, preferences: null, check: vi.fn(), refresh: vi.fn() }));
vi.mock('../../src/hooks/useStorage', () => ({ useStorage: () => mocks.storage }));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user, expireSession: vi.fn() }) }));
vi.mock('../../src/hooks/usePreferences', () => ({ usePreferences: () => ({ preferences: mocks.preferences, status: 'ready' }) }));
vi.mock('../../src/services/storage', async importOriginal => ({ ...await importOriginal(), getStorageCapabilities: mocks.check }));

const good = { storageId: 'good', name: 'Alpha', status: 'active', providerLabel: 'Private', isDefault: true, connectionStatus: 'connected' };
const bad = { storageId: 'bad', name: 'Beta', status: 'active', providerLabel: 'Private', isDefault: false, connectionStatus: 'unavailable' };
function mount() {
  return render(<MemoryRouter initialEntries={['/storage']}><Routes><Route path="/storage" element={<WorkspacePage />} /><Route path="/admin/users" element={<p>Users route</p>} /></Routes></MemoryRouter>);
}
beforeEach(() => {
  mocks.user = { role: 'user' }; mocks.preferences = { defaultStorageId: 'bad' };
  mocks.storage = { status: 'ready', storages: [good, bad], activeStorage: bad, capabilities: {}, usage: { status: 'unavailable' }, refresh: mocks.refresh };
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { storages: [], truncated: false } })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Storage page', () => {
  it('shows separate defaults, filters by search and connection, and hides admin actions for a user', () => {
    mount();
    expect(screen.getByText(/Assignment default:/).textContent).toContain('Alpha');
    expect(screen.getByText(/User preferred:/).textContent).toContain('Beta');
    expect(screen.getByText(/Effective default:/).textContent).toContain('Beta');
    expect(screen.queryByText('Admin storage catalog')).toBeNull();
    fireEvent.change(screen.getByLabelText('Connection status'), { target: { value: 'unavailable' } });
    expect(screen.queryByRole('heading', { name: /Alpha/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Beta' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search storage'), { target: { value: 'missing' } });
    expect(screen.getByText('No storages match your search and filter.')).toBeTruthy();
  });
  it('shows admin catalog and navigates to assignment management', async () => {
    mocks.user = { role: 'admin' }; mount();
    expect(await screen.findByText('Admin storage catalog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Manage user assignments' }));
    expect(screen.getByText('Users route')).toBeTruthy();
  });
  it('shows a retry failure and permits another attempt', async () => {
    mocks.check.mockRejectedValueOnce(new Error('Check failed')); mount();
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('Check failed');
    expect(screen.getByRole('button', { name: 'Retry connection' }).disabled).toBe(false);
  });
  it('refreshes discovery after retry succeeds and displays the new connected state', async () => {
    mocks.check.mockResolvedValueOnce({}); mocks.refresh.mockImplementationOnce(async () => { mocks.storage = { ...mocks.storage, storages: [good, { ...bad, connectionStatus: 'connected' }] }; });
    const view = mount(); fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    view.rerender(<MemoryRouter initialEntries={['/storage']}><WorkspacePage /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Retry connection' })).toBeNull();
  });
  it('aborts a pending retry on unmount and ignores its late resolution', async () => {
    let finish; mocks.check.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = mount(); fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    const signal = mocks.check.mock.calls[0][1].signal; view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => finish({}));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
