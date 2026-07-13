import { Agent, fetch as undiciFetch } from 'undici'
import { resolveInstitutionalBackendTarget } from '@/utils/onboarding/institutionalBackend'

const REQUEST_TIMEOUT_MS = 15_000

function createPinnedLookup(target) {
  return (hostname, options, callback) => {
    if (hostname.toLowerCase() !== target.hostname) {
      callback(new Error('Institutional backend hostname changed during connection'))
      return
    }

    const requestedFamily = Number(options?.family || 0)
    const candidates = requestedFamily === 4 || requestedFamily === 6
      ? target.addresses.filter(({ family }) => family === requestedFamily)
      : target.addresses

    if (candidates.length === 0) {
      callback(new Error('Institutional backend has no validated address for the requested family'))
      return
    }

    if (options?.all) {
      callback(null, candidates)
      return
    }
    callback(null, candidates[0].address, candidates[0].family)
  }
}

export async function secureBackendJsonRequest(backendUrl, path, options = {}) {
  const target = await resolveInstitutionalBackendTarget(backendUrl)
  const targetUrl = new URL(target.baseUrl)
  const basePath = targetUrl.pathname.replace(/\/$/, '')
  const requestPath = String(path || '').replace(/^\/+/, '')
  const requestUrl = new URL(`${basePath}/${requestPath}`, targetUrl.origin)
  if (requestUrl.origin !== targetUrl.origin || !requestUrl.pathname.startsWith(`${basePath}/`)) {
    throw new Error('Institutional backend request must remain on the resolved origin')
  }

  const dispatcher = new Agent({
    connect: {
      lookup: createPinnedLookup(target),
      servername: target.hostname,
    },
    connectTimeout: REQUEST_TIMEOUT_MS,
    headersTimeout: REQUEST_TIMEOUT_MS,
    bodyTimeout: REQUEST_TIMEOUT_MS,
    maxRedirections: 0,
  })

  try {
    const response = await undiciFetch(requestUrl.toString(), {
      ...options,
      redirect: 'error',
      dispatcher,
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data }
  } finally {
    await dispatcher.close()
  }
}

export default secureBackendJsonRequest
