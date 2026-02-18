import { canFetchUserBookings, resolveBookingsUserAddress } from '../bookingAccess'

describe('bookingAccess', () => {
  describe('canFetchUserBookings', () => {
    test('returns false when user is not logged in', () => {
      expect(canFetchUserBookings({
        isLoggedIn: false,
        isSSO: true,
      })).toBe(false)
    })

    test('returns true for logged-in SSO users without wallet session', () => {
      expect(canFetchUserBookings({
        isLoggedIn: true,
        isSSO: true,
        address: null,
        hasWalletSession: false,
        isWalletLoading: true,
      })).toBe(true)
    })

    test('returns true for wallet users with stable wallet session', () => {
      expect(canFetchUserBookings({
        isLoggedIn: true,
        isSSO: false,
        address: '0x123',
        hasWalletSession: true,
        isWalletLoading: false,
      })).toBe(true)
    })

    test('returns false for wallet users while wallet is loading', () => {
      expect(canFetchUserBookings({
        isLoggedIn: true,
        isSSO: false,
        address: '0x123',
        hasWalletSession: true,
        isWalletLoading: true,
      })).toBe(false)
    })

    test('returns false for wallet users without wallet session or address', () => {
      expect(canFetchUserBookings({
        isLoggedIn: true,
        isSSO: false,
        address: null,
        hasWalletSession: false,
        isWalletLoading: false,
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

    test('returns wallet address for wallet users', () => {
      expect(resolveBookingsUserAddress({
        isSSO: false,
        address: '0x123',
      })).toBe('0x123')
    })

    test('returns null when wallet user has no address', () => {
      expect(resolveBookingsUserAddress({
        isSSO: false,
        address: null,
      })).toBeNull()
    })
  })
})
