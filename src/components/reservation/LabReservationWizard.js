/**
 * Lab reservation wizard component with integrated calendar and booking management
 * Simplified version of LabReservation with better separation of concerns
 */
import React, { useState, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { 
  useCreateBookingMutation,
  useBookingsForCalendar, 
  useLabBookingsDashboard 
} from '@/hooks/booking/useBookings'
import CalendarWithBookings from '@/components/booking/CalendarWithBookings'
import BookingForm from '@/components/reservation/BookingForm'
import BookingConfirmation from '@/components/reservation/BookingConfirmation'
import { formatDateRange } from '@/utils/booking/dateHelpers'
import { isSlotAvailable } from '@/utils/booking/bookingValidation'
import devLog from '@/utils/dev/logger'

/**
 * Reservation wizard steps
 */
const STEPS = {
  SELECT_SLOT: 'select',
  BOOK_SLOT: 'book',
  CONFIRM: 'confirm'
}

/**
 * Lab reservation wizard component
 * @param {Object} props
 * @param {Object} props.lab - Lab object
 * @param {Object} props.user - Current user object
 * @param {string} props.userAccount - User wallet/account address
 * @param {Function} props.onBookingComplete - Callback when booking is completed
 * @param {Function} props.onClose - Callback to close the wizard
 */
export default function LabReservationWizard({ 
  lab, 
  user, 
  userAccount, 
  onBookingComplete, 
  onClose 
}) {
  // State management
  const [currentStep, setCurrentStep] = useState(STEPS.SELECT_SLOT)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [bookingData, setBookingData] = useState(null)

  // Data fetching
  const { 
    data: userBookingsData, 
    isLoading: userBookingsLoading 
  } = useBookingsForCalendar(userAccount, lab?.id, {
    enabled: !!userAccount
  });
  const userBookings = useMemo(() => 
    userBookingsData?.userBookings || [], 
    [userBookingsData?.userBookings]
  );
  
  const { 
    data: labBookingsData, 
    isLoading: labBookingsLoading 
  } = useLabBookingsDashboard(lab?.id, true, {
    enabled: !!lab?.id
  });
  const labBookings = useMemo(() => 
    labBookingsData?.bookings || [], 
    [labBookingsData?.bookings]
  );

  // Booking creation
  const {
    createBooking,
    isBooking,
    isWaitingForReceipt,
    calculateBookingCost,
    formatBalance,
    formatPrice
  } = useCreateBookingMutation(lab, handleBookingSuccess)

  // Combined bookings for calendar
  const allBookings = useMemo(() => {
    return [...userBookings, ...labBookings]
  }, [userBookings, labBookings])

  /**
   * Handle successful booking
   */
  function handleBookingSuccess(booking) {
    setBookingData(booking)
    setCurrentStep(STEPS.CONFIRM)
    
    if (onBookingComplete) {
      onBookingComplete(booking)
    }
  }

  /**
   * Handle slot selection from calendar
   */
  const handleSlotSelect = useCallback((startDate, endDate) => {
    const slot = {
      startDate,
      endDate,
      lab,
      user
    }

    // Validate slot availability
    if (!isSlotAvailable(slot, allBookings)) {
      devLog.warn('⚠️ Selected slot is not available')
      return
    }

    setSelectedSlot(slot)
    setCurrentStep(STEPS.BOOK_SLOT)
  }, [lab, user, allBookings])

  /**
   * Handle booking form submission
   */
  const handleBookingSubmit = useCallback(async (formData) => {
    if (!selectedSlot) {
      devLog.error('❌ No slot selected for booking')
      return
    }

    const bookingRequest = {
      labId: lab.id,
      startDate: selectedSlot.startDate,
      endDate: selectedSlot.endDate,
      userAccount,
      ...formData
    }

    await createBooking(bookingRequest)
  }, [selectedSlot, lab.id, userAccount, createBooking])

  /**
   * Go back to previous step
   */
  const handleStepBack = useCallback(() => {
    switch (currentStep) {
      case STEPS.BOOK_SLOT:
        setCurrentStep(STEPS.SELECT_SLOT)
        setSelectedSlot(null)
        break
      case STEPS.CONFIRM:
        setCurrentStep(STEPS.BOOK_SLOT)
        break
      default:
        break
    }
  }, [currentStep])

  /**
   * Close the wizard
   */
  const handleClose = useCallback(() => {
    setCurrentStep(STEPS.SELECT_SLOT)
    setSelectedSlot(null)
    setBookingData(null)
    if (onClose) {
      onClose()
    }
  }, [onClose])

  // Loading state
  if (userBookingsLoading || labBookingsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full size-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading calendar...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-2xl font-bold text-gray-900">
          Reserve {lab.name}
        </h2>
        <p className="text-gray-600 mt-1">
          {lab.category} • {lab.keywords?.join(', ')}
        </p>
        
        {/* Step indicator */}
        <div className="flex items-center mt-4 space-x-4">
          <div className={`flex items-center ${
            currentStep === STEPS.SELECT_SLOT ? 'text-blue-600' : 'text-gray-400'
          }`}>
            <div className={`size-6 rounded-full border-2 flex items-center justify-center text-xs ${
              currentStep === STEPS.SELECT_SLOT ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'
            }`}>
              1
            </div>
            <span className="ml-2 text-sm font-medium">Select Time</span>
          </div>
          
          <div className={`flex items-center ${
            currentStep === STEPS.BOOK_SLOT ? 'text-blue-600' : 'text-gray-400'
          }`}>
            <div className={`size-6 rounded-full border-2 flex items-center justify-center text-xs ${
              currentStep === STEPS.BOOK_SLOT ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'
            }`}>
              2
            </div>
            <span className="ml-2 text-sm font-medium">Book Slot</span>
          </div>
          
          <div className={`flex items-center ${
            currentStep === STEPS.CONFIRM ? 'text-blue-600' : 'text-gray-400'
          }`}>
            <div className={`size-6 rounded-full border-2 flex items-center justify-center text-xs ${
              currentStep === STEPS.CONFIRM ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'
            }`}>
              3
            </div>
            <span className="ml-2 text-sm font-medium">Confirm</span>
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">
        {currentStep === STEPS.SELECT_SLOT && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Select a time slot
            </h3>
            <CalendarWithBookings
              lab={lab}
              bookings={allBookings}
              onSlotSelect={handleSlotSelect}
              userAccount={userAccount}
              className="max-w-none"
            />
          </div>
        )}

        {currentStep === STEPS.BOOK_SLOT && selectedSlot && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Book your slot
            </h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-blue-900">Selected Time Slot</h4>
              <p className="text-blue-700">
                {formatDateRange(selectedSlot.startDate, selectedSlot.endDate)}
              </p>
            </div>
            <BookingForm
              lab={lab}
              selectedSlot={selectedSlot}
              onSubmit={handleBookingSubmit}
              isSubmitting={isBooking || isWaitingForReceipt}
              error={null} // Errors are now handled by notifications
            />
          </div>
        )}

        {currentStep === STEPS.CONFIRM && bookingData && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Booking Confirmed!
            </h3>
            <BookingConfirmation
              booking={bookingData}
              lab={lab}
              onClose={handleClose}
            />
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t border-gray-200">
        <button
          onClick={currentStep === STEPS.SELECT_SLOT ? handleClose : handleStepBack}
          className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
          disabled={isBooking || isWaitingForReceipt}
        >
          {currentStep === STEPS.SELECT_SLOT ? 'Close' : 'Back'}
        </button>

        {currentStep === STEPS.CONFIRM && (
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Done
          </button>
        )}
      </div>
    </div>
  )
}

LabReservationWizard.propTypes = {
  lab: PropTypes.object.isRequired,
  user: PropTypes.object.isRequired,
  userAccount: PropTypes.string.isRequired,
  onBookingComplete: PropTypes.func,
  onClose: PropTypes.func
}
