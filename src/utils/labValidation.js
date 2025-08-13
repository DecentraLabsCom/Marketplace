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

import { validateDateString, validateDateRange } from './dateValidation'
export function validateLabFull(localLab, { imageInputType, docInputType }) {
    const errors = {};
    const urlRegex = /^(ftp|http|https):\/\/[^ "]+$/;
    const imageExtensionRegex = /\.(jpeg|jpg|gif|png|webp|svg|bmp|tiff|tif)$/i;
    const pdfExtensionRegex = /\.pdf$/i;

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