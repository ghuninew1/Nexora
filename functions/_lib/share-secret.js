import { ApiError } from './http.js';
import { sha256Hex } from './password.js';

const encoder = new TextEncoder();
const asBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const asBytes = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

async function keyFor(env) {
  try {
    const raw = asBytes(env.SHARE_ENCRYPTION_KEY || '');
    if (raw.length !== 32) throw new Error();
    return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } catch { throw new ApiError('INTERNAL_ERROR', 500); }
}

export async function encryptShareSecret(env, id, userId, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`${id}:${userId}`) }, await keyFor(env), encoder.encode(secret));
  return `${asBase64(iv)}.${asBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptShareSecret(env, row) {
  if (!row.encrypted_secret) return null;
  try {
    const [iv, ciphertext, extra] = row.encrypted_secret.split('.');
    if (!iv || !ciphertext || extra) return null;
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBytes(iv), additionalData: encoder.encode(`${row.id}:${row.user_id}`) }, await keyFor(env), asBytes(ciphertext));
    const secret = new TextDecoder().decode(plaintext);
    return /^[A-Za-z0-9_-]{43}$/u.test(secret) && await sha256Hex(secret) === row.token_hash ? secret : null;
  } catch { return null; }
}
