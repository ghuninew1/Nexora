export const fields = [
  ['read', 'View files'], ['preview', 'Preview'], ['download', 'Download'], ['upload', 'Upload'],
  ['createFolder', 'Create folder'], ['rename', 'Rename'], ['move', 'Move'], ['copy', 'Copy'],
  ['delete', 'Move to Trash'], ['permanentDelete', 'Permanent Delete'], ['favorite', 'Favorites'],
  ['share', 'Create Public Share'], ['manageShare', 'Manage Public Share'],
];
const groups = {
  Viewer: ['read', 'preview', 'download'],
  Contributor: ['read', 'preview', 'download', 'upload', 'createFolder'],
  Editor: ['read', 'preview', 'download', 'upload', 'createFolder', 'rename', 'move', 'copy', 'delete', 'favorite'],
  'Full Access': fields.map(([name]) => name),
};
export function preset(name) {
  return Object.fromEntries(fields.map(([key]) => [key, groups[name]?.includes(key) ?? false]));
}
export function presetName(permissions) {
  return Object.keys(groups).find(name => fields.every(([key]) => permissions[key] === preset(name)[key])) || 'Custom';
}
export function updatePermission(permissions, key, value) {
  const next = { ...permissions, [key]: value };
  if (!next.read) { next.preview = false; next.download = false; next.favorite = false; }
  if (!next.delete) next.permanentDelete = false;
  if (!next.share) next.manageShare = false;
  return next;
}
