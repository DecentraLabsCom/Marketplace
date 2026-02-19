import fs from 'fs/promises';
import path from 'path';
import { unstable_cache } from 'next/cache';
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import { buildEnrichedLab, collectMetadataImages } from '@/hooks/lab/labEnrichmentHelpers';
import getIsVercel from '@/utils/isVercel';

const MARKET_LABS_LIMIT = 100;
const MARKET_SNAPSHOT_REVALIDATE_SECONDS = 60;
const METADATA_FETCH_TIMEOUT_MS = 2000;
const DETAIL_CONCURRENCY = 8;

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = METADATA_FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
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

const transformLab = (rawLab, labId) => ({
  labId: toFiniteNumber(rawLab?.[0], labId),
  base: {
    uri: String(rawLab?.[1]?.[0] || ''),
    price: rawLab?.[1]?.[1] ? rawLab[1][1].toString() : '0',
    accessURI: String(rawLab?.[1]?.[2] || ''),
    accessKey: String(rawLab?.[1]?.[3] || ''),
    createdAt: rawLab?.[1]?.[4] ? toFiniteNumber(rawLab[1][4], 0) : 0,
  },
});

const transformReputation = (raw) => ({
  score: toFiniteNumber(raw?.score ?? raw?.[0], 0),
  totalEvents: toFiniteNumber(raw?.totalEvents ?? raw?.[1], 0),
  ownerCancellations: toFiniteNumber(raw?.ownerCancellations ?? raw?.[2], 0),
  institutionalCancellations: toFiniteNumber(raw?.institutionalCancellations ?? raw?.[3], 0),
  lastUpdated: toFiniteNumber(raw?.lastUpdated ?? raw?.[4], 0),
});

const parseProviders = (providersRaw) => {
  if (!Array.isArray(providersRaw)) {
    return [];
  }

  return providersRaw.map((provider) => ({
    account: provider?.account ? String(provider.account) : '',
    name: String(provider?.base?.name || provider?.name || ''),
    email: String(provider?.base?.email || provider?.email || ''),
    country: String(provider?.base?.country || provider?.country || ''),
    authURI: String(provider?.base?.authURI || provider?.authURI || ''),
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

const getBlobMetadataUrl = (metadataUri) => {
  const baseUrl = process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL;
  if (!baseUrl) return null;

  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const trimmedUri = String(metadataUri || '').replace(/^\/+/, '');
  return `${trimmedBase}/data/${trimmedUri}`;
};

const loadMetadataDocument = async (metadataUri) => {
  if (!metadataUri) return null;

  try {
    if (metadataUri.startsWith('Lab-')) {
      if (!getIsVercel()) {
        const filePath = path.join(process.cwd(), 'data', metadataUri);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(fileContent);
      }

      const blobUrl = getBlobMetadataUrl(metadataUri);
      if (!blobUrl) return null;

      const response = await fetchWithTimeout(blobUrl, { cache: 'no-store' });
      if (!response.ok) return null;
      return await response.json();
    }

    const response = await fetchWithTimeout(metadataUri, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
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

const getMarketLabsSnapshotUncached = async ({ includeUnlisted = false } = {}) => {
  const contract = await getContractInstance();

  const [paginatedLabsResult, providersResult] = await Promise.allSettled([
    contract.getLabsPaginated(0, MARKET_LABS_LIMIT),
    contract.getLabProviders(),
  ]);

  if (paginatedLabsResult.status !== 'fulfilled') {
    return { labs: [], totalLabs: 0, snapshotAt: new Date().toISOString() };
  }

  const labIds = parseLabIdsFromPaginated(paginatedLabsResult.value);
  const providers = providersResult.status === 'fulfilled' ? parseProviders(providersResult.value) : [];
  const providerMapping = createProviderLookup(providers);

  const labs = await mapWithConcurrency(labIds, DETAIL_CONCURRENCY, async (labId) => {
    const [labResult, ownerResult, listedResult, reputationResult] = await Promise.allSettled([
      contract.getLab(labId),
      contract.ownerOf(labId),
      contract.isTokenListed(labId),
      contract.getLabReputation(labId),
    ]);

    if (labResult.status !== 'fulfilled') {
      return null;
    }

    const lab = transformLab(labResult.value, labId);
    const listingFailed = listedResult.status !== 'fulfilled';
    const isListed = listingFailed ? true : Boolean(listedResult.value);

    if (!includeUnlisted && !isListed) {
      return null;
    }

    const ownerAddress = ownerResult.status === 'fulfilled' ? String(ownerResult.value) : null;
    const reputation = reputationResult.status === 'fulfilled'
      ? transformReputation(reputationResult.value)
      : null;
    const metadata = lab?.base?.uri
      ? await loadMetadataDocument(lab.base.uri)
      : null;
    const imageUrls = collectMetadataImages(metadata);

    return buildEnrichedLab({
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
        email: providerInfo.email,
        country: providerInfo.country,
        account: providerInfo.account,
      }),
    });
  });

  const normalizedLabs = labs.filter(Boolean);
  return {
    labs: normalizedLabs,
    totalLabs: normalizedLabs.length,
    snapshotAt: new Date().toISOString(),
  };
};

const getCachedMarketLabsSnapshot = unstable_cache(
  async (includeUnlisted = false) => getMarketLabsSnapshotUncached({ includeUnlisted }),
  ['market-labs-snapshot-v1'],
  {
    revalidate: MARKET_SNAPSHOT_REVALIDATE_SECONDS,
    tags: ['market-labs-snapshot'],
  }
);

export async function getMarketLabsSnapshot({ includeUnlisted = false } = {}) {
  try {
    return await getCachedMarketLabsSnapshot(Boolean(includeUnlisted));
  } catch {
    return { labs: [], totalLabs: 0, snapshotAt: new Date().toISOString() };
  }
}
