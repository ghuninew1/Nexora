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
