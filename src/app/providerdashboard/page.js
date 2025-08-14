import HydrationBoundary from '@/components/ui/HydrationBoundary'
import { prefetchLabsData } from '@/utils/ssr/prefetch'
import ProviderDashboardPage from '@/components/dashboard/provider/ProviderDashboardPage'

/**
 * Provider dashboard page with hybrid SSR strategy
 * Pre-loads public labs data for immediate display
 * Provider-specific filtering and bookings load progressively after auth
 */
export default async function ProviderDashboardWrapper() {
  // Prefetch public labs data (provider will filter by ownership client-side)
  const dehydratedState = await prefetchLabsData()

  return (
    <HydrationBoundary state={dehydratedState}>
      <ProviderDashboardPage />
    </HydrationBoundary>
  )
}