/**
 * JWT Test Endpoint
 *
 * Test endpoint to check that the JWT system is working correctly.
 *
 * POST /api/auth/test-jwt
 * Body: { "testUser": { "username": "test@example.com", "email": "test@example.com" } }
 */

import marketplaceJwtService from '@/utils/auth/marketplaceJwt';
import authServiceClient from '@/utils/auth/authServiceClient';

export async function POST(request) {
  try {
    const body = await request.json();
    const { testUser, labId } = body;

    if (!testUser || !testUser.username) {
      return Response.json({
        success: false,
        error: 'testUser with username is required'
      }, { status: 400 });
    }

    // Verify configuration
    if (!marketplaceJwtService.isConfigured()) {
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
      eduPersonAffiliation: testUser.affiliation || 'member',
      eduPersonScopedAffiliation: testUser.scopedAffiliation || 'member@test-org.edu'
    };

    const jwt = marketplaceJwtService.generateJwtForUser(mockSamlAttributes);

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

    // If labId is provided, also test communication with auth-service
    if (labId) {
      try {
        // First, get lab data from contract to obtain Lab Gateway URL
        const labResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/contract/lab/getLab?labId=${labId}`);
        
        if (!labResponse.ok) {
          response.data.auth_service_error = `Failed to fetch lab ${labId} from contract`;
        } else {
          const labContractData = await labResponse.json();
          response.data.lab_gateway_url = labContractData.base?.accessURI || 'not configured';
          response.data.auth_service_url = labContractData.base?.auth || 'not configured';
          
          // Test auth-service connectivity using contract data
          const healthCheck = await authServiceClient.healthCheck(labContractData);
          response.data.auth_service_health = healthCheck;

          if (healthCheck) {
            // Attempt to make test request (may fail due to test JWT)
            try {
              const authResponse = await authServiceClient.requestAuthToken(jwt, labContractData, labId);
              response.data.auth_service_response = 'success';
              response.data.auth_service_data = authResponse;
            } catch (authError) {
              response.data.auth_service_response = 'error';
              response.data.auth_service_error = authError.message;
            }
          }
        }
      } catch (serviceError) {
        response.data.auth_service_error = serviceError.message;
      }
    }

    return Response.json(response);

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      details: 'Check server logs for more information'
    }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({
    message: 'JWT Test Endpoint',
    usage: 'POST with { "testUser": { "username": "test@example.com" }, "labId": "optional-lab-id" }',
    endpoints: {
      public_key: '/.well-known/public-key.pem',
      jwt_test: '/api/auth/test-jwt'
    },
    status: {
      jwt_service_configured: marketplaceJwtService.isConfigured(),
      auth_service_mode: 'dynamic (per-lab from smart contract)',
      note: 'Auth-service URL is now obtained dynamically from each lab\'s contract data (base.accessURI)'
    }
  });
}