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
    const publicKeyPath = path.join(process.cwd(), 'public', '.well-known', 'public-key.pem');

    // Prefer the runtime env var so deployed key rotations keep signing and
    // published verification keys in sync. Fall back to the committed file for
    // local/static deployments.
    if (process.env.JWT_PUBLIC_KEY) {
      publicKey = process.env.JWT_PUBLIC_KEY;
    } else {
      try {
        publicKey = fs.readFileSync(publicKeyPath, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.error('Public key not found. Set JWT_PUBLIC_KEY environment variable or place file at:', publicKeyPath);
          return new Response('Public key not found', {
            status: 404,
            headers: {
              'Content-Type': 'text/plain',
            },
          });
        }
        throw err;
      }
    }

    // Validate basic PEM format
    if (!publicKey.includes('-----BEGIN PUBLIC KEY-----') ||
        !publicKey.includes('-----END PUBLIC KEY-----')) {
      console.error('Invalid PEM format in public key');
      return new Response('Invalid public key format', {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }

    // Return the public key with appropriate headers
    return new Response(publicKey, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error('Error serving public key:', error);
    return new Response('Internal server error', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }
}
