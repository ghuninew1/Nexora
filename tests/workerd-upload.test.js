import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Use Wrangler's installed runtime/build dependencies; no remote resource or
// separately installed package. Local workerd does not enforce production CPU quotas.
const require = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { build } = require('esbuild');

test('real workerd native part stream is exact, checksum preserving and rejects invalid bodies', async () => {
  const source = `import { exactPartStream } from ${JSON.stringify(new URL('../functions/_lib/upload-sessions.js', import.meta.url).pathname)};
    export default {fetch(request) {
      if (typeof FixedLengthStream !== 'function') throw Error('native stream unavailable');
      const size = Number(new URL(request.url).searchParams.get('size'));
      // Native piping must bypass any JS getReader/chunk-counting loop.
      Object.defineProperty(request.body, 'getReader', {value() {throw Error('JS reader used');}});
      return new Response(exactPartStream(request.body, size));
    }};`;
  const built = await build({ stdin: { contents: source, resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, format: 'esm', platform: 'browser' });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: built.outputFiles[0].text, compatibilityDate: '2026-10-06' }));
  try {
    const size = 8 * 1024 ** 2, bytes = new Uint8Array(size);
    bytes.fill(93);
    const expected = createHash('sha256').update(bytes).digest('hex');
    const response = await mf.dispatchFetch(`http://local/?size=${size}`, { method: 'PUT', body: bytes });
    assert.equal(response.status, 200);
    const hash = createHash('sha256'); let received = 0;
    for await (const chunk of response.body) { hash.update(chunk); received += chunk.byteLength; }
    assert.equal(received, size); assert.equal(hash.digest('hex'), expected);
    for (const length of [2, 4]) {
      await assert.rejects(async () => {
        const invalid = await mf.dispatchFetch('http://local/?size=3', { method: 'PUT', body: new Uint8Array(length) });
        if (!invalid.ok) throw Error('invalid stream rejected');
        await invalid.arrayBuffer();
      });
    }
  } finally { await mf.dispose(); }
});
