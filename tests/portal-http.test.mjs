import test from 'node:test'
import assert from 'node:assert/strict'
import { parseJsonResponse } from '../portal/http.mjs'

const json = (body, status = 200, type = 'application/json; charset=utf-8') =>
  new Response(body, { status, headers: { 'Content-Type': type } })

test('valid JSON response returns the API payload', async () => {
  const result = await parseJsonResponse(json('{"user":{"id":"one"},"csrfToken":"token"}'))
  assert.deepEqual(result, { user: { id: 'one' }, csrfToken: 'token' })
  assert.deepEqual(await parseJsonResponse(json('{"ok":true}', 200, 'application/problem+json')), { ok: true })
})

test('200 HTML static fallback is not treated as successful login or exposed in the error', async () => {
  const html = '<!doctype html><script>private marker</script>'
  await assert.rejects(parseJsonResponse(json(html, 200, 'text/html; charset=utf-8')), (error) => {
    assert.match(error.message, /portal API returned a web page instead of JSON/i)
    assert.match(error.message, /API routing/i)
    assert.equal(error.status, 200)
    assert.doesNotMatch(error.message, /private marker|<!doctype/i)
    return true
  })
})

test('HTML 500 reports a server failure, status, and validated CF-Ray reference without exposing its body', async () => {
  const response = new Response('<html>private marker</html>', {
    status: 500,
    headers: { 'Content-Type': 'text/html', 'CF-Ray': '0123456789abcdef-SJC', 'X-Secret': 'header marker' },
  })
  await assert.rejects(parseJsonResponse(response), (error) => {
    assert.equal(error.status, 500)
    assert.equal(error.code, undefined)
    assert.match(error.message, /server failed.*HTTP 500/i)
    assert.match(error.message, /CF-Ray: 0123456789abcdef-SJC/)
    assert.match(error.message, /if you.re unsure.*reload and check your sign-in before retrying/i)
    assert.doesNotMatch(error.message, /routing|private marker|header marker|password (?:was |is )?unchanged/i)
    return true
  })
})

test('HTML 502 without CF-Ray reports server failure without a reference', async () => {
  await assert.rejects(parseJsonResponse(json('<html>private marker</html>', 502, 'text/html')), (error) => {
    assert.equal(error.status, 502)
    assert.match(error.message, /server failed.*HTTP 502/i)
    assert.match(error.message, /reload and check your sign-in before retrying/i)
    assert.doesNotMatch(error.message, /CF-Ray|routing|private marker/i)
    return true
  })
})

test('non-JSON 5xx omits unsafe CF-Ray headers and never includes the body', async () => {
  for (const ray of ['private marker', '0123456789abcdef-SJC; private marker', 'a'.repeat(65)]) {
    const response = new Response('private body', {
      status: 502,
      headers: { 'Content-Type': 'text/plain', 'CF-Ray': ray },
    })
    await assert.rejects(parseJsonResponse(response), (error) => {
      assert.equal(error.status, 502)
      assert.match(error.message, /server failed.*HTTP 502/i)
      assert.doesNotMatch(error.message, /CF-Ray|private marker|private body|routing/i)
      return true
    })
  }
})

test('malformed and unexpected JSON bodies fail with safe messages', async () => {
  for (const body of ['<!doctype html>', '', 'null', '[]', '"success"']) {
    await assert.rejects(parseJsonResponse(json(body)), (error) => {
      assert.match(error.message, /invalid JSON|unexpected JSON response/i)
      assert.doesNotMatch(error.message, /<!doctype/i)
      return true
    })
  }
})

test('401 JSON error preserves its human message and status', async () => {
  await assert.rejects(parseJsonResponse(json('{"error":"Your session expired."}', 401)), (error) => {
    assert.equal(error.message, 'Your session expired.')
    assert.equal(error.status, 401)
    return true
  })
})

test('structured password error preserves a safe code for field validation', async () => {
  await assert.rejects(
    parseJsonResponse(
      json(
        '{"error":"Current password is incorrect. Enter the password you used to sign in.","code":"CURRENT_PASSWORD_INCORRECT"}',
        400,
      ),
    ),
    (error) => {
      assert.equal(error.status, 400)
      assert.equal(error.code, 'CURRENT_PASSWORD_INCORRECT')
      assert.match(error.message, /Enter the password you used to sign in/)
      return true
    },
  )
})

test('unexpected error codes are ignored and non-JSON failures expose no code or body', async () => {
  for (const code of [42, '', 'not-safe', ' CURRENT_PASSWORD_INCORRECT', 'A'.repeat(65)]) {
    await assert.rejects(parseJsonResponse(json(JSON.stringify({ error: 'Try again.', code }), 400)), (error) => {
      assert.equal(error.message, 'Try again.')
      assert.equal(error.code, undefined)
      return true
    })
  }
  await assert.rejects(parseJsonResponse(json('<html>private marker</html>', 400, 'text/html')), (error) => {
    assert.equal(error.status, 400)
    assert.equal(error.code, undefined)
    assert.doesNotMatch(error.message, /private marker/)
    return true
  })
  await assert.rejects(parseJsonResponse(json('{"code":"CURRENT_PASSWORD_INCORRECT"', 400)), (error) => {
    assert.equal(error.code, undefined)
    assert.match(error.message, /invalid JSON/)
    return true
  })
})

test('JSON error without a usable message falls back to a status-specific message', async () => {
  await assert.rejects(parseJsonResponse(json('{"error":42}', 503)), (error) => {
    assert.equal(error.status, 503)
    assert.match(error.message, /database is not configured/i)
    return true
  })
})

test('HTML API errors and malformed JSON errors never expose response bodies', async () => {
  for (const response of [
    json('<html>private marker</html>', 401, 'text/html'),
    json('{"error":"private marker"', 500),
    json('private marker', 502, 'text/plain'),
  ]) {
    await assert.rejects(parseJsonResponse(response), (error) => {
      assert.equal(error.status, response.status)
      assert.doesNotMatch(error.message, /private marker|Unexpected token/i)
      return true
    })
  }
})
