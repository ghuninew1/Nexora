const OBJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;

export function rootBreadcrumbs() {
  return [{ objectId: null, label: 'My Files' }];
}

export function normalizeFileBrowserRouteState(routeState, storageId, folderId) {
  if (!routeState || routeState.storageId !== storageId || !Array.isArray(routeState.breadcrumbs)
    || routeState.breadcrumbs.length < 1 || routeState.breadcrumbs.length > 101) return null;
  const [root, ...segments] = routeState.breadcrumbs;
  if (!root || root.objectId !== null || root.label !== 'My Files') return null;
  const seen = new Set();
  const breadcrumbs = [rootBreadcrumbs()[0]];
  for (const segment of segments) {
    if (!segment || typeof segment.objectId !== 'string' || !OBJECT_ID_PATTERN.test(segment.objectId)
      || typeof segment.label !== 'string' || !segment.label.trim() || segment.label.length > 255
      || seen.has(segment.objectId)) return null;
    seen.add(segment.objectId);
    breadcrumbs.push({ objectId: segment.objectId, label: segment.label });
  }
  if ((folderId === null && breadcrumbs.length !== 1)
    || (folderId !== null && breadcrumbs.at(-1)?.objectId !== folderId)) return null;
  return breadcrumbs;
}

export function appendBreadcrumb(breadcrumbs, folder) {
  const parentPath = breadcrumbs.filter((item) => item.objectId !== folder.objectId);
  return [...parentPath, { objectId: folder.objectId, label: folder.name }];
}

export function isValidObjectId(value) {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

export function isFolderDestinationInvalid(action, source, parentId, breadcrumbs) {
  if (action !== 'move' || source?.type !== 'folder') return false;
  if (parentId === source.parentId) return true;
  return breadcrumbs.some((item) => item.objectId === source.objectId);
}
