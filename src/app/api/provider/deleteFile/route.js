import path from 'path';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { filePath } = await req.json();

    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    const fullFilePath = path.join(process.cwd(), 'public', filePath);

    if (!fullFilePath.startsWith(path.resolve('./public'))) {
        return NextResponse.json({ error: 'Invalid file path.  Must be within public directory:', fullFilePath }, { status: 400 });
    }

    try {
      await fs.unlink(fullFilePath);
    } catch (deleteError) {
      if (deleteError.code === 'ENOENT') {
        return NextResponse.json({ message: 'File not found, but deletion was considered successful.' }, { status: 200 });
      } else {
        console.error('Error deleting file:', deleteError);
        return NextResponse.json(
          { error: 'Failed to delete file', details: deleteError.message },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ message: 'File deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}