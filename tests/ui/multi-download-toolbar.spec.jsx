import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FileToolbar from '../../src/components/files/FileToolbar';
afterEach(cleanup);
const props = { selectedCount: 2, canDownloadSelected: true, canMoveSelected: true, canTrashSelected: true,
  query: '', sortBy: 'name', sortDirection: 'asc', view: 'list' };
it('adds a bulk ZIP action without changing Move, Trash or multi-selection Rename rules', () => {
  const onDownloadSelected = vi.fn(), onMoveSelected = vi.fn(), onTrashSelected = vi.fn();
  render(<FileToolbar {...props} onDownloadSelected={onDownloadSelected} onMoveSelected={onMoveSelected} onTrashSelected={onTrashSelected} />);
  fireEvent.click(screen.getByRole('button', { name: 'Download ZIP' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Move to Trash', exact: true }));
  expect(onDownloadSelected).toHaveBeenCalledOnce(); expect(onMoveSelected).toHaveBeenCalledOnce(); expect(onTrashSelected).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Rename' }).disabled).toBe(true);
});
it.each([{ canDownloadSelected: false }, { isSelectionBusy: true }])('disables bulk ZIP when unavailable or mutating: %j', override => {
  render(<FileToolbar {...props} {...override} />);
  expect(screen.getByRole('button', { name: 'Download ZIP' }).disabled).toBe(true);
});
it('single-file selection retains existing actions without offering the multi-item ZIP button', () => {
  render(<FileToolbar {...props} selectedCount={1} selectedFile={{ name: 'a.txt', type: 'file' }} />);
  expect(screen.queryByRole('button', { name: 'Download ZIP' })).toBeNull();
});
