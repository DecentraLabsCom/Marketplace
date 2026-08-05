const CONFIRMED_RESERVATION_STATES = new Set([
  'confirmed',
  'access_authorized',
  'settled',
  'collected',
])

export const normalizeReservationStatus = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return normalized || 'unknown'
}

export const isReservationConfirmedStatus = (value) =>
  CONFIRMED_RESERVATION_STATES.has(normalizeReservationStatus(value))
