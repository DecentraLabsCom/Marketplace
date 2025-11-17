/**
 * Comprehensive validation for lab data in full setup mode
 * Validates all required fields, formats, and constraints for lab creation/editing
 * @param {Object} localLab - Lab data object to validate
 * @param {string} localLab.name - Lab name (required)
 * @param {string} localLab.category - Lab category (required)
 * @param {string} localLab.description - Lab description (required)
 * @param {string|number} localLab.price - Lab price per hour (required, must be >= 0)
 * @param {string} localLab.uri - Lab URI/endpoint (required, must be valid URL format)
 * @param {string} localLab.opens - Lab opening date (MM/DD/YYYY format)
 * @param {string} localLab.closes - Lab closing date (MM/DD/YYYY format)
 * @param {Array} localLab.images - Array of image URLs/files
 * @param {Array} localLab.docs - Array of document URLs/files
 * @param {Object} options - Validation options
 * @param {string} options.imageInputType - Type of image input ('file' or 'url')
 * @param {string} options.docInputType - Type of document input ('file' or 'url')
 * @returns {Object} Object containing validation errors (empty if all valid)
 */

import { validateDateString, validateDateRange } from './dates/dateValidation'

const WEEKDAY_VALUES = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY'
]

const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

const normalizeArray = (value) => Array.isArray(value) ? value : []
const normalizeObject = (value) => (value && typeof value === 'object') ? value : {}
export function validateLabFull(localLab, { imageInputType, docInputType }) {
    const errors = {};
    const urlRegex = /^(ftp|http|https):\/\/[^ "]+$/;
    const imageExtensionRegex = /\.(jpeg|jpg|gif|png|webp|svg|bmp|tiff|tif)$/i;
    const pdfExtensionRegex = /\.pdf$/i;
    const shaRegex = /^[a-f0-9]{64}$/i;
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

    if (!localLab.name?.trim()) errors.name = 'Lab name is required';
    if (!localLab.category?.trim()) errors.category = 'Category is required';
    if (!localLab.description?.trim()) errors.description = 'Description is required';

    if (localLab.price === '' || localLab.price === undefined || localLab.price === null) {
        errors.price = 'Price is required';
    } else {
        const priceNum = parseFloat(localLab.price);
        if (isNaN(priceNum) || priceNum < 0) {
            errors.price = 'Price must be a positive number or zero';
        }
    }

    if (!localLab.auth?.trim()) {
        errors.auth = 'Authentication URL is required';
    } else if (!urlRegex.test(localLab.auth)) {
        errors.auth = 'Invalid Authentication URL format';
    }

    if (!localLab.accessURI?.trim()) {
        errors.accessURI = 'Access URI is required';
    } else if (!urlRegex.test(localLab.accessURI)) {
        errors.accessURI = 'Invalid Access URI format';
    }

    if (!localLab.accessKey?.trim()) errors.accessKey = 'Access Key is required';

    // Enhanced date validation
    if (!localLab.opens?.trim()) {
        errors.opens = 'Opening date is required';
    } else {
        const opensValidation = validateDateString(localLab.opens);
        if (!opensValidation.isValid) {
            errors.opens = opensValidation.error;
        }
    }

    if (!localLab.closes?.trim()) {
        errors.closes = 'Closing date is required';
    } else {
        const closesValidation = validateDateString(localLab.closes);
        if (!closesValidation.isValid) {
            errors.closes = closesValidation.error;
        }
    }

    if (!localLab.timeSlots || localLab.timeSlots.length === 0 ||
        localLab.timeSlots.every(slot => isNaN(Number(slot)) || Number(slot) <= 0)) {
        errors.timeSlots = 'At least one valid time slot (positive number) must be selected';
    }

    if (!localLab.keywords || localLab.keywords.length === 0 || localLab.keywords.every(k => !k.trim())) {
        errors.keywords = 'At least one keyword must be added';
    }

    const availableDays = normalizeArray(localLab.availableDays);
    if (availableDays.length === 0) {
        errors.availableDays = 'Select at least one available day';
    } else if (!availableDays.every(day => WEEKDAY_VALUES.includes(day))) {
        errors.availableDays = 'One or more selected days are invalid';
    }

    const availableHours = normalizeObject(localLab.availableHours);
    if (!availableHours.start?.trim()) {
        errors.availableHoursStart = 'Daily start time is required';
    } else if (!timeRegex.test(availableHours.start.trim())) {
        errors.availableHoursStart = 'Start time must use HH:MM (24h) format';
    }
    if (!availableHours.end?.trim()) {
        errors.availableHoursEnd = 'Daily end time is required';
    } else if (!timeRegex.test(availableHours.end.trim())) {
        errors.availableHoursEnd = 'End time must use HH:MM (24h) format';
    }
    if (!errors.availableHoursStart && !errors.availableHoursEnd) {
        const startMinutes = timeToMinutes(availableHours.start.trim());
        const endMinutes = timeToMinutes(availableHours.end.trim());
        if (startMinutes >= endMinutes) {
            errors.availableHoursEnd = 'End time must be later than the start time';
        }
    }

    if (localLab.maxConcurrentUsers === '' || localLab.maxConcurrentUsers === undefined || localLab.maxConcurrentUsers === null) {
        errors.maxConcurrentUsers = 'Concurrent user limit is required';
    } else {
        const maxUsers = parseInt(localLab.maxConcurrentUsers, 10);
        if (isNaN(maxUsers) || maxUsers <= 0) {
            errors.maxConcurrentUsers = 'Concurrent user limit must be a positive integer';
        }
    }

    const unavailableWindows = normalizeArray(localLab.unavailableWindows);
    const hasInvalidWindow = unavailableWindows.some((window) => {
        if (!window) return false;
        const { start, end, reason } = window;
        const hasAnyValue = Boolean(start || end || (reason && reason.trim()));
        if (!hasAnyValue) return false;
        if (!start || !end || !reason?.trim()) {
            return true;
        }
        const startDate = new Date(start);
        const endDate = new Date(end);
        return isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate;
    });
    if (hasInvalidWindow) {
        errors.unavailableWindows = 'Every maintenance window must include valid start/end timestamps and a reason';
    }

    const termsOfUse = normalizeObject(localLab.termsOfUse);
    if (termsOfUse.url?.trim()) {
        if (!urlRegex.test(termsOfUse.url.trim())) {
            errors.termsOfUseUrl = 'Invalid terms of use URL format';
        }
    }
    if (!termsOfUse.effectiveDate?.trim()) {
        errors.termsOfUseEffectiveDate = 'Effective date is required';
    } else {
        const effectiveDateValidation = validateDateString(termsOfUse.effectiveDate);
        if (!effectiveDateValidation.isValid) {
            errors.termsOfUseEffectiveDate = effectiveDateValidation.error;
        }
    }
    if (termsOfUse.sha256?.trim() && !shaRegex.test(termsOfUse.sha256.trim())) {
        errors.termsOfUseSha = 'SHA256 must be a 64-character hexadecimal string';
    }

    // Enhanced date range validation
    if (!errors.opens && !errors.closes && localLab.opens?.trim() && localLab.closes?.trim()) {
        const rangeValidation = validateDateRange(localLab.opens, localLab.closes);
        if (!rangeValidation.isValid) {
            errors.closes = rangeValidation.error;
        }
    }

    // Image and Document link validations
    if (imageInputType === 'link' && Array.isArray(localLab.images)) {
        localLab.images.forEach((imageUrl) => {
            if (imageUrl.trim() && !imageExtensionRegex.test(imageUrl.trim())) {
                errors.images = 'Image link must end with a valid image extension (e.g., .jpg, .png)';
            }
        });
    }
    if (docInputType === 'link' && Array.isArray(localLab.docs)) {
        localLab.docs.forEach((docUrl) => {
            if (docUrl.trim() && !pdfExtensionRegex.test(docUrl.trim())) {
                errors.docs = 'Document link must end with ".pdf"';
            }
        });
    }

    return errors;
}

/**
 * Quick validation for lab data in simplified setup mode
 * Validates only essential fields required for basic lab registration
 * @param {Object} localLab - Lab data object to validate
 * @param {string|number} localLab.price - Lab price per hour (required, must be >= 0)
 * @param {string} localLab.uri - Lab URI/endpoint (required, must be valid URL or external URI format)
 * @returns {Object} Object containing validation errors (empty if all valid)
 */
export function validateLabQuick(localLab) {
    const errors = {};
    const urlRegex = /^(ftp|http|https):\/\/[^ "]+$/;

    if (localLab.price === '' || localLab.price === undefined || localLab.price === null) {
        errors.price = 'Price is required';
    } else {
        const priceNum = parseFloat(localLab.price);
    if (isNaN(priceNum) || priceNum < 0) {
        errors.price = 'Price must be a positive number or zero';
    }
    }

    if (!localLab.auth?.trim()) {
        errors.auth = 'Authentication URL is required';
    } else if (!urlRegex.test(localLab.auth)) {
        errors.auth = 'Invalid Authentication URL format';
    }

    if (!localLab.accessURI?.trim()) {
        errors.accessURI = 'Access URI is required';
    } else if (!urlRegex.test(localLab.accessURI)) {
        errors.accessURI = 'Invalid Access URI format';
    }

    if (!localLab.accessKey?.trim()) errors.accessKey = 'Access Key is required';

    if (!localLab.uri?.trim()) {
        errors.uri = 'Lab Data URL is required';
    } else {
        const isExternalUrlAttempt = localLab.uri.startsWith('http://') ||
            localLab.uri.startsWith('https://') ||
            localLab.uri.startsWith('ftp://');
        if (isExternalUrlAttempt) {
            if (!urlRegex.test(localLab.uri)) {
                errors.uri = 'Invalid external URI format. Must be a valid URL starting with http(s):// or ftp://';
            }
        } else {
            errors.uri = 'It must be an external URL';
        }
    }

    return errors;
}
