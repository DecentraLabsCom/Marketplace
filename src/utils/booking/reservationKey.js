/**
 * Normalize reservation key into canonical 0x-prefixed lowercase bytes32 when possible.
 * Returns null for empty-ish values.
 */
export const normalizeReservationKey = (reservationKey) => {
  if (reservationKey === undefined || reservationKey === null) return null

  const raw = String(reservationKey).trim()
  if (!raw) return null

  const lower = raw.toLowerCase()
  const withoutPrefix = lower.startsWith('0x') ? lower.slice(2) : lower

  if (/^[0-9a-f]{64}$/.test(withoutPrefix)) {
    return `0x${withoutPrefix}`
  }

  return raw
}

