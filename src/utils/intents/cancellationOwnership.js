import { ethers } from 'ethers'

const CANCEL_REQUEST_BOOKING = 9
const CANCEL_BOOKING = 10
const CANCELLED_STATUS = 4
const PENDING_STATUS = 0
const CONFIRMED_STATUS = 1
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

export function hasCancellationOwnership(reservation, institutionAddress) {
  if (!reservation || typeof reservation.renter !== 'string' || typeof institutionAddress !== 'string') {
    return false
  }
  if (!ADDRESS_PATTERN.test(reservation.renter) || !ADDRESS_PATTERN.test(institutionAddress)) return false
  if (reservation.renter.toLowerCase() === ethers.ZeroAddress) return false
  return reservation.renter.toLowerCase() === institutionAddress.toLowerCase()
}

export function cancellationStateError(action, reservation) {
  const status = Number(reservation?.status)
  if (status === CANCELLED_STATUS) {
    return { status: 409, message: 'Reservation is already cancelled' }
  }
  if (action === CANCEL_REQUEST_BOOKING && status !== PENDING_STATUS) {
    return { status: 409, message: 'Reservation request is not pending' }
  }
  if (action === CANCEL_BOOKING && status !== CONFIRMED_STATUS) {
    return { status: 409, message: 'Reservation is not confirmed' }
  }
  return null
}
