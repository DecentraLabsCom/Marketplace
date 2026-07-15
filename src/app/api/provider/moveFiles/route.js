/**
 * API endpoint for moving files from temp folder to lab-specific folder
 * Handles POST requests to move files after lab creation (when labId is obtained from blockchain)
 * 
 * SECURITY: Requires authentication and lab ownership verification
 */
import path from 'path'
import { promises as fs } from 'fs'
import { NextResponse } from 'next/server'
import { copy, del } from '@vercel/blob'
import devLog from '@/utils/dev/logger'
import getIsVercel from '@/utils/isVercel'
import { 
  requireAuth, 
  requireLabOwner, 
  handleGuardError,
  HttpError 
} from '@/utils/auth/guards'
import {
  getSessionUploadNamespace,
  isTrustedBlobUrl,
  parseManagedFilePath,
  resolveManagedLocalPath,
  validateLabId,
} from '@/utils/storage/fileSecurity'
import { publicErrorResponse, sanitizeErrorForLog } from '@/utils/security/publicError'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'

const checkRate = createRateLimiter({ operation: 'provider-move-files', windowMs: 60_000, maxRequests: 20 })

const MAX_MOVE_ATTEMPTS = 3

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

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
    const rateLimitResponse = createRateLimitResponse(await checkRate(req, session))
    if (rateLimitResponse) return rateLimitResponse
    
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

    if (labId === undefined || labId === null || labId === '') {
      return NextResponse.json(
        { 
          error: 'Missing required field: labId',
          code: 'MISSING_LAB_ID'
        }, 
        { status: 400 }
      );
    }

    const normalizedLabId = validateLabId(labId)

    // ===== AUTHORIZATION =====
    // Verify the user owns the target lab
    await requireLabOwner(session, normalizedLabId);

    const expectedNamespace = getSessionUploadNamespace(session)
    const managedPaths = filePaths.map((filePath) => {
      try {
        const parsed = parseManagedFilePath(filePath)
        if (parsed.kind !== 'temporary') return { error: 'Only temporary files can be moved' }
        if (parsed.namespace !== expectedNamespace) return { error: 'Temporary file does not belong to the current session' }
        if (parsed.sourceUrl && !isTrustedBlobUrl(parsed.sourceUrl)) return { error: 'Temporary blob origin is not trusted' }
        return { parsed }
      } catch {
        return { error: 'Invalid managed temporary path' }
      }
    })
    const invalidPath = managedPaths.find((entry) => entry.error)
    if (invalidPath) {
      return NextResponse.json(
        { error: invalidPath.error, code: 'INVALID_TEMPORARY_PATH' },
        { status: 403 },
      )
    }

    const isVercel = getIsVercel();
    const movedFiles = [];
    const errors = [];

    for (const [index, filePath] of filePaths.entries()) {
      try {
        const parsed = managedPaths[index].parsed
        const folderAndFile = `${parsed.folder}/${parsed.filename}`

        // Construct new path with labId
        const newRelativePath = `/${normalizedLabId}/${folderAndFile}`;

        let moved = false
        let lastError = null

        for (let attempt = 1; attempt <= MAX_MOVE_ATTEMPTS; attempt += 1) {
          try {
            if (!isVercel) {
              // Local development: move file in filesystem
              const oldLocalPath = resolveManagedLocalPath(path.join(process.cwd(), 'public'), parsed.relativePath)
              const newLocalPath = resolveManagedLocalPath(path.join(process.cwd(), 'public'), `${normalizedLabId}/${folderAndFile}`)

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
              const oldBlobPath = parsed.sourceUrl
                ? parsed.sourceUrl.toString()
                : parsed.blobPath

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
        devLog.error(`Error moving file at index ${index}:`, {
          error: sanitizeErrorForLog(fileError),
        });
        errors.push({
          index,
          error: 'The file could not be moved.',
        });
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
      return handleGuardError(error, req);
    }
    
    return publicErrorResponse({
      status: 500,
      code: 'MOVE_FILES_FAILED',
      message: 'The file move request could not be completed.',
      error,
      context: 'provider-move-files',
    });
  }
}
