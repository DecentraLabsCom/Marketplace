import https from 'node:https'
import { Readable } from 'node:stream'

export function localPreviewDenied(request, { allowOpaqueOrigin = false } = {}) {
  let url
  try {
    url = new URL(request.url)
  } catch {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin && !(allowOpaqueOrigin && origin === 'null')) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  return null
}

export function requestLocalGateway(pathname, { method = 'GET', body, signal, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const gatewayRequest = https.request({
      hostname: '127.0.0.1',
      port: 8443,
      path: pathname,
      method,
      rejectUnauthorized: false,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    }, resolve)
    gatewayRequest.setTimeout(timeoutMs, () => gatewayRequest.destroy(new Error('Local Gateway request timed out')))
    gatewayRequest.on('error', reject)
    signal?.addEventListener('abort', () => gatewayRequest.destroy(new Error('Local simulation preview was cancelled')), { once: true })
    if (body !== undefined) gatewayRequest.write(body)
    gatewayRequest.end()
  })
}

export async function readLocalGatewayResponse(response, maxBytes = 4 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of response) {
    size += chunk.length
    if (size > maxBytes) {
      response.destroy()
      throw new RangeError('Local Gateway response exceeded the preview limit')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export function toWebReadable(response) {
  return Readable.toWeb(response)
}
