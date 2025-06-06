import path from 'path';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';

export async function POST(req) {
    try {
        const formData = await req.formData();
        let filePath = formData.get('filePath'); 

        if (!filePath) {
            console.error('Error: File path is required.');
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
        const isVercel = !!process.env.VERCEL;
        
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
                console.log(`Successfully deleted file locally: ${fullFilePath}`);
            } catch (deleteError) {
                if (deleteError.code === 'ENOENT') {
                    deleteSuccessful = true; 
                    console.warn(`File not found, but deletion considered successful: ${fullFilePath}`);
                } else {
                    console.error('Error deleting file locally:', deleteError);
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
                    console.log(`Blob deleted from Vercel: ${blobPath}`);
                    deleteSuccessful = true;
                } else {
                    console.warn(`Blob deletion from Vercel may have failed: ${blobPath}`);
                    deleteSuccessful = true;
                }
            } catch (error) {
                console.error("Error deleting blob from Vercel:", error);
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
                console.warn(`File path ${filePath} does not have expected segments (ID/type/file). 
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

            console.log('Calculated fullTypeSubDir (e.g., .../public/57/images):', fullTypeSubDir);
            console.log('Calculated fullLabIdDir (e.g., .../public/57):', fullLabIdDir);

            if (!isVercel) {
                // FIRSTLY: Delete 'images'/'docs' folder if empty
                try {
                    const typeSubDirContents = await fs.readdir(fullTypeSubDir);
                    console.log(`Contents of ${fullTypeSubDir}:`, typeSubDirContents);
                    if (typeSubDirContents.length === 0) {
                        await fs.rmdir(fullTypeSubDir);
                        console.log(`Successfully deleted empty directory: ${fullTypeSubDir}`);
                    } else {
                        console.log(`Directory ${fullTypeSubDir} is NOT empty.`);
                    }
                } catch (dirError) {
                    if (dirError.code === 'ENOENT') {
                        console.log(`Directory ${fullTypeSubDir} did not exist, skipping deletion.`);
                    } else if (dirError.code === 'ENOTEMPTY') {
                        console.log(`Directory ${fullTypeSubDir} is not empty, skipping deletion.`);
                    } else {
                        console.warn(`Could not delete directory ${fullTypeSubDir}:`, dirError.message);
                    }
                }

                // SECONDLY: Delete lab id folder if empty
                try {
                    const labIdDirContents = await fs.readdir(fullLabIdDir);
                    console.log(`Contents of ${fullLabIdDir}:`, labIdDirContents);
                    if (labIdDirContents.length === 0) {
                        await fs.rmdir(fullLabIdDir);
                        console.log(`Successfully deleted empty directory: ${fullLabIdDir}`);
                    } else {
                        console.log(`Directory ${fullLabIdDir} is NOT empty.`);
                    }
                } catch (dirError) {
                    if (dirError.code === 'ENOENT') {
                        console.log(`Directory ${fullLabIdDir} did not exist, skipping deletion.`);
                    } else if (dirError.code === 'ENOTEMPTY') {
                        console.log(`Directory ${fullLabIdDir} is not empty, skipping deletion.`);
                    } else {
                        console.warn(`Could not delete directory ${fullLabIdDir}:`, dirError.message);
                    }
                }
            }
        }

        return NextResponse.json({ message: 'File deleted successfully' }, { status: 200 });

    } catch (error) {
        console.error('--- Error general en deleteFile endpoint ---', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 },
        );
    }
}