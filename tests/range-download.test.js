import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeDownloadResponse, downloadRequestHeaders } from '../functions/_lib/range-download.js';
import { createStorageClient } from '../functions/_lib/storage-client.js';
const etag = '"' + 'a'.repeat(64) + '"';
const url = 'https://nexora.test/download';
function fixture({ status = 206, bytes = '345', headers = {}, body } = {}) {
  const state = { aborts: 0, cleanups: 0, cancels: 0 };
  const stream = body || new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(bytes)); c.close(); }, cancel() { state.cancels++; } });
  return { state, response: new Response(stream, { status, headers: { 'Content-Length': '3', 'Content-Range': 'bytes 3-5/10', 'Accept-Ranges': 'bytes', ETag: etag, ...headers } }),
    abort() { state.aborts++; }, cleanup() { state.cleanups++; } };
}
test('proxy preserves 206 metadata and checks exact body length', async () => {
  const result = fixture();
  const response = rangeDownloadResponse(result, new Request(url, { headers: { Range: 'bytes=3-5', 'If-Range': etag } }));
  assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), 'bytes 3-5/10');
  assert.equal(response.headers.get('etag'), etag); assert.equal(await response.text(), '345');
  assert.equal(result.state.cleanups, 1);
});
test('proxy rejects geometry, unsafe validators and mismatched If-Range before reading', () => {
  for (const headers of [{ 'Content-Length':'4' }, { 'Content-Range':'bytes 4-6/10' }, { 'Content-Range':'bytes 3-10/10' }, { ETag:'"provider-internals"' }, { 'Accept-Ranges':'none' }]) {
    const result = fixture({headers});
    assert.throws(() => rangeDownloadResponse(result,new Request(url,{headers:{Range:'bytes=3-5'}})),{code:'PROVIDER_UNAVAILABLE'});
    assert.equal(result.state.aborts,1);
  }
  assert.throws(() => rangeDownloadResponse(fixture(),new Request(url,{headers:{Range:'bytes=3-5','If-Range':'"old"'}})),{code:'PROVIDER_UNAVAILABLE'});
});
test('HEAD and 416 forward metadata without a body and release resources', async () => {
  for (const [method,status,headers] of [['HEAD',200,{'Content-Range':'','Content-Length':'10'}],['GET',416,{'Content-Range':'bytes */10','Content-Length':'0'}]]) {
    const result = fixture({ status, headers: { ...headers, 'Content-Range': headers['Content-Range'] || undefined } });
    if (method === 'HEAD') result.response.headers.delete('Content-Range');
    const response = rangeDownloadResponse(result,new Request(url,{method,headers:{Range:'bytes=10-'}}));
    assert.equal(response.status,status); assert.equal(await response.text(),''); assert.equal(result.state.aborts,1);
  }
});
test('proxy detects truncated and excessive data and propagates browser cancellation', async () => {
  for (const bytes of ['3','3456']) {
    const result = fixture({bytes});
    await assert.rejects(rangeDownloadResponse(result,new Request(url,{headers:{Range:'bytes=3-5'}})).text(),{code:'TRANSFER_INCOMPLETE'});
    assert.equal(result.state.aborts,1);
  }
  let cancelled = false;
  const result = fixture({body:new ReadableStream({cancel(){cancelled=true;}})});
  await rangeDownloadResponse(result,new Request(url,{headers:{Range:'bytes=3-5'}})).body.cancel();
  assert.ok(cancelled); assert.equal(result.state.aborts,1);
});
test('download client allowlists protocol headers and stops connection deadline at headers', async () => {
  let captured;
  const env = { STORAGE_API_URL:'https://storage.test',STORAGE_APP_SECRET:'server-only',CF_ACCESS_CLIENT_ID:'test-id',CF_ACCESS_CLIENT_SECRET:'test-secret',STORAGE_TIMEOUT_MS:100 };
  const client = createStorageClient({env,fetchImpl:async (_url,init)=>{captured=init;return new Response('data');}});
  const request = new Request(url,{headers:{Range:'bytes=0-','If-Range':etag,Cookie:'private-cookie',Authorization:'browser-secret','X-Other':'bad'}});
  const result = await client.request({request,projectId:'project-test',path:'/objects/object-test/download',operation:'download',requestHeaders:downloadRequestHeaders(request)});
  assert.equal(captured.headers.get('Range'),'bytes=0-'); assert.equal(captured.headers.get('If-Range'),etag);
  assert.equal(captured.headers.get('Cookie'),null);assert.equal(captured.headers.get('X-Other'),null);
  assert.equal(captured.headers.get('Authorization'),'Bearer server-only');
  await new Promise(resolve=>setTimeout(resolve,130));
  assert.equal(captured.signal.aborted,false);result.abort();result.cleanup();
});

test('range capability requires explicit provider support and ordinary download', async () => {
  const {normalizeCapabilities} = await import('../functions/_lib/storage-client.js');
  for(const [caps,expected] of [[{download:true},false],[{download:true,rangeRead:'true'},false],[{download:false,rangeRead:true},false],[{download:true,rangeRead:true},true]]) {
    assert.equal(normalizeCapabilities(caps,{read_only:0}).rangeRead,expected);
  }
});
