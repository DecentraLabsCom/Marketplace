import path from 'path';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';

export async function POST(req) {
  try {
    const { labURI } = await req.json();
    if (!labURI) {
      return NextResponse.json({ error: 'Missing labURI' }, { status: 400 });
    }
    const isVercel = !!process.env.VERCEL;
    const filePath = path.join(process.cwd(), 'data', labURI);

    if (!isVercel) {
        try {
        await fs.unlink(filePath);
        return NextResponse.json({ message: 'Lab data deleted successfully.' }, { status: 200 });
        } catch (error) {
        return NextResponse.json(
            { error: 'Failed to delete lab data.', details: error.message },
            { status: 500 }
        );
        }
    } else {
        try {
            const blobUrl = `${process.env.VERCEL_BLOB_BASE_URL}/data/${labURI}`;
            const result = await del(blobUrl);
            if (result) {
            console.log(`Blob deleted from Vercel: ${blobUrl}`);
            return NextResponse.json({ message: 'Lab data deleted successfully.' }, { status: 200 }); //success
            } else {
            console.warn(`Blob deletion from Vercel may have failed: ${blobUrl}`); // No falla si no existe.
            return NextResponse.json({ message: 'Lab data deleted successfully.' }, { status: 200 }); //success
            }
        } catch (error) {
            console.error("Error deleting data:", error);
            return NextResponse.json(
                { error: 'Failed to delete lab data.', details: error.message },
                { status: 500 }
            );
        }
    }

  } catch (error) {
    return NextResponse.json({ error: 'Failed to parse request body.', details: error.message }, { status: 400 });
  }
}