import {
  calculateInstitutionalReservationFee,
  CROSS_INSTITUTION_ZERO_PRICE_RESERVATION_FEE,
  OWN_INSTITUTION_RESERVATION_FEE,
} from '../reservationFees'
import { RAW_PER_CREDIT } from '@/utils/blockchain/creditUnits'

describe('calculateInstitutionalReservationFee', () => {
  test('charges two credits for an own-institution reservation', () => {
    expect(calculateInstitutionalReservationFee({
      isSSO: true,
      isOwnInstitutionLab: true,
      reservationPrice: 0n,
    })).toBe(2n * RAW_PER_CREDIT)
    expect(OWN_INSTITUTION_RESERVATION_FEE).toBe(2n * RAW_PER_CREDIT)
  })

  test('charges one credit for a cross-institutional zero-price reservation', () => {
    expect(calculateInstitutionalReservationFee({
      isSSO: true,
      reservationPrice: 0n,
    })).toBe(RAW_PER_CREDIT)
    expect(CROSS_INSTITUTION_ZERO_PRICE_RESERVATION_FEE).toBe(RAW_PER_CREDIT)
  })

  test('does not add a fee to a paid reservation', () => {
    expect(calculateInstitutionalReservationFee({
      isSSO: true,
      reservationPrice: 10n,
    })).toBe(0n)
  })

  test('does not charge non-SSO or demo access', () => {
    expect(calculateInstitutionalReservationFee({ reservationPrice: 0n })).toBe(0n)
    expect(calculateInstitutionalReservationFee({
      isSSO: true,
      isDemo: true,
      reservationPrice: 0n,
    })).toBe(0n)
  })
})
