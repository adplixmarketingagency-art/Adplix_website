import { securityHeaders } from './security-headers.mjs'
import { handlePortalApi } from './portal/api.mjs'
export { PortalPasswordHasher } from './portal/password-object.mjs'

const portalPolicy =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'; worker-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; upgrade-insecure-requests"

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const isApi = url.pathname === '/api/portal' || url.pathname.startsWith('/api/portal/')
    const isPortal = url.pathname === '/portal' || url.pathname.startsWith('/portal/')
    let response
    if (isApi) {
      response = await handlePortalApi(request, env, ctx)
    } else if (isPortal && !['GET', 'HEAD'].includes(request.method)) {
      response = new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
    } else if (url.pathname === '/portal') {
      response = new Response(null, { status: 308, headers: { Location: '/portal/' } })
    } else if (isPortal && !/\.[a-z0-9]+$/i.test(url.pathname)) {
      // The assets binding canonicalises index.html to its directory URL.
      // Fetch the directory directly to avoid a clean-URL redirect loop.
      const assetUrl = new URL('/portal/', url)
      response = await env.ASSETS.fetch(new Request(assetUrl, request))
    } else {
      response = await env.ASSETS.fetch(request)
    }
    const headers = new Headers(response.headers)

    for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value)
    if (isPortal || isApi) {
      headers.set('Cache-Control', 'private, no-store')
      headers.set('X-Robots-Tag', 'noindex, nofollow')
      headers.set('Content-Security-Policy', portalPolicy)
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}
