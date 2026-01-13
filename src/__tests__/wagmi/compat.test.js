import * as wagmi from 'wagmi'

test('wagmi exports expected public members (smoke test)', () => {
  // Ensure the package exports something usable and at least one public API
  expect(typeof wagmi).toBe('object')
  const hasCreateClient = typeof wagmi.createClient === 'function'
  const hasWagmiConfig = typeof wagmi.WagmiConfig === 'function' || typeof wagmi.WagmiConfig === 'object'
  expect(hasCreateClient || hasWagmiConfig).toBe(true)
})
