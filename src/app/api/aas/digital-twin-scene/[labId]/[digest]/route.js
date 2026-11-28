import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import {
  GatewayValidationError,
  buildGatewayTargetUrl,
  gatewayFetch,
  resolveLabAccessGateway,
} from '@/utils/api/gatewayProxy'
import { publicErrorResponse } from '@/utils/security/publicError'

const MAX_SCENE_BYTES = 50 * 1024 * 1024
const checkRate = createRateLimiter({ operation: 'aas-digital-twin-scene', windowMs: 60_000, maxRequests: 120 })

function sceneHeaders() {
  return new Headers({
    'Content-Type': 'model/gltf-binary',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  })
}

async function handleRequest(request, { params }, method) {
  const rateLimitResponse = createRateLimitResponse(await checkRate(request))
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { labId, digest } = await params
    if (!/^\d{1,78}$/.test(String(labId || '')) || !/^[a-f0-9]{64}$/i.test(String(digest || ''))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const gatewayBaseUrl = await resolveLabAccessGateway({ labId })
    const targetUrl = buildGatewayTargetUrl(
      gatewayBaseUrl,
      `/digital-twin-scenes/${labId}/${digest.toLowerCase()}.glb`,
    )
    const upstream = await gatewayFetch(targetUrl, { method, cache: 'no-store' })
    if (upstream.status === 404) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!upstream.ok) return NextResponse.json({ error: 'Digital twin scene unavailable' }, { status: 502 })

    const contentLength = Number(upstream.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_SCENE_BYTES) {
      return NextResponse.json({ error: 'Digital twin scene too large' }, { status: 413 })
    }
    if (method === 'HEAD') return new Response(null, { status: 200, headers: sceneHeaders() })

    const body = await upstream.arrayBuffer()
    if (body.byteLength > MAX_SCENE_BYTES) {
      return NextResponse.json({ error: 'Digital twin scene too large' }, { status: 413 })
    }
    const actualDigest = createHash('sha256').update(new Uint8Array(body)).digest('hex')
    if (actualDigest !== digest.toLowerCase()) {
      return NextResponse.json({ error: 'Digital twin scene integrity check failed' }, { status: 502 })
    }
    return new Response(body, { status: 200, headers: sceneHeaders() })
  } catch (error) {
    if (error instanceof GatewayValidationError) {
      return publicErrorResponse({
        status: error.status || 400,
        code: 'INVALID_DIGITAL_TWIN_SCENE_REQUEST',
        message: 'The digital twin scene request is invalid.',
        error,
        context: 'aas-digital-twin-scene-validation',
      })
    }
    return publicErrorResponse({
      status: 502,
      code: 'DIGITAL_TWIN_SCENE_UNAVAILABLE',
      message: 'The provider digital twin scene could not be loaded.',
      error,
      context: 'aas-digital-twin-scene',
    })
  }
}

export async function GET(request, context) {
  return handleRequest(request, context, 'GET')
}

export async function HEAD(request, context) {
  return handleRequest(request, context, 'HEAD')
}
