/**
 * Metadata API endpoint for server-side file system access
 * Handles local metadata files that can't be accessed from client-side
 */
import fs from 'fs/promises'
import path from 'path'
import getIsVercel from '@/utils/isVercel'
import { NextResponse } from 'next/server'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const metadataUri = searchParams.get('uri');

    if (!metadataUri) {
      return NextResponse.json(
        { error: 'Missing metadata URI parameter' },
        { status: 400 }
      );
    }

    let metadata = {};
    const isVercel = getIsVercel();
    
    if (metadataUri.startsWith('Lab-')) {
      // Local or Vercel blob storage
      if (!isVercel) {
        try {
          const filePath = path.join(process.cwd(), 'data', metadataUri);
          const fileContent = await fs.readFile(filePath, 'utf-8');
          metadata = JSON.parse(fileContent);
        } catch (error) {
          return NextResponse.json(
            { error: `Failed to read local file: ${error.message}` },
            { status: 404 }
          );
        }
      } else {
        try {
          const blobUrl = path.join(process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL, 'data', metadataUri);
          const response = await fetch(blobUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch blob data: ${response.statusText}`);
          }
          metadata = await response.json();
        } catch (error) {
          return NextResponse.json(
            { error: `Failed to fetch blob data: ${error.message}` },
            { status: 404 }
          );
        }
      }
    } else {
      // External URI - proxy the request
      try {
        const response = await fetch(metadataUri);
        if (!response.ok) {
          throw new Error(`Failed to fetch metadata: ${response.statusText}`);
        }
        metadata = await response.json();
      } catch (error) {
        return NextResponse.json(
          { error: `Failed to fetch external metadata: ${error.message}` },
          { status: 404 }
        );
      }
    }
    
    return NextResponse.json(metadata);
  } catch (error) {
    console.error('Error in metadata endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
