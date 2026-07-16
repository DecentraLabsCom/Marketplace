/**
 * Builds the FMU describe URL used by the browser during pre-registration.
 *
 * A new lab has no on-chain accessURI yet, so this request must stay in the
 * browser. The Marketplace server never receives this URL as a proxy target.
 */
export function buildDirectFmuDescribeUrl(rawGatewayUrl, fmuFileName) {
  if (typeof rawGatewayUrl !== 'string' || !rawGatewayUrl.trim()) {
    throw new Error('Invalid gateway URL')
  }
  if (typeof fmuFileName !== 'string' || !fmuFileName.trim()) {
    throw new Error('FMU file name is required')
  }

  let parsed
  try {
    parsed = new URL(rawGatewayUrl.trim())
  } catch {
    throw new Error('Invalid gateway URL')
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    throw new Error('Invalid gateway URL')
  }

  parsed.pathname = '/fmu/api/v1/simulations/describe'
  parsed.search = ''
  parsed.searchParams.set('fmuFileName', fmuFileName.trim())
  return parsed.toString()
}
