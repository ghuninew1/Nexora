// Small deterministic IDB protocol double. Native IDB is additionally checked in browser QA.
export function memoryIndexedDB() {
  const data = new Map(), scopes = [];
  const factory = { failOpen: false, failWrite: false, closed: false, scopes,
    seed: row => data.set(JSON.stringify([row.userScope,row.id]), structuredClone(row)),
    rows: () => [...data.values()].map(row => structuredClone(row)),
    open() {
      const request = {};
      queueMicrotask(() => {
        if (factory.failOpen) { request.onerror?.(); return; }
        const db = { objectStoreNames: { contains: () => true }, close: () => { factory.closed = true; }, transaction() {
          const snapshot = new Map(data);
          let pending = 0, stopped = false, timer;
          const tx = { error: null, abort() {
            if (stopped) return; stopped = true; clearTimeout(timer);
            data.clear(); for (const [k,v] of snapshot) data.set(k,v);
            tx.onabort?.();
          } };
          const complete = () => {
            clearTimeout(timer);
            timer = setTimeout(() => { if (!pending && !stopped) { stopped = true; tx.oncomplete?.(); } }, 0);
          };
          const run = fn => {
            pending++;
            queueMicrotask(() => {
              if (stopped) return;
              try { fn(); } catch (error) { tx.error = error; tx.abort(); return; }
              pending--; complete();
            });
          };
          const remove = key => run(() => data.delete(JSON.stringify(key)));
          const store = { put(value) { run(() => {
            if (factory.failWrite) throw new DOMException('test quota','QuotaExceededError');
            data.set(JSON.stringify([value.userScope,value.id]), structuredClone(value));
          }); }, delete: remove,
          index() { return { openCursor(scope) {
            scopes.push(scope);
            const request = {}, entries = [...data.entries()].filter(([,v]) => v.userScope === scope);
            let index = 0;
            const next = () => run(() => {
              const entry = entries[index++];
              request.result = entry ? { value: structuredClone(entry[1]), primaryKey: JSON.parse(entry[0]),
                continue: next, delete: () => remove(JSON.parse(entry[0])) } : null;
              request.onsuccess?.();
            });
            next(); return request;
          } }; } };
          tx.objectStore = () => store;
          complete(); return tx;
        } };
        request.result = db; request.onsuccess?.();
      });
      return request;
    } };
  return factory;
}
