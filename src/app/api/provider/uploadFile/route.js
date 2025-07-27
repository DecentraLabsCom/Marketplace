import devLog from '@/utils/dev/logger';

import path from 'path';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import getIsVercel from '@/utils/isVercel';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const isVercel = getIsVercel();
    const destinationFolder = formData.get('destinationFolder');
    const labId = formData.get('labId');

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (!destinationFolder) {
      return NextResponse.json({ error: 'Destination folder is required' }, { status: 400 });
    }

    // --- Dynamic Content-Type Detection ---
    let detectedContentType = file.type;

    // Fallback: If file.type is not available or is generic, try to infer from the file extension
    // Handle cases where file.type might be empty or 'application/octet-stream'
    if (!detectedContentType || detectedContentType === 'application/octet-stream') {
        const ext = file.name.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'pdf': detectedContentType = 'application/pdf'; break;
            case 'jpg':
            case 'jpeg': detectedContentType = 'image/jpeg'; break;
            case 'png': detectedContentType = 'image/png'; break;
            case 'gif': detectedContentType = 'image/gif'; break;
            case 'webp': detectedContentType = 'image/webp'; break;
            case 'svg': detectedContentType = 'image/svg+xml'; break;
            // Add more common types as needed
            default: detectedContentType = 'application/octet-stream'; // Default to generic binary type
        }
    }

    const localFilePath = path.join(`./public/${labId}`, destinationFolder, file.name);
    const filePath = `/${labId}/${destinationFolder}/${file.name}`;

    const buffer = await file.arrayBuffer();
    if (!isVercel) {
      await fs.mkdir(path.dirname(localFilePath), { recursive: true });
      await fs.writeFile(localFilePath, Buffer.from(buffer));
    } else {
      await put(`data${filePath}`, Buffer.from(buffer), 
                { contentType: detectedContentType, allowOverwrite: true, access: 'public' });
    }

    return NextResponse.json({ filePath }, { status: 200 });
  } catch (error) {
    devLog.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: error.message },
      { status: 500 },
    );
  }
}
