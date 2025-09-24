/**
 * Safely parse dates avoiding UTC timezone conversion issues
 */

/**
 * Parse a date string in local timezone to avoid UTC conversion issues
 * This is especially important when handling YYYY-MM-DD format dates that
 * JavaScript interprets as UTC midnight, which can shift to the previous day
 * in negative UTC offset timezones (like Vancouver UTC-8)
 * 
 * @param {string|Date|number} dateInput - Date to parse
 * @returns {Date|null} Parsed date in local timezone or null if invalid
 */
export function parseDateSafe(dateInput) {
  if (!dateInput) return null;
  
  // If already a Date object, return as-is
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? null : dateInput;
  }
  
  // If it's a number (timestamp), convert normally
  if (typeof dateInput === 'number') {
    const date = new Date(dateInput);
    return isNaN(date.getTime()) ? null : date;
  }
  
  // If it's a string, handle YYYY-MM-DD format specially
  if (typeof dateInput === 'string') {
    // Check if it's YYYY-MM-DD format
    const ymdMatch = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
      const [, year, month, day] = ymdMatch;
      // Create date in local timezone (month is 0-indexed)
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return isNaN(date.getTime()) ? null : date;
    }
    
    // For other string formats, use normal parsing
    const date = new Date(dateInput);
    return isNaN(date.getTime()) ? null : date;
  }
  
  return null;
}

/**
 * Check if two dates represent the same calendar day (ignoring time)
 * @param {Date|string|number} date1 - First date
 * @param {Date|string|number} date2 - Second date
 * @returns {boolean} True if both dates are the same calendar day
 */
export function isSameCalendarDay(date1, date2) {
  const parsedDate1 = parseDateSafe(date1);
  const parsedDate2 = parseDateSafe(date2);
  
  if (!parsedDate1 || !parsedDate2) return false;
  
  return parsedDate1.toDateString() === parsedDate2.toDateString();
}