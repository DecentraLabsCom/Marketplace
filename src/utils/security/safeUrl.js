const parseSafeUrl = (value, protocols) => {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const parsed = new URL(value.trim())
    if (!protocols.includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export const safeExternalHttpsUrl = (value) => {
  const parsed = parseSafeUrl(value, ['https:'])
  return parsed?.toString() || null
}

export const safeExternalHttpUrl = (value) => {
  const parsed = parseSafeUrl(value, ['http:', 'https:'])
  return parsed?.toString() || null
}

export const parseSafeExternalHttpUrl = (value) => parseSafeUrl(value, ['http:', 'https:'])
