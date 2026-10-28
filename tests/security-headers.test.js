import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { onRequest } from '../functions/_middleware.js';

const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('static asset rules retain the non-CSP security headers', () => {
  assert.match(headers, /Strict-Transport-Security: max-age=31536000/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Permissions-Policy:/);
});

test('HTML responses receive a per-response restrictive nonce CSP and no-store caching', async () => {
  const request = new Request('https://nexora.example.test/', { method: 'GET' });
  const next = async () => new Response('<!doctype html><html></html>', {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'ETag': 'static-html-tag',
    },
  });

  const [first, second] = await Promise.all([
    onRequest({ request, next }),
    onRequest({ request, next }),
  ]);
  const csp = first.headers.get('Content-Security-Policy');
  const scriptSrc = csp.match(/(?:^|;\s*)script-src\s+([^;]+)/)?.[1];
  assert.ok(scriptSrc?.startsWith("'self'"));
  assert.match(scriptSrc, /https:\/\/static\.cloudflareinsights\.com/);
  assert.match(scriptSrc, /'nonce-[A-Za-z0-9+/]+=*'/);
  assert.doesNotMatch(scriptSrc, /'unsafe-inline'|'unsafe-eval'/);
  assert.match(csp, /frame-src blob:/);
  assert.notEqual(csp, second.headers.get('Content-Security-Policy'));
  assert.equal(first.headers.get('Cache-Control'), 'no-store');
  assert.equal(first.headers.get('ETag'), null);
  assert.equal(first.headers.get('Strict-Transport-Security'), 'max-age=31536000');
  assert.equal(first.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(first.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.ok(first.headers.has('Permissions-Policy'));
});

test('non-HTML and non-read responses pass through unchanged', async () => {
  const response = Response.json({ ok: true });
  const actual = await onRequest({
    request: new Request('https://nexora.example.test/api/auth/me'),
    next: async () => response,
  });
  assert.equal(actual, response);
  assert.equal(actual.headers.get('Content-Security-Policy'), null);
});

test('app HTML template does not contain inline executable scripts', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  assert.ok(scripts.length > 0, 'expected the app entry scripts');
  for (const [, attributes, body] of scripts) {
    assert.match(attributes, /\bsrc\s*=/i, 'every script in the app template must be external');
    assert.equal(body.trim(), '', 'external script tags must not contain inline code');
  }
});
