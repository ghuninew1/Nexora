import assert from 'node:assert/strict';
import test from 'node:test';
import { getCurrentUser, getSafeReturnTo, signIn, signOut } from '../src/services/auth.js';

test('session bootstrap treats 401 as unauthenticated and uses the same-origin cookie', async () => {
  let request;
  const user = await getCurrentUser({ fetchImpl: async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }), { status: 401 });
  } });

  assert.equal(user, null);
  assert.equal(request.url, '/api/auth/me');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.credentials, 'same-origin');
});

test('session bootstrap returns only public identity fields and distinguishes server failures', async () => {
  const user = await getCurrentUser({ fetchImpl: async () => Response.json({ data: { user: {
    id: 'internal-id', email: 'owner@example.test', displayName: 'Workspace Owner', role: 'admin', avatarUrl: 'unexpected',
  } } }) });
  assert.deepEqual(user, { email: 'owner@example.test', displayName: 'Workspace Owner', role: 'admin' });

  await assert.rejects(getCurrentUser({ fetchImpl: async () => Response.json({ error: { message: 'private server detail' } }, { status: 503 }) }), {
    message: "We couldn't verify your session. Check your connection and try again.",
  });
  await assert.rejects(getCurrentUser({ fetchImpl: async () => Response.json({ data: { user: { email: '', displayName: 'Missing email', role: 'admin' } } }) }), {
    message: "We couldn't verify your session. Check your connection and try again.",
  });
  await assert.rejects(getCurrentUser({ fetchImpl: async () => { throw new TypeError('network detail'); } }), {
    message: "We couldn't verify your session. Check your connection and try again.",
  });
});

test('login sends the Phase 8 request shape and keeps invalid credentials generic', async () => {
  let request;
  const user = await signIn('Owner@Example.Test', 'private password', { fetchImpl: async (url, options) => {
    request = { url, options };
    return Response.json({ data: { user: { id: 'internal-id', email: 'owner@example.test', displayName: 'Owner', role: 'user' } } });
  } });
  assert.equal(request.url, '/api/auth/login');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.options.body), { email: 'Owner@Example.Test', password: 'private password' });
  assert.deepEqual(user, { email: 'owner@example.test', displayName: 'Owner', role: 'user' });

  await assert.rejects(signIn('owner@example.test', 'wrong password', { fetchImpl: async () => Response.json({ error: {
    code: 'UNAUTHENTICATED', message: 'Do not expose this backend text',
  } }, { status: 401 }) }), { message: 'Email or password is incorrect.' });
  await assert.rejects(signIn('owner@example.test', 'password', { fetchImpl: async () => Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }) }), {
    message: 'Too many sign-in attempts. Wait a few minutes and try again.',
  });
  await assert.rejects(signIn('owner@example.test', 'password', { fetchImpl: async () => { throw new TypeError('private network detail'); } }), {
    message: 'Sign-in is temporarily unavailable. Try again later.',
  });
});

test('logout uses a same-origin POST and does not require browser cookie access', async () => {
  let request;
  await signOut({ fetchImpl: async (url, options) => {
    request = { url, options };
    return Response.json({ data: { loggedOut: true } });
  } });
  assert.equal(request.url, '/api/auth/logout');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(Object.hasOwn(request.options, 'body'), false);
  await signOut({ fetchImpl: async () => new Response(null, { status: 401 }) });
});

test('return destinations remain internal and reject login loops and external URLs', () => {
  const origin = 'https://nexora.example.test';
  assert.equal(getSafeReturnTo('/files?folder=reports#list', origin), '/files?folder=reports#list');
  assert.equal(getSafeReturnTo('https://evil.example/path', origin), null);
  assert.equal(getSafeReturnTo('//evil.example/path', origin), null);
  assert.equal(getSafeReturnTo('/\\evil.example/path', origin), null);
  assert.equal(getSafeReturnTo('/login', origin), null);
  assert.equal(getSafeReturnTo(null, origin), null);
});
