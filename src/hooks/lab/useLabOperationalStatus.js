import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
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
  const query = useQuery({
    queryKey: marketQueryKeys.labStatuses(normalizedLabIds),
    queryFn: () => fetchLabOperationalStatuses(normalizedLabIds),
    enabled: normalizedLabIds.length > 0 && options.enabled !== false,
    ...STATUS_QUERY_CONFIG,
    ...options.queryOptions,
  })

  return {
    ...query,
    data: query.data || {},
  }
}

export const getLabOperationalStatus = (statuses, labId) => (
  statuses?.[String(labId)] || {
    labId: String(labId),
    state: 'unknown',
    reason: 'status_unavailable',
    source: 'lab_station_heartbeat',
    observedAt: null,
    ageSeconds: null,
    severity: 'neutral',
  }
)
