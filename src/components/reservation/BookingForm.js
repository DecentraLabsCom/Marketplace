/**
 * Booking form component for lab reservations
 * Handles user input for booking details and submission
 */
import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import { formatPrice } from '@/utils/booking/priceHelpers'
import { calculateBookingDuration } from '@/utils/booking/timeHelpers'

/**
 * Booking form component
 * @param {Object} props
 * @param {Object} props.lab - Lab being booked
 * @param {Object} props.selectedSlot - Selected time slot
 * @param {Function} props.onSubmit - Form submission handler
 * @param {boolean} props.isSubmitting - Whether form is submitting
 * @param {string} props.error - Error message if any
 */
export default function BookingForm({ 
  lab, 
  selectedSlot, 
  onSubmit, 
  isSubmitting = false, 
  error = null 
}) {
  const [formData, setFormData] = useState({
    purpose: '',
    notes: '',
    acceptTerms: false
  })

  const [errors, setErrors] = useState({})

  // Calculate booking details
  const duration = calculateBookingDuration(selectedSlot.startDate, selectedSlot.endDate)
  const totalPrice = lab.price * duration.hours

  /**
   * Handle input changes
   */
  const handleChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }))
    }
  }, [errors])

  /**
   * Validate form
   */
  const validateForm = useCallback(() => {
    const newErrors = {}

    if (!formData.purpose.trim()) {
      newErrors.purpose = 'Purpose is required'
    }

    if (!formData.acceptTerms) {
      newErrors.acceptTerms = 'You must accept the terms and conditions'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData])

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    onSubmit(formData)
  }, [formData, validateForm, onSubmit])

  return (
    <div className="space-y-6">
      {/* Booking Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-3">Booking Summary</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Duration:</span>
            <span className="font-medium">{duration.hours} hours</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Price per hour:</span>
            <span className="font-medium">{formatPrice(lab.price)} LAB</span>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-2">
            <span className="text-gray-900 font-medium">Total:</span>
            <span className="font-bold text-lg">{formatPrice(totalPrice)} LAB</span>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Purpose */}
        <div>
          <label htmlFor="purpose" className="block text-sm font-medium text-gray-700 mb-1">
            Purpose of Use *
          </label>
          <input
            type="text"
            id="purpose"
            value={formData.purpose}
            onChange={(e) => handleChange('purpose', e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.purpose ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="Brief description of your intended use"
            disabled={isSubmitting}
          />
          {errors.purpose && (
            <p className="text-red-600 text-sm mt-1">{errors.purpose}</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            Additional Notes
          </label>
          <textarea
            id="notes"
            rows={3}
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Any additional information or special requirements"
            disabled={isSubmitting}
          />
        </div>

        {/* Terms and Conditions */}
        <div>
          <div className="flex items-start">
            <input
              type="checkbox"
              id="acceptTerms"
              checked={formData.acceptTerms}
              onChange={(e) => handleChange('acceptTerms', e.target.checked)}
              className="mt-1 size-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              disabled={isSubmitting}
            />
            <label htmlFor="acceptTerms" className="ml-2 text-sm text-gray-700">
              I accept the{' '}
              <a href="/terms" className="text-blue-600 hover:text-blue-500" target="_blank">
                terms and conditions
              </a>{' '}
              and{' '}
              <a href="/privacy" className="text-blue-600 hover:text-blue-500" target="_blank">
                privacy policy
              </a>
            </label>
          </div>
          {errors.acceptTerms && (
            <p className="text-red-600 text-sm mt-1">{errors.acceptTerms}</p>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full size-4 border-b-2 border-white mr-2"></div>
              Creating Booking...
            </div>
          ) : (
            `Book for ${formatPrice(totalPrice)} LAB`
          )}
        </button>
      </form>
    </div>
  )
}

BookingForm.propTypes = {
  lab: PropTypes.object.isRequired,
  selectedSlot: PropTypes.object.isRequired,
  onSubmit: PropTypes.func.isRequired,
  isSubmitting: PropTypes.bool,
  error: PropTypes.string
}
