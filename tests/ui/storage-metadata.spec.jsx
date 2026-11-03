import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import AdminStorageOverview from '../../src/components/storage/AdminStorageOverview';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('../../src/hooks/useStorage', () => ({ useStorage: () => ({ refresh: mocks.refresh }) }));
const item = { storageId: 'one', name: 'Original', description: 'Before', status: 'active', readOnly: false };
function setup(patch) {
  vi.stubGlobal('fetch', vi.fn(async (url, options) => options?.method === 'PATCH' ? patch(url, options) : Response.json({ data: { storages: [item] } })));
  render(<MemoryRouter><AdminStorageOverview /></MemoryRouter>);
}
async function edit() {
  fireEvent.click(await screen.findByRole('button', { name: 'Details' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit metadata' }));
}
beforeEach(() => mocks.refresh.mockReset());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('opens and cancels edits without saving', async () => {
  setup(() => { throw new Error('Unexpected save'); }); await edit();
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Changed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('Description: Before')).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('validates empty name and displays save failures', async () => {
  setup(() => Response.json({ error: {} }, { status: 409 })); await edit();
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('alert').textContent).toContain('Enter a name');
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Duplicate' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect((await screen.findByRole('alert')).textContent).toContain('already exists');
});
it('disables duplicate submissions while saving and updates details on success', async () => {
  let finish;
  setup(() => new Promise(resolve => { finish = resolve; })); await edit();
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: ' Updated ' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: ' New notes ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('button', { name: 'Saving…' }).disabled).toBe(true);
  finish(Response.json({ data: { storage: { storageId: 'one', name: 'Updated', description: 'New notes' } } }));
  expect(await screen.findByText('Description: New notes')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('saved');
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(fetch.mock.calls.filter(call => call[1]?.method === 'PATCH')).toHaveLength(1);
});
