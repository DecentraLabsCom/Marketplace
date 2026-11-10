import { NextResponse } from 'next/server'
import { buildContentSecurityPolicy } from './utils/security/contentSecurityPolicy.js'
import { getRegisteredLabGatewayConnectSources } from './utils/security/registeredLabGatewayConnectSources.js'

export async function proxy(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDevelopment = process.env.NODE_ENV === 'development'
  const simulationLabId = request.nextUrl.pathname.match(/^\/simulation\/(\d{1,78})\/?$/)?.[1]
  const isDocumentNavigation = request.method === 'GET'
    && request.headers.get('accept')?.includes('text/html')
  const gatewayConnectSources = simulationLabId && isDocumentNavigation
    ? await getRegisteredLabGatewayConnectSources(simulationLabId, { isDevelopment })
    : []
  const contentSecurityPolicy = buildContentSecurityPolicy({
    nonce,
    isDevelopment,
    additionalConnectSources: gatewayConnectSources,
  })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', contentSecurityPolicy)

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
