import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { marketQueryKeys } from '@/utils/hooks/queryKeys'

const STATUS_QUERY_CONFIG = Object.freeze({
  staleTime: 15_000,
  gcTime: 2 * 60_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: false,
})

const normalizeLabIds = (labIds) => {
  const normalized = [...new Set((Array.isArray(labIds) ? labIds : [])
    .map((labId) => String(labId ?? '').trim())
    .filter((labId) => /^\d+$/.test(labId)))]
  return normalized.sort((left, right) => Number(left) - Number(right))
}

export const fetchLabOperationalStatuses = async (labIds) => {
  const normalizedLabIds = normalizeLabIds(labIds)
  if (normalizedLabIds.length === 0) return {}

  const params = new URLSearchParams({ labIds: normalizedLabIds.join(',') })
  const response = await fetch(`/api/market/lab-status?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Lab status unavailable (${response.status})`)

  const payload = await response.json()
  return Object.fromEntries((Array.isArray(payload?.statuses) ? payload.statuses : [])
    .map((status) => [String(status?.labId), status]))
}

export const useLabOperationalStatuses = (labIds, options = {}) => {
  const normalizedLabIds = useMemo(() => normalizeLabIds(labIds), [labIds])
  const queryClient = useQueryClient()
  const singleLabId = normalizedLabIds.length === 1 ? normalizedLabIds[0] : null
  const queryKey = useMemo(() => (
    normalizedLabIds.length === 1
      ? marketQueryKeys.labStatus(normalizedLabIds[0])
      : marketQueryKeys.labStatuses(normalizedLabIds)
  ), [normalizedLabIds])
  const query = useQuery({
    queryKey,
    queryFn: () => fetchLabOperationalStatuses(normalizedLabIds),
    enabled: normalizedLabIds.length > 0 && options.enabled !== false,
    ...STATUS_QUERY_CONFIG,
    ...options.queryOptions,
  })

  const statuses = useMemo(() => {
    if (!query.data || typeof query.data !== 'object') return {}
    if (singleLabId === null) return query.data
    if (query.data.labId !== undefined) return { [singleLabId]: query.data }
    return query.data[singleLabId] ? { [singleLabId]: query.data[singleLabId] } : {}
  }, [query.data, singleLabId])

  useEffect(() => {
    if (!statuses || typeof statuses !== 'object') return

    Object.entries(statuses).forEach(([labId, value]) => {
      queryClient.setQueryData(
        marketQueryKeys.labStatus(labId),
        value,
        value?.state === 'unknown' ? { updatedAt: 0 } : undefined,
      )
    })
    queryClient.setQueriesData(
      { queryKey: marketQueryKeys.labStatusesPrefix() },
      (cachedStatuses) => {
        if (!cachedStatuses || typeof cachedStatuses !== 'object' || Array.isArray(cachedStatuses)) {
          return cachedStatuses
        }
        let changed = false
        const nextStatuses = { ...cachedStatuses }
        Object.entries(statuses).forEach(([labId, value]) => {
          if (nextStatuses[labId] === value) return
          nextStatuses[labId] = value
          changed = true
        })
        return changed ? nextStatuses : cachedStatuses
      },
    )
  }, [queryClient, statuses])

  return {
    ...query,
    data: statuses,
  }
}

export const getLabOperationalStatus = (statuses, labId) => (
  statuses?.[String(labId)] || {
    labId: String(labId),
    state: 'unknown',
    reason: 'status_unavailable',
    source: 'status_unavailable',
    observedAt: null,
    ageSeconds: null,
    severity: 'neutral',
  }
)
