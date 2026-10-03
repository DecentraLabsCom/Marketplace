import { getIntentBackendAuthToken } from '@/utils/intents/backendClient'

export async function evaluateReservationAccess({ backendUrl, institutionId, institutionalSessionToken, reservation }) {
  const auth = await getIntentBackendAuthToken({ backendUrl, institutionId, scope: 'access-policy:evaluate' })
  const response = await fetch(`${backendUrl.replace(/\/$/, '')}/access-policy/labs/evaluate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      institutionalSessionToken,
      labId: String(reservation.labId),
      price: String(reservation.price ?? 0),
      categories: reservation.categories || [],
      start: String(reservation.start ?? ''),
      end: String(reservation.end ?? ''),
    }),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || 'Lab access policy could not be evaluated')
    error.status = response.status >= 500 ? 503 : response.status
    error.code = payload.code || payload.error
    throw error
  }
  if (payload.allowed === false) {
    const error = new Error('Lab access denied by institutional policy')
    error.status = 403
    error.code = 'LAB_CATEGORY_ACCESS_DENIED'
    throw error
  }
  return payload
}
