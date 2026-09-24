import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { marketQueryKeys } from '@/utils/hooks/queryKeys'
import { RESOURCE_TYPES, getResourceType } from '@/utils/resourceType'

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

const STATUS_SOURCE_PRIORITY = Object.freeze({
  status_unavailable: 0,
  guacamole_tcp_probe: 1,
  lab_station_heartbeat: 2,
})

const parseStatusTimestamp = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

const parseStatusAge = (value) => {
  const age = Number(value)
  return Number.isFinite(age) && age >= 0 ? age : null
}

const shouldReplaceStatus = (currentStatus, incomingStatus) => {
  if (!currentStatus || typeof currentStatus !== 'object') return true
  if (!incomingStatus || typeof incomingStatus !== 'object') return false

  const currentObservedAt = parseStatusTimestamp(currentStatus.observedAt)
  const incomingObservedAt = parseStatusTimestamp(incomingStatus.observedAt)
  if (currentObservedAt !== incomingObservedAt) {
    // An actual lab observation is stronger evidence than a response that
    // contains no observation at all, regardless of the projected state.
    if (currentObservedAt !== null && incomingObservedAt === null) return false
    if (currentObservedAt === null && incomingObservedAt !== null) return true
    return incomingObservedAt > currentObservedAt
  }

  const currentGeneratedAt = parseStatusTimestamp(currentStatus.generatedAt)
  const incomingGeneratedAt = parseStatusTimestamp(incomingStatus.generatedAt)
  if (currentGeneratedAt !== incomingGeneratedAt) {
    if (currentGeneratedAt === null) return true
    if (incomingGeneratedAt === null) return false
    return incomingGeneratedAt > currentGeneratedAt
  }

  const currentAge = parseStatusAge(currentStatus.ageSeconds)
  const incomingAge = parseStatusAge(incomingStatus.ageSeconds)
  if (currentAge !== null && incomingAge !== null && currentAge !== incomingAge) {
    return incomingAge < currentAge
  }

  const currentSourcePriority = STATUS_SOURCE_PRIORITY[currentStatus.source] ?? 0
  const incomingSourcePriority = STATUS_SOURCE_PRIORITY[incomingStatus.source] ?? 0
  if (currentSourcePriority !== incomingSourcePriority) {
    return incomingSourcePriority > currentSourcePriority
  }

  // If the Gateway provides no ordering metadata, accept the latest response
  // rather than coupling freshness rules to particular state combinations.
  return true
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
    queryFn: async () => {
      const fetchedStatuses = await fetchLabOperationalStatuses(normalizedLabIds)
      return Object.fromEntries(Object.entries(fetchedStatuses).map(([labId, value]) => {
        const cachedStatus = queryClient.getQueryData(marketQueryKeys.labStatus(labId))
        return [labId, shouldReplaceStatus(cachedStatus, value) ? value : cachedStatus]
      }))
    },
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
      const singleStatusKey = marketQueryKeys.labStatus(labId)
      const cachedStatus = queryClient.getQueryData(singleStatusKey)
      if (!shouldReplaceStatus(cachedStatus, value)) return
      queryClient.setQueryData(singleStatusKey, value, value?.state === 'unknown'
        ? { updatedAt: 0 }
        : undefined)
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
          if (!shouldReplaceStatus(nextStatuses[labId], value)) return
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

export const getLabOperationalStatus = (statuses, labId, resourceType = RESOURCE_TYPES.LAB) => {
  const status = statuses?.[String(labId)]
  if (!status) {
    return {
      labId: String(labId),
      state: 'unknown',
      reason: 'status_unavailable',
      source: 'status_unavailable',
      observedAt: null,
      ageSeconds: null,
      severity: 'neutral',
    }
  }

  const capability = getResourceType({ resourceType }) === RESOURCE_TYPES.FMU
    ? status.capabilities?.fmu
    : status.capabilities?.physicalLab
  return capability || status
}
