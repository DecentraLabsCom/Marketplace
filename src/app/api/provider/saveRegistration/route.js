/**
 * API endpoint for saving provider registration data
 * Handles POST requests to store pending provider registration information
 */
import fs from 'fs'
import path from 'path'
import { put } from '@vercel/blob'
import devLog from '@/utils/dev/logger'
import getIsVercel from '@/utils/isVercel'

/**
 * Saves provider registration to pending providers storage
 * @param {Request} request - HTTP request with provider registration data
 * @param {Object} request.body - Provider registration data
 * @param {string} request.body.name - Provider name
 * @param {string} request.body.email - Provider email
 * @param {string} request.body.organization - Provider organization
 * @param {string} [request.body.registrationType] - Type of registration (defaults to 'manual')
 * @returns {Response} JSON response with success status or error
 */
export async function POST(request) {
  const body = await request.json();
  const provider = body;

  try {
    let providers = [];
    const isVercel = getIsVercel();

    // Add metadata for tracking
    const providerWithMetadata = {
      ...provider,
      createdAt: new Date().toISOString(),
      status: 'pending',
      registrationType: provider.registrationType || 'manual'
    };

    if (!isVercel) {
      // LOCAL: Use filesystem
      const DATA_FILE = path.resolve(process.cwd(), 'data', 'pendingProviders.json');
      if (fs.existsSync(DATA_FILE)) {
        const file = fs.readFileSync(DATA_FILE, 'utf-8');
        providers = JSON.parse(file);
      }
      providers.push(providerWithMetadata);
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(providers, null, 2));
    } else {
      // PRODUCTION: Use Vercel Blob API
      const blobName = 'pendingProviders.json';
      try {
        const blobUrl = path.join(process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL, 'data', blobName);
        const response = await fetch(blobUrl);
        if (response.ok) {
          try {
            providers = await response.json();
          } catch {
            providers = [];
          }
        } else {
          providers = [];
        }
      } catch (e) {
        console.warn(`Failed to fetch existing providers blob:`, e.message);
        // Blob may not exist yet
        providers = [];
      }
      providers.push(providerWithMetadata);
      await put(`data/${blobName}`, JSON.stringify(providers, null, 2), 
                { contentType: 'application/json', allowOverwrite: true, access: 'public' });
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error saving provider:', error);
    return Response.json({ error: 'Failed to save provider' }, { status: 500 });
  }
}
