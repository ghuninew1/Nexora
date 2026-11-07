import { createCipheriv, createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { openSync, closeSync, writeFileSync, renameSync, fsyncSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';

export const MiB = 1024 ** 2;
export const GiB = 1024 ** 3;
export const PART_BYTES = 8 * MiB;
export const SCENARIOS = Object.freeze([
  'isolated-provider-preflight', 'upload-100MiB', 'upload-1GiB', 'upload-10GiB',
  'interruption-same-session', 'shared-process-restart-resume', 'lost-create-ack',
  'lost-part-ack-retry', 'lost-complete-ack-duplicate-completion', 'cancel-abort',
  'expiration-cleanup-clock-advanced', 'concurrent-files', 'no-partial-publication',
  'final-provider-cleanup', 'resource-budgets', 'proxy-request-path', 'proxy-slow-part-timeout',
  'production-resource-retention-gates',
]);
export class AcceptanceError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export const check = (condition, code = 'ASSERTION_FAILED') => { if (!condition) throw new AcceptanceError(code); };
export function endpoint(value) {
  const url = new URL(value);
  check((url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))
    && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'UNSAFE_ENDPOINT');
  return url.origin;
}
export function validateConfig(value) {
  const allowed = ['isolatedTestResources','endpoint','region','bucket','confirmDisposableBucket','sharedStorageRoot','dependencyRoot',
    'maxLogicalBytes','sizesMiB','concurrentFiles','maxParentRssBytes','maxSharedRssBytes','sharedPort','nexoraPort',
    'sharedProxyUrl','nexoraProxyUrl','slowPartSeconds','operatorProviderVersion'];
  check(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => allowed.includes(k)), 'INVALID_CONFIG_KEYS');
  check(value.isolatedTestResources === true, 'ISOLATION_NOT_CONFIRMED');
  check(/^nexora-acceptance-[a-z0-9][a-z0-9-]{5,39}$/u.test(value.bucket || '') && value.bucket === value.confirmDisposableBucket, 'DISPOSABLE_BUCKET_NOT_CONFIRMED');
  const config = { ...value, endpoint: endpoint(value.endpoint), region: value.region || 'garage',
    sizesMiB: value.sizesMiB ?? [100,1024,10240], concurrentFiles: value.concurrentFiles ?? 2,
    sharedPort: value.sharedPort ?? 0, nexoraPort: value.nexoraPort ?? 0, slowPartSeconds: value.slowPartSeconds ?? 0 };
  check(typeof config.region === 'string' && /^[A-Za-z0-9_-]{1,64}$/u.test(config.region), 'INVALID_REGION');
  check(Array.isArray(config.sizesMiB) && config.sizesMiB.includes(100) && new Set(config.sizesMiB).size === config.sizesMiB.length
    && config.sizesMiB.every(n => [100,1024,10240].includes(n)), 'INVALID_SIZES');
  check(Number.isSafeInteger(config.maxLogicalBytes) && config.maxLogicalBytes >= 100 * MiB, 'CAPACITY_NOT_CONFIRMED');
  check(Number.isInteger(config.concurrentFiles) && config.concurrentFiles >= 2 && config.concurrentFiles <= 4, 'INVALID_CONCURRENCY');
  for (const name of ['maxParentRssBytes','maxSharedRssBytes']) check(Number.isSafeInteger(config[name]) && config[name] >= 64 * MiB, 'MEMORY_BUDGET_NOT_CONFIRMED');
  for (const name of ['sharedPort','nexoraPort']) check(Number.isInteger(config[name]) && config[name] >= 0 && config[name] <= 65535, 'INVALID_PORT');
  check(Number.isInteger(config.slowPartSeconds) && (config.slowPartSeconds === 0 || (config.slowPartSeconds >= 30 && config.slowPartSeconds <= 210)), 'INVALID_SLOW_PROBE');
  check(typeof config.sharedStorageRoot === 'string' && config.sharedStorageRoot.length > 0, 'SHARED_SOURCE_REQUIRED');
  config.sharedStorageRoot = resolve(config.sharedStorageRoot);
  if (config.dependencyRoot) config.dependencyRoot = resolve(config.dependencyRoot);
  for (const name of ['sharedProxyUrl','nexoraProxyUrl']) if (config[name]) config[name] = endpoint(config[name]);
  if (config.sharedProxyUrl) check(config.sharedPort > 0, 'PROXY_REQUIRES_FIXED_PORT');
  if (config.nexoraProxyUrl) check(config.nexoraPort > 0, 'PROXY_REQUIRES_FIXED_PORT');
  return config;
}
export function fingerprint(endpointValue, bucket) {
  return createHash('sha256').update(JSON.stringify([endpointValue,bucket])).digest('hex');
}
export function privateJson(path, value) {
  const tmp = `${path}.writing`;
  const fd = openSync(tmp, 'w', 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2)); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, path);
  const directory = openSync(dirname(path), 'r');
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
export function syntheticPart(seed, number, length) {
  check(typeof seed === 'string' && Number.isInteger(number) && number >= 1 && Number.isInteger(length) && length > 0 && length <= PART_BYTES, 'INVALID_SYNTHETIC_PART');
  const key = createHash('sha256').update(seed).digest();
  const iv = Buffer.alloc(16);
  iv.writeBigUInt64BE(BigInt(number) << 32n, 8);
  return createCipheriv('aes-256-ctr', key, iv).update(Buffer.alloc(length));
}
export function d1(database) {
  return {
    async batch(statements) {
      database.exec('BEGIN');
      try { const out=[]; for (const statement of statements) out.push(await statement.run()); database.exec('COMMIT'); return out; }
      catch (error) { database.exec('ROLLBACK'); throw error; }
    },
    prepare(sql) { return { bind(...values) { return {
      async first() { return database.prepare(sql).get(...values) ?? null; },
      async all() { return { results: database.prepare(sql).all(...values) }; },
      async run() { return { success: true, meta: database.prepare(sql).run(...values) }; },
    }; } }; },
  };
}
export async function webServer(handler, { port = 0, publicOrigin, identity } = {}) {
  const server = createServer(async (req, res) => {
    if (req.url === '/__acceptance__/identity') {
      res.writeHead(200, { 'Content-Type':'application/json', 'Cache-Control':'no-store' });
      res.end(JSON.stringify(identity)); return;
    }
    const controller = new AbortController();
    req.once('aborted', () => controller.abort());
    res.once('close', () => { if (!res.writableFinished) controller.abort(); });
    try {
      const request = new Request(`${publicOrigin || `http://127.0.0.1:${server.address().port}`}${req.url}`, {
        method: req.method, headers: req.headers, signal:controller.signal,
        ...(['GET','HEAD'].includes(req.method) ? {} : { body:Readable.toWeb(req), duplex:'half' }),
      });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        const stream = Readable.fromWeb(response.body);
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        stream.pipe(res);
      } else res.end();
    } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
  });
  await new Promise((resolveReady, reject) => { server.once('error',reject); server.listen(port,'127.0.0.1',resolveReady); });
  return server;
}
export async function closeServer(server) {
  if (!server) return;
  server.closeIdleConnections();
  const closed = new Promise(resolveClosed => server.close(resolveClosed));
  server.closeAllConnections();
  await closed;
}
export function blockedReport(reason = 'NO_ISOLATED_PROVIDER_CONFIG') {
  return { schemaVersion:1, evidence:'not-run', productionFlagsChanged:false, generatedAt:new Date().toISOString(),
    scenarios:SCENARIOS.map(id => ({ id, status:'BLOCKED', reason })), measurements:null };
}
export async function scenario(report, id, action) {
  const started = performance.now();
  try {
    const details = await action();
    Object.assign(report.scenarios.find(s => s.id === id), { status:'PASS', reason:undefined, durationMs:Math.round(performance.now()-started), ...details });
    return true;
  } catch (error) {
    Object.assign(report.scenarios.find(s => s.id === id), { status:'FAIL', reason:error instanceof AcceptanceError ? error.code : 'SCENARIO_ERROR', durationMs:Math.round(performance.now()-started) });
    return false;
  }
}
export function reportMarkdown(report) {
  const lines=['# Isolated large-file acceptance results','',`Evidence: **${report.evidence}**`, '', '| Scenario | Status | Reason |','| --- | --- | --- |'];
  for (const s of report.scenarios) lines.push(`| ${s.id} | ${s.status} | ${s.reason || 'Observed assertions passed; see JSON measurements'} |`);
  lines.push('', 'No production configuration or application feature flag was changed.', '', '```json',JSON.stringify(report.measurements,null,2),'```','');
  return lines.join('\n');
}
