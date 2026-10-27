import { ApiError } from './http.js';
import { hashPassword, randomToken, sha256Hex, verifyPassword } from './password.js';

const COOKIE = 'nexora_session';
const SESSION_SECONDS = 60 * 60 * 24 * 14;
const MAX_PASSWORD_BYTES = 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function cookieValue(request) {
  const cookies = request.headers.get('Cookie') || '';
  for (const cookie of cookies.split(';')) {
    const index = cookie.indexOf('=');
    if (index < 0 || cookie.slice(0, index).trim() !== COOKIE) continue;
    return cookie.slice(index + 1).trim();
  }
  return null;
}

function cookieHeader(token, maxAge = SESSION_SECONDS) {
  return `${COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function publicUser(user) {
  return { id: user.id, email: user.email, displayName: user.display_name ?? user.displayName, role: user.role };
}

function normalizeEmail(value) {
  if (typeof value !== 'string') throw new ApiError('INVALID_INPUT', 400);
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) throw new ApiError('INVALID_INPUT', 400);
  return email;
}

function validatePassword(value) {
  if (typeof value !== 'string' || !value.length || new TextEncoder().encode(value).length > MAX_PASSWORD_BYTES) {
    throw new ApiError('INVALID_INPUT', 400);
  }
  return value;
}

export async function createUser({ db, email: inputEmail, displayName, password, role = 'user', now = Date.now() }) {
  const email = normalizeEmail(inputEmail);
  if (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 120) throw new ApiError('INVALID_INPUT', 400);
  if (!['admin', 'user'].includes(role)) throw new ApiError('INVALID_INPUT', 400);
  if (typeof password !== 'string' || new TextEncoder().encode(password).length < 12 || new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    throw new ApiError('INVALID_INPUT', 400);
  }
  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO users (id, email, display_name, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
    .bind(id, email, displayName.trim(), passwordHash, role, now, now).run();
  return { id, email, displayName: displayName.trim(), role };
}

export async function authenticate(request, env, now = Date.now()) {
  const token = cookieValue(request);
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/u.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(`SELECT u.id, u.email, u.display_name, u.role, s.id AS session_id, s.expires_at, s.last_seen_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`).bind(tokenHash, now).first();
  if (!row) return null;
  if (Number(row.last_seen_at) < now - 5 * 60 * 1000) {
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(now, row.session_id).run();
  }
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role, sessionId: row.session_id };
}

export async function login(request, env, body, now = Date.now()) {
  const email = normalizeEmail(body.email);
  const password = validatePassword(body.password);
  const emailHash = await sha256Hex(email);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipHash = await sha256Hex(ip.slice(0, 128));
  const since = now - 15 * 60 * 1000;
  const attempts = await env.DB.prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE (email_hash = ? OR ip_hash = ?) AND succeeded = 0 AND attempted_at > ?')
    .bind(emailHash, ipHash, since).first();
  if (Number(attempts?.count || 0) >= 8) throw new ApiError('RATE_LIMITED', 429);
  const user = await env.DB.prepare('SELECT id, email, display_name, password_hash, role, active FROM users WHERE email = ? COLLATE NOCASE').bind(email).first();
  const passwordOk = await verifyPassword(password, user?.password_hash || null);
  if (!user || !passwordOk || Number(user.active) !== 1) {
    await env.DB.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').bind(now - 24 * 60 * 60 * 1000).run();
    await env.DB.prepare('INSERT INTO login_attempts (email_hash, ip_hash, attempted_at, succeeded) VALUES (?, ?, ?, 0)')
      .bind(emailHash, ipHash, now).run();
    await env.DB.prepare(`DELETE FROM login_attempts WHERE id NOT IN
      (SELECT id FROM login_attempts ORDER BY attempted_at DESC, id DESC LIMIT 10000)`).run();
    throw new ApiError('UNAUTHENTICATED', 401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE email_hash = ? OR ip_hash = ?').bind(emailHash, ipHash).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();
  await env.DB.prepare(`DELETE FROM sessions WHERE id IN
    (SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 10)`).bind(user.id).run();
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = now + SESSION_SECONDS * 1000;
  await env.DB.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), user.id, tokenHash, expiresAt, now, now).run();
  return { user: publicUser(user), token, expiresAt };
}

export async function logout(request, env) {
  const token = cookieValue(request);
  if (token && /^[A-Za-z0-9_-]{40,50}$/u.test(token)) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  }
  return cookieHeader('', 0);
}

export function sessionCookie(token) { return cookieHeader(token); }
export function clearedSessionCookie() { return cookieHeader('', 0); }
export function serializeUser(user) { return publicUser(user); }
