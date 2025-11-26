/**
 * Date utilities rewritten to favor Unix timestamps (seconds)
 */

const toUnixSeconds = (value) => {
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric)
  }
  const parsed = new Date(value)
  if (isNaN(parsed.getTime())) return value
  return Math.floor(parsed.getTime() / 1000)
}

/**
 * Normalizes date-bearing fields in lab data to Unix seconds.
 * @param {Object} labData - Lab data object
 * @returns {Object} Lab data with dates converted to Unix seconds
 */
export function normalizeLabDates(labData) {
  if (!labData || typeof labData !== 'object') {
    return labData;
  }

  const normalized = { ...labData };

  if (normalized.opens !== undefined) {
    normalized.opens = toUnixSeconds(normalized.opens);
  }

  if (normalized.closes !== undefined) {
    normalized.closes = toUnixSeconds(normalized.closes);
  }

  if (normalized.termsOfUse?.effectiveDate !== undefined) {
    normalized.termsOfUse = {
      ...normalized.termsOfUse,
      effectiveDate: toUnixSeconds(normalized.termsOfUse.effectiveDate)
    };
  }

  if (Array.isArray(normalized.unavailableWindows)) {
    normalized.unavailableWindows = normalized.unavailableWindows.map(window => ({
      ...window,
      startUnix: toUnixSeconds(window.startUnix ?? window.start),
      endUnix: toUnixSeconds(window.endUnix ?? window.end)
    }))
  }

  return normalized;
}
