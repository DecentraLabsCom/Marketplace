/**
 * Custom hook for lab reservation state management.
 * Institutional flow only: wallet-based reservation state has been removed.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNotifications } from '@/context/NotificationContext'
import { useLabCredit } from '@/context/LabCreditContext'
import {
  useReservationRequest,
  useBookingCacheUpdates
} from '@/hooks/booking/useBookings'
import {
  BOOKING_STATE,
  BOOKING_STATUS,
  isCancelledBooking,
  normalizeBookingStatusCode,
  normalizeBookingStatusState,
} from '@/utils/booking/bookingStatus'
import { generateTimeOptions } from '@/utils/booking/labBookingCalendar'
import { normalizeReservationKey } from '@/utils/booking/reservationKey'
import { useSsoReservationFlow, SSO_BOOKING_STAGE } from './useSsoReservationFlow'
import { useReservationButtonState } from './useReservationButtonState'
import { findTrackedBookingForFlow, isFinalBookingState } from './flowTracking'
import devLog from '@/utils/dev/logger'
import {
  notifyReservationConfirmed,
  notifyReservationRequestAcceptedAwaitingOnChain,
  reservationToastIds,
} from '@/utils/notifications/reservationToasts'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import {
  CALENDAR_PERIOD_BOOKING_MODE,
  normalizeAllowedDurations,
  normalizeBookingMode,
} from '@/utils/pricing/pricingUnits'

const durationToDays = (duration) => {
  const value = Number(duration?.value)
  if (!Number.isFinite(value) || value <= 0) return null
  const unit = String(duration?.unit || '').toLowerCase()
  if (unit === 'day' || unit === 'days') return value
  if (unit === 'week' || unit === 'weeks') return value * 7
  if (unit === 'month' || unit === 'months') return value * 30
  return null
}

const addDaysAtStartOfDay = (value, days) => {
  const base = new Date(value)
  base.setHours(0, 0, 0, 0)
  base.setDate(base.getDate() + Math.max(1, Number(days) || 1))
  return base
}

const resolvePeriodRules = (lab) => lab?.periodRules || {}

const startOfDay = (value) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

const minDateByTime = (...dates) => {
  const valid = dates.filter((date) => date instanceof Date && !isNaN(date.getTime()))
  if (!valid.length) return null
  return valid.reduce((selected, current) => (
    current.getTime() < selected.getTime() ? current : selected
  ))
}

const resolvePeriodBounds = ({ startDate, rules, maxDate }) => {
  const minDays = Math.max(1, Math.trunc(Number(rules?.minDurationDays)) || 1)
  const maxDaysRaw = Math.trunc(Number(rules?.maxDurationDays))
  const start = startOfDay(startDate)
  const minEndDate = addDaysAtStartOfDay(start, minDays)
  const ruleMaxEndDate = Number.isFinite(maxDaysRaw) && maxDaysRaw > 0
    ? addDaysAtStartOfDay(start, Math.max(minDays, maxDaysRaw))
    : null
  const labMaxEndDate = maxDate instanceof Date && !isNaN(maxDate.getTime())
    ? startOfDay(maxDate)
    : null
  const maxEndDate = minDateByTime(ruleMaxEndDate, labMaxEndDate)

  return { minEndDate, maxEndDate }
}

const clampDate = (value, minDate, maxDate) => {
  let resolved = startOfDay(value)
  if (minDate instanceof Date && !isNaN(minDate.getTime()) && resolved < minDate) {
    resolved = new Date(minDate)
  }
  if (maxDate instanceof Date && !isNaN(maxDate.getTime()) && resolved > maxDate) {
    resolved = new Date(maxDate)
  }
  return resolved
}

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

const getBookingPreferenceScore = (booking) => {
  const state = normalizeBookingStatusState(booking)
  const statusCode = normalizeBookingStatusCode(booking)
  let score = 0

  if (isFinalBookingState(state)) {
    score += 1000
  } else if (state === BOOKING_STATE.PENDING || state === BOOKING_STATE.REQUESTED) {
    score += 100
  }

  if (booking?.isOptimistic !== true) {
    score += 10
  }

  if (Number.isFinite(statusCode)) {
    score += statusCode
  }

  return score
}

const preferBooking = (current, candidate) => {
  if (!current) return candidate
  if (!candidate) return current

  const currentScore = getBookingPreferenceScore(current)
  const candidateScore = getBookingPreferenceScore(candidate)
  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidate : current
  }

  const candidateHasKey = Boolean(normalizeReservationKey(candidate?.reservationKey || candidate?.id))
  const currentHasKey = Boolean(normalizeReservationKey(current?.reservationKey || current?.id))
  if (candidateHasKey !== currentHasKey) {
    return candidateHasKey ? candidate : current
  }

  return current
}

const reconcileBookings = (bookings) => {
  const deduped = new Map()

  bookings.forEach((booking) => {
    const dedupeKey = buildRequestMatchKey(booking)
    const mapKey = dedupeKey || `fallback-${deduped.size}`
    const existing = deduped.get(mapKey)
    deduped.set(mapKey, preferBooking(existing, booking))
  })

  return Array.from(deduped.values())
}

export function useLabReservationState({
  selectedLab,
  labBookings,
  userBookingsForLab = [],
  isSSO,
} = {}) {
  const {
    addTemporaryNotification,
    notifications = [],
    removeNotification,
  } = useNotifications()
  const {
    calculateReservationCost,
    formatPrice,
    formatTokenAmount,
  } = useLabCredit()

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
  const [periodEndDate, setPeriodEndDate] = useState(null)

  const optimisticRemovedRef = useRef(false)
  const fallbackSsoToastKeysRef = useRef(new Set())
  const confirmedSsoToastKeysRef = useRef(new Set())
  const confirmPollingStartRef = useRef(null)

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

  const bookingMode = useMemo(() => normalizeBookingMode(selectedLab || {}), [selectedLab])
  const isCalendarPeriod = bookingMode === CALENDAR_PERIOD_BOOKING_MODE
  const allowedDurations = useMemo(() => normalizeAllowedDurations(selectedLab || {}), [selectedLab])
  const periodRules = useMemo(() => resolvePeriodRules(selectedLab || {}), [selectedLab])
  const allowCustomDateRange = isCalendarPeriod && periodRules?.allowCustomDateRange === true

  useEffect(() => {
    if (isCalendarPeriod) {
      const firstDays = allowedDurations.map(durationToDays).find((days) => Number.isFinite(days) && days > 0)
      const resolvedDays = firstDays || 1
      setDuration(resolvedDays)
      setSelectedTime('00:00')
      setPeriodEndDate((current) => current || addDaysAtStartOfDay(date, resolvedDays))
    } else if (selectedLab && Array.isArray(selectedLab.timeSlots) && selectedLab.timeSlots.length > 0) {
      setDuration(selectedLab.timeSlots[0])
      setPeriodEndDate(null)
    }
  }, [selectedLab, isCalendarPeriod, allowedDurations, date])

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

  const { periodEndMinDate, periodEndMaxDate } = useMemo(() => {
    if (!isCalendarPeriod) return { periodEndMinDate: null, periodEndMaxDate: null }
    const bounds = resolvePeriodBounds({ startDate: date, rules: periodRules, maxDate })
    return {
      periodEndMinDate: bounds.minEndDate,
      periodEndMaxDate: bounds.maxEndDate,
    }
  }, [isCalendarPeriod, date, periodRules, maxDate])

  useEffect(() => {
    if (!isCalendarPeriod) return
    const fallbackEnd = addDaysAtStartOfDay(date, duration)
    const nextEnd = clampDate(periodEndDate || fallbackEnd, periodEndMinDate, periodEndMaxDate)
    if (!periodEndDate || nextEnd.getTime() !== periodEndDate.getTime()) {
      setPeriodEndDate(nextEnd)
    }
    const nextDuration = Math.max(1, Math.round((nextEnd.getTime() - startOfDay(date).getTime()) / 86400000))
    if (nextDuration !== duration) {
      setDuration(nextDuration)
    }
  }, [isCalendarPeriod, date, duration, periodEndDate, periodEndMinDate, periodEndMaxDate])

  const availableTimes = useMemo(() => {
    if (!selectedLab) return []
    if (isCalendarPeriod) return [{ value: '00:00', label: 'Full day', disabled: false }]

    return generateTimeOptions({
      date,
      interval: duration,
      lab: selectedLab,
      bookingInfo: (labBookings || []).filter((booking) => !isCancelledBooking(booking))
    })
  }, [selectedLab, isCalendarPeriod, date, duration, labBookings])

  const reconciledBookingsForLab = useMemo(() => (
    reconcileBookings([
      ...(Array.isArray(userBookingsForLab) ? userBookingsForLab : []),
      ...(Array.isArray(labBookings) ? labBookings : []),
    ])
  ), [userBookingsForLab, labBookings])

  const trackedSsoBooking = useMemo(() => {
    if (!isSSO || !activeSsoRequest) return null
    return findTrackedBookingForFlow(reconciledBookingsForLab, activeSsoRequest)
  }, [isSSO, activeSsoRequest, reconciledBookingsForLab])

  const trackedSsoBookingState = useMemo(
    () => normalizeBookingStatusState(trackedSsoBooking),
    [trackedSsoBooking]
  )

  const isTrackedSsoBookingFinal = isFinalBookingState(trackedSsoBookingState)

  const dismissPendingOnChainToasts = useCallback((reservationKeys) => {
    if (typeof removeNotification !== 'function' || !Array.isArray(notifications)) return

    const pendingToastDedupeKeys = new Set(
      reservationKeys
        .map((reservationKey) => normalizeReservationKey(reservationKey))
        .filter(Boolean)
        .map((reservationKey) => reservationToastIds.onchainPending(reservationKey))
    )
    if (pendingToastDedupeKeys.size === 0) return

    notifications
      .filter((notification) => pendingToastDedupeKeys.has(notification?.dedupeKey))
      .forEach((notification) => removeNotification(notification.id))
  }, [notifications, removeNotification])

  const calendarUserBookingsForLab = useMemo(() => {
    const merged = [...reconciledBookingsForLab]

    if (
      isSSO &&
      ssoBookingStage === SSO_BOOKING_STAGE.REQUEST_REGISTERED &&
      !trackedSsoBooking
    ) {
      const syntheticBooking = buildPendingCalendarBooking(activeSsoRequest)
      if (syntheticBooking) {
        merged.push(syntheticBooking)
      }
    }

    return reconcileBookings(merged)
  }, [
    reconciledBookingsForLab,
    isSSO,
    ssoBookingStage,
    activeSsoRequest,
    trackedSsoBooking,
  ])

  const totalCost = useMemo(
    () => {
      if (!selectedLab) return 0n
      if (isCalendarPeriod) {
        const startDate = new Date(date)
        startDate.setHours(0, 0, 0, 0)
        const start = Math.floor(startDate.getTime() / 1000)
        const resolvedEndDate = allowCustomDateRange && periodEndDate
          ? new Date(periodEndDate)
          : addDaysAtStartOfDay(startDate, duration)
        resolvedEndDate.setHours(0, 0, 0, 0)
        const end = Math.floor(resolvedEndDate.getTime() / 1000)
        return calculateReservationCost(selectedLab.price, { start, end })
      }
      return calculateReservationCost(selectedLab.price, duration)
    },
    [selectedLab, isCalendarPeriod, allowCustomDateRange, periodEndDate, date, duration, calculateReservationCost]
  )

  const effectiveBookingStage = isTrackedSsoBookingFinal
    ? SSO_BOOKING_STAGE.IDLE
    : ssoBookingStage

  const effectiveIsSSOFlowLocked = isSSO && effectiveBookingStage !== SSO_BOOKING_STAGE.IDLE

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
    if (isTrackedSsoBookingFinal) return
    // DIRECT_BOOKING is atomic (request+confirm in one tx); the "awaiting" intermediate
    // toast is irrelevant and would appear after "Reservation confirmed." is already shown.
    if (activeSsoRequest?.action === 11 /* DIRECT_BOOKING */) return

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
    isTrackedSsoBookingFinal,
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

    if (!isTrackedSsoBookingFinal) return
    if (confirmedSsoToastKeysRef.current.has(normalizedReservationKey)) return

    dismissPendingOnChainToasts([normalizedReservationKey])
    notifyReservationConfirmed(addTemporaryNotification, normalizedReservationKey)
    confirmedSsoToastKeysRef.current.add(normalizedReservationKey)
  }, [
    isSSO,
    activeSsoRequest,
    trackedSsoBooking,
    pendingData?.reservationKey,
    pendingData?.optimisticId,
    addTemporaryNotification,
    dismissPendingOnChainToasts,
    isTrackedSsoBookingFinal,
  ])

  // Poll for provider confirmation while a request is registered and not yet final.
  // Mirrors the backup polling from the main-branch BookingEventContext, adapted for the
  // SSO-only (no-wagmi) flow. Stops after 2 minutes or when the booking reaches a final state.
  useEffect(() => {
    if (!isSSO || ssoBookingStage !== SSO_BOOKING_STAGE.REQUEST_REGISTERED) return undefined
    if (isTrackedSsoBookingFinal) return undefined

    const labId =
      activeSsoRequest?.labId !== undefined && activeSsoRequest?.labId !== null
        ? String(activeSsoRequest.labId)
        : null
    const reservationKey = normalizeReservationKey(
      activeSsoRequest?.reservationKey || pendingData?.reservationKey
    )
    if (!labId && !reservationKey) return undefined

    confirmPollingStartRef.current = Date.now()

    const interval = setInterval(() => {
      if (!confirmPollingStartRef.current) return
      const elapsed = Date.now() - confirmPollingStartRef.current
      if (elapsed > 120_000) {
        confirmPollingStartRef.current = null
        clearInterval(interval)
        return
      }
      devLog.log('[LabReservationState] Polling for SSO confirmation, elapsed:', Math.round(elapsed / 1000), 's')
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.ssoReservationsOf() })
      if (reservationKey) {
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) })
      }
      if (labId) {
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.getReservationsOfToken(labId) })
        queryClient.invalidateQueries({
          queryKey: bookingQueryKeys.reservationOfTokenPrefix(labId),
          exact: false,
        })
      }
    }, 10_000)

    return () => {
      clearInterval(interval)
      confirmPollingStartRef.current = null
    }
  }, [
    isSSO,
    ssoBookingStage,
    isTrackedSsoBookingFinal,
    activeSsoRequest?.reservationKey,
    activeSsoRequest?.labId,
    pendingData?.reservationKey,
    queryClient,
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

    const handleOnChainRegistered = (event) => {
      const detail = event?.detail || {}
      dismissPendingOnChainToasts([
        detail?.reservationKey,
        activeSsoRequest?.reservationKey,
        pendingData?.reservationKey,
        pendingData?.optimisticId,
      ])
      invalidateTrackedQueries(detail)
    }
    const handleDenied = (event) => {
      const detail = event?.detail || {}
      const eventReservationKey = normalizeReservationKey(detail?.reservationKey)
      const pendingReservationKey = normalizeReservationKey(pendingData?.reservationKey || pendingData?.optimisticId)
      const activeReservationKey = normalizeReservationKey(activeSsoRequest?.reservationKey)
      const eventLabId = detail?.labId !== undefined && detail?.labId !== null ? String(detail.labId) : null
      const pendingLabId = pendingData?.labId !== undefined && pendingData?.labId !== null
        ? String(pendingData.labId)
        : null
      const activeLabId = activeSsoRequest?.labId !== undefined && activeSsoRequest?.labId !== null
        ? String(activeSsoRequest.labId)
        : null

      const matchesKey =
        !eventReservationKey ||
        eventReservationKey === pendingReservationKey ||
        eventReservationKey === activeReservationKey
      const matchesLab =
        !eventLabId ||
        eventLabId === pendingLabId ||
        eventLabId === activeLabId

      if (matchesKey || matchesLab) {
        const references = [
          eventReservationKey,
          pendingData?.reservationKey,
          pendingData?.optimisticId,
          activeSsoRequest?.reservationKey,
        ].filter(Boolean)

        if (references.length > 0) {
          bookingCacheUpdates.removeOptimisticBooking(references)
        }
        setPendingData(null)
        optimisticRemovedRef.current = true
        setForceRefresh((current) => current + 1)
      }

      invalidateTrackedQueries(detail)
    }

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
    pendingData?.labId,
    bookingCacheUpdates,
    queryClient,
    dismissPendingOnChainToasts,
  ])

  const handleDateChange = useCallback((newDate) => {
    setDate(newDate)
    if (isCalendarPeriod) {
      const { minEndDate, maxEndDate } = resolvePeriodBounds({ startDate: newDate, rules: periodRules, maxDate })
      setPeriodEndDate(clampDate(addDaysAtStartOfDay(newDate, duration), minEndDate, maxEndDate))
    }
  }, [isCalendarPeriod, duration, periodRules, maxDate])

  const handlePeriodEndDateChange = useCallback((newEndDate) => {
    if (!newEndDate) return
    const normalizedStart = startOfDay(date)
    const { minEndDate, maxEndDate } = resolvePeriodBounds({ startDate: normalizedStart, rules: periodRules, maxDate })
    const normalizedEnd = clampDate(newEndDate, minEndDate, maxEndDate)
    if (normalizedEnd <= normalizedStart) {
      const fallbackEnd = minEndDate || addDaysAtStartOfDay(normalizedStart, 1)
      setPeriodEndDate(fallbackEnd)
      setDuration(Math.max(1, Math.round((fallbackEnd.getTime() - normalizedStart.getTime()) / 86400000)))
      return
    }
    const days = Math.round((normalizedEnd.getTime() - normalizedStart.getTime()) / 86400000)
    setPeriodEndDate(normalizedEnd)
    setDuration(days)
  }, [date, periodRules, maxDate])

  const handleDurationChange = useCallback((newDuration) => {
    setDuration(newDuration)
    if (isCalendarPeriod) {
      const { minEndDate, maxEndDate } = resolvePeriodBounds({ startDate: date, rules: periodRules, maxDate })
      setPeriodEndDate(clampDate(addDaysAtStartOfDay(date, newDuration), minEndDate, maxEndDate))
    }
  }, [isCalendarPeriod, date, periodRules, maxDate])

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
    bookingStage: effectiveBookingStage,
    isFlowLocked: effectiveIsSSOFlowLocked,
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
    bookingMode,
    isCalendarPeriod,
    allowedDurations,
    periodRules,
    allowCustomDateRange,
    periodEndDate,
    periodEndMinDate,
    periodEndMaxDate,
    calendarUserBookingsForLab,
    totalCost,
    bookingStage: effectiveBookingStage,
    isFlowLocked: effectiveIsSSOFlowLocked,
    ssoBookingStage,
    isSSOFlowLocked,
    reservationButtonState,
    setIsBooking,
    setPendingData,
    setForceRefresh,
    handleDateChange,
    handlePeriodEndDateChange,
    handleDurationChange,
    handleTimeChange,
    handleBookingSuccess,
    startSsoProcessing,
    markSsoRequestSent,
    resetSsoReservationFlow,
    formatPrice,
    formatTokenAmount,
    reservationRequestMutation,
    bookingCacheUpdates
  }
}

