import getBaseUrl from '@/utils/env/baseUrl'
import { labQueryKeys } from '@/utils/hooks/queryKeys'

export function createEmptyLabDraft() {
  return {
    name: '',
    category: '',
    keywords: [],
    price: '',
    description: '',
    provider: '',
    accessURI: '',
    accessKey: '',
    timeSlots: [],
    opens: null,
    closes: null,
    docs: [],
    images: [],
    uri: '',
    availableDays: [],
    availableHours: { start: '', end: '' },
    timezone: '',
    maxConcurrentUsers: 1,
    unavailableWindows: [],
    termsOfUse: {
      url: '',
      version: '',
      effectiveDate: null,
      sha256: ''
    }
  }
}

export function sanitizeProviderNameForUri(name) {
  const base = (name || 'Provider').toString().trim()
  const sanitized = base
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return sanitized || 'Provider'
}

export function buildProviderLabUri(uri, providerName, labId) {
  if (uri) {
    return uri
  }

  const providerSegment = sanitizeProviderNameForUri(providerName)
  return `Lab-${providerSegment}-${labId}.json`
}

export function isLabIdListCache(entries) {
  return Array.isArray(entries) && entries.every((entry) => (
    entry === null
    || entry === undefined
    || typeof entry === 'string'
    || typeof entry === 'number'
    || typeof entry === 'bigint'
  ))
}

export function resolveOnchainLabUri(
  uri,
  {
    blobBaseUrl = process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL,
    resolveBaseUrl = getBaseUrl,
  } = {}
) {
  if (!uri) return uri

  const trimmed = String(uri).trim()
  if (!trimmed) return trimmed

  if (/^https?:\/\//i.test(trimmed) || /^ipfs:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (trimmed.startsWith('Lab-')) {
    if (blobBaseUrl && typeof blobBaseUrl === 'string' && blobBaseUrl.trim().length > 0) {
      const normalizedBase = blobBaseUrl.replace(/\/+$/, '')
      return `${normalizedBase}/data/${trimmed}`
    }

    const baseUrl = resolveBaseUrl().replace(/\/+$/, '')
    return `${baseUrl}/api/metadata?uri=${encodeURIComponent(trimmed)}`
  }

  return trimmed
}

export function remapMovedLabAssetPaths(labData, movedFiles) {
  if (!Array.isArray(movedFiles) || movedFiles.length === 0) {
    return labData
  }

  const movedPathMap = new Map(
    movedFiles
      .filter((movedFile) => movedFile?.original && movedFile?.new)
      .map((movedFile) => [movedFile.original, movedFile.new])
  )

  const remapPaths = (paths = []) => (
    Array.isArray(paths)
      ? paths.map((filePath) => movedPathMap.get(filePath) || filePath)
      : []
  )

  const nextLabData = {
    ...labData,
    images: remapPaths(labData?.images),
    docs: remapPaths(labData?.docs),
  }

  if (nextLabData.images.length === 0) {
    const imageMoves = movedFiles
      .filter((movedFile) => movedFile?.original?.includes('/images/'))
      .map((movedFile) => movedFile.new)

    if (imageMoves.length > 0) {
      nextLabData.images = imageMoves
    }
  }

  if (nextLabData.docs.length === 0) {
    const docMoves = movedFiles
      .filter((movedFile) => movedFile?.original?.includes('/docs/'))
      .map((movedFile) => movedFile.new)

    if (docMoves.length > 0) {
      nextLabData.docs = docMoves
    }
  }

  return nextLabData
}

export function formatErrorMessage(error) {
  let message = error?.message || 'Unknown error';

  const patterns = [
    { regex: /execution reverted:?\s*/i, replacement: '' },
    { regex: /VM Exception while processing transaction:?\s*/i, replacement: '' },
    { regex: /Error:\s*/i, replacement: '' },
    { regex: /Failed to.*?:\s*/i, replacement: '' },
    { regex: /HTTP error! status: (\d+)/, replacement: 'Server error ($1)' },
    { regex: /network.*?error/i, replacement: 'Network error' },
    { regex: /insufficient.*?funds/i, replacement: 'Insufficient funds' },
    { regex: /user.*?rejected/i, replacement: 'Transaction rejected' },
    { regex: /wallet.*?connection/i, replacement: 'Wallet error' }
  ];

  patterns.forEach(({ regex, replacement }) => {
    message = message.replace(regex, replacement);
  });

  if (message.length > 80) {
    message = message.substring(0, 77) + '...';
  }

  return message.trim() || 'Operation failed';
}

export function updateListingCache(queryClient, labId, isListed) {
  if (!queryClient) return;

  const ids = new Set();
  if (labId !== null && labId !== undefined) {
    ids.add(labId);
    ids.add(String(labId));
    const numericId = Number(labId);
    if (!Number.isNaN(numericId)) {
      ids.add(numericId);
    }
  }

  ids.forEach((id) => {
    try {
      queryClient.setQueryData(labQueryKeys.isTokenListed(id), { isListed });
    } catch {
      // best-effort cache update
    }
  });

  try {
    queryClient.setQueryData(labQueryKeys.getAllLabs(), (old = []) => {
      if (!Array.isArray(old)) return old;
      if (isLabIdListCache(old)) return old;
      return old.map((lab) => {
        const labKey = lab?.labId ?? lab?.id;
        if (labKey === undefined || labKey === null) return lab;
        return String(labKey) === String(labId) ? { ...lab, isListed } : lab;
      });
    });
  } catch {
    // best-effort cache update
  }
}
