import path from 'path';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const filePath = formData.get('filePath');
    const labId = formData.get('labId');
    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }
    const isVercel = !!process.env.VERCEL;
    const fullFilePath = path.join(process.cwd(), `public/${labId}`, filePath);

    if (!fullFilePath.startsWith(path.resolve('./public'))) {
        return NextResponse.json({ error: 'Invalid file path.  Must be within public directory:', fullFilePath }, { status: 400 });
    }

    if (!isVercel) {
        try {
            await fs.unlink(fullFilePath);
        } catch (deleteError) {
            if (deleteError.code === 'ENOENT') {
                return NextResponse.json({ message: 'File not found, but deletion was considered successful.', fullFilePath }, { status: 200 });
            } else {
                console.error('Error deleting file:', deleteError);
                return NextResponse.json(
                { error: 'Failed to delete file', details: deleteError.message },
                { status: 500 },
                );
            }
        }
        return NextResponse.json({ message: 'File deleted successfully' }, { status: 200 });
    } else {
        try {
            const blobPath = `public/${labId}${filePath}`;
            const result = await del(blobPath);
            if (result) {
                console.log(`Blob deleted from Vercel: ${blobPath}`);
                return NextResponse.json({ message: 'File deleted successfully.' }, 
                    { status: 200 });
            } else {
                console.warn(`Blob deletion from Vercel may have failed: ${blobPath}`);
                return NextResponse.json({ message: 'File deleted successfully.' }, 
                    { status: 200 });
            }
        } catch (error) {
            console.error("Error deleting data:", error);
            return NextResponse.json(
                { error: 'Failed to delete file.', details: error.message },
                { status: 500 }
            );
        }
    }
    
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}