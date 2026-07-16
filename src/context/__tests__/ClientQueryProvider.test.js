import { shouldPersistPublicQuery } from '../ClientQueryProvider'

const successful = (queryKey) => ({
  queryKey,
  state: { status: 'success', data: { value: true } },
})

describe('shouldPersistPublicQuery', () => {
  test.each([
    ['labs', 'catalogue'],
    ['metadata', 'public metadata'],
  ])('persists public %s queries', (queryType) => {
    expect(shouldPersistPublicQuery(successful([queryType, 'value']))).toBe(true)
  })

  test.each(['provider', 'providers', 'reservations', 'bookings', 'labImage', 'users'])(
    'does not persist user-scoped or binary %s queries',
    (queryType) => {
      expect(shouldPersistPublicQuery(successful([queryType, 'value']))).toBe(false)
    },
  )

  test('does not persist failed or empty public queries', () => {
    expect(shouldPersistPublicQuery({ queryKey: ['labs'], state: { status: 'error', data: [] } })).toBe(false)
    expect(shouldPersistPublicQuery({ queryKey: ['metadata'], state: { status: 'success' } })).toBe(false)
  })
})
