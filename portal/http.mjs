const jsonType = /^application\/(?:[\w.-]+\+)?json$/i

export async function parseJsonResponse(response) {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim() || ''
  let data
  let failure

  if (!jsonType.test(contentType)) {
    failure =
      contentType.toLowerCase() === 'text/html'
        ? 'The portal API returned a web page instead of JSON. Check the portal server and API routing, then try again.'
        : 'The portal API returned an unexpected response format. Please try again or contact your administrator.'
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
    throw error
  }
  return data
}
