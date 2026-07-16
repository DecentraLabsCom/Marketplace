/**
 * API endpoint for saving lab data to local storage or cloud
 * Handles POST requests to persist lab information and metadata
 * 
 * SECURITY: Requires authentication and lab ownership verification
 */
import path from 'path'
import { promises as fs } from 'fs'
import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import getIsVercel from '@/utils/isVercel'
import {
  CALENDAR_PERIOD_BOOKING_MODE,
  DEFAULT_BOOKING_MODE,
  displayPriceToRawPerSecond,
  normalizePricingUnit,
} from '@/utils/pricing/pricingUnits'
import { 
  requireAuth,
  requireProviderRole,
  requireLabOwner, 
  handleGuardError,
  HttpError,
  BadRequestError
} from '@/utils/auth/guards'
import { resolveManagedLocalPath } from '@/utils/storage/fileSecurity'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import {
  CLASSIFICATION_SCHEMES,
  buildClassificationEntries,
  getFordCodesFromClassification,
  getIscedCodesFromClassification,
} from '@/constants/labClassifications'
import { publicErrorResponse, sanitizeErrorForLog } from '@/utils/security/publicError'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'

const checkRate = createRateLimiter({ operation: 'provider-save-lab-data', windowMs: 60_000, maxRequests: 10 })

const WEEKDAY_VALUES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const PERIOD_UNITS = ['day', 'week', 'month']
const INTERNAL_LAB_URI_PATTERN = /^Lab-[A-Za-z0-9][A-Za-z0-9._-]*-\d+\.json$/

const extractInternalLabUri = (value) => {
  if (!value) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  if (INTERNAL_LAB_URI_PATTERN.test(trimmed)) {
    return trimmed
  }
  try {
    const parsed = new URL(trimmed)
    const param = parsed.searchParams.get('uri')
    if (param && INTERNAL_LAB_URI_PATTERN.test(param)) {
      return param
    }
    const match = parsed.pathname.match(/Lab-[A-Za-z0-9][A-Za-z0-9._-]*-\d+\.json$/)
    if (match) {
      return match[0]
    }
  } catch {
    // Ignore invalid URLs.
  }
  return null
}

const sanitizeAvailableDays = (days) => {
  if (!Array.isArray(days)) return []
  return days
    .map(day => (typeof day === 'string' ? day.toUpperCase() : null))
    .filter(day => WEEKDAY_VALUES.includes(day))
}

const sanitizeTime = (time) => {
  if (!time || typeof time !== 'string') return ''
  const trimmed = time.trim()
  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return ''
  const [hours, minutes] = trimmed.split(':').map(Number)
  if (hours > 23 || minutes > 59) return ''
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

const sanitizeAvailableHours = (hours) => {
  const safeHours = hours && typeof hours === 'object' ? hours : {}
  const start = sanitizeTime(safeHours.start)
  const end = sanitizeTime(safeHours.end)
  if (!start || !end) {
    return {}
  }
  return {
    start,
    end
  }
}

const sanitizeUnavailableWindows = (windows) => {
  if (!Array.isArray(windows)) return []
  return windows
    .map(window => {
      if (!window) return null
      const startUnix = Number(window.startUnix || window.start || 0)
      const endUnix = Number(window.endUnix || window.end || 0)
      const reason = typeof window.reason === 'string' ? window.reason.trim() : ''
      if (!Number.isFinite(startUnix) || !Number.isFinite(endUnix) || startUnix <= 0 || endUnix <= 0) return null
      if (!reason) return null
      if (startUnix >= endUnix) return null
      const startDate = new Date(startUnix * 1000)
      const endDate = new Date(endUnix * 1000)
      return {
        startUnix: Math.floor(startDate.getTime() / 1000),
        endUnix: Math.floor(endDate.getTime() / 1000),
        reason
      }
    })
    .filter(Boolean)
}

const sanitizeTermsOfUse = (terms) => {
  const safeTerms = terms && typeof terms === 'object' ? terms : {}
  const sanitized = {}
  if (safeTerms.url) sanitized.url = safeTerms.url
  if (safeTerms.version) sanitized.version = safeTerms.version
  if (safeTerms.effectiveDate) sanitized.effectiveDate = safeTerms.effectiveDate
  if (safeTerms.sha256) sanitized.sha256 = safeTerms.sha256.toLowerCase()
  return sanitized
}

const sanitizeUnixDate = (value) => {
  if (value === undefined || value === null) return null
  const asNumber = Number(value)
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.floor(asNumber)
  const parsed = new Date(value)
  if (isNaN(parsed.getTime())) return null
  return Math.floor(parsed.getTime() / 1000)
}

const parseOptionalNumber = (value) => {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeMetadataResourceType = (value) => {
  if (value === 1 || value === '1') return 'fmu'
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return normalized === 'fmu' ? 'fmu' : 'lab'
}

const splitCsv = (value) => {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean)
  if (typeof value !== 'string') return []
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

const normalizeMetadataAssetList = (value, maxItems = 64) => (
  (Array.isArray(value) ? value : splitCsv(value))
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0 && item.length <= 4_096)
    .slice(0, maxItems)
)

const normalizePositiveIntegers = (value) => (
  (Array.isArray(value) ? value : splitCsv(value))
    .map(Number)
    .filter(item => Number.isFinite(item) && item > 0)
    .map(Math.trunc)
)

const normalizePeriodUnit = (unit, fallback = 'day') => {
  const normalized = String(unit || fallback).trim().toLowerCase().replace(/s$/, '')
  return PERIOD_UNITS.includes(normalized) ? normalized : fallback
}

const getBookingModeFromPriceUnit = (priceUnit) => (
  normalizePricingUnit(priceUnit) === 'hour'
    ? DEFAULT_BOOKING_MODE
    : CALENDAR_PERIOD_BOOKING_MODE
)

const normalizeAllowedDurationRange = (range, priceUnit = 'day') => {
  const fallbackUnit = normalizePricingUnit(priceUnit) === 'month'
    ? 'month'
    : normalizePricingUnit(priceUnit) === 'week'
      ? 'week'
      : 'day'
  const unit = normalizePeriodUnit(range?.unit, fallbackUnit)
  const maxByUnit = { day: 90, week: 12, month: 3 }
  const unitMax = maxByUnit[unit] || 90
  const rawMin = Math.trunc(Number(range?.min ?? 1))
  const rawMax = Math.trunc(Number(range?.max ?? rawMin))
  const min = Math.min(Math.max(Number.isFinite(rawMin) ? rawMin : 1, 1), unitMax)
  const max = Math.min(Math.max(Number.isFinite(rawMax) ? rawMax : min, min), unitMax)
  return { unit, min, max }
}

const expandAllowedDurations = (range) => {
  if (!range) return []
  const min = Math.trunc(Number(range.min))
  const max = Math.trunc(Number(range.max))
  const unit = normalizePeriodUnit(range.unit)
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return []
  return Array.from({ length: max - min + 1 }, (_, index) => ({ unit, value: min + index }))
}

const buildPeriodRules = (range) => {
  if (!range) return null
  const daysPerUnit = { day: 1, week: 7, month: 30 }
  const unit = normalizePeriodUnit(range.unit)
  return {
    startGranularity: 'day',
    allowCustomDateRange: true,
    minDurationDays: Number(range.min) * daysPerUnit[unit],
    maxDurationDays: Number(range.max) * daysPerUnit[unit],
  }
}

const normalizePricing = ({ price, pricing, priceUnit }) => {
  const displayUnit = normalizePricingUnit(pricing?.displayUnit || priceUnit || pricing?.unit || 'hour')
  const displayAmount = String(pricing?.displayAmount ?? price ?? '').trim()
  let rawPricePerSecond = pricing?.rawPricePerSecond ? String(pricing.rawPricePerSecond) : ''
  if (!rawPricePerSecond && displayAmount) {
    try {
      rawPricePerSecond = displayPriceToRawPerSecond(displayAmount, displayUnit).toString()
    } catch {
      rawPricePerSecond = ''
    }
  }
  return {
    displayAmount,
    displayUnit,
    rawPricePerSecond,
    roundingMode: 'ceil-per-second',
    billingMode: 'linear-duration',
  }
}

/**
 * Saves lab data to file system (local) or cloud storage (Vercel)
 * @param {Request} req - HTTP request with lab data
 * @param {Object} req.body.labData - Lab data object to save
 * @param {string} req.body.labData.name - Lab name
 * @param {string} req.body.labData.description - Lab description
 * @param {string} req.body.labData.category - Lab category
 * @param {Array} req.body.labData.keywords - Lab keywords
 * @param {number|string|Date} req.body.labData.opens - Opening date (Unix seconds preferred)
 * @param {number|string|Date} req.body.labData.closes - Closing date (Unix seconds preferred)
 * @param {Array} req.body.labData.docs - Document URLs
 * @param {Array} req.body.labData.images - Image URLs
 * @param {Array} req.body.labData.timeSlots - Available time slots
 * @param {string} req.body.labData.uri - Lab URI identifier
 * @returns {Response} JSON response indicating success or error
 */
export async function POST(req) {
  try {
    // ===== AUTHENTICATION & AUTHORIZATION =====
    // Require provider role (defense in depth; the smart contract enforces
    // _requireLabProvider on-chain as the primary gate).
    const session = await requireAuth();
    const rateLimitResponse = createRateLimitResponse(await checkRate(req, session))
    if (rateLimitResponse) return rateLimitResponse
    requireProviderRole(session);
    
    const body = await req.json();
    const { labData } = body;

    // Validate required body structure
    if (!labData) {
      return NextResponse.json(
        {
          error: 'Missing required field: labData',
          code: 'MISSING_LAB_DATA'
        },
        { status: 400 }
      );
    }

    const {
      name,
      description,
      category,
      classification,
      educationalProgramLinked,
      iscedF,
      keywords,
      opens,
      closes,
      docs,
      images,
      timeSlots,
      price,
      priceUnit,
      pricing,
      allowedDurationRange,
      uri,
      availableDays,
      availableHours,
      maxConcurrentUsers,
      unavailableWindows,
      termsOfUse,
      timezone,
      resourceType,
      fmuFileName,
      fmiVersion,
      simulationType,
      modelVariables,
      defaultStartTime,
      defaultStopTime,
      defaultStepSize
    } = labData || {};

    // Validate required fields
    if (!uri) {
      return NextResponse.json(
        { 
          error: 'Missing required field: uri',
          code: 'MISSING_URI'
        },
        { status: 400 }
      );
    }

    if (typeof uri !== 'string') {
      return NextResponse.json(
        {
          error: 'Invalid lab URI format. Expected: Lab-{provider}-{id}.json',
          code: 'INVALID_URI_FORMAT'
        },
        { status: 400 }
      );
    }

    // Only the controlled internal metadata filename is writable. This keeps
    // both local paths and Blob keys inside the repository/data namespace.
    const normalizedUri = extractInternalLabUri(uri)
    if (!normalizedUri) {
      return NextResponse.json(
        {
          error: 'Invalid lab URI format. Expected: Lab-{provider}-{id}.json',
          code: 'INVALID_URI_FORMAT'
        },
        { status: 400 }
      );
    }

    // ===== AUTHORIZATION =====
    // Prefer explicit labId from request/body, fallback to extracting from URI.
    const resolvedLabId = body?.labId || labData?.labId || labData?.id;
    const labIdFromUri = normalizedUri?.match(/-(\d+)\.json$/)?.[1];
    const labId = (resolvedLabId || labIdFromUri)?.toString?.();

    if (!labId) {
      throw new BadRequestError('Missing labId (provide labData.id/labData.labId or include it in the URI)');
    }
    if (labIdFromUri && String(labId) !== String(labIdFromUri)) {
      throw new BadRequestError('labId does not match the metadata URI');
    }

    await requireLabOwner(session, labId);

    // Extra safety: when persisting local "Lab-*.json" metadata, ensure the on-chain URI matches.
    if (normalizedUri.startsWith('Lab-')) {
      try {
        const contract = await getContractInstance();
        const onchainTokenUri = await contract.tokenURI(labId);
        const normalizedOnchainUri = extractInternalLabUri(onchainTokenUri)
        const matchesLocalUri = onchainTokenUri === normalizedUri || normalizedOnchainUri === normalizedUri
        if (!matchesLocalUri) {
          throw new BadRequestError('URI does not match the on-chain tokenURI for this lab');
        }
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new BadRequestError('Unable to validate tokenURI for this lab');
      }
    }

    const isVercel = getIsVercel();
    const filePath = resolveManagedLocalPath(path.join(process.cwd(), 'data'), normalizedUri);
    const blobName = normalizedUri;
    let existingData = null;
    const timestamp = new Date().toISOString();

    // Try to read existing data
    if (!isVercel) {
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        existingData = JSON.parse(fileContent);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          return publicErrorResponse({
            status: 500,
            code: 'READ_ERROR',
            message: 'The existing lab data could not be read.',
            error,
            context: 'provider-save-lab-data-read',
          });
        }
        // ENOENT is fine - file doesn't exist yet
      }
    } else {
      try {
        const blobBase = process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL.replace(/\/+$/, '');
        const blobUrl = `${blobBase}/data/${blobName}`;
        const response = await fetch(blobUrl);
        if (response.ok) {
          try {
            existingData = await response.json();
      } catch (parseError) {
            console.warn(`Failed to parse existing blob data for ${blobName}:`, sanitizeErrorForLog(parseError));
            existingData = null; // Treat as new file
          }
        }
        // Non-200 responses are fine - blob might not exist yet
      } catch (error) {
        console.warn(`Failed to fetch existing blob data for ${blobName}:`, sanitizeErrorForLog(error));
        // Continue with null existingData
      }
    }

    const normalizedAvailableDays = sanitizeAvailableDays(availableDays)
    const normalizedAvailableHours = sanitizeAvailableHours(availableHours)
    const normalizedOpens = sanitizeUnixDate(opens)
    const normalizedCloses = sanitizeUnixDate(closes)
    const parsedMaxUsers = parseInt(maxConcurrentUsers, 10)
    const normalizedMaxUsers = Number.isFinite(parsedMaxUsers) && parsedMaxUsers > 0
      ? parsedMaxUsers
      : 1
    const normalizedUnavailableWindows = sanitizeUnavailableWindows(unavailableWindows)
    const normalizedTerms = sanitizeTermsOfUse(termsOfUse)
    const normalizedTimezone = typeof timezone === 'string' ? timezone.trim() : ''
    const normalizedResourceType = normalizeMetadataResourceType(resourceType)
    const normalizedFmuFileName = typeof fmuFileName === 'string' ? fmuFileName.trim() : ''
    const normalizedDefaultStartTime = parseOptionalNumber(defaultStartTime)
    const normalizedDefaultStopTime = parseOptionalNumber(defaultStopTime)
    const normalizedDefaultStepSize = parseOptionalNumber(defaultStepSize)
    const normalizedImages = normalizeMetadataAssetList(images)
    const normalizedDocs = normalizeMetadataAssetList(docs, 32)
    const fordCodesFromClassification = getFordCodesFromClassification(classification)
    const iscedCodesFromClassification = getIscedCodesFromClassification(classification)
    const normalizedCategory = Array.isArray(category)
      ? category.filter(Boolean)
      : (category ? [category] : fordCodesFromClassification)
    const normalizedIscedCodes = Array.isArray(iscedF) && iscedF.length
      ? iscedF.filter(Boolean)
      : iscedCodesFromClassification
    const hasEducationalLink = educationalProgramLinked === true
      || normalizedIscedCodes.length > 0
      || iscedCodesFromClassification.length > 0
    const normalizedClassification = buildClassificationEntries({
      fordCodes: normalizedCategory,
      iscedCodes: normalizedIscedCodes,
      educationalProgramLinked: hasEducationalLink,
    })
    if (!normalizedClassification.some(entry => entry.scheme === CLASSIFICATION_SCHEMES.FORD)) {
      return NextResponse.json(
        {
          error: 'At least one valid OECD FORD classification is required',
          code: 'MISSING_FORD_CLASSIFICATION'
        },
        { status: 400 }
      )
    }
    const normalizedKeywords = splitCsv(keywords)
    const normalizedPricing = normalizePricing({ price, pricing, priceUnit })
    const normalizedBookingMode = getBookingModeFromPriceUnit(normalizedPricing.displayUnit)
    const normalizedTimeSlots = normalizePositiveIntegers(timeSlots)
    const normalizedAllowedDurationRange = normalizedBookingMode === CALENDAR_PERIOD_BOOKING_MODE
      ? normalizeAllowedDurationRange(allowedDurationRange, normalizedPricing.displayUnit)
      : null
    const normalizedAllowedDurations = normalizedBookingMode === CALENDAR_PERIOD_BOOKING_MODE
      ? expandAllowedDurations(normalizedAllowedDurationRange)
      : normalizedTimeSlots.map(slot => ({ unit: 'minute', value: slot }))
    const normalizedPeriodRules = normalizedBookingMode === CALENDAR_PERIOD_BOOKING_MODE
      ? buildPeriodRules(normalizedAllowedDurationRange)
      : null

    // Prepare new data structure
    const newData = {
      name: name || "",
      description: description || "",
      image: normalizedImages.length > 0 ? normalizedImages[0] : "",
      attributes: [
        { trait_type: "classification", value: normalizedClassification },
        { trait_type: "classificationPrimaryScheme", value: CLASSIFICATION_SCHEMES.FORD },
        ...(hasEducationalLink ? [{ trait_type: "educationalProgramLinked", value: true }] : []),
        { trait_type: "keywords", value: normalizedKeywords },
        ...(normalizedBookingMode === DEFAULT_BOOKING_MODE ? [{ trait_type: "timeSlots", value: normalizedTimeSlots }] : []),
        { trait_type: "pricing", value: normalizedPricing },
        { trait_type: "bookingMode", value: normalizedBookingMode },
        ...(normalizedAllowedDurationRange ? [{ trait_type: "allowedDurationRange", value: normalizedAllowedDurationRange }] : []),
        { trait_type: "allowedDurations", value: normalizedAllowedDurations },
        ...(normalizedPeriodRules ? [{ trait_type: "periodRules", value: normalizedPeriodRules }] : []),
        { trait_type: "opens", value: normalizedOpens },
        { trait_type: "closes", value: normalizedCloses },
        { trait_type: "additionalImages", value: normalizedImages.length > 1 ? normalizedImages.slice(1) : [] },
        { trait_type: "docs", value: normalizedDocs },
        { trait_type: "availableDays", value: normalizedAvailableDays },
        { trait_type: "availableHours", value: normalizedAvailableHours },
        { trait_type: "maxConcurrentUsers", value: normalizedMaxUsers },
        { trait_type: "unavailableWindows", value: normalizedUnavailableWindows },
        { trait_type: "termsOfUse", value: normalizedTerms },
        { trait_type: "timezone", value: normalizedTimezone },
        { trait_type: "resourceType", value: normalizedResourceType },
        ...(normalizedResourceType === 'fmu' && normalizedFmuFileName ? [{ trait_type: "fmuFileName", value: normalizedFmuFileName }] : []),
        ...(fmiVersion ? [{ trait_type: "fmiVersion", value: fmiVersion }] : []),
        ...(simulationType ? [{ trait_type: "simulationType", value: simulationType }] : []),
        ...(modelVariables ? [{ trait_type: "modelVariables", value: modelVariables }] : []),
        ...(normalizedDefaultStartTime !== null ? [{ trait_type: "defaultStartTime", value: normalizedDefaultStartTime }] : []),
        ...(normalizedDefaultStopTime !== null ? [{ trait_type: "defaultStopTime", value: normalizedDefaultStopTime }] : []),
        ...(normalizedDefaultStepSize !== null ? [{ trait_type: "defaultStepSize", value: normalizedDefaultStepSize }] : [])
      ],
      _meta: {
        lastUpdated: timestamp,
        uri: normalizedUri,
        version: existingData?._meta?.version ? existingData._meta.version + 1 : 1,
        // Add cache-busting timestamp for Vercel production
        cacheBreaker: Date.now()
      }
    };

    // Replace the document atomically. Merging preserved unknown legacy fields
    // (including stale URLs) even after a provider removed them from the form.
    const finalData = newData;

    // Save the data
    const labJSON = JSON.stringify(finalData, null, 2);
    
    try {
      if (!isVercel) {
        // Ensure directory exists
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, labJSON, 'utf-8');
      } else {
        await put(`data/${blobName}`, labJSON, 
                  { contentType: 'application/json', allowOverwrite: true, access: 'public' });
      }
    } catch (writeError) {
      return publicErrorResponse({
        status: 500,
        code: 'WRITE_ERROR',
        message: 'The lab data could not be saved.',
        error: writeError,
        context: 'provider-save-lab-data-write',
      });
    }

    // Return success response optimized for React Query
    // Include finalData so the client can populate the metadata cache directly
    // without a CDN round-trip (avoids CDN propagation race on first fetch).
    const successResponse = NextResponse.json(
      { 
        message: 'Lab data saved/updated successfully',
        uri: normalizedUri,
        version: finalData._meta.version,
        timestamp: timestamp,
        isUpdate: !!existingData,
        cacheBreaker: finalData._meta.cacheBreaker,
        metadata: finalData
      }, 
      { status: 200 }
    );
    
    // Add cache-control headers to prevent caching issues in production
    successResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    successResponse.headers.set('Pragma', 'no-cache');
    successResponse.headers.set('Expires', '0');
    
    return successResponse;

  } catch (error) {
    // Handle authentication/authorization errors
    if (error instanceof HttpError) {
      return handleGuardError(error, req);
    }

    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      return publicErrorResponse({
        status: 400,
        code: 'INVALID_JSON',
        message: 'The request body is invalid.',
        error,
        context: 'provider-save-lab-data-json',
      });
    }
    
    return publicErrorResponse({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'The lab data request could not be completed.',
      error,
      context: 'provider-save-lab-data',
    });
  }
}
