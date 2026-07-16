import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { marketQueryKeys } from '@/utils/hooks/queryKeys'
import { DEFAULT_MARKET_PAGE_SIZE } from '@/utils/market/marketPagination'

const PUBLIC_MARKET_QUERY_CONFIG = Object.freeze({
  staleTime: 60 * 1000,
  gcTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
})

const getPerformanceNow = () => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
)

const emitMarketFetchMetrics = ({ response, url, cursor, startedAt }) => {
  if (typeof window === 'undefined') return

  const finishedAt = getPerformanceNow()
  const resourceEntries = typeof performance !== 'undefined'
    && typeof performance.getEntriesByName === 'function'
    ? performance.getEntriesByName(url, 'resource')
    : []
  const resourceEntry = resourceEntries[resourceEntries.length - 1]
  const ttfbMs = resourceEntry && Number.isFinite(resourceEntry.responseStart)
    ? Math.round(resourceEntry.responseStart - resourceEntry.startTime)
    : null
  const detail = {
    cursor,
    durationMs: Math.round(finishedAt - startedAt),
    ttfbMs,
    rpcCalls: Number(response.headers.get('X-Market-RPC-Calls')) || null,
    payloadBytes: Number(response.headers.get('X-Market-Payload-Bytes')) || null,
    serverTiming: response.headers.get('Server-Timing'),
  }

  if (typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('decentralabs:market-metrics', { detail }))
  }
}

export const fetchPublicMarketLabs = async ({
  includeUnlisted = false,
  cursor = 0,
  limit = DEFAULT_MARKET_PAGE_SIZE,
  filters = {},
} = {}) => {
  const params = new URLSearchParams({
    includeUnlisted: includeUnlisted ? 'true' : 'false',
    cursor: String(cursor),
    limit: String(limit),
  })
  ;['q', 'searchField', 'category', 'provider', 'resourceType', 'sort'].forEach((key) => {
    if (typeof filters?.[key] === 'string' && filters[key].trim()) {
      params.set(key, filters[key].trim())
    }
  })
  const url = `/api/market/labs?${params.toString()}`
  const startedAt = getPerformanceNow()
  const response = await fetch(url, { headers: { Accept: 'application/json' } })

  if (!response.ok) {
    throw new Error(`Public market catalogue unavailable (${response.status})`)
  }

  const payload = await response.json()
  emitMarketFetchMetrics({ response, url, cursor, startedAt })
  return payload
}

const hasActiveFilters = (filters) => Object.values(filters || {}).some((value) => (
  typeof value === 'string' && value.trim()
))

const getInitialPage = ({ includeUnlisted, filters, initialData }) => {
  if (
    includeUnlisted
    || hasActiveFilters(filters)
    || !initialData
    || !Array.isArray(initialData.labs)
  ) {
    return undefined
  }

  return initialData
}

const getInitialDataUpdatedAt = (initialPage) => {
  const timestamp = initialPage?.snapshotAt ? Date.parse(initialPage.snapshotAt) : NaN
  return Number.isFinite(timestamp) ? timestamp : undefined
}

/**
 * Reads the server-side public catalogue DTO. The first page rendered by the
 * server seeds React Query, so hydration does not issue a duplicate catalogue
 * request. Later pages are fetched explicitly through the cursor.
 */
export const usePublicMarketLabs = ({
  includeUnlisted = false,
  enabled = true,
  initialData = null,
  filters = {},
} = {}) => {
  const normalizedIncludeUnlisted = Boolean(includeUnlisted)
  const normalizedFilters = useMemo(() => Object.fromEntries(
    ['q', 'searchField', 'category', 'provider', 'resourceType', 'sort']
      .flatMap((key) => (
        typeof filters?.[key] === 'string' && filters[key].trim()
          ? [[key, filters[key].trim()]]
          : []
      )),
  ), [filters?.q, filters?.searchField, filters?.category, filters?.provider, filters?.resourceType, filters?.sort])
  const initialPage = getInitialPage({
    includeUnlisted: normalizedIncludeUnlisted,
    filters: normalizedFilters,
    initialData,
  })
  const query = useInfiniteQuery({
    queryKey: marketQueryKeys.publicLabs(normalizedIncludeUnlisted, normalizedFilters),
    queryFn: ({ pageParam = 0 }) => fetchPublicMarketLabs({
      includeUnlisted: normalizedIncludeUnlisted,
      cursor: pageParam,
      limit: DEFAULT_MARKET_PAGE_SIZE,
      filters: normalizedFilters,
    }),
    initialPageParam: initialPage?.cursor ?? 0,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    initialData: initialPage
      ? { pages: [initialPage], pageParams: [initialPage.cursor ?? 0] }
      : undefined,
    initialDataUpdatedAt: getInitialDataUpdatedAt(initialPage),
    enabled: Boolean(enabled) && typeof window !== 'undefined',
    ...PUBLIC_MARKET_QUERY_CONFIG,
  })

  const data = useMemo(() => {
    const pages = query.data?.pages || []
    const labs = pages.flatMap((page) => (Array.isArray(page?.labs) ? page.labs : []))
    const lastPage = pages[pages.length - 1]

    return {
      labs,
      totalLabs: Number.isFinite(Number(lastPage?.totalLabs))
        ? Number(lastPage.totalLabs)
        : labs.length,
      returnedLabs: labs.length,
      cursor: pages[0]?.cursor ?? 0,
      nextCursor: lastPage?.nextCursor ?? null,
      snapshotAt: lastPage?.snapshotAt ?? null,
      catalogueStatus: pages.some((page) => page?.catalogueStatus === 'unavailable')
        ? 'unavailable'
        : pages.some((page) => page?.catalogueStatus === 'stale')
          ? 'stale'
          : 'fresh',
      facets: lastPage?.facets || pages[0]?.facets || { categories: [], providers: [] },
    }
  }, [query.data])

  return {
    ...query,
    data,
  }
}
