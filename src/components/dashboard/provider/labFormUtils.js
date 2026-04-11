export const WEEKDAY_OPTIONS = [
  { value: 'MONDAY', label: 'Mon' },
  { value: 'TUESDAY', label: 'Tue' },
  { value: 'WEDNESDAY', label: 'Wed' },
  { value: 'THURSDAY', label: 'Thu' },
  { value: 'FRIDAY', label: 'Fri' },
  { value: 'SATURDAY', label: 'Sat' },
  { value: 'SUNDAY', label: 'Sun' }
]

export const DEFAULT_TIMEZONES = [
  'UTC',
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Amsterdam',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Bogota',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Africa/Johannesburg',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland'
]

export function resolveSupportedTimezones() {
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try {
      const values = Intl.supportedValuesOf('timeZone')
      if (Array.isArray(values) && values.length > 0) {
        return values
      }
    } catch (error) {
      // Ignore and fall back to defaults.
    }
  }
  return DEFAULT_TIMEZONES
}

export function resolveBrowserTimezone() {
  if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (timezone && typeof timezone === 'string') {
        return timezone
      }
    } catch (error) {
      // Ignore and fall back to UTC.
    }
  }
  return 'UTC'
}

export function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

export function normalizeObject(value, fallback = {}) {
  // Treat null, undefined, non-objects AND empty objects as needing the fallback
  if (!value || typeof value !== 'object' || Object.keys(value).length === 0) return fallback
  return value
}

export function resolveGatewayAuthEndpoint(gatewayUrl) {
  const trimmed = String(gatewayUrl || '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.toLowerCase().endsWith('/auth') ? trimmed : `${trimmed}/auth`
}
