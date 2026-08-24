import { NextResponse } from 'next/server'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import {
  isLocalMetadataUri,
  loadMetadataDocument,
} from '@/utils/metadata/metadataPolicy'
import { resolveProviderMetadataOrigins } from '@/utils/metadata/providerMetadataOrigins'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const MAX_DEMO_WINDOW_SECONDS = 600n
const UINT256_MAX = (1n << 256n) - 1n
// The Gateway revalidates an active demo every two seconds. Keep this high
// enough for that control loop while bounding direct public RPC/metadata work.
const checkRate = createRateLimiter({
  operation: 'demo-eligibility',
  windowMs: 60_000,
  maxRequests: 120,
})

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
}

const response = (body, status = 200) => NextResponse.json(body, {
  status,
  headers: noStoreHeaders,
})

const parseUint256 = (value) => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null

  try {
    const parsed = BigInt(value)
    return parsed <= UINT256_MAX ? parsed : null
  } catch {
    return null
  }
}

const publicEligibility = (labId, start, end, eligible) => ({
  eligible,
  labId: labId.toString(),
  start: start.toString(),
  end: end.toString(),
})

const isMissingLabError = (error) => {
  const details = String(
    error?.reason || error?.shortMessage || error?.message || '',
  ).toLowerCase()

  return details.includes('lab does not exist')
    || details.includes('erc721nonexistenttoken')
    || details.includes('nonexistent token')
    || details.includes('token does not exist')
}

const readLabBase = (labResult) => {
  const base = labResult?.[1]
  if (!base || typeof base !== 'object') return null

  if (base[5] === undefined || base[5] === null) return null
  const resourceType = BigInt(base[5].toString())

  return {
    metadataUri: typeof base[0] === 'string' ? base[0].trim() : '',
    resourceType,
  }
}

export async function GET(request) {
  const rateLimitResponse = createRateLimitResponse(
    await checkRate(request),
    'Too many demo eligibility requests. Please try again later.',
  )
  if (rateLimitResponse) {
    rateLimitResponse.headers.set('Cache-Control', 'no-store, max-age=0')
    return rateLimitResponse
  }

  const searchParams = request?.nextUrl?.searchParams
    || new URL(request.url).searchParams
  const labId = parseUint256(searchParams.get('labId'))
  const start = parseUint256(searchParams.get('start'))
  const end = parseUint256(searchParams.get('end'))

  if (labId === null || start === null || end === null || end <= start
    || end - start > MAX_DEMO_WINDOW_SECONDS) {
    return response({ error: 'Invalid demo eligibility parameters' }, 400)
  }

  let contract
  try {
    contract = await getContractInstance()
  } catch {
    return response({ eligible: false }, 503)
  }

  let labResult
  let isListed
  try {
    [labResult, isListed] = await Promise.all([
      contract.getLab(labId),
      contract.isTokenListed(labId),
    ])
  } catch (error) {
    if (isMissingLabError(error)) {
      return response(publicEligibility(labId, start, end, false))
    }
    return response({ eligible: false }, 503)
  }

  const resolvedLabId = parseUint256(labResult?.[0]?.toString?.())
  if (resolvedLabId === null || resolvedLabId !== labId) {
    return response(publicEligibility(labId, start, end, false))
  }

  if (isListed !== true) {
    return response(publicEligibility(labId, start, end, false))
  }

  let labBase
  try {
    labBase = readLabBase(labResult)
  } catch {
    return response({ eligible: false }, 503)
  }

  if (!labBase || labBase.resourceType !== 0n || !labBase.metadataUri) {
    return response(publicEligibility(labId, start, end, false))
  }

  let metadata
  try {
    let additionalAllowedOrigins = []
    if (!isLocalMetadataUri(labBase.metadataUri)) {
      const ownerAddress = await contract.ownerOf(labId)
      additionalAllowedOrigins = await resolveProviderMetadataOrigins({
        labId,
        ownerAddress,
        contract,
      })
    }
    metadata = await loadMetadataDocument(labBase.metadataUri, {
      additionalAllowedOrigins,
    })
  } catch {
    return response({ eligible: false }, 503)
  }

  if (metadata?.demoEnabled !== true) {
    return response(publicEligibility(labId, start, end, false))
  }

  let isAvailable
  try {
    isAvailable = await contract.checkAvailable(labId, start, end)
  } catch {
    return response({ eligible: false }, 503)
  }

  return response(publicEligibility(labId, start, end, isAvailable === true))
}
