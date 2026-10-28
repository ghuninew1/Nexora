const ACTIONS = new Set([
  'upload', 'create_folder', 'rename', 'move', 'copy', 'trash', 'restore',
  'delete_permanent', 'favorite', 'unfavorite', 'share_create', 'share_replace', 'share_revoke',
]);
const METADATA_KEYS = {
  rename: ['previousName', 'newName'], move: ['destinationName'], copy: ['destinationName'],
  share_create: ['shareId'], share_replace: ['shareId'], share_revoke: ['shareId'],
};

export class ActivityApiError extends Error {
  constructor(message = 'Activity could not be loaded.', status = 0) {
    super(message);
    this.name = 'ActivityApiError';
    this.status = status;
  }
}

export function normalizeActivityEvent(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || typeof value.createdAt !== 'string') return null;
  const action = ACTIONS.has(value.action) ? value.action : 'unknown';
  const metadata = {};
  for (const key of METADATA_KEYS[action] || []) {
    if (typeof value.metadata?.[key] === 'string') metadata[key] = value.metadata[key].slice(0, 256);
  }
  return {
    id: value.id,
    action,
    storageMountId: typeof value.storageMountId === 'string' ? value.storageMountId : null,
    storageName: typeof value.storageName === 'string' ? value.storageName : null,
    objectId: typeof value.objectId === 'string' ? value.objectId : null,
    objectName: typeof value.objectName === 'string' ? value.objectName : null,
    objectType: ['file', 'folder'].includes(value.objectType) ? value.objectType : null,
    parentId: typeof value.parentId === 'string' ? value.parentId : null,
    destinationParentId: typeof value.destinationParentId === 'string' ? value.destinationParentId : null,
    metadata: Object.keys(metadata).length ? metadata : null,
    createdAt: value.createdAt,
  };
}

export function formatActivity(event) {
  const name = event?.objectName || 'item';
  const destination = event?.metadata?.destinationName || 'another folder';
  switch (event?.action) {
    case 'upload': return `Uploaded ${name}`;
    case 'create_folder': return `Created folder ${name}`;
    case 'rename': return event.metadata?.previousName && event.metadata?.newName
      ? `Renamed ${event.metadata.previousName} to ${event.metadata.newName}` : `Renamed ${event.metadata?.newName || name}`;
    case 'move': return `Moved ${name} to ${destination}`;
    case 'copy': return `Copied ${name} to ${destination}`;
    case 'trash': return `Moved ${name} to Trash`;
    case 'restore': return `Restored ${name}`;
    case 'delete_permanent': return `Permanently deleted ${name}`;
    case 'favorite': return `Added ${name} to Favorites`;
    case 'unfavorite': return `Removed ${name} from Favorites`;
    case 'share_create': return `Created a public link for ${name}`;
    case 'share_replace': return `Replaced the public link for ${name}`;
    case 'share_revoke': return `Revoked the public link for ${name}`;
    default: return 'File activity';
  }
}

export async function listActivity({ limit = 50, cursor = null, signal, fetchImpl = fetch } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ActivityApiError('Activity request is invalid.', 400);
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  let response;
  try {
    response = await fetchImpl(`/api/activity?${query}`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ActivityApiError();
  }
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    throw new ActivityApiError(response.status === 401 ? 'Your session has expired. Sign in again.' : 'Activity could not be loaded. Try again.', response.status);
  }
  const data = body?.data;
  if (!data || !Array.isArray(data.items) || !(data.nextCursor === null || typeof data.nextCursor === 'string')) throw new ActivityApiError();
  const items = data.items.map(normalizeActivityEvent);
  if (items.some((item) => !item)) throw new ActivityApiError();
  return { items, nextCursor: data.nextCursor };
}
