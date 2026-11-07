/** Web Locks are the sole authority. Unsupported contexts fail closed (no timestamp leases). */
export async function withUploadOwnership({ userScope, identity, signal, onWaiting, locks = globalThis.navigator?.locks }, operation) {
  if (!locks?.request || !userScope || !identity) {
    throw Object.assign(new Error('Exclusive upload ownership is unavailable'), { code: 'OWNERSHIP_UNAVAILABLE' });
  }
  const name = `nexora-upload:${JSON.stringify([userScope, identity])}`;
  // Probe without stealing; the queued request is the authority for safe takeover.
  let acquired = false;
  let result;
  await locks.request(name, { mode: 'exclusive', ifAvailable: true }, async lock => {
    if (!lock) return;
    acquired = true;
    if (signal.aborted) throw Object.assign(new Error('Aborted'), { code: 'ABORTED' });
    result = await operation();
  });
  if (acquired) return result;
  onWaiting?.();
  return locks.request(name, { mode: 'exclusive', signal }, async () => {
    if (signal.aborted) throw Object.assign(new Error('Aborted'), { code: 'ABORTED' });
    return operation();
  });
}

export function retryAfterMilliseconds(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const seconds = /^\d+(?:\.\d+)?$/u.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(2147483647, seconds) : 0;
}

/** Five origin-wide multipart workers. Individual queues retain their smaller preferences. */
export async function withUploadBudget(signal, operation, locks = globalThis.navigator?.locks) {
  if (!locks?.request) throw Object.assign(new Error('No authority'), { code: 'OWNERSHIP_UNAVAILABLE' });
  for (let slot = 0; slot < 5; slot++) {
    let acquired = false, result;
    await locks.request(`nexora-upload-budget:${slot}`, { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (!lock) return;
      acquired = true;
      if (signal.aborted) throw Object.assign(new Error('Aborted'), { code: 'ABORTED' });
      result = await operation();
    });
    if (acquired) return result;
  }
  return locks.request('nexora-upload-budget:0', { mode: 'exclusive', signal }, async () => {
    if (signal.aborted) throw Object.assign(new Error('Aborted'), { code: 'ABORTED' });
    return operation();
  });
}
