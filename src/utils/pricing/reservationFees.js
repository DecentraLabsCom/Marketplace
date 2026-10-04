import { RAW_PER_CREDIT } from '@/utils/blockchain/creditUnits'

export const OWN_INSTITUTION_RESERVATION_FEE = 2n * RAW_PER_CREDIT
export const CROSS_INSTITUTION_ZERO_PRICE_RESERVATION_FEE = RAW_PER_CREDIT

/**
 * Returns the fixed institutional booking fee, in raw service-credit units.
 * The lab price itself is calculated separately and remains zero for these
 * institutional free-price paths.
 */
export function calculateInstitutionalReservationFee({
  isSSO = false,
  isOwnInstitutionLab = false,
  reservationPrice = 0n,
  isDemo = false,
} = {}) {
  if (!isSSO || isDemo) return 0n
  if (isOwnInstitutionLab) return OWN_INSTITUTION_RESERVATION_FEE
  if (BigInt(reservationPrice) === 0n) return CROSS_INSTITUTION_ZERO_PRICE_RESERVATION_FEE
  return 0n
}
