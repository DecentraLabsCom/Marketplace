/**
 * Hook for lab form validation
 * Centralizes validation logic for both quick and full lab setup forms
 */
import { useCallback, useMemo } from 'react'
import { validateLabFull, validateLabQuick } from '@/utils/labValidation'
import devLog from '@/utils/dev/logger'

/**
 * Custom hook for lab form validation
 * @param {Object} lab - Lab object to validate
 * @param {string} mode - Validation mode ('quick' or 'full')
 * @param {Object} refs - Form field refs for validation
 * @returns {Object} Validation utilities and state
 */
export function useLabValidation(lab, mode = 'full', refs = {}) {
  
  /**
   * Validate lab data based on mode
   * @param {Object} labData - Lab data to validate
   * @param {string} validationMode - 'quick' or 'full'
   * @returns {Object} Validation result with errors and isValid flag
   */
  const validateLab = useCallback((labData, validationMode = mode) => {
    try {
      let validationResult
      
      if (validationMode === 'quick') {
        validationResult = validateLabQuick(labData, refs)
      } else {
        validationResult = validateLabFull(labData, refs)
      }
      
      devLog.log(`🔍 Lab validation (${validationMode}):`, {
        isValid: validationResult.isValid,
        errors: validationResult.errors,
        lab: labData
      })
      
      return validationResult
    } catch (error) {
      devLog.error('❌ Validation error:', error)
      return {
        isValid: false,
        errors: { general: 'Validation failed. Please check your input.' }
      }
    }
  }, [mode, refs])

  /**
   * Validate a specific field
   * @param {string} fieldName - Name of the field to validate
   * @param {any} value - Value to validate
   * @returns {string|null} Error message or null if valid
   */
  const validateField = useCallback((fieldName, value) => {
    // Create a temporary lab object with just this field
    const tempLab = { ...lab, [fieldName]: value }
    const result = validateLab(tempLab, mode)
    
    return result.errors[fieldName] || null
  }, [lab, mode, validateLab])

  /**
   * Check if lab data is valid for the current mode
   * @param {Object} labData - Lab data to check
   * @returns {boolean} True if valid
   */
  const isValid = useCallback((labData) => {
    const result = validateLab(labData, mode)
    return result.isValid
  }, [validateLab, mode])

  /**
   * Get all current errors for the lab
   * @param {Object} labData - Lab data to validate
   * @returns {Object} Object with field names as keys and error messages as values
   */
  const getErrors = useCallback((labData) => {
    const result = validateLab(labData, mode)
    return result.errors
  }, [validateLab, mode])

  /**
   * Required fields for the current validation mode
   */
  const requiredFields = useMemo(() => {
    if (mode === 'quick') {
      return ['name', 'category', 'description', 'price', 'auth']
    }
    return [
      'name', 'category', 'keywords', 'description', 'price', 
      'auth', 'accessURI', 'accessKey', 'timeSlots', 'opens', 'closes'
    ]
  }, [mode])

  /**
   * Check if a specific field is required
   * @param {string} fieldName - Name of the field
   * @returns {boolean} True if required
   */
  const isFieldRequired = useCallback((fieldName) => {
    return requiredFields.includes(fieldName)
  }, [requiredFields])

  /**
   * Get validation status for all fields
   * @param {Object} labData - Lab data to validate
   * @returns {Object} Object with field validation status
   */
  const getFieldValidationStatus = useCallback((labData) => {
    const errors = getErrors(labData)
    const status = {}
    
    // Check all possible fields
    const allFields = [
      'name', 'category', 'keywords', 'description', 'price',
      'auth', 'accessURI', 'accessKey', 'timeSlots', 'opens', 'closes',
      'imageUrls', 'docUrls', 'uri'
    ]
    
    allFields.forEach(field => {
      status[field] = {
        isValid: !errors[field],
        error: errors[field] || null,
        isRequired: isFieldRequired(field)
      }
    })
    
    return status
  }, [getErrors, isFieldRequired])

  /**
   * Validate and format price
   * @param {string|number} price - Price value to validate
   * @returns {Object} Validation result with formatted price
   */
  const validatePrice = useCallback((price) => {
    if (!price || price === '') {
      return { isValid: false, error: 'Price is required', formattedPrice: null }
    }
    
    const numPrice = parseFloat(price)
    if (isNaN(numPrice) || numPrice < 0) {
      return { isValid: false, error: 'Price must be a valid positive number', formattedPrice: null }
    }
    
    return { 
      isValid: true, 
      error: null, 
      formattedPrice: numPrice.toString() 
    }
  }, [])

  /**
   * Validate URI format
   * @param {string} uri - URI to validate
   * @returns {Object} Validation result
   */
  const validateURI = useCallback((uri) => {
    if (!uri || uri.trim() === '') {
      return { isValid: false, error: 'URI is required' }
    }
    
    try {
      new URL(uri)
      return { isValid: true, error: null }
    } catch {
      return { isValid: false, error: 'Invalid URI format' }
    }
  }, [])

  /**
   * Validate time format (HH:MM)
   * @param {string} time - Time string to validate
   * @returns {Object} Validation result
   */
  const validateTime = useCallback((time) => {
    if (!time || time.trim() === '') {
      return { isValid: false, error: 'Time is required' }
    }
    
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(time)) {
      return { isValid: false, error: 'Time must be in HH:MM format' }
    }
    
    return { isValid: true, error: null }
  }, [])

  return {
    // Validation functions
    validateLab,
    validateField,
    isValid,
    getErrors,
    getFieldValidationStatus,
    
    // Field-specific validators
    validatePrice,
    validateURI,
    validateTime,
    
    // Utilities
    requiredFields,
    isFieldRequired
  }
}
