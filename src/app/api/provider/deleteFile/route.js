/**
 * API endpoint for deleting files uploaded by lab providers
 * Handles POST requests to remove files from local storage or cloud storage
 * 
 * SECURITY: Requires authentication and lab ownership verification
 */
import path from 'path'
import { promises as fs } from 'fs'
import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import devLog from '@/utils/dev/logger'
import getIsVercel from '@/utils/isVercel'
import { 
  requireAuth, 
  requireProviderRole,
  requireLabOwner, 
  handleGuardError,
  HttpError 
} from '@/utils/auth/guards'
import {
  getSessionUploadNamespace,
  isTrustedBlobUrl,
  parseManagedFilePath,
  resolveManagedLocalPath,
} from '@/utils/storage/fileSecurity'
import { publicErrorResponse } from '@/utils/security/publicError'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'

const checkRate = createRateLimiter({ operation: 'provider-delete-file', windowMs: 60_000, maxRequests: 20 })

/**
 * Deletes files for lab providers with support for local and cloud storage
 * @param {Request} req - HTTP request with form data
 * @param {string} req.formData.filePath - Path to file to delete (required)
 * @param {string} req.formData.deletingLab - Whether entire lab is being deleted ("true"/"false")
 * @returns {Response} JSON response with success status or error
 */
export async function POST(req) {
    try {
        // ===== AUTHENTICATION =====
        // Require a valid authenticated session
        const session = await requireAuth();
        const rateLimitResponse = createRateLimitResponse(await checkRate(req, session))
        if (rateLimitResponse) return rateLimitResponse
        
        const formData = await req.formData();
        let filePath = formData.get('filePath'); 
        const deletingLab = formData.get('deletingLab') === 'true';

        // Validate required fields
        if (!filePath) {
            return NextResponse.json(
                { 
                    error: 'Missing required field: filePath',
                    code: 'MISSING_FILE_PATH'
                }, 
                { status: 400 }
            );
        }

        // Validate file path format
        if (typeof filePath !== 'string' || filePath.trim() === '') {
            return NextResponse.json(
                { 
                    error: 'Invalid file path format',
                    code: 'INVALID_FILE_PATH'
                }, 
                { status: 400 }
            );
        }

        let managedPath
        try {
            managedPath = parseManagedFilePath(filePath.trim())
        } catch (error) {
            return publicErrorResponse({
                status: 400,
                code: 'INVALID_FILE_PATH',
                message: 'The file path is invalid.',
                error,
                context: 'provider-delete-file-validation',
            })
        }

        if (managedPath.sourceUrl && !isTrustedBlobUrl(managedPath.sourceUrl)) {
            return NextResponse.json(
                { error: 'Blob origin is not trusted', code: 'FORBIDDEN_FILE_PATH' },
                { status: 403 },
            )
        }

        // ===== AUTHORIZATION =====
        if (managedPath.kind === 'temporary') {
            requireProviderRole(session)
            if (managedPath.namespace !== getSessionUploadNamespace(session)) {
                return NextResponse.json(
                    { error: 'Temporary file does not belong to the current session', code: 'FORBIDDEN_FILE_PATH' },
                    { status: 403 },
                )
            }
            if (managedPath.sourceUrl && !isTrustedBlobUrl(managedPath.sourceUrl)) {
                return NextResponse.json(
                    { error: 'Temporary blob origin is not trusted', code: 'FORBIDDEN_FILE_PATH' },
                    { status: 403 },
                )
            }
        } else {
            await requireLabOwner(session, managedPath.labId)
        }

        const timestamp = new Date().toISOString();
        
        filePath = managedPath.relativePath

        const isVercel = getIsVercel();
        const publicDir = path.join(process.cwd(), 'public'); 
        const fullFilePath = resolveManagedLocalPath(publicDir, filePath)

        let deleteSuccessful = false;
        let deletionMethod = '';

        // Attempt file deletion
        if (!isVercel) {
            try {
                await fs.unlink(fullFilePath); 
                deleteSuccessful = true;
                deletionMethod = 'local';
                console.log(`Successfully deleted file locally: ${fullFilePath}`);
            } catch (deleteError) {
                if (deleteError.code === 'ENOENT') {
                    deleteSuccessful = true; // File already doesn't exist
                    deletionMethod = 'local-not-found';
                    console.warn(`File not found, but deletion considered successful: ${fullFilePath}`);
                } else {
                    console.error('Error deleting file locally:', deleteError);
                    return publicErrorResponse({
                        status: 500,
                        code: 'LOCAL_DELETE_ERROR',
                        message: 'The file could not be deleted.',
                        error: deleteError,
                        context: 'provider-delete-file-local',
                    });
                }
            }
        } else {
            try {
                const blobPath = managedPath.sourceUrl
                    ? managedPath.sourceUrl.toString()
                    : managedPath.blobPath
                const result = await del(blobPath);
                deleteSuccessful = true;
                deletionMethod = result ? 'blob-deleted' : 'blob-not-found';
                console.log(`Blob deletion result for ${blobPath}: ${result ? 'deleted' : 'not found'}`);
            } catch (blobError) {
                console.error("Error deleting blob from Vercel:", blobError);
                return publicErrorResponse({
                    status: 500,
                    code: 'BLOB_DELETE_ERROR',
                    message: 'The file could not be deleted.',
                    error: blobError,
                    context: 'provider-delete-file-blob',
                });
            }
        }

        // Delete empty folders if lab is being deleted
        if (deleteSuccessful && deletingLab && managedPath.kind === 'permanent') {
            const pathSegments = filePath.split(path.sep); 

            if (pathSegments.length < 3) {
                console.warn(`File path ${filePath} does not have expected segments (ID/type/file). 
                    Length: ${pathSegments.length}. Skipping directory cleanup.`);
                return NextResponse.json({
                    message: 'File deleted, but directory cleanup skipped due to invalid path structure.'
                }, { status: 200 });
            }

            const labId = pathSegments[0];          // e.g. '57'
            const typeDirName = pathSegments[1];    // e.g. 'images' or 'docs'
            
            if (!labId || !typeDirName) {
                return NextResponse.json({ 
                    error: 'Failed to extract directory names from path.',
                    path: filePath 
                }, { status: 500 });
            }

            const fullTypeSubDir = path.join(publicDir, labId, typeDirName); 
            const fullLabIdDir = path.join(publicDir, labId);         

            console.log('Directory paths calculated:', { fullTypeSubDir, fullLabIdDir });

            if (!isVercel) {
                // FIRSTLY: Delete 'images'/'docs' folder if empty
                try {
                    const typeSubDirContents = await fs.readdir(fullTypeSubDir);
                    if (typeSubDirContents.length === 0) {
                        await fs.rmdir(fullTypeSubDir);
                        console.log(`Successfully deleted empty directory: ${fullTypeSubDir}`);
                    }
                } catch (dirError) {
                    if (dirError.code !== 'ENOENT' && dirError.code !== 'ENOTEMPTY') {
                        console.warn(`Could not delete directory ${fullTypeSubDir}:`, dirError.message);
                    }
                }

                // SECONDLY: Delete lab id folder if empty
                try {
                    const labIdDirContents = await fs.readdir(fullLabIdDir);
                    if (labIdDirContents.length === 0) {
                        await fs.rmdir(fullLabIdDir);
                        console.log(`Successfully deleted empty lab directory: ${fullLabIdDir}`);
                    }
                } catch (dirError) {
                    if (dirError.code !== 'ENOENT' && dirError.code !== 'ENOTEMPTY') {
                        console.warn(`Could not delete lab directory ${fullLabIdDir}:`, dirError.message);
                    }
                }
            }
        }

        return NextResponse.json({ message: 'File deleted successfully' }, { status: 200 });

    } catch (error) {
        // Handle authentication/authorization errors
        if (error instanceof HttpError) {
            return handleGuardError(error, req);
        }
        
        return publicErrorResponse({
            status: 500,
            code: 'FILE_DELETE_FAILED',
            message: 'The file could not be deleted.',
            error,
            context: 'provider-delete-file',
        });
    }
}
