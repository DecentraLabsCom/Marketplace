/**
 * General reusable helpers.
 */

/**
 * Recursively sorts object keys to build a deterministic structure.
 *
 * @param {*} value - The value to sort.
 * @returns {*} The sorted value.
 */
export function sortValue(value) {
  if (value === null || value === undefined) {
    return null
  }

  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item))
  }

  if (typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortValue(value[key])
        return acc
      }, {})
  }

  return value
}

export default {
  sortValue,
}