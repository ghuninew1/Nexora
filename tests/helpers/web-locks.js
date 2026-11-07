// Deterministic Web Locks protocol double: shared authority, FIFO, abortable waiters.
export function memoryWebLocks() {
  const held = new Set(), queues = new Map();
  function request(name, options, callback) {
    if (options.ifAvailable && options.signal) throw new TypeError('ifAvailable with signal');
    return new Promise((resolve, reject) => {
      const queue = queues.get(name) || [];
      queues.set(name, queue);
      const abort = () => { const i = queue.indexOf(start); if (i >= 0) queue.splice(i, 1); reject(new DOMException('Aborted', 'AbortError')); };
      const start = () => {
        options.signal?.removeEventListener('abort', abort);
        if (options.signal?.aborted) return abort();
        held.add(name);
        Promise.resolve().then(() => callback({ name, mode: 'exclusive' })).then(resolve, reject).finally(() => {
          held.delete(name); queue.shift()?.();
        });
      };
      if (options.signal?.aborted) return abort();
      if (held.has(name)) {
        if (options.ifAvailable) { Promise.resolve().then(() => callback(null)).then(resolve, reject); return; }
        queue.push(start); options.signal?.addEventListener('abort', abort, { once: true });
      } else start();
    });
  }
  return { request, held };
}
