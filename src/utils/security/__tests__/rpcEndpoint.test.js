import { isMoralisRpcUrl } from '../rpcEndpoint'

describe('isMoralisRpcUrl', () => {
  test('accepts the Moralis host and its subdomains after parsing the URL', () => {
    expect(isMoralisRpcUrl('https://moralis-nodes.com/rpc')).toBe(true)
    expect(isMoralisRpcUrl('https://site.moralis-nodes.com/abc')).toBe(true)
  })

  test('rejects URLs that only contain the Moralis host as text', () => {
    expect(isMoralisRpcUrl('https://evil.example/moralis-nodes.com')).toBe(false)
    expect(isMoralisRpcUrl('https://moralis-nodes.com.evil.example/rpc')).toBe(false)
    expect(isMoralisRpcUrl('https://moralis-nodes.com@evil.example/rpc')).toBe(false)
  })

  test('rejects malformed and non-string values', () => {
    expect(isMoralisRpcUrl('not a URL')).toBe(false)
    expect(isMoralisRpcUrl(null)).toBe(false)
  })
})
