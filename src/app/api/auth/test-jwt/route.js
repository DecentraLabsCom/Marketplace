/**
 * JWT Test Endpoint
 *
 * Test endpoint to check that the JWT system is working correctly.
 *
 * POST /api/auth/test-jwt
 * Body: { "testUser": { "username": "test@example.com", "email": "test@example.com" } }
 */

import marketplaceJwtService from '@/utils/auth/marketplaceJwt';
import { timingSafeEqual } from 'crypto';

const isTestJwtEndpointEnabled = () =>
  process.env.NODE_ENV !== 'production' ||
  String(process.env.ENABLE_TEST_JWT_ENDPOINT || '').toLowerCase() === 'true';

const isAuthorizedTestJwtRequest = (request) => {
  const configuredKey = process.env.TEST_JWT_API_KEY || '';
  if (!configuredKey) return true;

  const providedKey =
    request.headers.get('x-test-jwt-key') ||
    request.headers.get('x-api-key') ||
    '';

  const configuredBuffer = Buffer.from(configuredKey);
  const providedBuffer = Buffer.from(providedKey);
  if (configuredBuffer.length !== providedBuffer.length) {
    return false;
  }
  return timingSafeEqual(configuredBuffer, providedBuffer);
};

const getBlockedResponse = () =>
  Response.json(
    { success: false, error: 'Not found' },
    { status: 404 }
  );

const getUnauthorizedResponse = () =>
  Response.json(
    { success: false, error: 'Unauthorized' },
    { status: 401 }
  );

export async function POST(request) {
  if (!isTestJwtEndpointEnabled()) {
    return getBlockedResponse();
  }

  if (!isAuthorizedTestJwtRequest(request)) {
    return getUnauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { testUser } = body;

    if (!testUser || !testUser.username) {
      return Response.json({
        success: false,
        error: 'testUser with username is required'
      }, { status: 400 });
    }

    // Verify configuration
    if (!(await marketplaceJwtService.isConfigured())) {
      return Response.json({
        success: false,
        error: 'JWT service is not properly configured. Check private key path.'
      }, { status: 500 });
    }

    // Generate test JWT
    const mockSamlAttributes = {
      username: testUser.username,
      email: testUser.email || testUser.username,
      uid: testUser.uid || testUser.username,
      displayName: testUser.displayName || testUser.username,
      schacHomeOrganization: testUser.organization || 'test-org.edu',
      eduPersonScopedAffiliation: testUser.scopedAffiliation || 'member@test-org.edu'
    };

    const jwt = await marketplaceJwtService.generateJwtForUser(mockSamlAttributes);

    // Decode JWT to show information
    const decodedJwt = marketplaceJwtService.decodeToken(jwt);

    const response = {
      success: true,
      data: {
        jwt_generated: true,
        jwt_length: jwt.length,
        jwt_preview: `${jwt.substring(0, 50)}...`,
        decoded_header: decodedJwt.header,
        decoded_payload: {
          ...decodedJwt.payload,
          // Obfuscate sensitive information in response
          email: decodedJwt.payload.email ? '***@***.***' : ''
        },
        expires_at: new Date(decodedJwt.payload.exp * 1000).toISOString()
      }
    };

    return Response.json(response);

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      details: 'Check server logs for more information'
    }, { status: 500 });
  }
}

export async function GET(request) {
  if (!isTestJwtEndpointEnabled()) {
    return getBlockedResponse();
  }

  if (!isAuthorizedTestJwtRequest(request)) {
    return getUnauthorizedResponse();
  }

  return Response.json({
    message: 'JWT Test Endpoint',
    usage: 'POST with { "testUser": { "username": "test@example.com" } }',
    endpoints: {
      public_key: '/.well-known/public-key.pem',
      jwt_test: '/api/auth/test-jwt'
    },
    status: {
      jwt_service_configured: await marketplaceJwtService.isConfigured(),
      auth_service_mode: 'institutional gateway tokens are issued by dedicated lab-access routes'
    }
  });
}
