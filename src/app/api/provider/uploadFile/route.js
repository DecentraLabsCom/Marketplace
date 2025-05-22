import path from 'path';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const isVercel = !!process.env.VERCEL;
    const destinationFolder = formData.get('destinationFolder');
    const labId = formData.get('labId');

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (!destinationFolder) {
      return NextResponse.json({ error: 'Destination folder is required' }, { status: 400 });
    }

    const localFilePath = path.join(`./public/${labId}`, destinationFolder, file.name);
    const filePath = `/public/${labId}/${destinationFolder}/${file.name}`;

    const buffer = await file.arrayBuffer();
    if (!isVercel) {
      await fs.mkdir(path.dirname(localFilePath), { recursive: true });
      await fs.writeFile(localFilePath, Buffer.from(buffer));
    } else {
      await put(`${filePath}`, Buffer.from(buffer), 
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
