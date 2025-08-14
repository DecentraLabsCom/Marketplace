import HydrationBoundary from '@/components/ui/HydrationBoundary'
import { prefetchLabsData } from '@/utils/ssr/prefetch'
import LabReservation from '@/components/reservation/LabReservation'

/**
 * Reservation page with hybrid SSR strategy
 * Pre-loads public labs data for immediate lab selector display  
 * Specific lab bookings and wallet data load progressively
 */
export default async function LabReservationWrapper() {
  // Prefetch public labs data (needed for lab selector)
  const dehydratedState = await prefetchLabsData()

  return (
    <HydrationBoundary state={dehydratedState}>
      <LabReservation />
    </HydrationBoundary>
  )
}
