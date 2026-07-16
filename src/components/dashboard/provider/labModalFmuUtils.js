import devLog from '@/utils/dev/logger'
import { buildDirectFmuDescribeUrl } from '@/utils/fmu/describeUrl'

export async function resolveFmuDescribeHeaders(fmuFileName, gatewayUrl) {
  if (!fmuFileName || !gatewayUrl) return {}

  try {
    const tokenRes = await fetch(
      `/api/fmu/provider-describe-token?fmuFileName=${encodeURIComponent(fmuFileName)}`,
      { credentials: 'include' },
    )
    if (!tokenRes.ok) return {}
    const data = await tokenRes.json()
    if (data?.token) {
      return { Authorization: `Bearer ${data.token}` }
    }
  } catch (error) {
    devLog.warn('Unable to fetch describe token for FMU reference validation', error)
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

  const headers = await resolveFmuDescribeHeaders(fmuFileName, gatewayUrl)
  const describeUrl = labData?.id
    ? `/api/simulations/describe?fmuFileName=${encodeURIComponent(fmuFileName)}&labId=${encodeURIComponent(String(labData.id))}`
    : buildDirectFmuDescribeUrl(gatewayUrl, fmuFileName)
  const res = await fetch(describeUrl, {
    headers,
    ...(labData?.id ? {} : { mode: 'cors' }),
  })
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
