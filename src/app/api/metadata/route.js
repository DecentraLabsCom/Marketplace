/**
 * Metadata API endpoint for server-side file system access
 * Handles local metadata files that can't be accessed from client-side
 */
import fs from 'fs/promises'
import path from 'path'
import getIsVercel from '@/utils/isVercel'
import { NextResponse } from 'next/server'

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
          const fileContent = await fs.readFile(filePath, 'utf-8');
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
          throw error; // Re-throw for main catch block
        }
      } else {
        try {
          const blobUrl = path.join(process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL, 'data', metadataUri);
          const response = await fetch(blobUrl);
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
        const response = await fetch(metadataUri);
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
    return NextResponse.json({
      ...metadata,
      _meta: {
        uri: metadataUri,
        timestamp,
        source: metadataUri.startsWith('Lab-') ? (isVercel ? 'blob' : 'local') : 'external'
      }
    }, { status: 200 });

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
