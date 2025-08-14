import HydrationBoundary from '@/components/ui/HydrationBoundary'
import { prefetchLabDetails } from '@/utils/ssr/prefetch'
import LabDetail from '@/components/lab/LabDetail'

/**
 * Individual lab page with server-side prefetched lab data
 * Pre-loads specific lab details, metadata, and owner info for optimal UX and SEO
 * Falls back gracefully if prefetch fails
 */
export default async function LabDetailWrapper({ params }) {
  const { id } = await params;
  
  // Prefetch specific lab data on server for seamless hydration and SEO
  const dehydratedState = await prefetchLabDetails(id)

  return (
    <HydrationBoundary state={dehydratedState} logHydration={true}>
      <LabDetail id={id} />
    </HydrationBoundary>
  )
}