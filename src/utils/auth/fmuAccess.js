export async function establishFmuGatewaySession({ labURL, accessCode, labId, reservationKey }) {
  const response = await fetch('/api/auth/fmu-session', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labURL, accessCode, labId, reservationKey }),
  })
  if (!response.ok) {
    throw new Error(`FMU access-code exchange failed (${response.status})`)
  }
  const payload = await response.json()
  return payload.gatewayOrigin
}
