import path from 'path';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { labURI } = await req.json();
    if (!labURI) {
      return NextResponse.json({ error: 'Missing labURI' }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), 'data', labURI);

    try {
      await fs.unlink(filePath);
      console.log(`Deleted file: ${filePath}`);
      return NextResponse.json({ message: 'Lab data deleted successfully.' }, { status: 200 });
    } catch (error) {
      console.error("Error deleting file:", error);
      return NextResponse.json(
        { error: 'Failed to delete lab data.', details: error.message },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json({ error: 'Failed to parse request body.', details: error.message }, { status: 400 });
  }
}