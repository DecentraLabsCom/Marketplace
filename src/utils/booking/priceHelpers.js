/**
 * Price formatting utilities for lab marketplace
 */

/**
 * Format price with service-credit unit label
 * @param {number} price - Price in service credits
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted price string
 */
export function formatPrice(price, decimals = 2) {
  if (typeof price !== 'number' || isNaN(price)) {
    return '0.00'
  }
  
  return price.toFixed(decimals)
}

/**
 * Format price range (min - max)
 * @param {number} minPrice - Minimum price
 * @param {number} maxPrice - Maximum price
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted price range string
 */
export function formatPriceRange(minPrice, maxPrice, decimals = 2) {
  if (minPrice === maxPrice) {
    return `${formatPrice(minPrice, decimals)} credits`
  }
  
  return `${formatPrice(minPrice, decimals)} - ${formatPrice(maxPrice, decimals)} credits`
}

/**
 * Parse price string to number
 * @param {string} priceString - Price as string
 * @returns {number} Parsed price or 0 if invalid
 */
export function parsePrice(priceString) {
  const parsed = parseFloat(priceString)
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Calculate total price for booking
 * @param {number} hourlyRate - Hourly rate in service credits
 * @param {number} hours - Number of hours
 * @returns {number} Total price
 */
export function calculateTotalPrice(hourlyRate, hours) {
  return hourlyRate * hours
}

/**
 * Format currency with thousand separators
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency symbol (default: 'credits')
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount, currency = 'credits') {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
  
  return `${formatted} ${currency}`
}
