import { resolveGatewayAuthEndpoint } from '@/components/dashboard/provider/labFormUtils'
import devLog from '@/utils/dev/logger'

export async function resolveFmuDescribeHeaders(gatewayUrl) {
  const authEndpoint = resolveGatewayAuthEndpoint(gatewayUrl)
  if (!authEndpoint) return {}

  try {
    const authRes = await fetch('/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        authEndpoint,
        includeBookingInfo: false,
      }),
    })
    if (!authRes.ok) {
      return {}
    }
    const authData = await authRes.json()
    if (authData?.token) {
      return { Authorization: `Bearer ${authData.token}` }
    }
  } catch (error) {
    devLog.warn('Unable to fetch auth token for FMU reference validation', error)
  }
  return {}
}

export async function verifyFmuReference(labData) {
  const fmuFileName = String(labData?.fmuFileName || '').trim()
  const gatewayUrl = String(labData?.accessURI || '').trim()

  if (!fmuFileName) {
    throw new Error('FMU file name is required')
  }
  if (!gatewayUrl) {
    throw new Error('Access URI is required for FMU resources')
  }

  const headers = await resolveFmuDescribeHeaders(gatewayUrl)
  const gwParam = encodeURIComponent(gatewayUrl)
  const labParam = labData?.id ? `&labId=${encodeURIComponent(String(labData.id))}` : ''
  const describeUrl = `/api/simulations/describe?fmuFileName=${encodeURIComponent(fmuFileName)}&gatewayUrl=${gwParam}${labParam}`
  const res = await fetch(describeUrl, { headers })
  if (!res.ok) {
    let detail = `Gateway returned ${res.status}`
    try {
      const body = await res.json()
      detail = body?.error || body?.details || detail
    } catch {
      // Keep fallback detail
    }
    throw new Error(detail)
  }
  return res.json()
}
