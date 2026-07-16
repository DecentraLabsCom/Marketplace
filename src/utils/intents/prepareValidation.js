import { ACTION_CODES } from './actionCodes'

export const DIRECT_BOOKING_ACTION = 11

export const ACTION_INTENT_CODES = new Set([
  ACTION_CODES.LAB_ADD,
  ACTION_CODES.LAB_ADD_AND_LIST,
  ACTION_CODES.LAB_SET_URI,
  ACTION_CODES.LAB_UPDATE,
  ACTION_CODES.LAB_DELETE,
  ACTION_CODES.LAB_LIST,
  ACTION_CODES.LAB_UNLIST,
  ACTION_CODES.CANCEL_BOOKING,
])

export const RESERVATION_INTENT_CODES = new Set([
  ACTION_CODES.REQUEST_BOOKING,
  ACTION_CODES.CANCEL_REQUEST_BOOKING,
  DIRECT_BOOKING_ACTION,
])

const ACTION_NAMES = {
  ...ACTION_CODES,
  RESERVATION_REQUEST: ACTION_CODES.REQUEST_BOOKING,
  CANCEL_RESERVATION_REQUEST: ACTION_CODES.CANCEL_REQUEST_BOOKING,
  DIRECT_BOOKING: DIRECT_BOOKING_ACTION,
}

const UINT32_MAX = (1n << 32n) - 1n
const UINT96_MAX = (1n << 96n) - 1n
const UINT256_MAX = (1n << 256n) - 1n

const MAX_TEXT_LENGTHS = {
  uri: 4096,
  accessURI: 2048,
  accessKey: 1024,
  tokenURI: 4096,
}

const IGNORED_CLIENT_FIELDS = new Set(['backendUrl', 'returnUrl', 'requestId'])

export class IntentPrepareValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'IntentPrepareValidationError'
    this.status = 400
  }
}

function fail(message) {
  throw new IntentPrepareValidationError(message)
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== ''
}

export function normalizeIntentAction(value) {
  let action = null
  if (typeof value === 'number' && Number.isInteger(value)) {
    action = value
  } else if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase()
    if (Object.prototype.hasOwnProperty.call(ACTION_NAMES, normalized)) {
      action = ACTION_NAMES[normalized]
    } else if (/^\d+$/.test(normalized)) {
      action = Number(normalized)
    }
  }

  if (!Number.isInteger(action)) return null
  if (!ACTION_INTENT_CODES.has(action) && !RESERVATION_INTENT_CODES.has(action)) return null
  return action
}

export function isReservationIntentAction(action) {
  return RESERVATION_INTENT_CODES.has(Number(action))
}

export function isActionIntentAction(action) {
  return ACTION_INTENT_CODES.has(Number(action))
}

export function requirePayloadObject(payload) {
  if (payload === undefined || payload === null) return {}
  if (!isPlainObject(payload)) fail('Invalid intent payload')
  return payload
}

export function parseUint(value, fieldName, { min = 0n, max = UINT256_MAX, required = true } = {}) {
  if (!hasValue(value)) {
    if (required) fail(`Missing ${fieldName}`)
    return null
  }

  let parsed
  try {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
      fail(`Invalid ${fieldName}`)
    }
    if (typeof value === 'string' && !/^\d+$/.test(value.trim())) {
      fail(`Invalid ${fieldName}`)
    }
    parsed = BigInt(value)
  } catch {
    fail(`Invalid ${fieldName}`)
  }

  if (parsed < min || parsed > max) fail(`Invalid ${fieldName}`)
  return parsed
}

export function normalizeResourceType(value) {
  if (value === undefined || value === null || value === '' || value === 'lab' || value === 'LAB') return 0n
  if (value === 'fmu' || value === 'FMU') return 1n
  return parseUint(value, 'resourceType', { max: 1n })
}

function validateText(payload, field, { required = false } = {}) {
  const value = payload[field]
  if (!hasValue(value)) {
    if (required) fail(`Missing ${field}`)
    return ''
  }
  if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTHS[field] || value.includes('\0')) {
    fail(`Invalid ${field}`)
  }
  if (required && !value.trim()) fail(`Missing ${field}`)
  return value
}

function rejectUnexpectedFields(payload, allowed) {
  for (const [field, value] of Object.entries(payload)) {
    if (allowed.has(field) || IGNORED_CLIENT_FIELDS.has(field)) continue
    if (hasValue(value)) fail(`Field ${field} is not allowed for this intent action`)
  }
}

function validateReservationKey(value, required = false) {
  if (!hasValue(value)) {
    if (required) fail('Missing or invalid reservationKey')
    return null
  }
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    fail('Missing or invalid reservationKey')
  }
  return value
}

export function validateActionPayload(action, payloadInput) {
  const payload = requirePayloadObject(payloadInput)
  const labId = parseUint(payload.labId ?? 0, 'labId', { max: UINT256_MAX })

  switch (action) {
    case ACTION_CODES.LAB_ADD:
    case ACTION_CODES.LAB_ADD_AND_LIST: {
      rejectUnexpectedFields(payload, new Set(['labId', 'uri', 'price', 'accessURI', 'accessKey', 'resourceType', 'maxBatch']))
      if (labId !== 0n) fail('labId must be 0 for lab creation')
      validateText(payload, 'uri', { required: true })
      parseUint(payload.price, 'price', { max: UINT96_MAX })
      validateText(payload, 'accessURI', { required: true })
      validateText(payload, 'accessKey', { required: true })
      normalizeResourceType(payload.resourceType)
      parseUint(payload.maxBatch ?? 0, 'maxBatch', { max: UINT96_MAX })
      return { labId }
    }
    case ACTION_CODES.LAB_UPDATE:
      rejectUnexpectedFields(payload, new Set(['labId', 'uri', 'price', 'accessURI', 'accessKey', 'resourceType', 'maxBatch']))
      if (labId === 0n) fail('labId must be greater than 0')
      validateText(payload, 'uri')
      parseUint(payload.price ?? 0, 'price', { max: UINT96_MAX })
      validateText(payload, 'accessURI')
      validateText(payload, 'accessKey')
      normalizeResourceType(payload.resourceType)
      parseUint(payload.maxBatch ?? 0, 'maxBatch', { max: UINT96_MAX })
      return { labId }
    case ACTION_CODES.LAB_SET_URI:
      rejectUnexpectedFields(payload, new Set(['labId', 'tokenURI']))
      if (labId === 0n) fail('labId must be greater than 0')
      validateText(payload, 'tokenURI', { required: true })
      return { labId }
    case ACTION_CODES.LAB_DELETE:
    case ACTION_CODES.LAB_LIST:
    case ACTION_CODES.LAB_UNLIST:
      rejectUnexpectedFields(payload, new Set(['labId']))
      if (labId === 0n) fail('labId must be greater than 0')
      return { labId }
    case ACTION_CODES.CANCEL_BOOKING: {
      rejectUnexpectedFields(payload, new Set(['labId', 'price', 'reservationKey']))
      validateReservationKey(payload.reservationKey, true)
      if (hasValue(payload.labId) && labId === 0n) fail('labId must be greater than 0')
      return { labId: hasValue(payload.labId) ? labId : null, reservationKey: payload.reservationKey }
    }
    default:
      fail('Invalid action code')
  }
}

export function validateReturnUrl(value) {
  if (!hasValue(value)) return null
  if (typeof value !== 'string' || value.length > 2048) fail('Invalid returnUrl')
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    fail('Invalid returnUrl')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    fail('Invalid returnUrl')
  }
  return parsed.toString()
}

export function validateReservationWindow({ labId, start, end, timeslot }) {
  const normalizedLabId = parseUint(labId, 'labId', { min: 1n, max: UINT256_MAX })
  const normalizedStart = parseUint(start, 'start', { min: 1n, max: UINT32_MAX })
  let normalizedEnd
  if (hasValue(end)) {
    normalizedEnd = parseUint(end, 'end', { min: 1n, max: UINT32_MAX })
  } else {
    const normalizedTimeslot = parseUint(timeslot, 'timeslot', { min: 1n, max: UINT32_MAX })
    normalizedEnd = normalizedStart + normalizedTimeslot
  }

  if (normalizedEnd <= normalizedStart) fail('Reservation end must be after start')
  if (normalizedEnd > UINT32_MAX) fail('Invalid end')
  if (normalizedStart < BigInt(Math.floor(Date.now() / 1000))) fail('Cannot book in the past')

  return {
    labId: normalizedLabId,
    start: normalizedStart,
    end: normalizedEnd,
  }
}

export function validateCancellationReservationKey(value) {
  return validateReservationKey(value, true)
}

export function validateReservationPayload(action, payloadInput) {
  const payload = requirePayloadObject(payloadInput)
  if (action === ACTION_CODES.CANCEL_REQUEST_BOOKING) {
    rejectUnexpectedFields(payload, new Set(['reservationKey']))
    validateCancellationReservationKey(payload.reservationKey)
    return { reservationKey: payload.reservationKey }
  }

  if (action !== ACTION_CODES.REQUEST_BOOKING && action !== DIRECT_BOOKING_ACTION) {
    fail('Invalid reservation action code')
  }
  rejectUnexpectedFields(payload, new Set(['labId', 'start', 'end', 'timeslot']))
  return validateReservationWindow(payload)
}

export const INTENT_UINT_LIMITS = {
  UINT32_MAX,
  UINT96_MAX,
  UINT256_MAX,
}
