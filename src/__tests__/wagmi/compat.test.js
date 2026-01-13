import { createClient } from 'wagmi'

test('wagmi exports createClient (smoke test)', () => {
  expect(typeof createClient).toBe('function')
})
