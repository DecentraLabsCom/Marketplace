/**
 * Booking confirmation component
 * Displays successful booking details and next steps
 */
import React from 'react'
import PropTypes from 'prop-types'
import { formatDateRange } from '@/utils/booking/dateHelpers'
import { formatPrice } from '@/utils/booking/priceHelpers'

/**
 * Booking confirmation component
 * @param {Object} props
 * @param {Object} props.booking - Completed booking data
 * @param {Object} props.lab - Lab that was booked
 * @param {Function} props.onClose - Close handler
 */
export default function BookingConfirmation({ booking, lab, onClose }) {
  return (
    <div className="space-y-6">
      {/* Success Message */}
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900">
          Booking Confirmed!
        </h3>
        <p className="text-gray-600 mt-1">
          Your lab session has been successfully booked.
        </p>
      </div>

      {/* Booking Details */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h4 className="font-medium text-gray-900 mb-4">Booking Details</h4>
        
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Booking ID:</span>
            <span className="font-mono text-sm bg-gray-200 px-2 py-1 rounded">
              {booking.id}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Lab:</span>
            <span className="font-medium">{lab.name}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Time:</span>
            <span className="font-medium">
              {formatDateRange(booking.startDate, booking.endDate)}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Total Paid:</span>
            <span className="font-medium">{formatPrice(booking.totalPrice)} LAB</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Status:</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Confirmed
            </span>
          </div>
        </div>
      </div>

      {/* Access Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">
          Access Information
        </h4>
        <div className="space-y-2 text-sm text-blue-800">
          <p>
            <strong>Lab URL:</strong>{' '}
            <a 
              href={lab.accessURI} 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline hover:text-blue-600"
            >
              {lab.accessURI}
            </a>
          </p>
          {lab.accessKey && (
            <p>
              <strong>Access Key:</strong>{' '}
              <span className="font-mono bg-blue-100 px-2 py-1 rounded">
                {lab.accessKey}
              </span>
            </p>
          )}
          <p className="text-xs text-blue-600 mt-2">
            💡 You can access the lab 5 minutes before your scheduled time
          </p>
        </div>
      </div>

      {/* Next Steps */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">What&apos;s Next?</h4>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start">
            <span className="text-blue-600 mr-2">•</span>
            Access will be available when your session starts
          </li>
          <li className="flex items-start">
            <span className="text-blue-600 mr-2">•</span>
            You can view and manage your bookings in your dashboard
          </li>
          <li className="flex items-start">
            <span className="text-blue-600 mr-2">•</span>
            Contact support if you have any issues
          </li>
        </ul>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center space-x-4 pt-4">
        <button
          onClick={() => window.open('/userdashboard', '_blank')}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          View My Bookings
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </div>
  )
}

BookingConfirmation.propTypes = {
  booking: PropTypes.object.isRequired,
  lab: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired
}
