/**
 * Metadata API endpoint for server-side file system access
 * Handles local metadata files that can't be accessed from client-side
 */
import fs from 'fs/promises'
import path from 'path'
import getIsVercel from '@/utils/isVercel'
import { NextResponse } from 'next/server'

// Timeout for metadata fetches (2 seconds for fast failure)
const METADATA_FETCH_TIMEOUT = 2000;

/**
 * Creates a promise that rejects after the specified timeout
 * @param {number} ms - Timeout in milliseconds
 * @returns {Promise} Promise that rejects on timeout
 */
const timeoutPromise = (ms) => new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Request timeout')), ms)
);

/**
 * Retrieves metadata files from local storage or cloud blob storage
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.uri - Metadata URI to retrieve (required)
 * @returns {Response} JSON response with metadata content or error
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const metadataUri = searchParams.get('uri');

    // Validate required parameters
    if (!metadataUri) {
      return NextResponse.json(
        { 
          error: 'Missing required parameter: uri',
          code: 'MISSING_PARAMETER'
        },
        { status: 400 }
      );
    }

    // Validate URI format
    if (typeof metadataUri !== 'string' || metadataUri.trim().length === 0) {
      return NextResponse.json(
        { 
          error: 'Invalid URI format',
          code: 'INVALID_FORMAT'
        },
        { status: 400 }
      );
    }

    let metadata = {};
    const isVercel = getIsVercel();
    const timestamp = new Date().toISOString();
    
    if (metadataUri.startsWith('Lab-')) {
      // Local or Vercel blob storage
      if (!isVercel) {
        try {
          const filePath = path.join(process.cwd(), 'data', metadataUri);
          // Race between file read and timeout
          const fileContent = await Promise.race([
            fs.readFile(filePath, 'utf-8'),
            timeoutPromise(METADATA_FETCH_TIMEOUT)
          ]);
          metadata = JSON.parse(fileContent);
        } catch (error) {
          if (error.code === 'ENOENT') {
            return NextResponse.json(
              { 
                error: `Metadata file not found: ${metadataUri}`,
                code: 'FILE_NOT_FOUND'
              },
              { status: 404 }
            );
          }
          if (error.message === 'Request timeout') {
            return NextResponse.json(
              { 
                error: `Metadata fetch timeout: ${metadataUri}`,
                code: 'TIMEOUT'
              },
              { status: 408 } // Request Timeout
            );
          }
          throw error; // Re-throw for main catch block
        }
      } else {
        try {
          const blobUrl = path.join(process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL, 'data', metadataUri);
          // Add cache-busting parameter if 't' query param is present (from client)
          const cacheBuster = searchParams.get('t');
          const fetchUrl = cacheBuster ? `${blobUrl}?t=${cacheBuster}` : blobUrl;
          
          // Race between fetch and timeout
          const response = await Promise.race([
            fetch(fetchUrl, {
              headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
              }
            }),
            timeoutPromise(METADATA_FETCH_TIMEOUT)
          ]);
          
          if (!response.ok) {
            if (response.status === 404) {
              return NextResponse.json(
                { 
                  error: `Metadata blob not found: ${metadataUri}`,
                  code: 'BLOB_NOT_FOUND'
                },
                { status: 404 }
              );
            }
            throw new Error(`Failed to fetch blob: ${response.status} ${response.statusText}`);
          }
          metadata = await response.json();
        } catch (error) {
          if (error.message === 'Request timeout') {
            return NextResponse.json(
              { 
                error: `Metadata fetch timeout: ${metadataUri}`,
                code: 'TIMEOUT'
              },
              { status: 408 } // Request Timeout
            );
          }
          if (error.message.includes('404')) {
            return NextResponse.json(
              { 
                error: `Metadata blob not found: ${metadataUri}`,
                code: 'BLOB_NOT_FOUND'
              },
              { status: 404 }
            );
          }
          throw error; // Re-throw for main catch block
        }
      }
    } else {
      // External URI - proxy the request
      try {
        // Race between external fetch and timeout
        const response = await Promise.race([
          fetch(metadataUri),
          timeoutPromise(METADATA_FETCH_TIMEOUT)
        ]);
        
        if (!response.ok) {
          if (response.status === 404) {
            return NextResponse.json(
              { 
                error: `External metadata not found: ${metadataUri}`,
                code: 'EXTERNAL_NOT_FOUND'
              },
              { status: 404 }
            );
          }
          throw new Error(`External fetch failed: ${response.status} ${response.statusText}`);
        }
        metadata = await response.json();
      } catch (error) {
        if (error.message === 'Request timeout') {
          return NextResponse.json(
            { 
              error: `External metadata fetch timeout: ${metadataUri}`,
              code: 'TIMEOUT'
            },
            { status: 408 } // Request Timeout
          );
        }
        return NextResponse.json(
          { 
            error: `Failed to fetch external metadata: ${error.message}`,
            code: 'EXTERNAL_FETCH_ERROR',
            uri: metadataUri
          },
          { status: 502 } // Bad Gateway for external service errors
        );
      }
    }
    
    // Return successful response with metadata for React Query optimization
    const successResponse = NextResponse.json({
      ...metadata,
      _meta: {
        uri: metadataUri,
        timestamp,
        source: metadataUri.startsWith('Lab-') ? (isVercel ? 'blob' : 'local') : 'external',
        version: metadata._meta?.version || 1,
        cacheBreaker: metadata._meta?.cacheBreaker || Date.now()
      }
    }, { status: 200 });
    
    // Add cache-control headers to ensure fresh data in production
    const cacheBuster = searchParams.get('t');
    if (cacheBuster || isVercel) {
      // If cache-busting requested or in Vercel, add no-cache headers
      successResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      successResponse.headers.set('Pragma', 'no-cache');
      successResponse.headers.set('Expires', '0');
    }
    
    return successResponse;

  } catch (error) {
    console.error('Error in metadata endpoint:', error);
    
    // Handle JSON parsing errors specifically
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { 
          error: 'Invalid JSON in metadata file',
          code: 'INVALID_JSON',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        },
        { status: 422 } // Unprocessable Entity for malformed content
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
