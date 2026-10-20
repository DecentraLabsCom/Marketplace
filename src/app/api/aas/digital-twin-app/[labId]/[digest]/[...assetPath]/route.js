import { NextResponse } from 'next/server'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import {
  GatewayValidationError,
  buildGatewayTargetUrl,
  gatewayFetch,
  resolveLabAccessGateway,
} from '@/utils/api/gatewayProxy'
import { publicErrorResponse } from '@/utils/security/publicError'

const MAX_ASSET_BYTES = 50 * 1024 * 1024
// A validated app can contain up to 300 files; leave room for its entry page
// and a small number of browser retries while fetching them.
const checkRate = createRateLimiter({ operation: 'aas-digital-twin-app', windowMs: 60_000, maxRequests: 360 })
const MIME_TYPES = Object.freeze({
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  wasm: 'application/wasm',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  bin: 'application/octet-stream',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
})

function boundedAssetPath(parts) {
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 8) return null
  if (parts.some((part) => (
    typeof part !== 'string'
    || part.length > 128
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part)
    || part === '.'
    || part === '..'
  ))) return null
  const filename = parts[parts.length - 1]
  const extension = filename.includes('.') ? filename.split('.').pop().toLowerCase() : ''
  return MIME_TYPES[extension] ? { path: parts.join('/'), mime: MIME_TYPES[extension] } : null
}

function headersFor(mime, isHtml) {
  const headers = new Headers({
    'Content-Type': mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  })
  if (isHtml) {
    headers.set('X-Frame-Options', 'SAMEORIGIN')
    headers.set('Content-Security-Policy', [
      "default-src 'self' data: blob:",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "style-src-attr 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' blob:",
      "media-src 'self' data: blob:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'self'",
      'sandbox allow-scripts',
    ].join('; '))
  }
  return headers
}

async function handleRequest(_request, { params }, method) {
  const rateLimitResponse = createRateLimitResponse(await checkRate(_request))
  if (rateLimitResponse) return rateLimitResponse
  try {
    const { labId, digest, assetPath } = await params
    if (!/^\d{1,78}$/.test(String(labId || '')) || !/^[a-f0-9]{64}$/i.test(String(digest || ''))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const boundedPath = boundedAssetPath(assetPath)
    if (!boundedPath) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const gatewayBaseUrl = await resolveLabAccessGateway({ labId })
    const targetUrl = buildGatewayTargetUrl(
      gatewayBaseUrl,
      `/digital-twin-apps/${labId}/${digest.toLowerCase()}/${boundedPath.path}`,
    )
    const upstream = await gatewayFetch(targetUrl, { method, cache: 'no-store' })
    if (upstream.status === 404) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!upstream.ok) return NextResponse.json({ error: 'Digital twin application unavailable' }, { status: 502 })

    const contentLength = Number(upstream.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_ASSET_BYTES) {
      return NextResponse.json({ error: 'Digital twin application asset too large' }, { status: 413 })
    }
    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers: headersFor(boundedPath.mime, boundedPath.mime.startsWith('text/html')) })
    }
    const body = await upstream.arrayBuffer()
    if (body.byteLength > MAX_ASSET_BYTES) {
      return NextResponse.json({ error: 'Digital twin application asset too large' }, { status: 413 })
    }
    return new Response(body, {
      status: 200,
      headers: headersFor(boundedPath.mime, boundedPath.mime.startsWith('text/html')),
    })
  } catch (error) {
    if (error instanceof GatewayValidationError) {
      return publicErrorResponse({
        status: error.status || 400,
        code: 'INVALID_DIGITAL_TWIN_APP_REQUEST',
        message: 'The digital twin application request is invalid.',
        error,
        context: 'aas-digital-twin-app-validation',
      })
    }
    return publicErrorResponse({
      status: 502,
      code: 'DIGITAL_TWIN_APP_UNAVAILABLE',
      message: 'The provider digital twin application could not be loaded.',
      error,
      context: 'aas-digital-twin-app',
    })
  }
}

export async function GET(request, context) {
  return handleRequest(request, context, 'GET')
}

export async function HEAD(request, context) {
  return handleRequest(request, context, 'HEAD')
}

export async function OPTIONS(request) {
  const rateLimitResponse = createRateLimitResponse(await checkRate(request))
  if (rateLimitResponse) return rateLimitResponse
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
