/**
 * Date formatting utilities for lab metadata
 * Ensures all dates are stored in MM/DD/YYYY format regardless of user input
 */

/**
 * Converts various date formats to MM/DD/YYYY
 * Supports:
 * - MM/DD/YYYY (already correct)
 * - DD/MM/YYYY (European format) - detected when day > 12
 * - YYYY-MM-DD (ISO format)
 * - M/D/YYYY, MM/D/YYYY, M/DD/YYYY (mixed formats)
 * 
 * IMPORTANT: For ambiguous cases (e.g., 02/03/2025), assumes MM/DD/YYYY format.
 * Only swaps to DD/MM/YYYY when first number > 12 (clearly a day).
 * 
 * @param {string} dateString - Input date string
 * @returns {string} Date in MM/DD/YYYY format, or original string if invalid
 */
export function convertToMMDDYYYY(dateString) {
  if (!dateString || typeof dateString !== 'string') {
    return dateString;
  }

  const trimmed = dateString.trim();
  if (!trimmed) {
    return dateString;
  }

  // Already in MM/DD/YYYY format (basic check)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [month, day, year] = trimmed.split('/').map(Number);
    
    // Validate ranges - if month > 12, assume it's DD/MM/YYYY and swap
    if (month > 12 && day <= 12) {
      // Swap day and month (DD/MM/YYYY -> MM/DD/YYYY)
      return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
    } else if (month <= 12 && day <= 31) {
      // Already correct MM/DD/YYYY, just ensure 2-digit formatting
      return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
    }
  }

  // Handle ISO format YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
  }

  // Handle variations with different separators
  if (/^\d{1,2}[-.]?\d{1,2}[-.]?\d{4}$/.test(trimmed)) {
    const parts = trimmed.split(/[-.]/).map(Number);
    const [first, second, year] = parts;
    
    // Assume first part is month if <= 12, otherwise day
    if (first <= 12 && second <= 31) {
      // MM-DD-YYYY or MM.DD.YYYY
      return `${first.toString().padStart(2, '0')}/${second.toString().padStart(2, '0')}/${year}`;
    } else if (first > 12 && second <= 12) {
      // DD-MM-YYYY or DD.MM.YYYY -> swap to MM/DD/YYYY
      return `${second.toString().padStart(2, '0')}/${first.toString().padStart(2, '0')}/${year}`;
    }
  }

  // If we can't parse it confidently, try creating a Date object as fallback
  try {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      const month = date.getMonth() + 1; // getMonth() is 0-indexed
      const day = date.getDate();
      const year = date.getFullYear();
      return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
    }
  } catch {
    // Date parsing failed, return original string
  }

  // If all parsing attempts fail, return original string
  return dateString;
}

/**
 * Converts lab data to ensure opens and closes dates are in MM/DD/YYYY format
 * @param {Object} labData - Lab data object
 * @returns {Object} Lab data with converted dates
 */
export function normalizeLabDates(labData) {
  if (!labData || typeof labData !== 'object') {
    return labData;
  }

  const normalized = { ...labData };

  if (normalized.opens) {
    normalized.opens = convertToMMDDYYYY(normalized.opens);
  }

  if (normalized.closes) {
    normalized.closes = convertToMMDDYYYY(normalized.closes);
  }

  return normalized;
}
