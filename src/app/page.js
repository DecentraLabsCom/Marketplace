import HydrationBoundary from '@/components/ui/HydrationBoundary'
import { prefetchLabsData } from '@/utils/ssr/prefetch'
import Market from '@/components/home/Market'

/**
 * Homepage with server-side prefetched lab data for optimal UX
 * Pre-loads critical lab and provider data to eliminate loading flash
 * Falls back gracefully if prefetch fails
 */
export default async function HomePage() {
  // Prefetch critical data on server for seamless hydration
  const dehydratedState = await prefetchLabsData()

  return (
    <div>
      <div className="relative bg-cover bg-center text-white pt-8 pb-4 text-center">
        <div className="absolute inset-0"></div>
        <div className="relative z-10">
          <h1 className="text-3xl font-bold mb-2">Explore Online Labs</h1>
          <p className="text-base">Discover and access laboratories from anywhere in the world.</p>
          <div className="mt-4 border-t-4 border-brand w-80 mx-auto" />
        </div>
      </div>
      
      {/* HydrationBoundary provides prefetched data to client components */}
      <HydrationBoundary state={dehydratedState} logHydration={true}>
        <Market />
      </HydrationBoundary>
    </div>
  )
}
