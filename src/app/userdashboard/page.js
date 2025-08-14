import HydrationBoundary from '@/components/ui/HydrationBoundary'
import { prefetchLabsData } from '@/utils/ssr/prefetch'
import UserDashboardPage from '@/components/dashboard/user/UserDashboardPage'

/**
 * User dashboard page with hybrid SSR strategy  
 * Pre-loads public labs data for immediate display
 * User-specific bookings load progressively after auth
 */
export default async function UserDashboardWrapper() {
  // Prefetch public labs data (needed to enrich user bookings)
  const dehydratedState = await prefetchLabsData()

  return (
    <HydrationBoundary state={dehydratedState}>
      <UserDashboardPage />
    </HydrationBoundary>
  )
}