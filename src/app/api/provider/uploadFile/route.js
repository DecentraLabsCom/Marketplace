import path from 'path';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { put } from '@vercel/blob';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const isVercel = !!process.env.VERCEL;
    const destinationFolder = formData.get('destinationFolder');

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (!destinationFolder) {
      return NextResponse.json({ error: 'Destination folder is required' }, { status: 400 });
    }

    const uniqueFilename = `${uuidv4()}-${file.name}`;
    const localFilePath = path.join('./public', destinationFolder, uniqueFilename);
    const filePath = `/${destinationFolder}/${uniqueFilename}`;
    const blobName = filePath;

    if (!isVercel) {
      await fs.mkdir(path.dirname(localFilePath), { recursive: true });
      const buffer = await file.arrayBuffer();
      await fs.writeFile(localFilePath, Buffer.from(buffer));
    } else {
      await put(`public/${blobName}`, Buffer.from(buffer), 
                { contentType: 'application/json', allowOverwrite: true, access: 'public' });
    }

    return NextResponse.json({ filePath }, { status: 200 });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: error.message },
      { status: 500 },
    );
  }
}
