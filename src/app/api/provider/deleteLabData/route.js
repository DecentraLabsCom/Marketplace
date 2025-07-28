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
    if (!labURI) {
      return NextResponse.json({ error: 'Missing labURI' }, { status: 400 });
    }
    const isVercel = getIsVercel();
    const filePath = path.join(process.cwd(), 'data', labURI);

    if (!isVercel) {
        try {
          await fs.unlink(filePath);
          return NextResponse.json({ message: 'Lab data deleted successfully.' }, { status: 200 });
        } catch (error) {
          return NextResponse.json(
              { error: 'Failed to delete lab data.', details: error.message },
              { status: 500 }
        );
        }
    } else {
        try {
            const blobPath = `data/${labURI}`;
            const result = await del(blobPath);
            if (result) {
              console.log(`Blob deleted from Vercel: ${blobPath}`);
              return NextResponse.json({ message: 'Lab data deleted successfully.' }, 
                { status: 200 });
            } else {
              console.warn(`Blob deletion from Vercel may have failed: ${blobPath}`);
              return NextResponse.json({ message: 'Lab data deleted successfully.' }, 
                { status: 200 });
            }
        } catch (error) {
            console.error("Error deleting data:", error);
            return NextResponse.json(
                { error: 'Failed to delete lab data.', details: error.message },
                { status: 500 }
            );
        }
    }

  } catch (error) {
    return NextResponse.json({ error: 'Failed to parse request body.', details: error.message }, 
      { status: 400 });
  }
}
