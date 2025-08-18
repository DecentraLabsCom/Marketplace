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
  try {
    const body = await request.json();

    // Validate required fields
    if (!body) {
      return Response.json(
        { 
          error: 'Missing request body',
          code: 'MISSING_BODY'
        }, 
        { status: 400 }
      );
    }

    const { name, email, organization, registrationType, ...otherFields } = body;

    // Validate required fields
    if (!name || !email) {
      return Response.json(
        { 
          error: 'Missing required fields: name and email are required',
          code: 'MISSING_REQUIRED_FIELDS',
          required: ['name', 'email']
        }, 
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Response.json(
        { 
          error: 'Invalid email format',
          code: 'INVALID_EMAIL'
        }, 
        { status: 400 }
      );
    }

    // Validate name length
    if (name.trim().length < 2) {
      return Response.json(
        { 
          error: 'Provider name must be at least 2 characters long',
          code: 'INVALID_NAME_LENGTH'
        }, 
        { status: 400 }
      );
    }

    const timestamp = new Date().toISOString();
    let providers = [];
    const isVercel = getIsVercel();

    // Prepare provider data with metadata
    const providerWithMetadata = {
      ...body,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      organization: organization?.trim() || null,
      createdAt: timestamp,
      status: 'pending',
      registrationType: registrationType || 'manual'
    };

    // Load existing providers
    if (!isVercel) {
      // LOCAL: Use filesystem
      const DATA_FILE = path.resolve(process.cwd(), 'data', 'pendingProviders.json');
      try {
        if (fs.existsSync(DATA_FILE)) {
          const file = fs.readFileSync(DATA_FILE, 'utf-8');
          providers = JSON.parse(file);
        }
      } catch (parseError) {
        console.error('Error parsing existing providers file:', parseError);
        return Response.json(
          { 
            error: 'Failed to read existing provider data',
            code: 'READ_ERROR'
          }, 
          { status: 500 }
        );
      }
    } else {
      // PRODUCTION: Use Vercel Blob API
      const blobName = 'pendingProviders.json';
      try {
        const blobUrl = path.join(process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL, 'data', blobName);
        const response = await fetch(blobUrl);
        if (response.ok) {
          try {
            providers = await response.json();
          } catch (parseError) {
            console.warn('Failed to parse existing providers blob, starting with empty array');
            providers = [];
          }
        }
      } catch (error) {
        console.warn('Failed to fetch existing providers blob:', error.message);
        // Continue with empty array
      }
    }

    // Check for duplicate email
    const existingProvider = providers.find(p => 
      p.email && p.email.toLowerCase() === providerWithMetadata.email.toLowerCase()
    );
    
    if (existingProvider) {
      return Response.json(
        { 
          error: 'Provider with this email already exists',
          code: 'DUPLICATE_EMAIL',
          existingProvider: {
            name: existingProvider.name,
            email: existingProvider.email,
            status: existingProvider.status,
            createdAt: existingProvider.createdAt
          }
        }, 
        { status: 409 } // Conflict
      );
    }

    // Add new provider
    providers.push(providerWithMetadata);

    // Save updated providers list
    try {
      if (!isVercel) {
        const DATA_FILE = path.resolve(process.cwd(), 'data', 'pendingProviders.json');
        fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(providers, null, 2));
      } else {
        const blobName = 'pendingProviders.json';
        await put(`data/${blobName}`, JSON.stringify(providers, null, 2), 
                  { contentType: 'application/json', allowOverwrite: true, access: 'public' });
      }
    } catch (writeError) {
      console.error('Error saving provider registration:', writeError);
      return Response.json(
        { 
          error: 'Failed to save provider registration',
          code: 'WRITE_ERROR'
        }, 
        { status: 500 }
      );
    }

    return Response.json(
      { 
        message: 'Provider registration saved successfully',
        provider: {
          name: providerWithMetadata.name,
          email: providerWithMetadata.email,
          status: providerWithMetadata.status,
          registrationType: providerWithMetadata.registrationType
        },
        timestamp: timestamp
      }, 
      { status: 201 } // Created
    );

  } catch (error) {
    console.error('Error in saveRegistration endpoint:', error);
    
    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      return Response.json(
        { 
          error: 'Invalid JSON in request body',
          code: 'INVALID_JSON'
        }, 
        { status: 400 }
      );
    }
    
    return Response.json(
      { 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }, 
      { status: 500 }
    );
  }
}
