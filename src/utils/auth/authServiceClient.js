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
    this.authServiceUrl = process.env.AUTH_SERVICE_URL || 'https://sarlab.dia.uned.es/auth';
    
    // Remove trailing slash if present
    this.authServiceUrl = this.authServiceUrl.replace(/\/$/, '');
    
    devLog.log('AuthServiceClient initialized with URL:', this.authServiceUrl);
  }

  /**
   * Request authentication token from auth-service (authentication only)
   * 
   * @param {string} marketplaceJwt - Signed JWT from marketplace
   * @param {string} labId - Lab identifier (optional for auth-only)
   * @returns {Promise<Object>} Auth service response
   */
  async requestAuthToken(marketplaceJwt, labId = null) {
    return this.makeAuthRequest('/marketplace-auth', marketplaceJwt, labId, false);
  }

  /**
   * Request authentication + authorization token from auth-service
   * 
   * @param {string} marketplaceJwt - Signed JWT from marketplace
   * @param {string} labId - Lab identifier (required for authorization)
   * @returns {Promise<Object>} Auth service response with lab access
   */
  async requestAuthWithAuthorization(marketplaceJwt, labId) {
    if (!labId) {
      throw new Error('Lab ID is required for authorization requests');
    }
    
    return this.makeAuthRequest('/marketplace-auth2', marketplaceJwt, labId, true);
  }

  /**
   * Make request to auth-service
   * 
   * @private
   * @param {string} endpoint - Auth service endpoint path
   * @param {string} marketplaceJwt - Signed JWT from marketplace
   * @param {string} labId - Lab identifier
   * @param {boolean} includeAuthorization - Whether this is an authorization request
   * @returns {Promise<Object>} Auth service response
   */
  async makeAuthRequest(endpoint, marketplaceJwt, labId, includeAuthorization) {
    try {
      const url = `${this.authServiceUrl}${endpoint}`;
      
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
   * @returns {Promise<boolean>} True if auth-service is reachable
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.authServiceUrl}/health`, {
        method: 'GET',
        timeout: 5000 // 5 second timeout
      });
      
      const isHealthy = response.ok;
      devLog.log(`Auth service health check: ${isHealthy ? '✅ OK' : '❌ FAILED'}`);
      
      return isHealthy;
      
    } catch (error) {
      devLog.warn('⚠️ Auth service health check failed:', error.message);
      return false;
    }
  }

  /**
   * Get the configured auth-service URL
   * 
   * @returns {string} Auth service base URL
   */
  getAuthServiceUrl() {
    return this.authServiceUrl;
  }
}

// Create singleton instance
const authServiceClient = new AuthServiceClient();

export default authServiceClient;