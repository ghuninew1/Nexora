import { memoryWebLocks } from '../helpers/web-locks';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import useUploadQueue from '../../src/hooks/useUploadQueue';
import UploadQueue from '../../src/components/files/UploadQueue';
import { selectUploadStrategy } from '../../src/utils/upload-strategy';

beforeEach(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: memoryWebLocks() }));
afterEach(() => { cleanup(); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); });
const limits = { resumableUpload: true, partSizeBytes: 8 * 1024 ** 2, maxFileBytes: 10 * 1024 ** 3,
  maxParts: 1280, maxParallelParts: 1, sessionTtlSeconds: 604800 };
const file = (name = 'test.bin', size = 10) => new File([new Uint8Array(size)], name, { type: 'application/octet-stream' });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const err = code => Object.assign(new Error(code), { code });
const untilAbort = signal => new Promise((resolve, reject) => {
  signal.addEventListener('abort', () => reject(err('ABORTED')), { once: true });
  if (signal.aborted) reject(err('ABORTED'));
});
function backend() {
  const sessions = new Map(), keys = new Map(), calls = [], signals = [];
  const hooks = {};
  const createClient = vi.fn(({ signal, maxRetries }) => {
    signals.push(signal); expect(maxRetries).toBe(0);
    const operation = (name, fn) => async (...args) => {
      if (signal.aborted) throw err('ABORTED');
      calls.push({ name, args });
      await hooks[name]?.(...args, signal);
      if (signal.aborted) throw err('ABORTED');
      return fn(...args);
    };
    const get = id => sessions.get(id);
    const clone = value => JSON.parse(JSON.stringify(value));
    return {
      createSession: operation('create', (metadata, key) => {
        if (!keys.has(key)) {
          const id = `session_${sessions.size + 1}`;
          keys.set(key, id);
          sessions.set(id, { transferId: id, state: 'active', version: 1, sizeBytes: metadata.sizeBytes,
            partSizeBytes: limits.partSizeBytes, partCount: Math.ceil(metadata.sizeBytes / limits.partSizeBytes),
            acknowledgedBytes: 0, parts: [], nextCursor: null, expiresAt: Date.now() + 100000 });
        }
        return clone(get(keys.get(key)));
      }),
      reconcile: operation('reconcile', id => {
        const s = get(id);
        if (s.state === 'expired') throw err('SESSION_EXPIRED');
        return clone(s);
      }),
      getSession: operation('get', id => clone(get(id))),
      getCompletedParts: operation('parts', id => clone(get(id))),
      uploadPart: operation('part', (id, source, number) => {
        const s = get(id), receipt = { partNumber: number, sizeBytes: Math.min(s.partSizeBytes, source.size - (number - 1) * s.partSizeBytes), sha256: 'verified' };
        if (!s.parts.some(p => p.partNumber === number)) { s.parts.push(receipt); s.acknowledgedBytes += receipt.sizeBytes; }
        return receipt;
      }),
      pauseSession: operation('pause', id => { const s = get(id); s.state = 'paused'; s.version++; return clone(s); }),
      resumeSession: operation('resume', id => { const s = get(id); s.state = 'active'; s.version++; return clone(s); }),
      cancelSession: operation('cancel', id => { const s = get(id); s.state = 'cancelled'; return clone(s); }),
      completeSession: operation('complete', id => {
        const s = get(id); s.state = 'completed';
        s.object = { objectId: 'object_' + id, type: 'file', parentId: null, name: 'test.bin', sizeBytes: s.sizeBytes };
        return clone(s);
      }),
    };
  });
  return { createClient, sessions, calls, hooks, signals };
}
function setup(extra = {}) {
  const api = backend();
  const options = { scopeKey: 'owner_a:storage_a', uploadFile: vi.fn().mockResolvedValue({ file: { objectId: 'small' } }),
    createClient: api.createClient, autoClear: false, onComplete: vi.fn(), onUnauthorized: vi.fn(), ...extra };
  const hook = renderHook(props => useUploadQueue({ recoveryScope: 'test_owner', ...props }), { initialProps: options });
  const add = (files = [file()], params = {}) => {
    let ids;
    act(() => { ids = hook.result.current.addFiles(files, { storageId: 'storage_a', maxUploadBytes: 4, transfers: limits, ...params }); });
    return ids;
  };
  const status = () => hook.result.current.items[0]?.status;
  return { ...hook, api, options, add, status };
}

it('routes only large files with compatible explicit capability; clamps legacy maximum', () => {
  expect(selectUploadStrategy(10, 10).strategy).toBe('legacy');
  expect(selectUploadStrategy(11, 10).error).toBe('UPLOAD_TOO_LARGE');
  expect(selectUploadStrategy(11, 10, limits).strategy).toBe('multipart');
  for (const transfer of [undefined, { ...limits, resumableUpload: false }, { ...limits, partSizeBytes: 4 },
    { ...limits, maxParallelParts: 2 }, { ...limits, maxParts: 1 }, { ...limits, maxFileBytes: NaN }]) {
    expect(selectUploadStrategy(11, 10, transfer).error).toBe('UPLOAD_TOO_LARGE');
  }
  expect(selectUploadStrategy(26 * 1024 ** 2, 99 * 1024 ** 2).error).toBe('UPLOAD_TOO_LARGE');
});

it('bounds retained upload Files and rejects an overflowing selection atomically before network work', async () => {
  const onAdmissionError = vi.fn();
  const h = setup({ onAdmissionError });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  const first = h.add(Array.from({ length: 49 }, (_, i) => file(`queued-${i}.bin`)));
  expect(first).toHaveLength(49);
  expect(h.add([file('overflow-a.bin'), file('overflow-b.bin')])).toEqual([]);
  expect(h.result.current.items).toHaveLength(49);
  expect(onAdmissionError).toHaveBeenCalledWith(expect.stringContaining('No files from this selection were added'));
  expect(h.api.createClient).not.toHaveBeenCalled();
  expect(h.add([file('last.bin')])).toHaveLength(1);
  expect(h.add([file('overflow.bin')])).toEqual([]);
  expect(h.result.current.items).toHaveLength(50);
  act(() => h.result.current.cancelUpload(first[0]));
  act(() => h.result.current.clearFinished());
  expect(h.add([file('replacement.bin')])).toHaveLength(1);
  await act(async () => {});
});

it('preserves the small-file path, limit and indeterminate UI without multipart controls', async () => {
  const h = setup();
  h.add([file()], { maxUploadBytes: 10, transfers: undefined });
  await waitFor(() => expect(h.status()).toBe('success'));
  expect(h.options.uploadFile).toHaveBeenCalledTimes(1);
  expect(h.options.uploadFile.mock.calls[0][0].maxUploadBytes).toBe(10);
  expect(h.api.createClient).not.toHaveBeenCalled();
  render(<UploadQueue items={[{ id: 's', name: 'small', strategy: 'legacy', status: 'uploading', sizeBytes: 10 }]} concurrency={3} />);
  expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
  expect(screen.queryByRole('button', { name: /Pause/ })).toBeNull();
});

it('queues multipart files one at a time even when a higher concurrency is requested', async () => {
  const h = setup({ maxConcurrency: 2 }); const gate = deferred();
  const active = new Map(); let peak = 0;
  h.api.hooks.part = async id => {
    active.set(id, (active.get(id) || 0) + 1);
    expect(active.get(id)).toBe(1); peak = Math.max(peak, active.size);
    await gate.promise; active.delete(id);
  };
  h.add([file('a'), file('b'), file('c')]);
  await waitFor(() => expect(h.api.calls.filter(c => c.name === 'part')).toHaveLength(1));
  expect(h.api.sessions.size).toBe(1);
  expect(h.result.current.concurrency).toBe(1);
  await act(async () => gate.resolve());
  await waitFor(() => expect(h.result.current.items.every(i => i.status === 'success')).toBe(true));
  expect(peak).toBe(1); expect(h.options.onComplete).toHaveBeenCalledTimes(3);
  for (const item of h.result.current.items) { expect(item.file).toBeUndefined(); expect(item.controller).toBeUndefined(); expect(item.key).toBeUndefined(); }
});

it('pauses after aborting local work, resumes with reconciliation, and preserves the original session', async () => {
  const h = setup(); let first = true;
  h.api.hooks.part = async (id, source, number, signal) => { if (first) { first = false; await untilAbort(signal); } };
  const [id] = h.add();
  await waitFor(() => expect(h.api.calls.some(c => c.name === 'part')).toBe(true));
  act(() => h.result.current.pauseUpload(id));
  await waitFor(() => expect(h.status()).toBe('paused'));
  expect(h.api.sessions.get('session_1').state).toBe('paused');
  expect(h.api.calls.filter(c => c.name === 'part')).toHaveLength(1);
  act(() => h.result.current.resumeUpload(id));
  await waitFor(() => expect(h.status()).toBe('success'));
  expect(h.api.calls.filter(c => c.name === 'create')).toHaveLength(1);
  const names = h.api.calls.map(c => c.name);
  expect(names.indexOf('resume')).toBeGreaterThan(names.indexOf('pause'));
  expect(names[names.indexOf('resume') - 1]).toBe('reconcile');
});

it('cancels active and paused sessions through the server; ambiguous cancellation is not phantom success', async () => {
  const h = setup(); h.api.hooks.part = (id, source, n, signal) => untilAbort(signal);
  const [id] = h.add();
  await waitFor(() => expect(h.api.calls.some(c => c.name === 'part')).toBe(true));
  h.api.hooks.cancel = () => { throw err('NETWORK_INTERRUPTION'); };
  act(() => h.result.current.cancelUpload(id));
  await waitFor(() => expect(h.status()).toBe('error'));
  expect(h.result.current.items[0].pendingAction).toBe('cancel');
  expect(h.result.current.items[0].error).toContain('unconfirmed');
  expect(h.api.calls.filter(c => c.name === 'cancel')).toHaveLength(1);
  h.api.hooks.cancel = id => { h.api.sessions.get(id).state = 'cancelled'; throw err('NETWORK_INTERRUPTION'); };
  act(() => h.result.current.retryUpload(id));
  await waitFor(() => expect(h.status()).toBe('cancelled'));
  expect(h.options.onComplete).not.toHaveBeenCalled();
});

it('cancels a paused session without resuming its parts', async () => {
  const h = setup(); h.api.hooks.part = (id, source, n, signal) => untilAbort(signal);
  const [id] = h.add(); await waitFor(() => expect(h.api.calls.some(c => c.name === 'part')).toBe(true));
  act(() => h.result.current.pauseUpload(id)); await waitFor(() => expect(h.status()).toBe('paused'));
  act(() => h.result.current.cancelUpload(id)); await waitFor(() => expect(h.status()).toBe('cancelled'));
  expect(h.api.calls.filter(c => c.name === 'part')).toHaveLength(1);
});

it('network retry retains identity, waits, then reconciles; no legacy fallback', async () => {
  const gate = deferred(); const wait = vi.fn(() => gate.promise);
  const h = setup({ waitForRetry: wait }); let first = true;
  h.api.hooks.part = () => { if (first) { first = false; throw err('NETWORK_INTERRUPTION'); } };
  h.add(); await waitFor(() => expect(h.status()).toBe('recovering_connection'));
  expect(h.api.sessions.size).toBe(1);
  await act(async () => gate.resolve()); await waitFor(() => expect(h.status()).toBe('success'));
  expect(h.api.calls.filter(c => c.name === 'create')).toHaveLength(1);
  expect(h.api.calls.filter(c => c.name === 'part').map(c => c.args[0])).toEqual(['session_1', 'session_1']);
  expect(h.api.calls.filter(c => c.name === 'reconcile')).toHaveLength(2);
  expect(h.options.uploadFile).not.toHaveBeenCalled();
});

it('acknowledges server counters only and keeps finalizing below 100% until confirmed', async () => {
  const h = setup(); const gate = deferred();
  h.api.hooks.complete = () => gate.promise;
  h.add(); await waitFor(() => expect(h.status()).toBe('finalizing'));
  expect(h.result.current.items[0].acknowledgedBytes).toBe(10);
  expect(h.options.onComplete).not.toHaveBeenCalled();
  const view = render(<UploadQueue items={h.result.current.items} concurrency={3} />);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('99');
  expect(screen.getByText(/awaiting finalization/)).toBeTruthy();
  await act(async () => gate.resolve()); await waitFor(() => expect(h.status()).toBe('success'));
  view.rerender(<UploadQueue items={h.result.current.items} concurrency={3} />);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  expect(h.options.onComplete).toHaveBeenCalledTimes(1);
});

it('uncertain completion reuses completed session and never emits duplicate publication', async () => {
  const h = setup({ waitForRetry: async () => {} });
  h.api.hooks.complete = id => {
    const s = h.api.sessions.get(id); s.state = 'completed'; s.object = { objectId: 'same_object' };
    throw err('AMBIGUOUS_COMPLETION');
  };
  h.add(); await waitFor(() => expect(h.status()).toBe('success'));
  expect(h.api.calls.filter(c => c.name === 'complete')).toHaveLength(1);
  expect(h.options.onComplete).toHaveBeenCalledTimes(1);
  const [task, result] = h.options.onComplete.mock.calls[0];
  expect(result.file.objectId).toBe('same_object');
  act(() => h.result.current.retryUpload(task.id));
  expect(h.options.onComplete).toHaveBeenCalledTimes(1);
});

it('account/storage scope changes abort and discard old work without cancelling server sessions', async () => {
  const h = setup(); const gate = deferred();
  h.api.hooks.part = () => gate.promise; // deliberately ignores AbortSignal
  h.add(); await waitFor(() => expect(h.api.calls.some(c => c.name === 'part')).toBe(true));
  h.rerender({ ...h.options, scopeKey: 'owner_b:storage_a' });
  expect(h.api.signals[0].aborted).toBe(true);
  await act(async () => gate.resolve());
  expect(h.result.current.items).toEqual([]);
  expect(h.options.onComplete).not.toHaveBeenCalled();
  expect(h.api.calls.some(c => c.name === 'cancel')).toBe(false);
  h.add([file('new')], { maxUploadBytes: 10 });
  await waitFor(() => expect(h.status()).toBe('success'));
  expect(h.options.onComplete).toHaveBeenCalledTimes(1);
});

it('auth failures stop pending work; permission revocation and expiry never automatically retry', async () => {
  for (const code of ['PERMISSION_REVOKED', 'SESSION_EXPIRED', 'AUTHENTICATION_FAILURE']) {
    const h = setup({ maxConcurrency: 1, waitForRetry: vi.fn() });
    h.api.hooks.part = () => { throw err(code); };
    h.add(code === 'AUTHENTICATION_FAILURE' ? [file('one'), file('two')] : [file()]);
    await waitFor(() => expect(h.status()).toBe(code === 'SESSION_EXPIRED' ? 'expired' : 'error'));
    expect(h.options.waitForRetry).not.toHaveBeenCalled();
    expect(h.result.current.items[0].retryable).toBe(false);
    if (code === 'AUTHENTICATION_FAILURE') { expect(h.options.onUnauthorized).toHaveBeenCalledTimes(1); expect(h.api.sessions.size).toBe(1); }
    h.unmount();
  }
});

it('unmount aborts requests and ignores late responses without server cancellation', async () => {
  const h = setup(); const gate = deferred(); h.api.hooks.part = () => gate.promise;
  h.add(); await waitFor(() => expect(h.api.calls.some(c => c.name === 'part')).toBe(true));
  h.unmount(); expect(h.api.signals.every(s => s.aborted)).toBe(true);
  await act(async () => gate.resolve());
  expect(h.options.onComplete).not.toHaveBeenCalled();
  expect(h.api.calls.some(c => c.name === 'cancel')).toBe(false);
});

it('UI invokes multipart pause/resume and retry cancellation, including revoked write permission', () => {
  const pause = vi.fn(), resume = vi.fn(), retry = vi.fn();
  const items = [
    { id: 'a', name: 'active', strategy: 'multipart', status: 'uploading', sizeBytes: 10 },
    { id: 'p', name: 'paused', strategy: 'multipart', status: 'paused', sizeBytes: 10 },
    { id: 'c', name: 'cancel', strategy: 'multipart', status: 'error', sizeBytes: 10, retryable: true, pendingAction: 'cancel' },
  ];
  const view = render(<UploadQueue items={items} concurrency={3} onPause={pause} onResume={resume} onRetry={retry} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pause upload active' })); expect(pause).toHaveBeenCalledWith('a');
  fireEvent.click(screen.getByRole('button', { name: 'Resume upload paused' })); expect(resume).toHaveBeenCalledWith('p');
  view.rerender(<UploadQueue items={items} concurrency={3} onRetry={retry} canRetry={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry upload cancel' })); expect(retry).toHaveBeenCalledWith('c');
});

it('StrictMode lifecycle replay does not duplicate uploads', async () => {
  const api = backend(), complete = vi.fn();
  const h = renderHook(() => useUploadQueue({ recoveryScope: 'test_owner', scopeKey: 'strict', createClient: api.createClient, onComplete: complete, autoClear: false }),
    { wrapper: StrictMode });
  await act(async () => {});
  act(() => h.result.current.addFiles([file()], { storageId: 'storage_a', maxUploadBytes: 4, transfers: limits }));
  await waitFor(() => expect(h.result.current.items[0]?.status).toBe('success'));
  expect(complete).toHaveBeenCalledTimes(1);
});

it('serializes several parts per logical session and uses server-reconciled progress between parts', async () => {
  const h = setup(); const second = deferred();
  const size = limits.partSizeBytes + 2;
  h.api.hooks.part = (id, source, number) => number === 2 ? second.promise : undefined;
  h.add([file('two-parts', size)]);
  await waitFor(() => expect(h.api.calls.filter(c => c.name === 'part')).toHaveLength(2));
  expect(h.result.current.items[0].acknowledgedBytes).toBe(limits.partSizeBytes);
  expect(h.result.current.items[0].completedParts).toBe(1);
  const names = h.api.calls.map(c => c.name);
  const parts = names.flatMap((name, i) => name === 'part' ? [i] : []);
  expect(names.slice(parts[0] + 1, parts[1])).toContain('parts');
  await act(async () => second.resolve()); await waitFor(() => expect(h.status()).toBe('success'));
  expect(h.result.current.items[0].completedParts).toBe(2);
});

it('explicit pause during retry_wait prevents scheduled automatic retry', async () => {
  const h = setup({ waitForRetry: (attempt, signal) => untilAbort(signal) });
  h.api.hooks.part = () => { throw err('NETWORK_INTERRUPTION'); };
  const [id] = h.add(); await waitFor(() => expect(h.status()).toBe('recovering_connection'));
  act(() => h.result.current.pauseUpload(id)); await waitFor(() => expect(h.status()).toBe('paused'));
  expect(h.api.calls.filter(c => c.name === 'part')).toHaveLength(1);
});

it('uncertain pause only becomes paused after server confirmation; failures need explicit retry', async () => {
  const h = setup(); h.api.hooks.part = (id, source, number, signal) => untilAbort(signal);
  const [id] = h.add(); await waitFor(() => expect(h.api.calls.some(c => c.name === 'part')).toBe(true));
  h.api.hooks.pause = () => { throw err('NETWORK_INTERRUPTION'); };
  act(() => h.result.current.pauseUpload(id)); await waitFor(() => expect(h.status()).toBe('error'));
  expect(h.result.current.items[0].pendingAction).toBe('pause');
  expect(h.api.calls.filter(c => c.name === 'pause')).toHaveLength(1);
  h.api.hooks.pause = id => { h.api.sessions.get(id).state = 'paused'; throw err('NETWORK_INTERRUPTION'); };
  act(() => h.result.current.retryUpload(id)); await waitFor(() => expect(h.status()).toBe('paused'));
  expect(h.api.calls.filter(c => c.name === 'part')).toHaveLength(1);
});

it('create recovery preserves stable identity and version conflicts reconcile before continuing', async () => {
  const h = setup({ waitForRetry: async () => {} }); let createFailed = false, partFailed = false;
  h.api.hooks.create = () => { if (!createFailed) { createFailed = true; throw err('NETWORK_INTERRUPTION'); } };
  h.api.hooks.part = () => { if (!partFailed) { partFailed = true; throw err('VERSION_CONFLICT'); } };
  h.add(); await waitFor(() => expect(h.status()).toBe('success'));
  const creates = h.api.calls.filter(c => c.name === 'create');
  expect(creates).toHaveLength(2);
  expect(creates[0].args).toEqual(creates[1].args);
  expect(h.api.sessions.size).toBe(1);
  expect(h.api.calls.filter(c => c.name === 'reconcile')).toHaveLength(2);
});

it('cancellation racing completed publication recovers success once, never cancelled', async () => {
  const h = setup(); h.api.hooks.part = (id, source, n, signal) => untilAbort(signal);
  const [id] = h.add(); await waitFor(() => expect(h.api.calls.some(c => c.name === 'part')).toBe(true));
  h.api.hooks.cancel = id => {
    const s = h.api.sessions.get(id); s.state = 'completed'; s.object = { objectId: 'published' };
    throw err('VERSION_CONFLICT');
  };
  act(() => h.result.current.cancelUpload(id)); await waitFor(() => expect(h.status()).toBe('success'));
  expect(h.options.onComplete).toHaveBeenCalledTimes(1);
});

it('permission errors stop new upload writes but creator cancellation remains available', async () => {
  const h = setup({ maxConcurrency: 1 });
  h.api.hooks.part = () => { throw err('PERMISSION_REVOKED'); };
  const [first] = h.add([file('first'), file('second')]);
  await waitFor(() => expect(h.result.current.items.every(item => item.status === 'error')).toBe(true));
  expect(h.api.sessions.size).toBe(1);
  act(() => h.result.current.cancelUpload(first)); await waitFor(() => expect(h.status()).toBe('cancelled'));
  expect(h.api.calls.filter(c => c.name === 'cancel')).toHaveLength(1);
});

it('a known permission change aborts local requests immediately while retaining creator cleanup', async () => {
  const h = setup({ canUpload: () => true });
  h.api.hooks.part = (id, source, n, signal) => untilAbort(signal);
  const [id] = h.add(); await waitFor(() => expect(h.api.calls.some(c => c.name === 'part')).toBe(true));
  h.rerender({ ...h.options, canUpload: () => false });
  await waitFor(() => expect(h.status()).toBe('error'));
  expect(h.api.signals[0].aborted).toBe(true);
  expect(h.result.current.items[0].errorCode).toBe('PERMISSION_REVOKED');
  act(() => h.result.current.cancelUpload(id)); await waitFor(() => expect(h.status()).toBe('cancelled'));
});

it('fails closed without Web Locks while preserving the small-file path', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  const h = setup(); h.add();
  await waitFor(() => expect(h.status()).toBe('waiting_ownership'));
  expect(h.api.calls).toEqual([]);
  h.add([file('small', 2)]);
  await waitFor(() => expect(h.result.current.items[1].status).toBe('success'));
});

it('requires public user identity to prove multipart ownership', async () => {
  const h = setup({ recoveryScope: null }); h.add();
  await waitFor(() => expect(h.status()).toBe('waiting_ownership'));
  expect(h.api.calls).toEqual([]);
});

it('offline part interruption preserves session; online reconciles and completes once', async () => {
  let online = true;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  const h = setup({ waitForRetry: vi.fn(async () => {}) });
  let interrupted = false;
  h.api.hooks.part = async (id, source, number, signal) => {
    if (interrupted) return;
    interrupted = true; online = false; window.dispatchEvent(new Event('offline')); await untilAbort(signal);
  };
  h.add();
  await waitFor(() => expect(h.status()).toBe('waiting_network'));
  const creates = h.api.calls.filter(c => c.name === 'create'); expect(creates).toHaveLength(1);
  online = true; act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(h.status()).toBe('success'));
  expect(h.api.calls.filter(c => c.name === 'create')).toHaveLength(1);
  expect(h.options.onComplete).toHaveBeenCalledTimes(1);
  expect(h.options.waitForRetry).toHaveBeenCalledTimes(1);
});

it('explicit Pause while offline cannot automatically resume on online; Cancel remains explicit', async () => {
  let online = false;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  const h = setup({ waitForRetry: vi.fn(async () => {}) }); const [id] = h.add();
  await waitFor(() => expect(h.status()).toBe('waiting_network'));
  act(() => h.result.current.pauseUpload(id));
  await waitFor(() => expect(h.status()).toBe('paused'));
  online = true; act(() => window.dispatchEvent(new Event('online')));
  await act(async () => {}); expect(h.status()).toBe('paused'); expect(h.api.calls).toEqual([]);
  act(() => h.result.current.cancelUpload(id)); expect(h.status()).toBe('cancelled');
});

it('unstable online events share a bounded budget and exponential attempts instead of restarting retries', async () => {
  let online = true;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  const wait = vi.fn(async () => {}), h = setup({ waitForRetry: wait });
  h.api.hooks.part = async (id, source, number, signal) => {
    online = false; window.dispatchEvent(new Event('offline')); await untilAbort(signal);
  };
  h.add();
  for (let i = 0; i < 2; i++) {
    await waitFor(() => expect(h.status()).toBe('waiting_network'));
    online = true; act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(h.api.calls.filter(c => c.name === 'part')).toHaveLength(i + 2));
  }
  await waitFor(() => expect(h.status()).toBe('waiting_network'));
  online = true; act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(h.status()).toBe('error'));
  expect(h.result.current.items[0].retryable).toBe(true);
  expect(wait.mock.calls.map(call => call[0])).toEqual([0, 1]);
  act(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('online')); });
  await act(async () => {}); expect(h.api.calls.filter(c => c.name === 'part')).toHaveLength(3);
});

it('Cancel interrupts connection backoff and confirms the same server session without sending more parts', async () => {
  let online = true;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  const h = setup({ waitForRetry: (attempt, signal) => untilAbort(signal) });
  h.api.hooks.part = async (id, source, number, signal) => {
    online = false; window.dispatchEvent(new Event('offline')); await untilAbort(signal);
  };
  const [id] = h.add(); await waitFor(() => expect(h.status()).toBe('waiting_network'));
  online = true; act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(h.status()).toBe('recovering_connection'));
  act(() => h.result.current.cancelUpload(id));
  await waitFor(() => expect(h.status()).toBe('cancelled'));
  expect(h.api.calls.filter(c => c.name === 'part')).toHaveLength(1);
  expect(h.api.calls.filter(c => c.name === 'create')).toHaveLength(1);
  expect(h.api.calls.filter(c => c.name === 'cancel')).toHaveLength(1);
});

it('permission revocation during offline wait blocks automatic network resume', async () => {
  let online = true, permitted = true;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  const h = setup({ canUpload: () => permitted, waitForRetry: vi.fn(async () => {}) });
  h.api.hooks.part = async (id, source, number, signal) => {
    online = false; window.dispatchEvent(new Event('offline')); await untilAbort(signal);
  };
  h.add(); await waitFor(() => expect(h.status()).toBe('waiting_network'));
  permitted = false; online = true; act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(h.status()).toBe('error'));
  expect(h.result.current.items[0].retryable).toBe(false);
  expect(h.api.calls.filter(c => c.name === 'part')).toHaveLength(1);
});

it('Pause during an interrupted active part confirms pause on online without uploading another part', async () => {
  let online = true;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  const h = setup({ waitForRetry: vi.fn(async () => {}) });
  h.api.hooks.part = async (id, source, number, signal) => {
    online = false; window.dispatchEvent(new Event('offline')); await untilAbort(signal);
  };
  const [id] = h.add(); await waitFor(() => expect(h.status()).toBe('waiting_network'));
  act(() => h.result.current.pauseUpload(id));
  await waitFor(() => expect(h.status()).toBe('waiting_network'));
  online = true; act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(h.status()).toBe('paused'));
  expect(h.api.calls.filter(c => c.name === 'part')).toHaveLength(1);
  expect(h.api.calls.filter(c => c.name === 'pause')).toHaveLength(1);
  expect(h.api.calls.filter(c => c.name === 'resume')).toHaveLength(0);
});

it.each(['SESSION_EXPIRED', 'AUTHENTICATION_FAILURE'])('network reconciliation stops on %s without new parts', async code => {
  let online = true;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  const h = setup({ waitForRetry: vi.fn(async () => {}) });
  h.api.hooks.part = async (id, source, number, signal) => {
    online = false; window.dispatchEvent(new Event('offline')); await untilAbort(signal);
  };
  h.add(); await waitFor(() => expect(h.status()).toBe('waiting_network'));
  h.api.hooks.reconcile = () => { throw err(code); };
  online = true; act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(h.status()).toBe(code === 'SESSION_EXPIRED' ? 'expired' : 'error'));
  expect(h.api.calls.filter(c => c.name === 'part')).toHaveLength(1);
  expect(h.api.calls.filter(c => c.name === 'create')).toHaveLength(1);
  expect(h.options.onUnauthorized).toHaveBeenCalledTimes(code === 'AUTHENTICATION_FAILURE' ? 1 : 0);
});

it('a quick online event during abort settlement still reconciles instead of stranding the task', async () => {
  let first = true;
  const h = setup({ waitForRetry: vi.fn(async () => {}) });
  h.api.hooks.part = async (id, source, number, signal) => {
    if (!first) return;
    first = false;
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    await untilAbort(signal);
  };
  h.add(); await waitFor(() => expect(h.status()).toBe('success'));
  expect(h.api.calls.filter(c => c.name === 'create')).toHaveLength(1);
  expect(h.options.onComplete).toHaveBeenCalledTimes(1);
});

it('manual Retry cannot bypass a long server Retry-After by constructing a new client', async () => {
  const h = setup({ waitForRetry: vi.fn(async () => {}) });
  h.api.hooks.part = () => { throw Object.assign(err('RATE_LIMITED'), { retryAfterMs: 600000 }); };
  const [id] = h.add(); await waitFor(() => expect(h.status()).toBe('error'));
  const calls = h.api.calls.length;
  act(() => h.result.current.retryUpload(id));
  await waitFor(() => expect(h.status()).toBe('error'));
  expect(h.api.calls.length).toBe(calls);
  expect(h.options.waitForRetry).not.toHaveBeenCalled();
});

it('work queued while already offline needs explicit Resume and cannot create a session on online', async () => {
  let online = false;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  const h = setup({ waitForRetry: vi.fn(async () => {}) });
  const [id] = h.add(); await waitFor(() => expect(h.status()).toBe('waiting_network'));
  online = true; act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(h.status()).toBe('paused'));
  expect(h.api.calls).toEqual([]);
  act(() => h.result.current.resumeUpload(id));
  await waitFor(() => expect(h.status()).toBe('success'));
  expect(h.api.calls.filter(c => c.name === 'create')).toHaveLength(1);
});

it('measures only acknowledged byte deltas and clears speed on pause', async () => {
  let clock = 0;
  const time = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const h = setup(); const gate = deferred();
  try {
    h.api.hooks.part = async (id, source, number, signal) => {
      if (number === 1) clock = 2000;
      else await untilAbort(signal);
    };
    h.add([file('measured.bin', limits.partSizeBytes + 10)]);
    await waitFor(() => expect(h.result.current.items[0]?.completedParts).toBe(1));
    expect(h.result.current.items[0].bytesPerSecond).toBe(limits.partSizeBytes / 2);
    expect(h.result.current.items[0].etaSeconds).toBeCloseTo(10 / (limits.partSizeBytes / 2));
    act(() => h.result.current.pauseUpload(h.result.current.items[0].id));
    await waitFor(() => expect(h.status()).toBe('paused'));
    expect(h.result.current.items[0].bytesPerSecond).toBeNull();
    expect(h.result.current.items[0].etaSeconds).toBeNull();
  } finally { gate.resolve(); h.unmount(); time.mockRestore(); }
});


it('rejects files larger than the decimal 5 GB application limit', () => {
  const transfers = { resumableUpload: true, maxFileBytes: 10 * 1024 ** 3, partSizeBytes: 8 * 1024 ** 2, maxParts: 1280, maxParallelParts: 1, sessionTtlSeconds: 604800 };
  expect(selectUploadStrategy(5_000_000_000, 10, transfers).strategy).toBe('multipart');
  expect(selectUploadStrategy(5_000_000_001, 10, transfers).error).toBe('UPLOAD_TOO_LARGE');
});
