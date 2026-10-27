const ITERATIONS = 600_000;
const KEY_LENGTH = 32;
const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function derive(password, salt, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, KEY_LENGTH * 8));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await derive(password, salt);
  return `pbkdf2-sha256$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(digest)}`;
}

export async function verifyPassword(password, encoded) {
  const parts = typeof encoded === 'string' ? encoded.split('$') : [];
  const salt = parts[2] ? fromBase64Url(parts[2]) : null;
  const expected = parts[3] ? fromBase64Url(parts[3]) : null;
  const validFormat = parts[0] === 'pbkdf2-sha256' && Number(parts[1]) === ITERATIONS && salt?.length === 16 && expected?.length === KEY_LENGTH;
  const actual = await derive(password, validFormat ? salt : new Uint8Array(16));
  let difference = validFormat ? 0 : 1;
  for (let i = 0; i < KEY_LENGTH; i += 1) difference |= actual[i] ^ (validFormat ? expected[i] : 0);
  return difference === 0;
}

export async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomToken() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}
