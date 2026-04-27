import { canFetchUserBookings, resolveBookingsUserAddress } from '../bookingAccess'

describe('bookingAccess', () => {
  describe('canFetchUserBookings', () => {
    test('returns false when user is not logged in', () => {
      expect(canFetchUserBookings({
        isLoggedIn: false,
        isSSO: true,
      })).toBe(false)
    })

    test('returns true for logged-in SSO users', () => {
      expect(canFetchUserBookings({
        isLoggedIn: true,
        isSSO: true,
        address: null,
      })).toBe(true)
    })

    test('returns false for non-SSO users', () => {
      expect(canFetchUserBookings({
        isLoggedIn: true,
        isSSO: false,
        address: '0x123',
      })).toBe(false)
    })

    test('returns false for non-SSO users without address', () => {
      expect(canFetchUserBookings({
        isLoggedIn: true,
        isSSO: false,
        address: null,
      })).toBe(false)
    })
  })

  describe('resolveBookingsUserAddress', () => {
    test('returns null for SSO users', () => {
      expect(resolveBookingsUserAddress({
        isSSO: true,
        address: '0x123',
      })).toBeNull()
    })

    test('returns null for non-SSO users too because bookings are session-scoped', () => {
      expect(resolveBookingsUserAddress({
        isSSO: false,
        address: '0x123',
      })).toBeNull()
    })

    test('returns null when non-SSO user has no address', () => {
      expect(resolveBookingsUserAddress({
        isSSO: false,
        address: null,
      })).toBeNull()
    })
  })
})
