import path from 'path';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const destinationFolder = formData.get('destinationFolder');

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (!destinationFolder) {
      return NextResponse.json({ error: 'Destination folder is required' }, { status: 400 });
    }

    const uniqueFilename = `${uuidv4()}-${file.name}`;
    const localFilePath = path.join('./public', destinationFolder, uniqueFilename); // Guarda en /public/images o /public/docs

    // Asegúrate de que el directorio exista
    await fs.mkdir(path.dirname(localFilePath), { recursive: true });
    const buffer = await file.arrayBuffer();
    await fs.writeFile(localFilePath, Buffer.from(buffer));

    const filePath = `/${destinationFolder}/${uniqueFilename}`; // La ruta para acceder al archivo desde el navegador

    return NextResponse.json({ filePath }, { status: 200 });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: error.message },
      { status: 500 },
    );
  }
}
