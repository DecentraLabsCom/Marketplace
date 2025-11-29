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
  requireLabOwner, 
  extractLabIdFromPath,
  handleGuardError,
  HttpError 
} from '@/utils/auth/guards'

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
        // Require valid session (works for both SSO and wallet users)
        const session = await requireAuth();
        
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

        // ===== AUTHORIZATION =====
        // Extract labId from the file path and verify ownership
        const labIdFromPath = extractLabIdFromPath(filePath);
        if (labIdFromPath) {
            await requireLabOwner(session, labIdFromPath);
        }
        // Note: temp files can be deleted by any authenticated user
        // (they're only accessible during the upload session anyway)

        const timestamp = new Date().toISOString();
        
        // Transform and normalize path
        filePath = path.normalize(filePath.trim()); 
    
        // Security: Remove initial separator if present (but not for absolute paths like /public)
        if (filePath.startsWith(path.sep) && filePath.length > path.sep.length && 
            !filePath.startsWith(path.sep + 'public')) {
            filePath = filePath.substring(path.sep.length);
        }

        const isVercel = getIsVercel();
        const publicDir = path.join(process.cwd(), 'public'); 
        const fullFilePath = path.join(publicDir, filePath); 

        // Security checks - ensure file is within public directory
        const publicDirResolved = path.resolve(publicDir); 
        const normalizedFullFilePath = path.resolve(fullFilePath);
        
        if (normalizedFullFilePath.includes('..') || !normalizedFullFilePath.startsWith(publicDirResolved)) {
            return NextResponse.json(
                { 
                    error: 'Invalid file path. Path must be within public directory and cannot contain ".."',
                    code: 'INVALID_PATH_SECURITY'
                }, 
                { status: 403 } // Forbidden
            );
        }

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
                    return NextResponse.json(
                        { 
                            error: 'Failed to delete file locally',
                            code: 'LOCAL_DELETE_ERROR',
                            details: process.env.NODE_ENV === 'development' ? deleteError.message : undefined,
                            filePath: filePath
                        },
                        { status: 500 }
                    );
                }
            }
        } else {
            try {
                const blobPath = `data/${filePath.replace(/\\/g, '/')}`; 
                const result = await del(blobPath);
                deleteSuccessful = true;
                deletionMethod = result ? 'blob-deleted' : 'blob-not-found';
                console.log(`Blob deletion result for ${blobPath}: ${result ? 'deleted' : 'not found'}`);
            } catch (blobError) {
                console.error("Error deleting blob from Vercel:", blobError);
                return NextResponse.json(
                    {
                        error: 'Failed to delete file from Vercel Blob',
                        code: 'BLOB_DELETE_ERROR',
                        details: process.env.NODE_ENV === 'development' ? blobError.message : undefined,
                        filePath: filePath
                    },
                    { status: 500 }
                );
            }
        }

        // Delete empty folders if lab is being deleted
        if (deleteSuccessful && deletingLab) {
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
            return handleGuardError(error);
        }
        
        console.error('--- Error general en deleteFile endpoint ---', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 },
        );
    }
}
