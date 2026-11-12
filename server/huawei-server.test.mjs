import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHuaweiServer } from './huawei-server.mjs';

async function withServer(options, run) {
  const server = createHuaweiServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}/api/legacyshift/huawei`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const request = { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:4211' }, body: JSON.stringify({ question: 'Explica las reglas', context: { findings: [] } }) };

test('requires server configuration and does not call the provider', async () => {
  await withServer({ apiKey: '', model: '', fetchImpl: () => { throw new Error('Must not call'); } }, async url => {
    const response = await fetch(url, request);
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Configura/);
  });
});
test('rejects untrusted browser origins', async () => {
  await withServer({ apiKey: 'server-only', model: 'test-model' }, async url => {
    const response = await fetch(url, { ...request, headers: { ...request.headers, Origin: 'https://untrusted.example' } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  });
});
test('adds credentials on the server and returns only the answer', async () => {
  let calls = 0;
  await withServer({ apiKey: 'server-only', model: 'test-model', fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api-ap-southeast-1.modelarts-maas.com/openai/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer server-only');
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'test-model');
    assert.equal(payload.stream, false);
    assert.equal(payload.messages[0].role, 'system');
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Regla candidata, server-only' } }], usage: { total_tokens: 10 } });
  } }, async url => {
    const response = await fetch(url, request);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { answer: 'Regla candidata, [credencial omitida]', model: 'test-model' });
    assert.equal(calls, 1);
  });
});
test('validates requests, bounds payloads, and does not forward invalid data', async () => {
  let calls = 0;
  await withServer({ apiKey: 'server-only', model: 'test-model', fetchImpl: async () => { calls++; throw new Error('Unexpected'); } }, async url => {
    assert.equal((await fetch(url, { ...request, body: '{' })).status, 400);
    assert.equal((await fetch(url, { ...request, body: JSON.stringify({ question: '', context: {} }) })).status, 400);
    assert.equal((await fetch(url, { ...request, body: JSON.stringify({ question: 'test', context: { data: 'x'.repeat(130 * 1024) } }) })).status, 413);
    assert.equal(calls, 0);
  });
});
test('handles provider failures without leaking raw error bodies', async () => {
  for (const status of [401, 403, 429, 500]) {
    await withServer({ apiKey: 'server-only', model: 'test-model', fetchImpl: async () => new Response('raw sensitive provider error', { status }) }, async url => {
      const response = await fetch(url, request);
      assert.equal(response.status, 502);
      assert.doesNotMatch(JSON.stringify(await response.json()), /sensitive|server-only/);
    });
  }
});
test('rejects truncated or malformed provider results', async () => {
  for (const result of [{ choices: [] }, { choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }]) {
    await withServer({ apiKey: 'server-only', model: 'test-model', fetchImpl: async () => Response.json(result) }, async url => {
      assert.equal((await fetch(url, request)).status, 502);
    });
  }
});

test('verifies a connection, shares it with chat requests and disconnects without exposing the key', async () => {
  const calls = [];
  await withServer({ apiKey: '', model: '', fetchImpl: async (url, options) => {
    calls.push({ url, auth: options.headers.Authorization, payload: JSON.parse(options.body) });
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'OK' } }] });
  } }, async url => {
    const connectionUrl = `${url}/connection`;
    const before = await (await fetch(connectionUrl)).json();
    assert.equal(before.configured, false);
    const setup = await fetch(connectionUrl, { ...request, body: JSON.stringify({ url: 'https://api-ap-southeast-1.modelarts-maas.com/openai/v1', model: 'glm-5.2', apiKey: 'secret-test-key' }) });
    assert.equal(setup.status, 200);
    assert.doesNotMatch(JSON.stringify(await setup.json()), /secret-test-key/);
    const status = await (await fetch(connectionUrl)).json();
    assert.deepEqual(status, { configured: true, verified: true, model: 'glm-5.2', url: 'https://api-ap-southeast-1.modelarts-maas.com/openai/v1' });
    assert.equal((await fetch(url, request)).status, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].auth, 'Bearer secret-test-key');
    assert.equal(calls[1].auth, 'Bearer secret-test-key');
    assert.equal(calls[1].payload.model, 'glm-5.2');
    assert.equal((await fetch(connectionUrl, { method: 'DELETE', headers: { Origin: 'http://localhost:4211' } })).status, 200);
    assert.equal((await fetch(url, request)).status, 503);
  });
});
test('rejects untrusted URLs, failed credentials and cross-origin connection changes', async () => {
  let called = 0;
  await withServer({ apiKey: '', model: '', fetchImpl: async () => { called++; return new Response('sensitive', { status: 401 }); } }, async url => {
    const connectionUrl = `${url}/connection`;
    const data = { url: 'https://attacker.example/openai/v1', model: 'glm-5.2', apiKey: 'secret' };
    assert.equal((await fetch(connectionUrl, { ...request, body: JSON.stringify(data) })).status, 400);
    assert.equal(called, 0);
    data.url = 'https://api-ap-southeast-1.modelarts-maas.com/openai/v1';
    const denied = await fetch(connectionUrl, { ...request, body: JSON.stringify(data) });
    assert.equal(denied.status, 502);
    assert.doesNotMatch(JSON.stringify(await denied.json()), /sensitive|secret/);
    assert.equal((await (await fetch(connectionUrl)).json()).configured, false);
    assert.equal((await fetch(connectionUrl, { ...request, headers: { ...request.headers, Origin: 'https://attacker.example' }, body: JSON.stringify(data) })).status, 403);
  });
});
test('disconnect wins over a pending connection check', async () => {
  let release;
  let started;
  const pending = new Promise(resolve => { release = resolve; });
  const startedPromise = new Promise(resolve => { started = resolve; });
  await withServer({ apiKey: '', model: '', fetchImpl: async () => { started(); await pending; return Response.json({ choices: [{ message: { content: 'OK' } }] }); } }, async url => {
    const connectionUrl = `${url}/connection`;
    const attempt = fetch(connectionUrl, { ...request, body: JSON.stringify({ url: 'https://api-ap-southeast-1.modelarts-maas.com/openai/v1', model: 'glm-5.2', apiKey: 'secret' }) });
    await startedPromise;
    await fetch(connectionUrl, { method: 'DELETE' });
    release();
    assert.equal((await attempt).status, 409);
    assert.equal((await (await fetch(connectionUrl)).json()).configured, false);
  });
});
