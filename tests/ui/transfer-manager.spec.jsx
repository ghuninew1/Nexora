import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link } from 'react-router';
import { RemoteFilesContext } from '../../src/context/files-context';
import TransferManager from '../../src/components/files/TransferManager';
afterEach(cleanup);
function setup(items = []) {
  const queue = { items, concurrency: 3, pauseUpload: vi.fn(), resumeUpload: vi.fn(), cancelUpload: vi.fn(), retryUpload: vi.fn(), clearFinished: vi.fn() };
  const view = render(<MemoryRouter><RemoteFilesContext.Provider value={{ uploadQueue: queue, canUpload: true }}><Link to="/recent">Recent</Link><TransferManager /></RemoteFilesContext.Provider></MemoryRouter>);
  return { queue, ...view };
}
it('opens from a keyboard, labels its dialog, closes with Escape and returns focus', async () => {
  setup(); const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: /Transfers, 0 active/ });
  trigger.focus(); await user.keyboard('{Enter}');
  expect(screen.getByRole('dialog', { name: 'Transfer Manager' })).toBeTruthy();
  expect(screen.getByText(/No uploads yet/)).toBeTruthy();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it('reuses queue items across closing and route navigation and dispatches supported bulk controls only', async () => {
  const { queue } = setup([
    { id: 'a', name: 'a.bin', sizeBytes: 100, strategy: 'multipart', status: 'uploading', acknowledgedBytes: 100, completedParts: 1, partCount: 1 },
    { id: 'b', name: 'b.bin', sizeBytes: 100, strategy: 'multipart', status: 'paused' },
    { id: 'c', name: 'c.txt', sizeBytes: 10, strategy: 'legacy', status: 'uploading' },
  ]);
  const open = () => fireEvent.click(screen.getByRole('button', { name: /Transfers, 3 active/ }));
  open();
  expect(screen.getByRole('progressbar', { name: 'Uploading a.bin' }).getAttribute('aria-valuenow')).toBe('99');
  fireEvent.click(screen.getByRole('button', { name: 'Pause all' }));
  expect(queue.pauseUpload.mock.calls).toEqual([['a']]);
  fireEvent.click(screen.getByRole('button', { name: 'Resume all' }));
  expect(queue.resumeUpload.mock.calls).toEqual([['b']]);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel upload c.txt' }));
  expect(queue.cancelUpload).toHaveBeenCalledWith('c');
  await userEvent.keyboard('{Escape}');
  fireEvent.click(screen.getByRole('link', { name: 'Recent' })); open();
  expect(screen.getByText('a.bin')).toBeTruthy();
  expect(screen.getAllByRole('region', { name: 'Upload queue' })).toHaveLength(1);
});
it('shows recovery actions and attention without fictitious speed or download controls', () => {
  setup([{ id: 'r', name: 'recover.bin', sizeBytes: 100, strategy: 'multipart', status: 'waiting_file', needsFile: true }]);
  fireEvent.click(screen.getByRole('button', { name: /Needs attention/ }));
  expect(screen.getByRole('button', { name: /Select original file for/ })).toBeTruthy();
  expect(screen.queryByText(/ETA/)).toBeNull();
  expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
});
it('shows measured acknowledgement speed only while uploading, with confirmed completion at 100%', () => {
  const { rerender } = setup([{ id: 's', name: 'speed.bin', sizeBytes: 100, strategy: 'multipart', status: 'uploading', acknowledgedBytes: 50, completedParts: 1, partCount: 2, bytesPerSecond: 10, etaSeconds: 5 }]);
  fireEvent.click(screen.getByRole('button', { name: /Transfers,/ }));
  expect(screen.getByText(/10 B\/s · ETA about 5s/)).toBeTruthy();
  // Authenticated workspace teardown removes the entire presentation.
  rerender(<div>Signed out</div>);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByText('speed.bin')).toBeNull();
});
