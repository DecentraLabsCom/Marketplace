import devLog from '@/utils/dev/logger'

export async function resolveFmuDescribeHeaders(fmuFileName, gatewayUrl) {
  if (!fmuFileName || !gatewayUrl) return {}

  try {
    const tokenRes = await fetch(
      `/api/fmu/provider-describe-token?fmuFileName=${encodeURIComponent(fmuFileName)}&gatewayUrl=${encodeURIComponent(gatewayUrl)}`,
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
