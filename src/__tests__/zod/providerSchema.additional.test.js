import { z } from 'zod'

// Duplicate of the providerSchema logic used in the app to keep tests independent
const providerSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  wallet: z.string().min(1, 'Wallet address is required').refine(
    (val) => /^0x[a-fA-F0-9]{40}$/.test(val),
    'Wallet address must start with 0x followed by 40 alphanumeric characters'
  ),
  country: z.string().min(2, 'Country is required'),
})

test('edge cases: wallet formats and trimming behavior', () => {
  // 1) 0x prefix but wrong length
  const shortWallet = {
    name: 'X',
    email: 't@e.com',
    wallet: '0x123',
    country: 'US',
  }
  expect(providerSchema.safeParse(shortWallet).success).toBe(false)

  // 2) Uppercase hex address should still pass
  const upperWallet = {
    name: 'X',
    email: 't@e.com',
    wallet: '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD',
    country: 'ES',
  }
  expect(providerSchema.safeParse(upperWallet).success).toBe(true)

  // 3) Email with surrounding spaces should fail (schema doesn't trim)
  const spaceEmail = { ...upperWallet, email: '  test@example.com  ' }
  // zod's email validator rejects the spaces
  expect(providerSchema.safeParse(spaceEmail).success).toBe(false)
})

test('error shape stability: flatten().fieldErrors returns arrays of strings', () => {
  const invalid = {
    name: '',
    email: 'not-an-email',
    wallet: 'abc',
    country: '',
  }

  const res = providerSchema.safeParse(invalid)
  expect(res.success).toBe(false)
  const fields = res.error.flatten().fieldErrors

  // Check that each expected field exists and is an array of strings
  ;['name', 'email', 'wallet', 'country'].forEach((key) => {
    expect(Array.isArray(fields[key])).toBe(true)
    expect(typeof fields[key][0]).toBe('string')
    expect(fields[key].length).toBeGreaterThan(0)
  })
})

test('parse() throws while safeParse returns error object', () => {
  const invalid = { name: '', email: 'x', wallet: 'abc', country: '' }
  const safe = providerSchema.safeParse(invalid)
  expect(safe.success).toBe(false)

  expect(() => providerSchema.parse(invalid)).toThrow()
})
