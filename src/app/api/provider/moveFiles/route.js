/**
 * API endpoint for moving files from temp folder to lab-specific folder
 * Handles POST requests to move files after lab creation (when labId is obtained from blockchain)
 * 
 * SECURITY: Requires authentication and lab ownership verification
 */
import path from 'path'
import { promises as fs } from 'fs'
import { NextResponse } from 'next/server'
import { copy, del, list } from '@vercel/blob'
import devLog from '@/utils/dev/logger'
import getIsVercel from '@/utils/isVercel'
import { 
  requireAuth, 
  requireLabOwner, 
  handleGuardError,
  HttpError 
} from '@/utils/auth/guards'

/**
 * Moves files from temporary folder to lab-specific folder
 * @param {Request} req - HTTP request with JSON body
 * @param {string[]} req.body.filePaths - Array of file paths to move (relative paths like "/temp/images/file.jpg")
 * @param {string|number} req.body.labId - Target lab ID for the destination folder
 * @returns {Response} JSON response with moved file paths or error
 */
export async function POST(req) {
  try {
    // ===== AUTHENTICATION =====
    // Require valid session (works for both SSO and wallet users)
    const session = await requireAuth();
    
    const body = await req.json();
    const { filePaths, labId } = body;

    // Validate required fields
    if (!filePaths || !Array.isArray(filePaths)) {
      return NextResponse.json(
        { 
          error: 'Missing or invalid required field: filePaths (must be an array)',
          code: 'MISSING_FILE_PATHS'
        }, 
        { status: 400 }
      );
    }

    if (!labId) {
      return NextResponse.json(
        { 
          error: 'Missing required field: labId',
          code: 'MISSING_LAB_ID'
        }, 
        { status: 400 }
      );
    }

    // ===== AUTHORIZATION =====
    // Verify the user owns the target lab
    await requireLabOwner(session, labId);

    const isVercel = getIsVercel();
    const movedFiles = [];
    const errors = [];

    for (const filePath of filePaths) {
      try {
        // Validate that file is in temp folder
        if (!filePath.includes('/temp/') && !filePath.includes('temp/')) {
          throw new Error(`File must be in temp folder: ${filePath}`);
        }

        // Extract the folder (images/docs) and filename from the path
        // Path formats:
        // - Local: "/temp/images/file.jpg" or "temp/images/file.jpg"
        // - Vercel Blob URL: "https://...blob.vercel-storage.com/data/temp/images/file.jpg"
        
        let folderAndFile;
        if (filePath.startsWith('http')) {
          // Vercel Blob URL - extract path after '/data/temp/'
          const match = filePath.match(/\/data\/temp\/(.+)/);
          if (!match) {
            throw new Error(`Invalid blob URL format: ${filePath}`);
          }
          folderAndFile = match[1]; // e.g., "images/file.jpg"
        } else {
          // Local relative path - extract after '/temp/' or 'temp/'
          const tempIndex = filePath.indexOf('/temp/');
          if (tempIndex !== -1) {
            folderAndFile = filePath.substring(tempIndex + 6); // After '/temp/'
          } else {
            const tempIndex2 = filePath.indexOf('temp/');
            if (tempIndex2 !== -1) {
              folderAndFile = filePath.substring(tempIndex2 + 5); // After 'temp/'
            } else {
              throw new Error(`Cannot extract path from: ${filePath}`);
            }
          }
        }

        // Construct new path with labId
        const newRelativePath = `/${labId}/${folderAndFile}`;

        if (!isVercel) {
          // Local development: move file in filesystem
          const oldLocalPath = path.join('./public', filePath.startsWith('/') ? filePath.substring(1) : filePath);
          const newLocalPath = path.join(`./public/${labId}`, folderAndFile);

          // Ensure destination directory exists
          await fs.mkdir(path.dirname(newLocalPath), { recursive: true });

          // Copy file to new location
          await fs.copyFile(oldLocalPath, newLocalPath);

          // Delete original file
          await fs.unlink(oldLocalPath);

          devLog.info(`📁 File moved locally: ${oldLocalPath} → ${newLocalPath}`);
          movedFiles.push({
            original: filePath,
            new: newRelativePath,
            storage: 'local'
          });

        } else {
          // Production: move file in Vercel Blob
          const oldBlobPath = filePath.startsWith('http') 
            ? filePath // Already a full URL
            : `data${filePath}`; // Convert relative path to blob path

          const newBlobPath = `data${newRelativePath}`;

          // Copy to new location
          const newBlob = await copy(oldBlobPath, newBlobPath, { 
            access: 'public',
            addRandomSuffix: false 
          });

          // Delete original
          await del(oldBlobPath);

          devLog.info(`📁 File moved in blob: ${oldBlobPath} → ${newBlob.url}`);
          movedFiles.push({
            original: filePath,
            new: newBlob.url,
            storage: 'blob'
          });
        }

      } catch (fileError) {
        devLog.error(`Error moving file ${filePath}:`, fileError);
        errors.push({
          filePath,
          error: fileError.message
        });
      }
    }

    // Try to clean up empty temp folder
    if (!isVercel && filePaths.length > 0) {
      try {
        const tempPath = path.join('./public/temp');
        // Check if temp folder exists and is empty
        const tempContents = await fs.readdir(tempPath);
        if (tempContents.length === 0) {
          await fs.rmdir(tempPath);
          devLog.info('🗑️ Cleaned up empty temp folder');
        }
      } catch (cleanupError) {
        // Ignore cleanup errors - not critical
        devLog.warn('Failed to cleanup temp folder:', cleanupError.message);
      }
    }

    if (errors.length > 0 && movedFiles.length === 0) {
      // All moves failed
      return NextResponse.json(
        {
          error: 'Failed to move all files',
          code: 'MOVE_ALL_FAILED',
          errors
        },
        { status: 500 }
      );
    }

    if (errors.length > 0) {
      // Partial success
      return NextResponse.json(
        {
          message: 'Some files moved successfully',
          code: 'PARTIAL_SUCCESS',
          movedFiles,
          errors
        },
        { status: 207 } // Multi-Status
      );
    }

    // Complete success
    return NextResponse.json(
      {
        message: 'All files moved successfully',
        movedFiles,
        count: movedFiles.length
      },
      { status: 200 }
    );

  } catch (error) {
    // Handle authentication/authorization errors
    if (error instanceof HttpError) {
      return handleGuardError(error);
    }
    
    console.error('Error in moveFiles endpoint:', error);
    
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
