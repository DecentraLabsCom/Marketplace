/**
 * Custom hook for lab reservation state management.
 * Institutional flow only: wallet-based reservation state has been removed.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNotifications } from '@/context/NotificationContext'
import { useLabToken } from '@/context/LabTokenContext'
import {
  useReservationRequest,
  useBookingCacheUpdates
} from '@/hooks/booking/useBookings'
import { BOOKING_STATUS, isCancelledBooking } from '@/utils/booking/bookingStatus'
import { generateTimeOptions } from '@/utils/booking/labBookingCalendar'
import { normalizeReservationKey } from '@/utils/booking/reservationKey'
import { useSsoReservationFlow, SSO_BOOKING_STAGE } from './useSsoReservationFlow'
import { useReservationButtonState } from './useReservationButtonState'
import { findTrackedBookingForFlow } from './flowTracking'
import devLog from '@/utils/dev/logger'
import {
  notifyReservationConfirmed,
  notifyReservationRequestAcceptedAwaitingOnChain,
} from '@/utils/notifications/reservationToasts'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'

const safeParseDate = (value, fallback = new Date()) => {
  if (value === undefined || value === null) return fallback
  if (value instanceof Date && !isNaN(value)) return value

  const numericValue = Number(value)
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return new Date(numericValue * 1000)
  }

  try {
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) return parsed
  } catch (error) {
    devLog.warn('Failed to parse date:', value, error)
  }

  return fallback
}

const toEpochSeconds = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const buildRequestMatchKey = (booking) => {
  const reservationKey = normalizeReservationKey(booking?.reservationKey || booking?.id)
  if (reservationKey) return `key:${reservationKey}`

  const labId = booking?.labId !== undefined && booking?.labId !== null
    ? String(booking.labId)
    : null
  const start = toEpochSeconds(booking?.start)
  if (labId && Number.isFinite(start)) return `slot:${labId}:${start}`

  return null
}

const buildPendingCalendarBooking = (request) => {
  if (!request) return null

  const labId = request.labId !== undefined && request.labId !== null
    ? String(request.labId)
    : null
  const start = toEpochSeconds(request.start)
  const end = toEpochSeconds(request.end)
  if (!labId || !Number.isFinite(start)) return null

  const normalizedKey = normalizeReservationKey(request.reservationKey)
  const syntheticKey = normalizedKey || `pending-${labId}-${start}`

  return {
    id: syntheticKey,
    reservationKey: syntheticKey,
    labId,
    start,
    end: Number.isFinite(end) ? end : null,
    date: new Date(start * 1000).toLocaleDateString('en-CA'),
    status: BOOKING_STATUS.PENDING,
    statusCategory: 'pending',
    isPending: true,
    isOptimistic: true,
  }
}

export function useLabReservationState({
  selectedLab,
  labBookings,
  userBookingsForLab = [],
  isSSO,
} = {}) {
  const { addTemporaryNotification } = useNotifications()
  const {
    calculateReservationCost,
    formatPrice,
  } = useLabToken()

  const bookingCacheUpdates = useBookingCacheUpdates()
  const queryClient = useQueryClient()
  const reservationRequestMutation = useReservationRequest()

  const [date, setDate] = useState(new Date())
  const [duration, setDuration] = useState(15)
  const [selectedTime, setSelectedTime] = useState('')
  const [isBooking, setIsBooking] = useState(false)
  const [forceRefresh, setForceRefresh] = useState(0)
  const [isClient, setIsClient] = useState(false)
  const [pendingData, setPendingData] = useState(null)

  const optimisticRemovedRef = useRef(false)
  const fallbackSsoToastKeysRef = useRef(new Set())
  const confirmedSsoToastKeysRef = useRef(new Set())

  const {
    ssoBookingStage,
    activeSsoRequest,
    isSSOFlowLocked,
    startSsoProcessing,
    markSsoRequestSent,
    resetSsoReservationFlow,
  } = useSsoReservationFlow({
    isSSO,
    userBookingsForLab,
    labBookings,
  })

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    optimisticRemovedRef.current = false
  }, [pendingData?.optimisticId])

  useEffect(() => {
    if (selectedLab && Array.isArray(selectedLab.timeSlots) && selectedLab.timeSlots.length > 0) {
      setDuration(selectedLab.timeSlots[0])
    }
  }, [selectedLab])

  useEffect(() => {
    if (selectedLab && selectedLab.opens) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const opensDate = safeParseDate(selectedLab.opens, today)

      if (opensDate > today) {
        setDate(opensDate)
      }
    }
  }, [selectedLab])

  const { minDate, maxDate } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const opensDate = selectedLab ? safeParseDate(selectedLab.opens, today) : today
    const min = opensDate > today ? opensDate : today
    const max = selectedLab ? safeParseDate(selectedLab.closes) : undefined

    return { minDate: min, maxDate: max }
  }, [selectedLab])

  const availableTimes = useMemo(() => {
    if (!selectedLab) return []

    return generateTimeOptions({
      date,
      interval: duration,
      lab: selectedLab,
      bookingInfo: (labBookings || []).filter((booking) => !isCancelledBooking(booking))
    })
  }, [selectedLab, date, duration, labBookings])

  const calendarUserBookingsForLab = useMemo(() => {
    const baseUserBookings = Array.isArray(userBookingsForLab) ? userBookingsForLab : []
    const combinedBookings = [
      ...baseUserBookings,
      ...(Array.isArray(labBookings) ? labBookings : []),
    ]

    let trackedBooking = null
    let syntheticBooking = null

    if (isSSO && ssoBookingStage === SSO_BOOKING_STAGE.REQUEST_REGISTERED) {
      trackedBooking = findTrackedBookingForFlow(combinedBookings, activeSsoRequest)
      syntheticBooking = buildPendingCalendarBooking(activeSsoRequest)
    }

    const merged = [...baseUserBookings]
    if (trackedBooking) {
      merged.push(trackedBooking)
    } else if (syntheticBooking) {
      merged.push(syntheticBooking)
    }

    const deduped = new Map()
    merged.forEach((booking) => {
      const dedupeKey = buildRequestMatchKey(booking)
      if (!dedupeKey) {
        deduped.set(`fallback-${deduped.size}`, booking)
        return
      }

      const existing = deduped.get(dedupeKey)
      if (!existing || existing?.isOptimistic) {
        deduped.set(dedupeKey, booking)
      }
    })

    return Array.from(deduped.values())
  }, [
    userBookingsForLab,
    labBookings,
    isSSO,
    ssoBookingStage,
    activeSsoRequest,
  ])

  const trackedSsoBooking = useMemo(() => {
    if (!isSSO || !activeSsoRequest) return null
    return findTrackedBookingForFlow([
      ...(Array.isArray(userBookingsForLab) ? userBookingsForLab : []),
      ...(Array.isArray(labBookings) ? labBookings : []),
    ], activeSsoRequest)
  }, [isSSO, activeSsoRequest, userBookingsForLab, labBookings])

  const totalCost = useMemo(
    () => (selectedLab ? calculateReservationCost(selectedLab.price, duration) : 0n),
    [selectedLab, duration, calculateReservationCost]
  )

  useEffect(() => {
    if (!selectedLab) return

    const firstAvailable = availableTimes.find((time) => !time.disabled)
    const newSelectedTime = firstAvailable ? firstAvailable.value : ''

    if (selectedTime && !availableTimes.find((time) => time.value === selectedTime && !time.disabled)) {
      setSelectedTime(newSelectedTime)
    } else if (!selectedTime) {
      setSelectedTime(newSelectedTime)
    }
  }, [date, duration, selectedLab, labBookings?.length, selectedTime, availableTimes])

  useEffect(() => {
    if (!selectedLab || forceRefresh === 0) return

    const currentlySelected = availableTimes.find((time) => time.value === selectedTime)
    if (!currentlySelected || currentlySelected.disabled) {
      const firstAvailable = availableTimes.find((time) => !time.disabled)
      setSelectedTime(firstAvailable ? firstAvailable.value : '')
    }
  }, [forceRefresh, selectedLab, availableTimes, selectedTime])

  useEffect(() => {
    if (!pendingData?.optimisticId || !Array.isArray(labBookings)) return

    const matchingRealBooking = labBookings.find((booking) => {
      if (booking.isOptimistic) return false

      const bookingStart = parseInt(booking.start, 10)
      const pendingStart = parseInt(pendingData.start, 10)

      return booking.labId?.toString() === pendingData.labId?.toString() &&
        Math.abs(bookingStart - pendingStart) < 60
    })

    if (!matchingRealBooking) return

    if (pendingData?.isOptimistic && !optimisticRemovedRef.current) {
      bookingCacheUpdates.removeOptimisticBooking(pendingData.optimisticId)
      optimisticRemovedRef.current = true
      setForceRefresh((current) => current + 1)
    }

    const statusNumber = Number(matchingRealBooking.status)
    if (!Number.isFinite(statusNumber)) return

    if (statusNumber === BOOKING_STATUS.CANCELLED || statusNumber > BOOKING_STATUS.PENDING) {
      setPendingData(null)
      setForceRefresh((current) => current + 1)
    }
  }, [labBookings, pendingData, bookingCacheUpdates])

  useEffect(() => {
    if (!isSSO || ssoBookingStage !== SSO_BOOKING_STAGE.REQUEST_REGISTERED) return

    const normalizedReservationKey = normalizeReservationKey(
      activeSsoRequest?.reservationKey || pendingData?.reservationKey || pendingData?.optimisticId
    )
    if (!normalizedReservationKey) return
    if (fallbackSsoToastKeysRef.current.has(normalizedReservationKey)) return

    const timer = setTimeout(() => {
      notifyReservationRequestAcceptedAwaitingOnChain(
        addTemporaryNotification,
        normalizedReservationKey
      )
      fallbackSsoToastKeysRef.current.add(normalizedReservationKey)
    }, 1200)

    return () => clearTimeout(timer)
  }, [
    isSSO,
    ssoBookingStage,
    activeSsoRequest?.reservationKey,
    pendingData?.reservationKey,
    pendingData?.optimisticId,
    addTemporaryNotification,
  ])

  useEffect(() => {
    if (!isSSO || !activeSsoRequest) return

    const normalizedReservationKey = normalizeReservationKey(
      trackedSsoBooking?.reservationKey ||
      activeSsoRequest?.reservationKey ||
      pendingData?.reservationKey ||
      pendingData?.optimisticId
    )
    if (!normalizedReservationKey) return

    const trackedStatus = Number(trackedSsoBooking?.status)
    if (!Number.isFinite(trackedStatus) || trackedStatus <= BOOKING_STATUS.PENDING) return
    if (trackedStatus === BOOKING_STATUS.CANCELLED) return
    if (confirmedSsoToastKeysRef.current.has(normalizedReservationKey)) return

    notifyReservationConfirmed(addTemporaryNotification, normalizedReservationKey)
    confirmedSsoToastKeysRef.current.add(normalizedReservationKey)
  }, [
    isSSO,
    activeSsoRequest,
    trackedSsoBooking,
    pendingData?.reservationKey,
    pendingData?.optimisticId,
    addTemporaryNotification,
  ])

  useEffect(() => {
    if (!isSSO || typeof window === 'undefined') return undefined

    const invalidateTrackedQueries = (detail = {}) => {
      const eventReservationKey = normalizeReservationKey(detail?.reservationKey)
      const activeReservationKey = normalizeReservationKey(activeSsoRequest?.reservationKey)
      const pendingReservationKey = normalizeReservationKey(pendingData?.reservationKey || pendingData?.optimisticId)
      const eventLabId = detail?.labId !== undefined && detail?.labId !== null ? String(detail.labId) : null
      const activeLabId = activeSsoRequest?.labId !== undefined && activeSsoRequest?.labId !== null
        ? String(activeSsoRequest.labId)
        : null

      const matchesKey =
        !eventReservationKey ||
        eventReservationKey === activeReservationKey ||
        eventReservationKey === pendingReservationKey
      const matchesLab = !eventLabId || eventLabId === activeLabId
      if (!matchesKey && !matchesLab) return

      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.ssoReservationsOf() })
      queryClient.invalidateQueries({
        queryKey: bookingQueryKeys.ssoReservationKeyOfUserPrefix(),
        exact: false,
      })
      if (eventReservationKey) {
        queryClient.invalidateQueries({
          queryKey: bookingQueryKeys.byReservationKey(eventReservationKey),
        })
      }
      if (activeLabId) {
        queryClient.invalidateQueries({
          queryKey: bookingQueryKeys.getReservationsOfToken(activeLabId),
        })
        queryClient.invalidateQueries({
          queryKey: bookingQueryKeys.reservationOfTokenPrefix(activeLabId),
          exact: false,
        })
      }
    }

    const handleOnChainRegistered = (event) => invalidateTrackedQueries(event?.detail)
    const handleDenied = (event) => invalidateTrackedQueries(event?.detail)

    window.addEventListener('reservation-request-onchain', handleOnChainRegistered)
    window.addEventListener('reservation-request-denied', handleDenied)

    return () => {
      window.removeEventListener('reservation-request-onchain', handleOnChainRegistered)
      window.removeEventListener('reservation-request-denied', handleDenied)
    }
  }, [
    isSSO,
    activeSsoRequest?.reservationKey,
    activeSsoRequest?.labId,
    pendingData?.reservationKey,
    pendingData?.optimisticId,
    queryClient,
  ])

  const handleDateChange = useCallback((newDate) => {
    setDate(newDate)
  }, [])

  const handleDurationChange = useCallback((newDuration) => {
    setDuration(newDuration)
  }, [])

  const handleTimeChange = useCallback((newTime) => {
    setSelectedTime(newTime)
  }, [])

  const handleBookingSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: bookingQueryKeys.ssoReservationsOf() })
    setForceRefresh((current) => current + 1)
    setIsBooking(false)
    devLog.log('Booking success - relying on intent polling and cache invalidation')
  }, [queryClient])

  const reservationButtonState = useReservationButtonState({
    selectedTime,
    isBooking,
    bookingStage: ssoBookingStage,
    isFlowLocked: isSSOFlowLocked,
  })

  return {
    date,
    duration,
    selectedTime,
    isBooking,
    forceRefresh,
    isClient,
    minDate,
    maxDate,
    availableTimes,
    calendarUserBookingsForLab,
    totalCost,
    bookingStage: ssoBookingStage,
    isFlowLocked: isSSOFlowLocked,
    ssoBookingStage,
    isSSOFlowLocked,
    reservationButtonState,
    setIsBooking,
    setPendingData,
    setForceRefresh,
    handleDateChange,
    handleDurationChange,
    handleTimeChange,
    handleBookingSuccess,
    startSsoProcessing,
    markSsoRequestSent,
    resetSsoReservationFlow,
    formatPrice,
    reservationRequestMutation,
    bookingCacheUpdates
  }
}
