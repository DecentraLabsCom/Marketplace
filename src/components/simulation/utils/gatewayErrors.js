function parseGatewayDetails(payload) {
  const detailsRaw = payload?.details

  if (typeof detailsRaw === 'string') {
    try {
      return JSON.parse(detailsRaw)
    } catch {
      return { error: detailsRaw }
    }
  }

  if (typeof detailsRaw === 'object' && detailsRaw !== null) {
    return detailsRaw
  }

  return null
}

export function resolveGatewayFeatureError(status, payload, { fallbackMessage, unavailableMessage }) {
  const details = parseGatewayDetails(payload)
  const code = String(payload?.code || details?.code || '').toUpperCase()

  if (status === 501 || code === 'NOT_IMPLEMENTED') {
    return {
      unavailable: true,
      message: unavailableMessage,
    }
  }

  return {
    unavailable: false,
    message: payload?.error || details?.error || fallbackMessage,
  }
}
