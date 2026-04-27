export function calculateBookingSummary(bookings = [], options = {}) {
  const {
    includeUpcoming = true,
    includeCancelled = true
  } = options

  if (!Array.isArray(bookings) || bookings.length === 0) {
    return {
      totalBookings: 0,
      activeBookings: 0,
      upcomingBookings: 0,
      completedBookings: 0,
      cancelledBookings: 0,
      pendingBookings: 0
    }
  }

  const now = Math.floor(Date.now() / 1000)

  const filteredForSummary = bookings.filter((booking) => {
    const status = parseInt(booking.status)
    const end = booking.end || booking.endTime
    const intentStatus = (booking.intentStatus || '').toLowerCase()

    if (status === 0 && end && Number.isFinite(Number(end)) && now > Number(end)) {
      return false
    }

    if (status === 5 || booking.statusCategory === 'cancelled') {
      return false
    }

    if (intentStatus === 'rejected' || intentStatus === 'failed' || intentStatus === 'denied') {
      return false
    }

    return true
  })

  const summary = {
    totalBookings: filteredForSummary.length,
    activeBookings: 0,
    upcomingBookings: 0,
    completedBookings: 0,
    cancelledBookings: 0,
    pendingBookings: 0
  }

  filteredForSummary.forEach((booking) => {
    const statusCategory = booking.statusCategory
    const status = parseInt(booking.status)
    const start = booking.start || booking.startTime
    const end = booking.end || booking.endTime
    let bucket = null

    if (statusCategory) {
      switch (statusCategory) {
        case 'active':
        case 'upcoming':
        case 'completed':
        case 'pending':
          bucket = statusCategory
          break
        case 'cancelled':
          if (includeCancelled) bucket = 'cancelled'
          break
        default:
          break
      }
    }

    if (!bucket) {
      if (status === 5) {
        if (includeCancelled) bucket = 'cancelled'
      } else if (status === 0) {
        if (end && Number.isFinite(Number(end)) && now > Number(end)) {
          return
        }
        bucket = 'pending'
      } else if (status === 4 || status === 3) {
        bucket = 'completed'
      } else if (status === 2) {
        if (start && end) {
          if (now >= start && now <= end) {
            bucket = 'active'
          } else if (now < start) {
            bucket = 'upcoming'
          } else {
            bucket = 'completed'
          }
        } else {
          bucket = 'active'
        }
      } else if (status === 1) {
        if (start && end) {
          if (now >= start && now <= end) {
            bucket = 'active'
          } else if (now < start) {
            bucket = 'upcoming'
          } else {
            bucket = 'completed'
          }
        } else {
          bucket = 'upcoming'
        }
      } else if (start && end) {
        if (now >= start && now <= end) {
          bucket = 'active'
        } else if (now < start) {
          bucket = 'upcoming'
        } else {
          bucket = 'completed'
        }
      }
    }

    if (!bucket) {
      bucket = 'completed'
    }

    if (bucket === 'active') {
      summary.activeBookings++
    } else if (bucket === 'upcoming') {
      if (includeUpcoming) summary.upcomingBookings++
    } else if (bucket === 'pending') {
      summary.pendingBookings++
    } else if (bucket === 'completed') {
      summary.completedBookings++
    } else if (bucket === 'cancelled') {
      if (includeCancelled) summary.cancelledBookings++
    }
  })

  return summary
}

export function getReservationStatusText(status) {
  switch (status) {
    case 0:
      return 'Pending'
    case 1:
      return 'Confirmed'
    case 2:
      return 'In Use'
    case 3:
      return 'Completed'
    case 4:
      return 'Settled'
    case 5:
      return 'Cancelled'
    default:
      return 'Unknown'
  }
}
