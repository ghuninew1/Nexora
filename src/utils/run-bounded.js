export async function runBounded(items, limit, worker, onProgress) {
  const results = new Array(items.length);
  let next = 0;
  let completed = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = await worker(items[index]); }
      catch (error) { results[index] = { ok: false, error }; }
      completed += 1;
      onProgress?.(completed);
    }
  }));
  return results;
}
