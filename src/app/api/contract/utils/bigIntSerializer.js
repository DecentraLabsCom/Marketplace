/**
 * Utility for serializing BigInt values to JSON-compatible strings
 * Used for blockchain contract responses that contain BigInt values
 */

/**
 * Converts BigInt values to strings for JSON serialization
 * Recursively processes objects and arrays
 * @param {any} obj - Object that may contain BigInt values
 * @returns {any} - Object with BigInt values converted to strings
 */
export function serializeBigInt(obj) {
  if (typeof obj === 'bigint') {
    return obj.toString()
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt)
  }
  if (obj !== null && typeof obj === 'object') {
    const serialized = {}
    for (const [key, value] of Object.entries(obj)) {
      serialized[key] = serializeBigInt(value)
    }
    return serialized
  }
  return obj
}

/**
 * Creates a Response.json with BigInt values automatically serialized
 * @param {any} data - Data to serialize and return
 * @param {ResponseInit} options - Response options (status, headers, etc.)
 * @returns {Response} - JSON response with serialized data
 */
export function createSerializedJsonResponse(data, options = {}) {
  const serializedData = serializeBigInt(data)
  return Response.json(serializedData, options)
}
