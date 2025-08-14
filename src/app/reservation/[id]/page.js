import HydrationBoundary from '@/components/ui/HydrationBoundary'
import { prefetchLabDetails } from '@/utils/ssr/prefetch'
import LabReservation from '@/components/reservation/LabReservation'

/**
 * Specific lab reservation page with server-side prefetched lab data
 * Pre-loads specific lab details and availability for optimal UX
 * Falls back gracefully if prefetch fails
 */
export default async function LabReservationWrapper({ params }) {
  const { id } = await params;
  
  // Prefetch specific lab data on server for seamless reservation interface
  const dehydratedState = await prefetchLabDetails(id)

  return (
    <HydrationBoundary state={dehydratedState} logHydration={true}>
      <LabReservation id={id} />
    </HydrationBoundary>
  )
}