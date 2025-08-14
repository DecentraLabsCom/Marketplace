import HydrationBoundary from '@/components/ui/HydrationBoundary'
import { prefetchProvidersOnly } from '@/utils/ssr/prefetch'
import RegisterProviderPage from '@/components/register/RegisterProviderPage'

/**
 * Provider registration page with server-side prefetched provider data
 * Pre-loads existing providers list for validation and UI feedback
 * Helps with form validation and duplicate checking
 */
export default async function RegisterProviderWrapper() {
  // Prefetch providers data (for validation and existing provider checks)
  const dehydratedState = await prefetchProvidersOnly()

  return (
    <HydrationBoundary state={dehydratedState}>
      <RegisterProviderPage />
    </HydrationBoundary>
  )
}