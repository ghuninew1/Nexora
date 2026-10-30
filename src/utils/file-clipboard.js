import { isFolderDestinationInvalid } from './storage-files.js';

export const emptyFileClipboard = () => ({ mode: null, items: [], sourceStorageId: null, sourceParentId: null });

export function remainingCutClipboard(current, snapshot, succeededIds) {
  if (current !== snapshot) return current;
  const succeeded = new Set(succeededIds);
  const items = current.items.filter((item) => !succeeded.has(item.objectId));
  return items.length ? { ...current, items } : emptyFileClipboard();
}

export function invalidCutDestination(items, folderId, breadcrumbs, abbreviated) {
  return items.some((item) => isFolderDestinationInvalid('move', item, folderId, breadcrumbs)
    || (item.type === 'folder' && folderId && (abbreviated || breadcrumbs.at(-1)?.objectId !== folderId)));
}

export function isEditableShortcutTarget(target) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]') || target.isContentEditable);
}
