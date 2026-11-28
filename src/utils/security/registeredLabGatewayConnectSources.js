import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { safeExternalHttpsUrl, safeExternalHttpUrl } from './safeUrl'

function getConnectSourcesFromAccessUri(accessURI, { isDevelopment }) {
  const secureUrl = safeExternalHttpsUrl(accessURI)
  if (secureUrl) {
    const gateway = new URL(secureUrl)
    return [`https://${gateway.host}`, `wss://${gateway.host}`]
  }

  if (!isDevelopment) return []

  const developmentUrl = safeExternalHttpUrl(accessURI)
  if (!developmentUrl) return []

  const gateway = new URL(developmentUrl)
  const hostname = gateway.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const isLoopback = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname)
  if (!isLoopback) return []

  return [`http://${gateway.host}`, `ws://${gateway.host}`]
}

export async function getRegisteredLabGatewayConnectSources(labId, { isDevelopment = false } = {}) {
  const normalizedLabId = String(labId ?? '')
  if (!/^\d{1,78}$/.test(normalizedLabId)) return []

  try {
    const contract = await getContractInstance()
    const labData = await contract.getLab(normalizedLabId)
    if (BigInt(String(labData?.[0] ?? '')) !== BigInt(normalizedLabId)) return []
    return getConnectSourcesFromAccessUri(labData?.[1]?.[2], { isDevelopment })
  } catch {
    return []
  }
}
