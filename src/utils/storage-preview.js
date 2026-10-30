export const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;
export const MAX_MEDIA_PREVIEW_BYTES = 20 * 1024 * 1024;

const MIME_PREVIEWS = new Map([
  ['image/jpeg', 'image'], ['image/png', 'image'], ['image/webp', 'image'],
  ['video/mp4', 'video'], ['video/webm', 'video'], ['video/ogg', 'video'],
  ['image/gif', 'image'], ['image/avif', 'image'], ['application/pdf', 'pdf'],
  ['text/plain', 'text'], ['text/markdown', 'text'], ['text/x-markdown', 'text'],
  ['text/csv', 'text'], ['application/csv', 'text'], ['application/json', 'text'],
  ['text/json', 'text'], ['application/xml', 'text'], ['text/xml', 'text'],
  ['text/css', 'text'], ['text/javascript', 'text'], ['application/javascript', 'text'],
  ['text/typescript', 'text'], ['application/typescript', 'text'],
  ['text/x-python', 'text'], ['text/x-java-source', 'text'], ['text/x-shellscript', 'text'],
]);

const EXTENSION_MIME = new Map([
  ['jpg', ['image/jpeg', 'image']], ['jpeg', ['image/jpeg', 'image']], ['png', ['image/png', 'image']],
  ['webp', ['image/webp', 'image']], ['gif', ['image/gif', 'image']], ['avif', ['image/avif', 'image']],
  ['mp4', ['video/mp4', 'video']], ['webm', ['video/webm', 'video']], ['ogv', ['video/ogg', 'video']],
  ['pdf', ['application/pdf', 'pdf']], ['txt', ['text/plain', 'text']], ['md', ['text/markdown', 'text']],
  ['markdown', ['text/markdown', 'text']], ['csv', ['text/csv', 'text']], ['json', ['application/json', 'text']],
  ['log', ['text/plain', 'text']], ['yaml', ['text/plain', 'text']], ['yml', ['text/plain', 'text']],
  ['toml', ['text/plain', 'text']], ['ini', ['text/plain', 'text']], ['env', ['text/plain', 'text']],
  ['js', ['text/javascript', 'text']], ['jsx', ['text/javascript', 'text']], ['mjs', ['text/javascript', 'text']],
  ['ts', ['text/typescript', 'text']], ['tsx', ['text/typescript', 'text']], ['css', ['text/css', 'text']],
  ['py', ['text/x-python', 'text']], ['sh', ['text/x-shellscript', 'text']], ['java', ['text/x-java-source', 'text']],
  ['c', ['text/plain', 'text']], ['h', ['text/plain', 'text']], ['cpp', ['text/plain', 'text']],
  ['go', ['text/plain', 'text']], ['rs', ['text/plain', 'text']], ['sql', ['text/plain', 'text']],
]);

export function getStoragePreviewSpec(file) {
  if (!file || file.type === 'folder') return null;
  const rawMime = typeof file.mimeType === 'string' ? file.mimeType.split(';', 1)[0].trim().toLowerCase() : '';
  const knownKind = MIME_PREVIEWS.get(rawMime);
  if (knownKind) {
    return { kind: knownKind, mimeType: rawMime, maxBytes: knownKind === 'text' ? MAX_TEXT_PREVIEW_BYTES : MAX_MEDIA_PREVIEW_BYTES };
  }
  if (rawMime && rawMime !== 'application/octet-stream') return null;
  const extension = typeof file.name === 'string' && file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
  const derived = EXTENSION_MIME.get(extension);
  if (!derived) return null;
  const [mimeType, kind] = derived;
  return { kind, mimeType, maxBytes: kind === 'text' ? MAX_TEXT_PREVIEW_BYTES : MAX_MEDIA_PREVIEW_BYTES };
}
