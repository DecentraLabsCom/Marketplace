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

const MAX_MOVE_ATTEMPTS = 3

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const normalizePathSeparators = (value = '') => String(value).replace(/\\/g, '/')

const extractTempRelativePath = (filePath) => {
  const normalizedInput = normalizePathSeparators(filePath)

  if (normalizedInput.startsWith('http')) {
    const url = new URL(normalizedInput)
    const normalizedPathname = normalizePathSeparators(url.pathname)
    const marker = '/data/temp/'
    const markerIndex = normalizedPathname.indexOf(marker)
    if (markerIndex === -1) {
      throw new Error(`Invalid blob URL format: ${filePath}`)
    }
    const relative = normalizedPathname.substring(markerIndex + marker.length)
    if (!relative) {
      throw new Error(`Invalid blob URL temp path: ${filePath}`)
    }
    return decodeURIComponent(relative)
  }

  const marker = '/temp/'
  const normalizedWithSlash = normalizedInput.startsWith('/') ? normalizedInput : `/${normalizedInput}`
  const markerIndex = normalizedWithSlash.indexOf(marker)
  if (markerIndex === -1) {
    throw new Error(`Cannot extract path from: ${filePath}`)
  }
  return normalizedWithSlash.substring(markerIndex + marker.length)
}

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
    // Require a valid authenticated session
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
        const normalizedFilePath = normalizePathSeparators(filePath)
        if (!normalizedFilePath.includes('/temp/') && !normalizedFilePath.includes('temp/')) {
          throw new Error(`File must be in temp folder: ${filePath}`);
        }

        const folderAndFile = extractTempRelativePath(filePath)

        // Construct new path with labId
        const newRelativePath = `/${labId}/${folderAndFile}`;

        let moved = false
        let lastError = null

        for (let attempt = 1; attempt <= MAX_MOVE_ATTEMPTS; attempt += 1) {
          try {
            if (!isVercel) {
              // Local development: move file in filesystem
              const oldLocalPath = path.join('./public', normalizedFilePath.startsWith('/') ? normalizedFilePath.substring(1) : normalizedFilePath)
              const newLocalPath = path.join(`./public/${labId}`, folderAndFile)

              // Ensure destination directory exists
              await fs.mkdir(path.dirname(newLocalPath), { recursive: true })

              // Copy file to new location
              await fs.copyFile(oldLocalPath, newLocalPath)

              // Delete original file
              await fs.unlink(oldLocalPath)

              devLog.info(`📁 File moved locally: ${oldLocalPath} → ${newLocalPath}`)
              movedFiles.push({
                original: filePath,
                new: newRelativePath,
                storage: 'local'
              })
            } else {
              // Production: move file in Vercel Blob
              const oldBlobPath = normalizedFilePath.startsWith('http')
                ? filePath // Keep original URL, may include encoded path
                : `data${normalizedFilePath}` // Convert relative path to blob path

              const newBlobPath = `data${newRelativePath}`

              // Copy to new location
              const newBlob = await copy(oldBlobPath, newBlobPath, {
                access: 'public',
                addRandomSuffix: false
              })

              // Delete original
              await del(oldBlobPath)

              devLog.info(`📁 File moved in blob: ${oldBlobPath} → ${newBlob.url}`)
              movedFiles.push({
                original: filePath,
                new: newBlob.url,
                storage: 'blob'
              })
            }

            moved = true
            break
          } catch (attemptError) {
            lastError = attemptError
            const shouldRetry = attempt < MAX_MOVE_ATTEMPTS
            if (!shouldRetry) {
              break
            }
            // Handle transient storage/network issues with small linear backoff.
            await sleep(200 * attempt)
          }
        }

        if (!moved) {
          throw lastError || new Error('Unknown move error')
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
