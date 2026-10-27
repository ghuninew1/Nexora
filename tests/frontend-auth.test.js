import assert from 'node:assert/strict';
import test from 'node:test';
import { getCurrentUser, getSafeReturnTo, safeSignInErrorMessage, signIn, signOut } from '../src/services/auth.js';

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
    password: 'private test value', passwordHash: 'private test value', password_hash: 'private test value',
    salt: 'private test value', sessionToken: 'private test value', session_token: 'private test value',
    authorization: 'private test value', cookie: 'private test value',
  } } }) });
  assert.deepEqual(Object.keys(user).sort(), ['displayName', 'email', 'role']);
  assert.ok(user.email === 'owner@example.test' && user.displayName === 'Workspace Owner' && user.role === 'admin', 'Session bootstrap should expose only safe identity fields.');

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
  const submittedBody = JSON.parse(request.options.body);
  assert.deepEqual(Object.keys(submittedBody).sort(), ['email', 'password']);
  assert.ok(submittedBody.email === 'Owner@Example.Test', 'Login should submit the entered email.');
  assert.ok(submittedBody.password === 'private password', 'Login should submit the password without asserting or printing its value.');
  assert.deepEqual(Object.keys(user).sort(), ['displayName', 'email', 'role']);
  assert.ok(user.email === 'owner@example.test' && user.displayName === 'Owner' && user.role === 'user', 'Login should return only safe identity fields.');

  const submittedPassword = 'unique-qa-login-secret';
  let failedLoginError;
  try {
    await signIn('owner@example.test', submittedPassword, { fetchImpl: async () => Response.json({ error: {
      code: 'UNAUTHENTICATED', message: submittedPassword,
    } }, { status: 401 }) });
  } catch (error) {
    failedLoginError = error;
  }
  assert.ok(failedLoginError instanceof Error && failedLoginError.message === 'Email or password is incorrect.', 'Invalid-login errors must remain generic and omit submitted credentials.');
  assert.ok(!safeSignInErrorMessage(new Error(submittedPassword)).includes(submittedPassword), 'Unknown auth errors must map to a safe message.');
  await assert.rejects(signIn('owner@example.test', 'password', { fetchImpl: async () => Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }) }), {
    message: 'Too many sign-in attempts. Wait a few minutes and try again.',
  });
  await assert.rejects(signIn('owner@example.test', 'password', { fetchImpl: async () => { throw new TypeError('private network detail'); } }), {
    message: 'Sign-in is temporarily unavailable. Try again later.',
  });
  assert.equal(safeSignInErrorMessage(new Error('private test password')), 'Sign-in is temporarily unavailable. Try again later.');
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
