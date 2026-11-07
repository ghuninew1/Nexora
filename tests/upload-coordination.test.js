import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withUploadOwnership, retryAfterMilliseconds } from '../src/services/upload-coordination.js';
import { memoryWebLocks } from './helpers/web-locks.js';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('exclusive tabs wait and takeover only after owner settlement; distinct owners are isolated', async () => {
  const locks = memoryWebLocks(), gate = deferred(), entered = deferred();
  const controller = new AbortController(); let active = 0, maximum = 0, waiting = 0;
  const options = { locks, userScope: 'owner', identity: 'transfer:one', signal: controller.signal };
  const first = withUploadOwnership(options, async () => { maximum = Math.max(maximum, ++active); entered.resolve(); await gate.promise; active--; });
  await entered.promise;
  const second = withUploadOwnership({ ...options, onWaiting: () => waiting++ }, async () => { maximum = Math.max(maximum, ++active); active--; });
  await withUploadOwnership({ ...options, userScope: 'another' }, async () => assert.equal(active, 1));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(waiting, 1); assert.equal(active, 1);
  gate.resolve(); await Promise.all([first, second]); assert.equal(maximum, 1);
});

test('unsupported authority and missing owner fail closed without executing work', async () => {
  let called = false;
  for (const patch of [{ locks: null }, { userScope: null }]) {
    await assert.rejects(withUploadOwnership({ locks: memoryWebLocks(), userScope: 'owner', identity: 'one', signal: new AbortController().signal, ...patch }, () => { called = true; }), { code: 'OWNERSHIP_UNAVAILABLE' });
  }
  assert.equal(called, false);
});

test('queued tab close aborts waiter without stealing; failure releases authority', async () => {
  const locks = memoryWebLocks(), gate = deferred(), entered = deferred();
  const options = { locks, userScope: 'owner', identity: 'one', signal: new AbortController().signal };
  const first = withUploadOwnership(options, async () => { entered.resolve(); await gate.promise; }); await entered.promise;
  const closed = new AbortController();
  const second = withUploadOwnership({ ...options, signal: closed.signal }, () => assert.fail('closed tab ran'));
  await new Promise(resolve => setTimeout(resolve, 0)); closed.abort();
  await assert.rejects(second, { name: 'AbortError' }); gate.resolve(); await first;
  await assert.rejects(withUploadOwnership(options, () => { throw new Error('failure'); }), /failure/);
  await withUploadOwnership(options, () => {});
});

test('Retry-After supports valid seconds/date, caps waits, rejects malformed/past hints', () => {
  assert.equal(retryAfterMilliseconds('2'), 2000);
  assert.equal(retryAfterMilliseconds('Thu, 01 Jan 1970 00:00:05 GMT', 1000), 4000);
  assert.equal(retryAfterMilliseconds('999999'), 999999000);
  for (const hint of ['', null, '-3', 'nonsense']) assert.equal(retryAfterMilliseconds(hint), 0);
});

test('origin budget bounds concurrent work across different owners and sessions', async () => {
  const { withUploadBudget } = await import('../src/services/upload-coordination.js');
  const locks = memoryWebLocks(), gate = deferred(); let active = 0, maximum = 0;
  const runs = Array.from({ length: 9 }, () => withUploadBudget(new AbortController().signal, async () => {
    maximum = Math.max(maximum, ++active); await gate.promise; active--;
  }, locks));
  await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(active, 5);
  gate.resolve(); await Promise.all(runs); assert.equal(maximum, 5);
});
