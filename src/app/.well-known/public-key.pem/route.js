/**
 * Public Key Endpoint for JWT Verification
 *
 * This endpoint serves the marketplace's RSA public key in PEM format
 * to allow the auth-service to verify JWT signatures.
 *
 * Endpoint: GET /.well-known/public-key.pem
 * Content-Type: text/plain
 * Cache-Control: public, max-age=3600 (1 hour)
 */

import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    let publicKey;

    // Try environment variable first (for Vercel deployment)
    if (process.env.JWT_PUBLIC_KEY) {
      publicKey = process.env.JWT_PUBLIC_KEY;
    } else {
      // Fallback to file system (for local development)
      const publicKeyPath = path.join(process.cwd(), 'certificates', 'jwt', 'marketplace-public-key.pem');

      // Verify that the file exists
      if (!fs.existsSync(publicKeyPath)) {
        console.error('? Public key not found. Set JWT_PUBLIC_KEY environment variable or place file at:', publicKeyPath);
        return new Response('Public key not found', {
          status: 404,
          headers: {
            'Content-Type': 'text/plain'
          }
        });
      }

      // Read the public key
      publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    }

    // Validate basic PEM format
    if (!publicKey.includes('-----BEGIN PUBLIC KEY-----') ||
        !publicKey.includes('-----END PUBLIC KEY-----')) {
      console.error('? Invalid PEM format in public key file');
      return new Response('Invalid public key format', {
        status: 500,
        headers: {
          'Content-Type': 'text/plain'
        }
      });
    }

    // Return the public key with appropriate headers
    return new Response(publicKey, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=3600', // 1 hour cache
        'Access-Control-Allow-Origin': '*', // Allow access from auth-service
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (error) {
    console.error('? Error serving public key:', error);
    return new Response('Internal server error', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
}

