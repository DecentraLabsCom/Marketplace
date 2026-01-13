import * as wagmi from 'wagmi'

test('wagmi exports expected public members (smoke test)', () => {
  // Ensure the package exports something usable and at least one public API
  expect(typeof wagmi).toBe('object')
  const hasCreateConfig = typeof wagmi.createConfig === 'function'
  const hasWagmiProvider = typeof wagmi.WagmiProvider === 'function' || typeof wagmi.WagmiProvider === 'object'
  expect(hasCreateConfig || hasWagmiProvider).toBe(true)
})
