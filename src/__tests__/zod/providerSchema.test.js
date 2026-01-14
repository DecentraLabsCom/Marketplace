import { z } from 'zod'

const providerSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  wallet: z.string().min(1, 'Wallet address is required').refine(
    (val) => /^0x[a-fA-F0-9]{40}$/.test(val),
    'Wallet address must start with 0x followed by 40 alphanumeric characters'
  ),
  country: z.string().min(2, 'Country is required'),
})

test('providerSchema accepts valid data', () => {
  const valid = {
    name: 'Test Lab',
    email: 'test@example.com',
    wallet: '0x1111111111111111111111111111111111111111',
    country: 'US',
  }
  const res = providerSchema.safeParse(valid)
  expect(res.success).toBe(true)
})

test('providerSchema rejects missing/invalid fields', () => {
  const invalid = {
    name: '',
    email: 'not-an-email',
    wallet: 'abc',
    country: '',
  }
  const res = providerSchema.safeParse(invalid)
  expect(res.success).toBe(false)
  const fields = res.error.flatten().fieldErrors
  expect(fields.name).toBeTruthy()
  expect(fields.email).toBeTruthy()
  expect(fields.wallet).toBeTruthy()
  expect(fields.country).toBeTruthy()
})
