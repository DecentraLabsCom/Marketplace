import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

const MARKET_SNAPSHOT_KEY_PREFIX = 'marketplace:market-snapshot:v1:'
const MARKET_SNAPSHOT_REFRESH_LOCK_PREFIX = 'marketplace:market-snapshot-refresh:v1:'
const memorySnapshots = new Map()
const revalidations = new Map()
const failedRevalidations = new Map()

const parseBoundedInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback
}

export const MARKET_SNAPSHOT_FRESHNESS_MS = parseBoundedInteger(
  process.env.MARKET_SNAPSHOT_REVALIDATE_SECONDS,
  300,
  30,
  3_600,
) * 1_000

const MARKET_SNAPSHOT_RETENTION_SECONDS = parseBoundedInteger(
  process.env.MARKET_SNAPSHOT_RETENTION_SECONDS,
  86_400,
  300,
  604_800,
)

const MARKET_SNAPSHOT_RETRY_COOLDOWN_MS = parseBoundedInteger(
  process.env.MARKET_SNAPSHOT_RETRY_COOLDOWN_SECONDS,
  30,
  5,
  300,
) * 1_000

const MARKET_SNAPSHOT_REFRESH_LOCK_SECONDS = parseBoundedInteger(
  process.env.MARKET_SNAPSHOT_REFRESH_LOCK_SECONDS,
  90,
  30,
  300,
)

const snapshotKey = ({ includeUnlisted = false, cursor = 0, limit = 24 } = {}) => (
  `${MARKET_SNAPSHOT_KEY_PREFIX}${includeUnlisted ? 'unlisted' : 'listed'}:${cursor}:${limit}`
)

const cloneSnapshot = (snapshot) => JSON.parse(JSON.stringify(snapshot))

const parseSnapshot = (rawSnapshot) => {
  if (!rawSnapshot) return null

  try {
    const snapshot = typeof rawSnapshot === 'string' ? JSON.parse(rawSnapshot) : rawSnapshot
    const snapshotTimestamp = Date.parse(snapshot?.snapshotAt)
    if (!Array.isArray(snapshot?.labs) || !Number.isFinite(snapshotTimestamp)) return null
    return cloneSnapshot(snapshot)
  } catch {
    return null
  }
}

const getMemorySnapshot = (key) => {
  const snapshot = memorySnapshots.get(key)
  if (!snapshot) return null
  if (Date.now() - Date.parse(snapshot.snapshotAt) > MARKET_SNAPSHOT_RETENTION_SECONDS * 1_000) {
    memorySnapshots.delete(key)
    return null
  }
  return cloneSnapshot(snapshot)
}

export const isMarketSnapshotFresh = (snapshot, now = Date.now()) => {
  const snapshotTimestamp = Date.parse(snapshot?.snapshotAt)
  return Number.isFinite(snapshotTimestamp) && now - snapshotTimestamp <= MARKET_SNAPSHOT_FRESHNESS_MS
}

export async function readMarketSnapshot(page) {
  const key = snapshotKey(page)
  const localSnapshot = getMemorySnapshot(key)

  if (!hasRedisConfig()) return localSnapshot

  try {
    const remoteSnapshot = parseSnapshot(await redisCommand(['GET', key]))
    if (remoteSnapshot) {
      memorySnapshots.set(key, remoteSnapshot)
      return cloneSnapshot(remoteSnapshot)
    }
  } catch {
    // A local last-known-good copy still permits graceful degradation while
    // the shared cache is temporarily unreachable.
  }

  return localSnapshot
}

export async function writeMarketSnapshot(page, snapshot) {
  const key = snapshotKey(page)
  const parsedSnapshot = parseSnapshot(snapshot)
  if (!parsedSnapshot) throw new Error('Cannot persist an invalid market snapshot')

  memorySnapshots.set(key, parsedSnapshot)
  if (!hasRedisConfig()) return

  try {
    await redisCommand([
      'SET',
      key,
      JSON.stringify(parsedSnapshot),
      'EX',
      String(MARKET_SNAPSHOT_RETENTION_SECONDS),
    ])
  } catch {
    // Serving a valid on-chain result is preferable to failing the catalogue
    // merely because its optional shared cache could not be updated.
  }
}

export const isMarketSnapshotRevalidating = (page) => revalidations.has(snapshotKey(page))

export const shouldRetryMarketSnapshot = (page, now = Date.now()) => {
  const failedAt = failedRevalidations.get(snapshotKey(page))
  return !failedAt || now - failedAt >= MARKET_SNAPSHOT_RETRY_COOLDOWN_MS
}

export function revalidateMarketSnapshot(page, loader) {
  const key = snapshotKey(page)
  const ongoing = revalidations.get(key)
  if (ongoing) return ongoing

  const revalidation = Promise.resolve()
    .then(async () => {
      if (hasRedisConfig()) {
        try {
          const acquired = await redisCommand([
            'SET',
            `${MARKET_SNAPSHOT_REFRESH_LOCK_PREFIX}${snapshotKey(page)}`,
            '1',
            'NX',
            'EX',
            String(MARKET_SNAPSHOT_REFRESH_LOCK_SECONDS),
          ])
          if (acquired !== 'OK') {
            const error = new Error('Market snapshot is already being revalidated')
            error.code = 'MARKET_SNAPSHOT_REVALIDATING'
            throw error
          }
        } catch (error) {
          if (error?.code === 'MARKET_SNAPSHOT_REVALIDATING') throw error
          // Redis is an optimization for cross-instance coordination. A
          // successful on-chain snapshot remains useful if it is unavailable.
        }
      }
      return loader()
    })
    .then((snapshot) => {
      failedRevalidations.delete(key)
      return snapshot
    })
    .catch((error) => {
      failedRevalidations.set(key, Date.now())
      throw error
    })
    .finally(() => {
      revalidations.delete(key)
    })

  revalidations.set(key, revalidation)
  return revalidation
}

export function clearMarketSnapshotStoreForTests() {
  memorySnapshots.clear()
  revalidations.clear()
  failedRevalidations.clear()
}
