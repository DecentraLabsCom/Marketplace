/**
 * API endpoint for deleting lab data from storage
 * Handles POST requests to remove lab data files from local or cloud storage
 */
import path from 'path'
import { promises as fs } from 'fs'
import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import devLog from '@/utils/dev/logger'
import getIsVercel from '@/utils/isVercel'

/**
 * Deletes lab data file from storage
 * @param {Request} req - HTTP request with lab data to delete
 * @param {Object} req.body - Request body
 * @param {string} req.body.labURI - URI/filename of lab data to delete (required)
 * @returns {Response} JSON response with deletion result or error
 */
export async function POST(req) {
  try {
    const { labURI } = await req.json();
    
    // Validate required parameters
    if (!labURI || typeof labURI !== 'string' || labURI.trim() === '') {
      return NextResponse.json({ 
        error: 'Missing or invalid labURI parameter',
        message: 'labURI is required and must be a non-empty string' 
      }, { status: 400 });
    }

    const sanitizedLabURI = labURI.trim();
    const isVercel = getIsVercel();

    devLog('DELETE_LAB_DATA', `Attempting to delete lab data: ${sanitizedLabURI} on ${isVercel ? 'Vercel' : 'local'}`);

    if (!isVercel) {
        // Local filesystem deletion
        const filePath = path.join(process.cwd(), 'data', sanitizedLabURI);
        
        try {
          await fs.unlink(filePath);
          devLog('DELETE_LAB_DATA', `Successfully deleted local file: ${filePath}`);
          
          return NextResponse.json({ 
            message: 'Lab data deleted successfully',
            deleted: sanitizedLabURI,
            timestamp: new Date().toISOString()
          }, { status: 200 });
          
        } catch (fsError) {
          console.error('Local file deletion error:', fsError);
          
          if (fsError.code === 'ENOENT') {
            return NextResponse.json(
              { 
                error: 'Lab data not found', 
                message: `File ${sanitizedLabURI} does not exist`,
                details: fsError.message 
              },
              { status: 404 }
            );
          }
          
          return NextResponse.json(
            { 
              error: 'Failed to delete lab data from local storage',
              message: 'Internal server error during file deletion', 
              details: fsError.message 
            },
            { status: 500 }
          );
        }
    } else {
        // Vercel blob deletion
        try {
            const blobPath = `data/${sanitizedLabURI}`;
            const result = await del(blobPath);
            
            devLog('DELETE_LAB_DATA', `Blob deletion result for ${blobPath}:`, result);
            
            return NextResponse.json({ 
              message: 'Lab data deleted successfully',
              deleted: sanitizedLabURI,
              blobPath,
              timestamp: new Date().toISOString()
            }, { status: 200 });
            
        } catch (blobError) {
            console.error('Vercel blob deletion error:', blobError);
            
            return NextResponse.json(
              { 
                error: 'Failed to delete lab data from cloud storage',
                message: 'Internal server error during blob deletion',
                details: blobError.message 
              },
              { status: 500 }
            );
        }
    }

  } catch (parseError) {
    console.error('Request parsing error:', parseError);
    
    return NextResponse.json({ 
      error: 'Invalid request format',
      message: 'Failed to parse request body. Expected valid JSON with labURI field.',
      details: parseError.message 
    }, { status: 400 });
  }
}
