import { ApiError } from './http.js';

export const STORAGE_PERMISSION_NAMES = Object.freeze([
  'read', 'preview', 'download', 'upload', 'createFolder', 'rename', 'move', 'copy',
  'delete', 'permanentDelete', 'share', 'manageShare', 'favorite',
]);

export function validateStoragePermissions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== STORAGE_PERMISSION_NAMES.length
    || STORAGE_PERMISSION_NAMES.some(name => !Object.hasOwn(input, name) || typeof input[name] !== 'boolean')) {
    throw new ApiError('INVALID_INPUT', 400);
  }
  if ((!input.read && (input.preview || input.download || input.favorite))
    || (!input.delete && input.permanentDelete)
    || (!input.share && input.manageShare)) throw new ApiError('INVALID_INPUT', 400);
  return Object.fromEntries(STORAGE_PERMISSION_NAMES.map(name => [name, input[name]]));
}

// Explicit route mapping for the future membership gate. Unknown routes fail
// closed; metadata endpoints still require an assignment before this is used.
export function requiredStoragePermissions(method, tail) {
  const verb = typeof method === 'string' ? method.toUpperCase() : '';
  if (!Array.isArray(tail)) throw new ApiError('NOT_FOUND', 404);
  const [route, id, action] = tail;
  if (verb === 'GET' && (tail.length === 0 || (['capabilities', 'usage'].includes(route) && tail.length === 1))) return [];
  if (route === 'objects') {
    if (verb === 'GET' && (tail.length === 1 || tail.length === 2)) return ['read'];
    if (tail.length === 2 && verb === 'PATCH') return ['rename'];
    if (tail.length === 2 && verb === 'DELETE') return ['delete'];
    if (tail.length === 3 && ['GET', 'HEAD'].includes(verb) && action === 'download') return ['read', 'download'];
    if (tail.length === 3 && verb === 'GET' && action === 'preview') return ['read', 'preview'];
    if (tail.length === 3 && verb === 'POST' && action === 'move') return ['move'];
    if (tail.length === 3 && verb === 'POST' && action === 'copy') return ['copy'];
  }
  if (route === 'uploads') {
    if (tail.length === 1 && ['POST','GET'].includes(verb)) return ['upload'];
    if (id && tail.length === 2 && ['GET','DELETE'].includes(verb)) return ['upload'];
    if (id && tail.length === 3 && verb === 'POST' && ['complete','pause','resume'].includes(action)) return ['upload'];
    if (id && tail.length === 4 && verb === 'PUT' && action === 'parts') return ['upload'];
  }
  if (route === 'folders' && tail.length === 1 && verb === 'POST') return ['createFolder'];
  if (route === 'files' && tail.length === 1 && verb === 'POST') return ['upload'];
  if (route === 'files' && tail.length === 3 && ['GET', 'HEAD'].includes(verb) && action === 'download') return ['read', 'download'];
  if (route === 'trash' && tail.length === 1 && verb === 'GET') return ['read', 'delete'];
  if (route === 'trash' && tail.length === 3 && action === 'restore' && verb === 'POST') return ['delete'];
  if (route === 'trash' && tail.length === 3 && action === 'permanent' && verb === 'DELETE') return ['permanentDelete'];
  if (route === 'operations' && tail.length === 2 && id && verb === 'GET') return ['read'];
  throw new ApiError('NOT_FOUND', 404);
}

// Provider support and policy may only reduce membership grants.
export function intersectStoragePermissions(grants, capabilities, { readOnly = false, maintenance = false } = {}) {
  const checked = validateStoragePermissions(grants);
  const provider = capabilities && typeof capabilities === 'object' ? capabilities : {};
  const writable = !readOnly && !maintenance && provider.readOnly !== true;
  const read = checked.read && provider.list === true && provider.stat === true;
  const remove = checked.delete && writable && provider.trash === true;
  const share = checked.share && writable && provider.stat === true && (provider.list === true || provider.download === true);
  return {
    read,
    preview: read && checked.preview && provider.download === true,
    download: read && checked.download && provider.download === true,
    upload: checked.upload && writable && provider.upload === true,
    createFolder: checked.createFolder && writable && provider.createFolder === true,
    rename: checked.rename && writable && provider.rename === true,
    move: checked.move && writable && provider.move === true,
    copy: read && checked.copy && writable && provider.copy === true,
    delete: remove,
    permanentDelete: remove && checked.permanentDelete && provider.permanentDelete === true,
    share,
    manageShare: share && checked.manageShare,
    favorite: read && checked.favorite && !maintenance,
  };
}
