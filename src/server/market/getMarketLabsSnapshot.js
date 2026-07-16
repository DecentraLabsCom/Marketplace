import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import { buildEnrichedLab, collectMetadataImages } from '@/hooks/lab/labEnrichmentHelpers';
import { isLocalMetadataUri, loadMetadataDocument } from '@/utils/metadata/metadataPolicy';
import { resolveProviderMetadataOrigins } from '@/utils/metadata/providerMetadataOrigins';
import { toPublicMarketLab } from '@/utils/market/publicLabDto';
import { getAllLabProviders } from '@/server/contract/getAllLabProviders';
import {
  DEFAULT_MARKET_PAGE_SIZE,
  getNextMarketCursor,
  parseMarketPageParams,
} from '@/utils/market/marketPagination';
import {
  isMarketSnapshotFresh,
  isMarketSnapshotRevalidating,
  MARKET_SNAPSHOT_FRESHNESS_MS,
  readMarketSnapshot,
  revalidateMarketSnapshot,
  shouldRetryMarketSnapshot,
  writeMarketSnapshot,
} from './marketSnapshotStore';

const DETAIL_CONCURRENCY = 8;
const MEASURED_CONTRACT_METHODS = new Set([
  'getLabsPaginated',
  'getLabProvidersPaginated',
  'getLab',
  'ownerOf',
  'isTokenListed',
  'getLabReputation',
  'isLabProvider',
  'getRegisteredSchacHomeOrganizations',
  'getSchacHomeOrganizationBackend',
]);

export const MARKET_CATALOGUE_STATUS = Object.freeze({
  FRESH: 'fresh',
  STALE: 'stale',
  UNAVAILABLE: 'unavailable',
});

export { MARKET_SNAPSHOT_FRESHNESS_MS };

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const parseLabIdsFromPaginated = (result) => {
  const arrayLike = (value) => value && typeof value.length === 'number';
  const idsCandidate =
    Array.isArray(result?.[0]) || arrayLike(result?.[0]) ? result[0]
      : Array.isArray(result?.[1]) || arrayLike(result?.[1]) ? result[1]
        : Array.isArray(result?.ids) || arrayLike(result?.ids) ? result.ids
          : result;

  if (!Array.isArray(idsCandidate)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  idsCandidate.forEach((value) => {
    const id = toFiniteNumber(value, NaN);
    if (!Number.isFinite(id)) return;
    if (seen.has(id)) return;
    seen.add(id);
    normalized.push(id);
  });

  return normalized;
};

const parseTotalLabs = (result, cursor, pageSize) => {
  const candidate = result?.total ?? result?.[1];
  const parsed = toFiniteNumber(candidate, NaN);
  if (Number.isSafeInteger(parsed) && parsed >= 0) {
    return parsed;
  }

  return cursor + pageSize;
};

const transformLab = (rawLab, labId) => ({
  labId: toFiniteNumber(rawLab?.[0], labId),
  base: {
    uri: String(rawLab?.[1]?.[0] || ''),
    price: rawLab?.[1]?.[1] ? rawLab[1][1].toString() : '0',
    createdAt: rawLab?.[1]?.[4] ? toFiniteNumber(rawLab[1][4], 0) : 0,
    resourceType: rawLab?.[1]?.[5] ? toFiniteNumber(rawLab[1][5], 0) : 0,
  },
});

const transformReputation = (raw) => ({
  score: toFiniteNumber(raw?.score ?? raw?.[0], 0),
  totalEvents: toFiniteNumber(raw?.totalEvents ?? raw?.[1], 0),
  ownerCancellations: toFiniteNumber(raw?.ownerCancellations ?? raw?.[2], 0),
  lastUpdated: toFiniteNumber(raw?.lastUpdated ?? raw?.[3], 0),
});

const parseProviders = (providersRaw) => {
  if (!Array.isArray(providersRaw)) {
    return [];
  }

  return providersRaw.map((provider) => ({
    account: provider?.account ? String(provider.account) : '',
    name: String(provider?.base?.name || provider?.name || ''),
  }));
};

const createProviderLookup = (providers) => {
  const byAccount = new Map();
  providers.forEach((provider) => {
    if (!provider.account) return;
    byAccount.set(provider.account.toLowerCase(), provider);
  });

  return {
    mapOwnerToProvider: (ownerAddress) => {
      if (!ownerAddress) return null;
      return byAccount.get(String(ownerAddress).toLowerCase()) || null;
    },
  };
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const results = new Array(items.length);
  let cursor = 0;

  const workerCount = Math.min(Math.max(concurrency, 1), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
};

const createMeasuredContract = (contract, metrics) => new Proxy(contract, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof value !== 'function' || !MEASURED_CONTRACT_METHODS.has(String(property))) {
      return value;
    }

    return (...args) => {
      metrics.rpcCalls += 1;
      return value.apply(target, args);
    };
  },
});

const createUnavailableSnapshot = ({ cursor, limit } = {}) => ({
  labs: [],
  totalLabs: 0,
  returnedLabs: 0,
  cursor,
  limit,
  nextCursor: null,
  snapshotAt: null,
  catalogueStatus: MARKET_CATALOGUE_STATUS.UNAVAILABLE,
  errorCode: 'MARKET_CATALOGUE_UNAVAILABLE',
});

const getMarketLabsSnapshotUncached = async ({
  includeUnlisted = false,
  cursor = 0,
  limit = DEFAULT_MARKET_PAGE_SIZE,
} = {}) => {
  const startedAt = Date.now();
  const metrics = {
    durationMs: 0,
    rpcCalls: 0,
    metadataFetches: 0,
    requestedLabs: 0,
    returnedLabs: 0,
  };
  const contract = await getContractInstance();
  const measuredContract = createMeasuredContract(contract, metrics);

  const [paginatedLabsResult, providersResult] = await Promise.allSettled([
    measuredContract.getLabsPaginated(cursor, limit),
    getAllLabProviders(measuredContract),
  ]);

  if (paginatedLabsResult.status !== 'fulfilled') {
    metrics.durationMs = Date.now() - startedAt;
    const error = new Error('Market catalogue pagination is unavailable');
    error.metrics = metrics;
    throw error;
  }

  const labIds = parseLabIdsFromPaginated(paginatedLabsResult.value);
  const totalLabs = parseTotalLabs(paginatedLabsResult.value, cursor, labIds.length);
  metrics.requestedLabs = labIds.length;
  const providers = providersResult.status === 'fulfilled' ? parseProviders(providersResult.value) : [];
  const providerMapping = createProviderLookup(providers);
  const providerMetadataOriginCache = new Map();

  const getProviderMetadataOrigins = async (ownerAddress, labId) => {
    const cacheKey = ownerAddress ? String(ownerAddress).toLowerCase() : `lab:${labId}`;
    if (!providerMetadataOriginCache.has(cacheKey)) {
      providerMetadataOriginCache.set(cacheKey, resolveProviderMetadataOrigins({
        labId,
        ownerAddress,
        contract: measuredContract,
      }).catch(() => []));
    }
    return providerMetadataOriginCache.get(cacheKey);
  };

  const labs = await mapWithConcurrency(labIds, DETAIL_CONCURRENCY, async (labId) => {
    const [labResult, ownerResult, listedResult, reputationResult] = await Promise.allSettled([
      measuredContract.getLab(labId),
      measuredContract.ownerOf(labId),
      measuredContract.isTokenListed(labId),
      measuredContract.getLabReputation(labId),
    ]);

    if (labResult.status !== 'fulfilled') {
      return null;
    }

    const lab = transformLab(labResult.value, labId);
    // A listing status that cannot be read is not evidence that the lab is
    // public. Keep the public catalogue fail-closed, while still allowing an
    // explicit includeUnlisted request to inspect the item with isListed=false.
    const isListed = listedResult.status === 'fulfilled' && Boolean(listedResult.value);

    if (!includeUnlisted && !isListed) {
      return null;
    }

    const ownerAddress = ownerResult.status === 'fulfilled' ? String(ownerResult.value) : null;
    const reputation = reputationResult.status === 'fulfilled'
      ? transformReputation(reputationResult.value)
      : null;
    const metadata = lab?.base?.uri
      ? await (async () => {
        metrics.metadataFetches += 1;
        return loadMetadataDocument(lab.base.uri, {
          additionalAllowedOrigins: isLocalMetadataUri(lab.base.uri)
            ? []
            : await getProviderMetadataOrigins(ownerAddress, labId),
        }).catch(() => null);
      })()
      : null;
    const imageUrls = collectMetadataImages(metadata);

    const enrichedLab = buildEnrichedLab({
      lab,
      metadata,
      isListed,
      reputation,
      ownerAddress,
      providerMapping,
      imageUrls,
      includeProviderInfo: true,
      includeProviderFallback: true,
      providerInfoSelector: (providerInfo) => ({
        name: providerInfo.name,
      }),
    });

    return toPublicMarketLab(enrichedLab);
  });

  const normalizedLabs = labs.filter(Boolean);
  metrics.returnedLabs = normalizedLabs.length;
  metrics.durationMs = Date.now() - startedAt;

  return {
    labs: normalizedLabs,
    totalLabs,
    returnedLabs: normalizedLabs.length,
    cursor,
    limit,
    nextCursor: getNextMarketCursor({
      cursor,
      sourceCount: labIds.length,
      total: totalLabs,
    }),
    snapshotAt: new Date().toISOString(),
    metrics,
  };
};

export const toPublicMarketSnapshot = (snapshot) => ({
  labs: Array.isArray(snapshot?.labs) ? snapshot.labs : [],
  totalLabs: Number.isFinite(Number(snapshot?.totalLabs)) ? Number(snapshot.totalLabs) : 0,
  returnedLabs: Number.isFinite(Number(snapshot?.returnedLabs))
    ? Number(snapshot.returnedLabs)
    : Array.isArray(snapshot?.labs) ? snapshot.labs.length : 0,
  cursor: Number.isSafeInteger(Number(snapshot?.cursor)) ? Number(snapshot.cursor) : 0,
  limit: Number.isSafeInteger(Number(snapshot?.limit)) ? Number(snapshot.limit) : DEFAULT_MARKET_PAGE_SIZE,
  nextCursor: snapshot?.nextCursor ?? null,
  snapshotAt: Number.isFinite(Date.parse(snapshot?.snapshotAt)) ? snapshot.snapshotAt : null,
  catalogueStatus: Object.values(MARKET_CATALOGUE_STATUS).includes(snapshot?.catalogueStatus)
    ? snapshot.catalogueStatus
    : MARKET_CATALOGUE_STATUS.FRESH,
  ...(snapshot?.catalogueStatus === MARKET_CATALOGUE_STATUS.UNAVAILABLE
    ? { errorCode: 'MARKET_CATALOGUE_UNAVAILABLE' }
    : {}),
  facets: {
    categories: Array.isArray(snapshot?.facets?.categories)
      ? snapshot.facets.categories.filter((value) => typeof value === 'string')
      : [],
    providers: Array.isArray(snapshot?.facets?.providers)
      ? snapshot.facets.providers.filter((value) => typeof value === 'string')
      : [],
  },
});

export async function getMarketLabsSnapshot({ includeUnlisted = false, cursor, limit } = {}) {
  const page = parseMarketPageParams({ cursor, limit });
  const snapshotPage = {
    includeUnlisted: Boolean(includeUnlisted),
    ...page,
  };
  const cachedSnapshot = await readMarketSnapshot(snapshotPage);

  if (cachedSnapshot && isMarketSnapshotFresh(cachedSnapshot)) {
    return {
      ...cachedSnapshot,
      catalogueStatus: MARKET_CATALOGUE_STATUS.FRESH,
    };
  }

  const staleSnapshot = cachedSnapshot
    ? {
      ...cachedSnapshot,
      catalogueStatus: MARKET_CATALOGUE_STATUS.STALE,
    }
    : null;

  if (staleSnapshot && (
    isMarketSnapshotRevalidating(snapshotPage)
    || !shouldRetryMarketSnapshot(snapshotPage)
  )) {
    return staleSnapshot;
  }

  const refreshSnapshot = () => revalidateMarketSnapshot(snapshotPage, async () => {
    const freshSnapshot = await getMarketLabsSnapshotUncached(snapshotPage);
    const storedSnapshot = { ...freshSnapshot };
    delete storedSnapshot.metrics;
    await writeMarketSnapshot(snapshotPage, storedSnapshot);
    return {
      ...freshSnapshot,
      catalogueStatus: MARKET_CATALOGUE_STATUS.FRESH,
    };
  });

  if (staleSnapshot) {
    // A stale catalogue is still a truthful response. Refresh it in the
    // background so a visitor never pays the complete per-lab RPC fan-out.
    void refreshSnapshot().catch(() => {});
    return staleSnapshot;
  }

  try {
    return await refreshSnapshot();
  } catch {
    return createUnavailableSnapshot(page);
  }
}
