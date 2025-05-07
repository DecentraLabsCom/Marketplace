import fs from 'fs';
import path from 'path';
import { put } from '@vercel/blob';

export async function POST(request) {
  const body = await request.json();
  const provider = body;

  try {
    let providers = [];
    const isVercel = !!process.env.VERCEL;

    if (!isVercel) {
      // LOCAL: Use filesystem
      const DATA_FILE = path.resolve(process.cwd(), 'data', 'pendingProviders.json');
      if (fs.existsSync(DATA_FILE)) {
        const file = fs.readFileSync(DATA_FILE, 'utf-8');
        providers = JSON.parse(file);
      }
      providers.push({ ...provider, createdAt: new Date().toISOString() });
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(providers, null, 2));
    } else {
      // PRODUCTION: Use Vercel Blob API
      const blobName = 'pendingProviders.json';
      try {
        const blobUrl = `https://blob.vercel-storage.com/data/${blobName}`;
        const response = await fetch(blobUrl);
        if (response.ok) {
          providers = await response.json();
        }
      } catch (e) {
        // Blob may not exist yet
        providers = [];
      }
      providers.push({ ...provider, createdAt: new Date().toISOString() });
      await put(`data/${blobName}`, JSON.stringify(providers, null, 2), 
                { contentType: 'application/json', allowOverwrite: true });
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error saving provider:', error);
    return Response.json({ error: 'Failed to save provider' }, { status: 500 });
  }
}