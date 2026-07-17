const MORALIS_RPC_HOST = 'moralis-nodes.com'

export function isMoralisRpcUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return false

  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/\.$/, '')
    return hostname === MORALIS_RPC_HOST || hostname.endsWith(`.${MORALIS_RPC_HOST}`)
  } catch {
    return false
  }
}
