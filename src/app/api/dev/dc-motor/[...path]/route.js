import {
  localPreviewDenied,
  readLocalGatewayResponse,
  requestLocalGateway,
  toWebReadable,
} from '../_local'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const FMU_ACCESS_KEY = 'local-demos/dc-motor/linux64/DC_motor.fmu'
const STOP_TIME_SECONDS = 4
const STEP_SIZE_SECONDS = 0.005
const MAX_SIMULATION_STEPS = 30_000
const MAX_REQUEST_BYTES = 8 * 1024
const MAX_APP_ASSET_BYTES = 8 * 1024 * 1024
const MAX_MODEL_DESCRIPTION_BYTES = 8 * 1024 * 1024
const TEACHING_VARIABLES = new Set([
  'out_control_err',
  'out_load_speed',
  'out_motor_speed',
  'speedController.k',
  'speedController.Ti',
  'damper.d',
  'spring.k',
  'torqueStep.stepTorque',
  'torqueStep.startTime',
  'torqueStep.offsetTorque',
  'data.Ja.value',
  'data.Jm.value',
])
const DEFAULT_PARAMETERS = Object.freeze({
  'speedController.k': 100,
  'speedController.Ti': 0.1,
  'damper.d': 40,
  'spring.k': 1,
  'torqueStep.stepTorque': 5,
  'torqueStep.startTime': 0.5,
  'torqueStep.offsetTorque': 5,
  'data.Ja.value': 2,
  'data.Jm.value': 1,
})
const PARAMETER_RANGES = Object.freeze({
  'speedController.k': [20, 180],
  'speedController.Ti': [0.02, 0.5],
  'damper.d': [5, 120],
  'spring.k': [0.4, 1.6],
  'torqueStep.stepTorque': [0, 12],
  'torqueStep.startTime': [0.1, 3],
  'torqueStep.offsetTorque': [0, 10],
  'data.Ja.value': [0.5, 4],
  'data.Jm.value': [0.5, 2],
})
const APP_ASSETS = new Set([
  'index.html',
  'app.js',
  'scene.js',
  'styles.css',
  'vendor/three.module.js',
  'vendor/three.core.js',
  'vendor/OrbitControls.js',
  'vendor/THREE-LICENSE.txt',
])
const MIME_TYPES = Object.freeze({
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
})
const HTML_POLICY = [
  "default-src 'self' data: blob:",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  'sandbox allow-scripts',
].join('; ')

function localGatewayPath(path) {
  return `/dev-dc-motor-fmu/${path}`
}

function errorResponse(message, status) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

function validParameters(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (Object.keys(value).some((name) => !Object.hasOwn(PARAMETER_RANGES, name))) return null

  const parameters = { ...DEFAULT_PARAMETERS }
  for (const [name, rawValue] of Object.entries(value)) {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return null
    const [min, max] = PARAMETER_RANGES[name]
    if (rawValue < min || rawValue > max) return null
    parameters[name] = rawValue
  }
  return parameters
}

export async function GET(request, { params }) {
  const { path = [] } = await params
  const segments = Array.isArray(path) ? path : [path]

  if (segments.length === 1 && segments[0] === 'model') {
    const denied = localPreviewDenied(request)
    if (denied) return denied
    try {
      const upstream = await requestLocalGateway(localGatewayPath('describe'), { signal: request.signal })
      if (upstream.statusCode !== 200) {
        upstream.resume()
        return errorResponse('The motor model description could not be loaded.', 502)
      }

      const description = JSON.parse((await readLocalGatewayResponse(upstream, MAX_MODEL_DESCRIPTION_BYTES)).toString('utf8'))
      if (!Array.isArray(description.modelVariables)) {
        return errorResponse('The motor model description contains no variables.', 502)
      }
      return Response.json({
        ...description,
        modelVariables: description.modelVariables.filter((variable) => (
          TEACHING_VARIABLES.has(variable?.name)
          && ['input', 'output', 'parameter'].includes(variable?.causality)
        )),
      }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      if (error instanceof RangeError) return errorResponse('The motor model description is too large to load.', 413)
      return errorResponse('The DC motor model could not be loaded.', 502)
    }
  }

  if (segments[0] !== 'app') return errorResponse('Not found', 404)
  const denied = localPreviewDenied(request, { allowOpaqueOrigin: true })
  if (denied) return denied
  const assetPath = segments.slice(1).join('/')
  if (!APP_ASSETS.has(assetPath)) return errorResponse('Not found', 404)
  const extension = assetPath.split('.').pop().toLowerCase()

  try {
    const upstream = await requestLocalGateway(localGatewayPath(`app/${assetPath}`), { signal: request.signal })
    if (upstream.statusCode === 404) {
      upstream.resume()
      return errorResponse('Not found', 404)
    }
    if (upstream.statusCode !== 200) {
      upstream.resume()
      return errorResponse('The motor scene is currently unavailable.', 502)
    }

    const body = await readLocalGatewayResponse(upstream, MAX_APP_ASSET_BYTES)
    const headers = new Headers({
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    })
    if (extension === 'html') {
      headers.set('Content-Security-Policy', HTML_POLICY)
      headers.set('X-Frame-Options', 'SAMEORIGIN')
      headers.set('Referrer-Policy', 'no-referrer')
    }
    return new Response(body, { status: 200, headers })
  } catch (error) {
    if (error instanceof RangeError) return errorResponse('The motor scene asset is too large to load.', 413)
    return errorResponse('The DC motor scene could not be loaded.', 502)
  }
}

export async function POST(request, { params }) {
  const denied = localPreviewDenied(request)
  if (denied) return denied

  const { path = [] } = await params
  const segments = Array.isArray(path) ? path : [path]
  if (segments.length !== 2 || segments[0] !== 'simulations' || segments[1] !== 'stream') {
    return errorResponse('Not found', 404)
  }

  const contentLength = request.headers.get('content-length')
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_REQUEST_BYTES)) {
    return errorResponse('The simulation request is too large.', 413)
  }

  let body
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > MAX_REQUEST_BYTES) return errorResponse('The simulation request is too large.', 413)
    body = JSON.parse(raw)
  } catch {
    return errorResponse('The simulation request is not valid JSON.', 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => key !== 'parameters')) {
    return errorResponse('The simulation settings are invalid.', 400)
  }
  const parameters = validParameters(body.parameters)
  if (!parameters) return errorResponse('One or more motor settings are invalid or outside their allowed ranges.', 400)

  const stepCount = Math.round(STOP_TIME_SECONDS / STEP_SIZE_SECONDS)
  if (stepCount > MAX_SIMULATION_STEPS) return errorResponse('The simulation exceeds the local step limit.', 400)

  const payload = JSON.stringify({
    accessKey: FMU_ACCESS_KEY,
    parameters,
    options: {
      startTime: 0,
      stopTime: STOP_TIME_SECONDS,
      stepSize: STEP_SIZE_SECONDS,
    },
  })

  try {
    const upstream = await requestLocalGateway(localGatewayPath('simulations/stream'), {
      method: 'POST',
      body: payload,
      signal: request.signal,
      timeoutMs: 300_000,
    })
    if (upstream.statusCode !== 200) {
      upstream.resume()
      return errorResponse('The DC motor simulation could not be started.', upstream.statusCode || 502)
    }
    return new Response(toWebReadable(upstream), {
      status: 200,
      headers: {
        'Content-Type': upstream.headers['content-type'] || 'application/x-ndjson',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch {
    return errorResponse('The DC motor simulation could not be completed.', 502)
  }
}
