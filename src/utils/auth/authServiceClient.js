/**
 * Auth Service Client
 * 
 * Handles communication with the auth-service using signed JWTs.
 * Provides methods for authentication and authorization requests.
 * 
 * Endpoints:
 * - /auth/marketplace-auth: Authentication only
 * - /auth/marketplace-auth2: Authentication + Authorization
 */

import devLog from '@/utils/dev/logger';

class AuthServiceClient {
  constructor() {
    // No longer store a fixed URL - it will be dynamic per lab
    devLog.log('AuthServiceClient initialized for dynamic auth-service URLs');
  }

  /**
   * Extract auth-service URL from lab contract data
   * @param {Object} labContractData - Lab data from smart contract or enriched payload (must include authURI)
   * @returns {string|null} Auth service URL or null if not found
   */
  getAuthServiceUrlFromLab(labContractData) {
    try {
      // Prefer provider-level authURI (lab -> provider) when available.
      const authURI =
        labContractData?.authURI ||
        labContractData?.base?.authURI ||
        labContractData?.provider?.authURI ||
        labContractData?.base?.auth ||
        labContractData?.auth;

      if (!authURI) {
        devLog.warn('Lab contract data has no authURI (auth-service URL)');
        return null;
      }

      let authServiceUrl = authURI;
      
      // Validate URL format
      if (!authServiceUrl.startsWith('http://') && !authServiceUrl.startsWith('https://')) {
        devLog.warn('Invalid Lab Gateway\'s auth-service URL format:', authServiceUrl);
        return null;
      }
      
      // Remove trailing slash if present
      authServiceUrl = authServiceUrl.replace(/\/$/, '');
      
      // The auth-service is typically at /auth endpoint of the Lab Gateway
      if (!authServiceUrl.endsWith('/auth')) {
        authServiceUrl += '/auth';
      }
      
      devLog.log('🌐 Found Lab Gateway auth-service URL:', authServiceUrl);
      return authServiceUrl;
      
    } catch (error) {
      devLog.error('Error extracting auth-service URL from lab contract data:', error.message);
      return null;
    }
  }

  /**
   * Request authentication token from auth-service (authentication only)
   * 
   * @param {string} marketplaceJwt - Signed JWT from marketplace
   * @param {Object} labContractData - Lab data from smart contract (from /api/contract/lab/getLab)
   * @param {string} labId - Lab identifier (optional for auth-only)
   * @returns {Promise<Object>} Auth service response
   */
  async requestAuthToken(marketplaceJwt, labContractData, labId = null) {
    const authServiceUrl = this.getAuthServiceUrlFromLab(labContractData);
    if (!authServiceUrl) {
      throw new Error('Lab does not have a configured auth-service URL in contract data');
    }
    
    return this.makeAuthRequest(authServiceUrl, '/marketplace-auth', marketplaceJwt, labId, false);
  }

  /**
   * Request authentication + authorization token from auth-service
   * 
   * @param {string} marketplaceJwt - Signed JWT from marketplace
   * @param {Object} labContractData - Lab data from smart contract (from /api/contract/lab/getLab)
   * @param {string} labId - Lab identifier (required for authorization)
   * @returns {Promise<Object>} Auth service response with lab access
   */
  async requestAuthWithAuthorization(marketplaceJwt, labContractData, labId) {
    if (!labId) {
      throw new Error('Lab ID is required for authorization requests');
    }
    
    const authServiceUrl = this.getAuthServiceUrlFromLab(labContractData);
    if (!authServiceUrl) {
      throw new Error('Lab does not have a configured auth-service URL in contract data');
    }
    
    return this.makeAuthRequest(authServiceUrl, '/marketplace-auth2', marketplaceJwt, labId, true);
  }

  /**
   * Make request to auth-service
   * 
   * @private
   * @param {string} authServiceUrl - Base URL of the auth-service
   * @param {string} endpoint - Auth service endpoint path
   * @param {string} marketplaceJwt - Signed JWT from marketplace
   * @param {string} labId - Lab identifier
   * @param {boolean} includeAuthorization - Whether this is an authorization request
   * @returns {Promise<Object>} Auth service response
   */
  async makeAuthRequest(authServiceUrl, endpoint, marketplaceJwt, labId, includeAuthorization) {
    try {
      const url = `${authServiceUrl}${endpoint}`;
      
      // Prepare request payload
      const requestBody = {
        marketplaceToken: marketplaceJwt,
        timestamp: Math.floor(Date.now() / 1000)
      };

      // Add lab ID if provided
      if (labId) {
        requestBody.labId = labId;
      }

      devLog.log(`🚀 Making ${includeAuthorization ? 'auth+authorization' : 'auth-only'} request to:`, url);
      devLog.log('Request payload (sanitized):', {
        marketplaceToken: marketplaceJwt ? `${marketplaceJwt.substring(0, 20)}...` : 'null',
        labId,
        timestamp: new Date(requestBody.timestamp * 1000).toISOString()
      });

      // Make HTTP request
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      // Handle response
      const responseText = await response.text();
      
      if (!response.ok) {
        devLog.error(`❌ Auth service request failed (${response.status}):`, responseText);
        throw new Error(`Auth service request failed: ${response.status} - ${responseText}`);
      }

      // Try to parse as JSON
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        // If not JSON, return as text (might be a simple token)
        responseData = { token: responseText.trim() };
      }

      devLog.success('✅ Auth service request successful');
      devLog.log('Response:', responseData);

      return responseData;

    } catch (error) {
      devLog.error('❌ Auth service client error:', error.message);
      
      // Re-throw with more context
      throw new Error(`Failed to communicate with auth-service: ${error.message}`);
    }
  }

  /**
   * Health check for auth-service connectivity
   * 
   * @param {Object} labContractData - Lab data from smart contract (from /api/contract/lab/getLab)
   * @returns {Promise<boolean>} True if auth-service is reachable
   */
  async healthCheck(labContractData) {
    try {
      const authServiceUrl = this.getAuthServiceUrlFromLab(labContractData);
      if (!authServiceUrl) {
        devLog.warn('⚠️ Cannot perform health check: no Lab Gateway auth-service URL in contract data');
        return false;
      }

      const response = await fetch(`${authServiceUrl}/health`, {
        method: 'GET',
        timeout: 5000 // 5 second timeout
      });
      
      const isHealthy = response.ok;
      devLog.log(`Lab Gateway auth-service health check for ${authServiceUrl}: ${isHealthy ? '✅ OK' : '❌ FAILED'}`);
      
      return isHealthy;
      
    } catch (error) {
      devLog.warn('⚠️ Lab Gateway auth-service health check failed:', error.message);
      return false;
    }
  }
}

// Create singleton instance
const authServiceClient = new AuthServiceClient();

export default authServiceClient;
