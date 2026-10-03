const ALIASES = new Map([
  ['ai/ml', 'Artificial Intelligence & Machine Learning'],
  ['ai and ml', 'Artificial Intelligence & Machine Learning'],
  ['computer-science', 'Computer Science'],
  ['cyber security', 'Cybersecurity'],
  ['engineering', 'Engineering & Technology'],
])

export function normalizeLabCategories(labOrCategories) {
  const values = Array.isArray(labOrCategories)
    ? labOrCategories
    : [
        labOrCategories?.category,
        ...(Array.isArray(labOrCategories?.categories) ? labOrCategories.categories : []),
        ...(Array.isArray(labOrCategories?.attributes) ? labOrCategories.attributes
          .filter((attribute) => attribute?.trait_type?.toLowerCase?.() === 'category')
          .flatMap((attribute) => attribute.value) : []),
      ]

  const normalized = []
  for (const value of values.flatMap((entry) => Array.isArray(entry) ? entry : [entry])) {
    if (typeof value !== 'string' || !value.trim()) continue
    const trimmed = value.trim()
    const canonical = ALIASES.get(trimmed.toLowerCase()) || trimmed
    if (!normalized.includes(canonical)) normalized.push(canonical)
  }
  return normalized
}

export function isAccessDenied(response) {
  return response?.allowed === false
}
