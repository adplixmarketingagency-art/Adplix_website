import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonResponse } from '../portal/http.mjs';

const json = (body, status = 200, type = 'application/json; charset=utf-8') =>
  new Response(body, { status, headers: { 'Content-Type': type } });

test('valid JSON response returns the API payload', async () => {
  const result = await parseJsonResponse(json('{"user":{"id":"one"},"csrfToken":"token"}'));
  assert.deepEqual(result, { user: { id: 'one' }, csrfToken: 'token' });
  assert.deepEqual(await parseJsonResponse(json('{"ok":true}', 200, 'application/problem+json')), { ok: true });
});

test('200 HTML static fallback is not treated as successful login or exposed in the error', async () => {
  const html = '<!doctype html><script>private marker</script>';
  await assert.rejects(parseJsonResponse(json(html, 200, 'text/html; charset=utf-8')), error => {
    assert.match(error.message, /portal API returned a web page instead of JSON/i);
    assert.equal(error.status, 200);
    assert.doesNotMatch(error.message, /private marker|<!doctype/i);
    return true;
  });
});

test('malformed and unexpected JSON bodies fail with safe messages', async () => {
  for (const body of ['<!doctype html>', '', 'null', '[]', '"success"']) {
    await assert.rejects(parseJsonResponse(json(body)), error => {
      assert.match(error.message, /invalid JSON|unexpected JSON response/i);
      assert.doesNotMatch(error.message, /<!doctype/i);
      return true;
    });
  }
});

test('401 JSON error preserves its human message and status', async () => {
  await assert.rejects(parseJsonResponse(json('{"error":"Your session expired."}', 401)), error => {
    assert.equal(error.message, 'Your session expired.');
    assert.equal(error.status, 401);
    return true;
  });
});

test('JSON error without a usable message falls back to a status-specific message', async () => {
  await assert.rejects(parseJsonResponse(json('{"error":42}', 503)), error => {
    assert.equal(error.status, 503);
    assert.match(error.message, /database is not configured/i);
    return true;
  });
});

test('HTML API errors and malformed JSON errors never expose response bodies', async () => {
  for (const response of [
    json('<html>private marker</html>', 401, 'text/html'),
    json('{"error":"private marker"', 500),
    json('private marker', 502, 'text/plain')
  ]) {
    await assert.rejects(parseJsonResponse(response), error => {
      assert.equal(error.status, response.status);
      assert.doesNotMatch(error.message, /private marker|Unexpected token/i);
      return true;
    });
  }
});
