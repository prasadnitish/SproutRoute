import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../../src/frontend/src/services/api.js', import.meta.url), 'utf8');
const code = source.replaceAll("'./journeyTrace.js'", JSON.stringify(new URL('../../src/frontend/src/services/journeyTrace.js', import.meta.url).href)).replaceAll('import.meta.env', JSON.stringify({ PROD: true }));

test('share tokens use headers and revocation accepts an empty 204 response', async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return options.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response('{}', { headers: { 'content-type': 'application/json' } });
  };
  try {
    const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    await api.getTripShare('VIEW TOKEN');
    await api.revokeTripShare('VIEW TOKEN', 'OWNER TOKEN');
    assert.equal(calls[0].url, '/api/v1/trip/shares/view');
    assert.equal(calls[0].options.headers['x-trip-share-token'], 'VIEW TOKEN');
    assert.equal(calls[1].options.headers['x-trip-share-owner-token'], 'OWNER TOKEN');
    assert.equal(calls.some(call => call.url.includes('TOKEN')), false);
  } finally { global.fetch = original; }
});
