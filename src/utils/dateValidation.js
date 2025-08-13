/**
 * Enhanced date validation utilities
 * Provides robust date validation that checks:
 * - Valid date formats (MM/DD/YYYY)
 * - Days per month (28/29/30/31)
 * - Leap years for February
 * - Valid month and day ranges
 */

/**
 * Check if a year is a leap year
 * @param {number} year - Year to check
 * @returns {boolean} True if leap year
 */
export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Get maximum days in a month for a given year
 * @param {number} month - Month (1-12)
 * @param {number} year - Year
 * @returns {number} Maximum days in the month
 */
export function getDaysInMonth(month, year) {
  const daysInMonth = {
    1: 31,   // January
    2: isLeapYear(year) ? 29 : 28,  // February
    3: 31,   // March
    4: 30,   // April
    5: 31,   // May
    6: 30,   // June
    7: 31,   // July
    8: 31,   // August
    9: 30,   // September
    10: 31,  // October
    11: 30,  // November
    12: 31   // December
  };
  return daysInMonth[month] || 31;
}

/**
 * Validate a date string in MM/DD/YYYY format
 * Performs comprehensive validation including:
 * - Format validation (MM/DD/YYYY)
 * - Range validation (month 1-12, day within month limits)
 * - Leap year validation for February
 * 
 * @param {string} dateString - Date string to validate
 * @returns {Object} Validation result with isValid and error message
 */
export function validateDateString(dateString) {
  if (!dateString || typeof dateString !== 'string') {
    return { 
      isValid: false, 
      error: 'Date is required' 
    };
  }

  const trimmed = dateString.trim();
  if (!trimmed) {
    return { 
      isValid: false, 
      error: 'Date is required' 
    };
  }

  // Check basic format: MM/DD/YYYY
  const formatRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/(\d{4})$/;
  const match = trimmed.match(formatRegex);
  
  if (!match) {
    return { 
      isValid: false, 
      error: 'Invalid date format. Use MM/DD/YYYY (e.g., 03/15/2025)' 
    };
  }

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  // Additional validation for days within the month
  const maxDays = getDaysInMonth(month, year);
  
  if (day > maxDays) {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    return { 
      isValid: false, 
      error: `Invalid date: ${monthNames[month - 1]} ${year} only has ${maxDays} days` 
    };
  }

  // Validate year range (reasonable limits)
  const currentYear = new Date().getFullYear();
  if (year < currentYear - 1 || year > currentYear + 10) {
    return { 
      isValid: false, 
      error: `Year must be between ${currentYear - 1} and ${currentYear + 10}` 
    };
  }

  return { 
    isValid: true, 
    error: null,
    parsedDate: { month, day, year }
  };
}

/**
 * Validate that opening date is before or equal to closing date
 * @param {string} opensDate - Opening date in MM/DD/YYYY format
 * @param {string} closesDate - Closing date in MM/DD/YYYY format
 * @returns {Object} Validation result
 */
export function validateDateRange(opensDate, closesDate) {
  const opensValidation = validateDateString(opensDate);
  const closesValidation = validateDateString(closesDate);

  // If either date is invalid, don't check the range
  if (!opensValidation.isValid || !closesValidation.isValid) {
    return { isValid: true, error: null }; // Let individual validations handle this
  }

  const opens = new Date(opensDate);
  const closes = new Date(closesDate);

  if (closes < opens) {
    return {
      isValid: false,
      error: 'Closing date must be after or equal to opening date'
    };
  }

  return { isValid: true, error: null };
}
