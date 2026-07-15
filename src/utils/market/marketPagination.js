export const DEFAULT_MARKET_PAGE_SIZE = 24
export const MAX_MARKET_PAGE_SIZE = 100

const isIntegerString = (value) => /^\d+$/.test(String(value))

const parseInteger = (value, fallback, { allowZero = true } = {}) => {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  if (!isIntegerString(value)) {
    throw new Error('Invalid market pagination parameter')
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || (!allowZero && parsed < 1)) {
    throw new Error('Invalid market pagination parameter')
  }

  return parsed
}

export const parseMarketPageParams = ({ cursor, limit } = {}) => ({
  cursor: parseInteger(cursor, 0),
  limit: Math.min(
    parseInteger(limit, DEFAULT_MARKET_PAGE_SIZE, { allowZero: false }),
    MAX_MARKET_PAGE_SIZE,
  ),
})

export const getNextMarketCursor = ({ cursor, sourceCount, total }) => {
  const normalizedCursor = Number(cursor)
  const normalizedCount = Number(sourceCount)
  const normalizedTotal = Number(total)

  if (
    !Number.isSafeInteger(normalizedCursor)
    || !Number.isSafeInteger(normalizedCount)
    || normalizedCount <= 0
    || !Number.isSafeInteger(normalizedTotal)
    || normalizedTotal <= normalizedCursor + normalizedCount
  ) {
    return null
  }

  return String(normalizedCursor + normalizedCount)
}
