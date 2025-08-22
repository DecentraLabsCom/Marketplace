/**
 * API endpoint for saving lab data to local storage or cloud
 * Handles POST requests to persist lab information and metadata
 */
import path from 'path'
import { promises as fs } from 'fs'
import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import devLog from '@/utils/dev/logger'
import getIsVercel from '@/utils/isVercel'

/**
 * Saves lab data to file system (local) or cloud storage (Vercel)
 * @param {Request} req - HTTP request with lab data
 * @param {Object} req.body.labData - Lab data object to save
 * @param {string} req.body.labData.name - Lab name
 * @param {string} req.body.labData.description - Lab description
 * @param {string} req.body.labData.category - Lab category
 * @param {Array} req.body.labData.keywords - Lab keywords
 * @param {string} req.body.labData.opens - Opening date
 * @param {string} req.body.labData.closes - Closing date
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

    const { name, description, category, keywords, opens, closes, docs, images, timeSlots, uri } = 
      labData || {};

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
    if (uri.startsWith('Lab-') && !/^Lab-\w+-\d+\.json$/.test(uri)) {
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
        { trait_type: "opens", value: opens || "" },
        { trait_type: "closes", value: closes || "" },
        { trait_type: "additionalImages", value: images && images.length > 1 ? images.slice(1) : [] },
        { trait_type: "docs", value: Array.isArray(docs) ? 
          docs : (docs ? docs.split(',').map(d => d.trim()) : []) },
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
