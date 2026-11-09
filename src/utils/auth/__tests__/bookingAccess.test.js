import { canFetchUserBookings } from '../bookingAccess'

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
      })).toBe(true)
    })

    test('returns false for non-SSO users', () => {
      expect(canFetchUserBookings({
        isLoggedIn: true,
        isSSO: false,
      })).toBe(false)
    })

    test('returns false for non-SSO users without address', () => {
      expect(canFetchUserBookings({
        isLoggedIn: true,
        isSSO: false,
      })).toBe(false)
    })
  })

})
