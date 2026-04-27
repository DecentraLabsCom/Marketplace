"use client";
import { useEffect, useState } from 'react'

/**
 * Lightweight client-side clock for UIs that need to react to time windows
 * (for example, bookings moving from upcoming to active).
 */
export function useCurrentTime({ intervalMs = 60000 } = {}) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    setNow(new Date())

    const intervalId = setInterval(() => {
      setNow(new Date())
    }, intervalMs)

    return () => clearInterval(intervalId)
  }, [intervalMs])

  return now
}

export default useCurrentTime
