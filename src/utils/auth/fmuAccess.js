export async function establishFmuGatewaySession(labURL, accessCode) {
  const gatewayOrigin = new URL(String(labURL || '')).origin
  const response = await fetch(`${gatewayOrigin}/auth/access`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_code: String(accessCode || '') }),
  })
  if (!response.ok) {
    throw new Error(`FMU access-code exchange failed (${response.status})`)
  }
  return gatewayOrigin
}
