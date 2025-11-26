/**
 * API endpoint for saving lab data to local storage or cloud
 * Handles POST requests to persist lab information and metadata
 */
import path from 'path'
import { promises as fs } from 'fs'
import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import getIsVercel from '@/utils/isVercel'

const WEEKDAY_VALUES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

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
      keywords,
      opens,
      closes,
      docs,
      images,
      timeSlots,
      uri,
      availableDays,
      availableHours,
      maxConcurrentUsers,
      unavailableWindows,
      termsOfUse,
      timezone
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

    // Validate URI format for local files
    if (uri.startsWith('Lab-') && !/^Lab-[\w-]+-\d+\.json$/.test(uri)) {
      return NextResponse.json(
        { 
          error: 'Invalid lab URI format. Expected: Lab-{provider}-{id}.json',
          code: 'INVALID_URI_FORMAT'
        },
        { status: 400 }
      );
    }

    const isVercel = getIsVercel();
    const filePath = path.join(process.cwd(), 'data', uri);
    const blobName = uri;
    let existingData = null;
    const timestamp = new Date().toISOString();

    // Try to read existing data
    if (!isVercel) {
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        existingData = JSON.parse(fileContent);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`Error reading existing lab data for ${uri}:`, error);
          return NextResponse.json(
            { 
              error: 'Failed to read existing lab data',
              code: 'READ_ERROR',
              details: process.env.NODE_ENV === 'development' ? error.message : undefined
            }, 
            { status: 500 }
          );
        }
        // ENOENT is fine - file doesn't exist yet
      }
    } else {
      try {
        const blobUrl = path.join(process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL, 'data', blobName);
        const response = await fetch(blobUrl);
        if (response.ok) {
          try {
            existingData = await response.json();
          } catch (parseError) {
            console.warn(`Failed to parse existing blob data for ${blobName}:`, parseError);
            existingData = null; // Treat as new file
          }
        }
        // Non-200 responses are fine - blob might not exist yet
      } catch (error) {
        console.warn(`Failed to fetch existing blob data for ${blobName}:`, error.message);
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

    // Prepare new data structure
    const newData = {
      name: name || "",
      description: description || "",
      image: images && images.length > 0 ? images[0] : "",
      attributes: [
        { trait_type: "category", value: category || "" },
        { trait_type: "keywords", value: Array.isArray(keywords) ? 
          keywords : (keywords ? keywords.split(',').map(k => k.trim()) : []) },
        { trait_type: "timeSlots", value: Array.isArray(timeSlots) ? 
          timeSlots.map(Number).filter(Boolean) 
          : (timeSlots ? timeSlots.split(',').map(Number).filter(Boolean) : []) },
        { trait_type: "opens", value: normalizedOpens },
        { trait_type: "closes", value: normalizedCloses },
        { trait_type: "additionalImages", value: images && images.length > 1 ? images.slice(1) : [] },
        { trait_type: "docs", value: Array.isArray(docs) ? 
          docs : (docs ? docs.split(',').map(d => d.trim()) : []) },
        { trait_type: "availableDays", value: normalizedAvailableDays },
        { trait_type: "availableHours", value: normalizedAvailableHours },
        { trait_type: "maxConcurrentUsers", value: normalizedMaxUsers },
        { trait_type: "unavailableWindows", value: normalizedUnavailableWindows },
        { trait_type: "termsOfUse", value: normalizedTerms },
        { trait_type: "timezone", value: normalizedTimezone }
      ],
      _meta: {
        lastUpdated: timestamp,
        uri: uri,
        version: existingData?._meta?.version ? existingData._meta.version + 1 : 1,
        // Add cache-busting timestamp for Vercel production
        cacheBreaker: Date.now()
      }
    };

    // Merge with existing data if present
    let finalData;
    if (existingData) {
      finalData = {
        ...existingData,
        ...newData,
        attributes: newData.attributes.map(newAttr => {
          const existingAttr = existingData.attributes?.find(attr => attr.trait_type === newAttr.trait_type);
          return existingAttr ? { ...existingAttr, ...newAttr } : newAttr;
        }),
        _meta: newData._meta // Always use new metadata
      };
    } else {
      finalData = newData;
    }

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
      console.error(`Error writing lab data for ${uri}:`, writeError);
      return NextResponse.json(
        { 
          error: 'Failed to save lab data',
          code: 'WRITE_ERROR',
          details: process.env.NODE_ENV === 'development' ? writeError.message : undefined
        },
        { status: 500 }
      );
    }

    // Return success response optimized for React Query
    const successResponse = NextResponse.json(
      { 
        message: 'Lab data saved/updated successfully',
        uri: uri,
        version: finalData._meta.version,
        timestamp: timestamp,
        isUpdate: !!existingData,
        cacheBreaker: finalData._meta.cacheBreaker
      }, 
      { status: 200 }
    );
    
    // Add cache-control headers to prevent caching issues in production
    successResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    successResponse.headers.set('Pragma', 'no-cache');
    successResponse.headers.set('Expires', '0');
    
    return successResponse;

  } catch (error) {
    console.error('Error in saveLabData endpoint:', error);
    
    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { 
          error: 'Invalid JSON in request body',
          code: 'INVALID_JSON',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }, 
      { status: 500 }
    );
  }
}
