import devLog from '@/utils/dev/logger';

import path from 'path';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import getIsVercel from '@/utils/isVercel';

export async function POST(req) {
    try {
        const formData = await req.formData();
        let filePath = formData.get('filePath'); 

        if (!filePath) {
            devLog.error('Error: File path is required.');
            return NextResponse.json({ error: 'File path is required' }, { status: 400 });
        }

        // Transform "57/images/..." to "57\images\..." if needed
        filePath = path.normalize(filePath); 
    
        // Make sure no initial / appears in filePath
        if (filePath.startsWith(path.sep) && filePath.length > 
        path.sep.length && !filePath.startsWith(path.sep + 'public')) {
            filePath = filePath.substring(path.sep.length);
        }

        const deletingLab = formData.get('deletingLab') === 'true';
        const isVercel = getIsVercel();
        
        const publicDir = path.join(process.cwd(), 'public'); 
        const fullFilePath = path.join(publicDir, filePath); 

        // Security checks
        const publicDirResolved = path.resolve(publicDir); 
        const normalizedFullFilePath = path.normalize(fullFilePath);
        
        if (normalizedFullFilePath.includes('..') || !normalizedFullFilePath.startsWith(publicDirResolved)) {
            return NextResponse.json({ error: 'Invalid file path. Must be within public directory.' }, 
                { status: 400 });
        }

        let deleteSuccessful = false;

        if (!isVercel) {
            try {
                await fs.unlink(fullFilePath); 
                deleteSuccessful = true;
                devLog.log(`Successfully deleted file locally: ${fullFilePath}`);
            } catch (deleteError) {
                if (deleteError.code === 'ENOENT') {
                    deleteSuccessful = true; 
                    devLog.warn(`File not found, but deletion considered successful: ${fullFilePath}`);
                } else {
                    devLog.error('Error deleting file locally:', deleteError);
                    return NextResponse.json(
                        { error: 'Failed to delete file locally', details: deleteError.message },
                        { status: 500 },
                    );
                }
            }
        } else {
            try {
                const blobPath = `data/${filePath.replace(/\\/g, '/')}`; 
                const result = await del(blobPath);
                if (result) {
                    devLog.log(`Blob deleted from Vercel: ${blobPath}`);
                    deleteSuccessful = true;
                } else {
                    devLog.warn(`Blob deletion from Vercel may have failed: ${blobPath}`);
                    deleteSuccessful = true;
                }
            } catch (error) {
                devLog.error("Error deleting blob from Vercel:", error);
                return NextResponse.json(
                    { error: 'Failed to delete file from Vercel Blob.', details: error.message },
                    { status: 500 }
                );
            }
        }

        // Delete empty folders if lab is being deleted
        if (deleteSuccessful && deletingLab) {
            const pathSegments = filePath.split(path.sep); 

            if (pathSegments.length < 3) {
                devLog.warn(`File path ${filePath} does not have expected segments (ID/type/file). 
                    Length: ${pathSegments.length}. Skipping directory cleanup.`);
                return NextResponse.json({
                    message: 'File deleted, but directory cleanup skipped due to invalid path structure.'
                }, { status: 200 });
            }

            const labId = pathSegments[0];          // e.g. '57'
            const typeDirName = pathSegments[1];    // e.g. 'images' or 'docs'
            
            if (labId === undefined || typeDirName === undefined) {
                 return NextResponse.json({ error: 'Failed to extract directory names from path.' }, 
                    { status: 500 });
            }

            const fullTypeSubDir = path.join(publicDir, labId, typeDirName); 
            const fullLabIdDir = path.join(publicDir, labId);         

            devLog.log('Directory paths calculated:', { fullTypeSubDir, fullLabIdDir });

            if (!isVercel) {
                // FIRSTLY: Delete 'images'/'docs' folder if empty
                try {
                    const typeSubDirContents = await fs.readdir(fullTypeSubDir);
                    if (typeSubDirContents.length === 0) {
                        await fs.rmdir(fullTypeSubDir);
                        devLog.log(`Successfully deleted empty directory: ${fullTypeSubDir}`);
                    }
                } catch (dirError) {
                    if (dirError.code !== 'ENOENT' && dirError.code !== 'ENOTEMPTY') {
                        devLog.warn(`Could not delete directory ${fullTypeSubDir}:`, dirError.message);
                    }
                }

                // SECONDLY: Delete lab id folder if empty
                try {
                    const labIdDirContents = await fs.readdir(fullLabIdDir);
                    if (labIdDirContents.length === 0) {
                        await fs.rmdir(fullLabIdDir);
                        devLog.log(`Successfully deleted empty lab directory: ${fullLabIdDir}`);
                    }
                } catch (dirError) {
                    if (dirError.code !== 'ENOENT' && dirError.code !== 'ENOTEMPTY') {
                        devLog.warn(`Could not delete lab directory ${fullLabIdDir}:`, dirError.message);
                    }
                }
            }
        }

        return NextResponse.json({ message: 'File deleted successfully' }, { status: 200 });

    } catch (error) {
        devLog.error('--- Error general en deleteFile endpoint ---', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 },
        );
    }
}
