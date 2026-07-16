import {
  getMarketLabsSnapshot,
  MARKET_CATALOGUE_STATUS,
} from './getMarketLabsSnapshot'
import {
  buildMarketFacets,
  filterMarketLabs,
  paginateMarketLabs,
} from './marketCatalogueFilters'

const MARKET_SOURCE_PAGE_SIZE = 100

const unavailableCatalogue = ({ cursor, limit }) => ({
  labs: [],
  totalLabs: 0,
  returnedLabs: 0,
  cursor,
  limit,
  nextCursor: null,
  snapshotAt: null,
  catalogueStatus: MARKET_CATALOGUE_STATUS.UNAVAILABLE,
  errorCode: 'MARKET_CATALOGUE_UNAVAILABLE',
  facets: { categories: [], providers: [] },
})

const snapshotTimestamp = (snapshots) => snapshots
  .map((snapshot) => Date.parse(snapshot?.snapshotAt))
  .filter(Number.isFinite)
  .sort((left, right) => left - right)[0]

const mergeMetrics = (snapshots) => snapshots.reduce((metrics, snapshot) => ({
  durationMs: metrics.durationMs + Math.max(0, Number(snapshot?.metrics?.durationMs) || 0),
  rpcCalls: metrics.rpcCalls + Math.max(0, Number(snapshot?.metrics?.rpcCalls) || 0),
  metadataFetches: metrics.metadataFetches + Math.max(0, Number(snapshot?.metrics?.metadataFetches) || 0),
  requestedLabs: metrics.requestedLabs + Math.max(0, Number(snapshot?.metrics?.requestedLabs) || 0),
  returnedLabs: metrics.returnedLabs + Math.max(0, Number(snapshot?.metrics?.returnedLabs) || 0),
}), {
  durationMs: 0,
  rpcCalls: 0,
  metadataFetches: 0,
  requestedLabs: 0,
  returnedLabs: 0,
})

/**
 * Builds a queryable public catalogue from the server-side read model. Source
 * pages remain independently cached, while filters and cursor pagination are
 * applied only after every source page has been considered.
 */
export async function getMarketCatalogueSnapshot({
  includeUnlisted = false,
  cursor = 0,
  limit = 24,
  filters = {},
} = {}) {
  const firstPage = await getMarketLabsSnapshot({
    includeUnlisted,
    cursor: 0,
    limit: MARKET_SOURCE_PAGE_SIZE,
  })

  if (firstPage?.catalogueStatus === MARKET_CATALOGUE_STATUS.UNAVAILABLE) {
    return unavailableCatalogue({ cursor, limit })
  }

  const totalSourceLabs = Math.max(0, Number(firstPage?.totalLabs) || 0)
  const sourceSnapshots = [firstPage]
  for (let sourceCursor = MARKET_SOURCE_PAGE_SIZE; sourceCursor < totalSourceLabs; sourceCursor += MARKET_SOURCE_PAGE_SIZE) {
    const sourcePage = await getMarketLabsSnapshot({
      includeUnlisted,
      cursor: sourceCursor,
      limit: MARKET_SOURCE_PAGE_SIZE,
    })
    if (sourcePage?.catalogueStatus === MARKET_CATALOGUE_STATUS.UNAVAILABLE) {
      return unavailableCatalogue({ cursor, limit })
    }
    sourceSnapshots.push(sourcePage)
  }

  const labsById = new Map()
  sourceSnapshots.forEach((sourcePage) => {
    ;(Array.isArray(sourcePage?.labs) ? sourcePage.labs : []).forEach((lab) => {
      if (lab?.id !== undefined && lab?.id !== null) labsById.set(String(lab.id), lab)
    })
  })

  const allLabs = [...labsById.values()]
  const filteredLabs = filterMarketLabs(allLabs, filters)
  const earliestSnapshotTimestamp = snapshotTimestamp(sourceSnapshots)
  const hasStaleSource = sourceSnapshots.some(
    (sourcePage) => sourcePage?.catalogueStatus === MARKET_CATALOGUE_STATUS.STALE,
  )

  return {
    ...paginateMarketLabs(filteredLabs, { cursor, limit }),
    facets: buildMarketFacets(allLabs),
    snapshotAt: Number.isFinite(earliestSnapshotTimestamp)
      ? new Date(earliestSnapshotTimestamp).toISOString()
      : null,
    catalogueStatus: hasStaleSource
      ? MARKET_CATALOGUE_STATUS.STALE
      : MARKET_CATALOGUE_STATUS.FRESH,
    metrics: mergeMetrics(sourceSnapshots),
  }
}

export { MARKET_CATALOGUE_STATUS }
