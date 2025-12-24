const parseNumber = (value) => {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const getLabRatingValue = (reputation) => {
  if (!reputation) return null

  const totalEvents = parseNumber(reputation.totalEvents)
  const score = parseNumber(reputation.score)

  if (totalEvents === null || score === null) return null
  if (totalEvents <= 0) return 0

  const ratio = (score / totalEvents + 1) / 2
  const rating = Math.max(0, Math.min(5, ratio * 5))

  return Math.round(rating * 10) / 10
}

export const getLabAgeLabel = (createdAtSeconds) => {
  const createdAt = parseNumber(createdAtSeconds)
  if (!createdAt) return null

  const diffMs = Math.max(0, Date.now() - createdAt * 1000)
  const days = Math.floor(diffMs / 86400000)

  if (days < 1) return '0d'
  if (days < 30) return `${days}d`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`

  const years = Math.floor(months / 12)
  const remainingMonths = months % 12

  return remainingMonths ? `${years}y ${remainingMonths}mo` : `${years}y`
}
