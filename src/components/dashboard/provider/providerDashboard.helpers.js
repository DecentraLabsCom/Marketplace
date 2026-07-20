import getBaseUrl from '@/utils/env/baseUrl'
import { labQueryKeys } from '@/utils/hooks/queryKeys'

export const LAB_CREATION_STAGES = Object.freeze({
  DRAFT: 'DRAFT',
  CONTENT_STAGED: 'CONTENT_STAGED',
  ONCHAIN_PENDING: 'ONCHAIN_PENDING',
  ACTIVE: 'ACTIVE',
})

const LAB_CREATION_TRANSITIONS = Object.freeze({
  [`${LAB_CREATION_STAGES.DRAFT}:contentStaged`]: LAB_CREATION_STAGES.CONTENT_STAGED,
  [`${LAB_CREATION_STAGES.CONTENT_STAGED}:onchainPending`]: LAB_CREATION_STAGES.ONCHAIN_PENDING,
  [`${LAB_CREATION_STAGES.ONCHAIN_PENDING}:contentActivated`]: LAB_CREATION_STAGES.ACTIVE,
})

export function advanceLabCreationStage(stage, event) {
  const next = LAB_CREATION_TRANSITIONS[`${stage}:${event}`]
  if (!next) {
    throw new Error(`Invalid lab creation transition: ${stage} -> ${event}`)
  }
  return next
}

export function shouldCompensateLabCreation(stage) {
  return stage === LAB_CREATION_STAGES.ONCHAIN_PENDING
}

export function createEmptyLabDraft() {
  return {
    name: '',
    category: [],
    classification: [],
    educationalProgramLinked: false,
    iscedF: [],
    keywords: [],
    price: '',
    priceUnit: 'hour',
    bookingMode: 'slot',
    allowedDurationRange: { unit: 'day', min: 1, max: 1 },
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
    labId = null,
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
    const params = new URLSearchParams({ uri: trimmed })
    if (labId !== null && labId !== undefined && labId !== '') params.set('labId', String(labId))
    return `${baseUrl}/api/metadata?${params.toString()}`
  }

  return trimmed
}

export function remapMovedLabAssetPaths(labData, movedFiles) {
  if (!Array.isArray(movedFiles) || movedFiles.length === 0) {
    return labData
  }

  const normalizeMovedAssetPath = (filePath) => {
    if (!filePath) return ''

    const rawValue = String(filePath).replace(/\\/g, '/')
    try {
      const url = new URL(rawValue)
      return decodeURIComponent(url.pathname).replace(/^\/data\//, '/')
    } catch {
      return rawValue.startsWith('/data/')
        ? rawValue.replace(/^\/data\//, '/')
        : rawValue
    }
  }

  const movedPathMap = new Map()

  movedFiles
    .filter((movedFile) => movedFile?.original && movedFile?.new)
    .forEach((movedFile) => {
      const original = String(movedFile.original)
      const normalizedOriginal = normalizeMovedAssetPath(original)

      movedPathMap.set(original, movedFile.new)
      if (normalizedOriginal) {
        movedPathMap.set(normalizedOriginal, movedFile.new)
        movedPathMap.set(normalizedOriginal.replace(/^\//, ''), movedFile.new)
        movedPathMap.set(`/data${normalizedOriginal}`, movedFile.new)
      }
    })

  const remapPaths = (paths = []) => (
    Array.isArray(paths)
      ? paths.map((filePath) => movedPathMap.get(filePath) || movedPathMap.get(normalizeMovedAssetPath(filePath)) || filePath)
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
