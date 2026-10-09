const jsonType = /^application\/(?:[\w.-]+\+)?json$/i
const safeCfRay = /^[a-fA-F0-9]{16}(?:-[A-Z]{3})?$/

export async function parseJsonResponse(response) {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim() || ''
  let data
  let failure

  if (!jsonType.test(contentType)) {
    if (response.status >= 500 && response.status < 600) {
      const ray = response.headers.get('cf-ray')
      failure = `The portal server failed (HTTP ${response.status}) and returned a non-JSON response. If you're unsure whether your request completed, reload and check your sign-in before retrying.${ray && safeCfRay.test(ray) ? ` CF-Ray: ${ray}.` : ''}`
    } else {
      failure =
        contentType.toLowerCase() === 'text/html'
          ? 'The portal API returned a web page instead of JSON. Check the portal server and API routing, then try again.'
          : 'The portal API returned an unexpected response format. Please try again or contact your administrator.'
    }
  } else {
    try {
      data = await response.json()
    } catch {
      failure = 'The portal API returned invalid JSON. Please try again or contact your administrator.'
    }
    if (!failure && (!data || typeof data !== 'object' || Array.isArray(data))) {
      failure = 'The portal API returned an unexpected JSON response. Please try again or contact your administrator.'
    }
  }

  if (!response.ok || failure) {
    const fallback =
      response.status === 503
        ? 'Portal database is not configured yet. Contact your administrator.'
        : `Request failed (${response.status}).`
    const error = new Error(failure || (typeof data.error === 'string' && data.error.trim()) || fallback)
    error.status = response.status
    if (!failure && typeof data.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(data.code)) error.code = data.code
    throw error
  }
  return data
}
