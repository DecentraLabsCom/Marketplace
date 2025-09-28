/**
 * Marketplace JWT Service
 * 
 * Handles JWT generation for secure communication with auth-service.
 * Uses RSA private key to sign JWTs containing user information from SAML2 sessions.
 * 
 * Security Features:
 * - RSA-256 signatures for cryptographic authentication
 * - 5-minute token expiration to prevent replay attacks
 * - Proper claim mapping from SAML2 attributes
 */

import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import devLog from '@/utils/dev/logger';

class MarketplaceJwtService {
  constructor() {
    this.privateKey = null;
    this.keyLoadAttempted = false;
    // Don't load the key in constructor - wait until it's actually needed
  }

  /**
   * Load and cache the RSA private key for JWT signing
   * @private
   */
  loadPrivateKey() {
    // Avoid multiple load attempts
    if (this.keyLoadAttempted) {
      return;
    }
    
    this.keyLoadAttempted = true;

    try {
      // Try environment variable first (for Vercel deployment)
      if (process.env.JWT_PRIVATE_KEY) {
        this.privateKey = process.env.JWT_PRIVATE_KEY;
        devLog.success('JWT private key loaded from environment variable');
        return;
      }

      // Fallback to file system (for local development)
      const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH || 
        path.join(process.cwd(), 'certificates', 'jwt', 'marketplace-private-key.pem');
      
      if (!fs.existsSync(privateKeyPath)) {
        throw new Error(`Private key not found. Set JWT_PRIVATE_KEY environment variable or place file at: ${privateKeyPath}`);
      }

      this.privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      
      // Validate PEM format
      if (!this.privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        throw new Error('Invalid private key format. Expected PEM format.');
      }

      devLog.success('JWT private key loaded from file system');
      
    } catch (error) {
      devLog.error('❌ Failed to load JWT private key:', error.message);
      // Don't throw error here - let it be handled when actually needed
      this.privateKey = null;
    }
  }

  /**
   * Generate a signed JWT token for user authentication with auth-service
   * 
   * @param {Object} samlAttributes - User attributes from SAML2 session
   * @param {string} samlAttributes.username - User's username/identifier
   * @param {string} samlAttributes.email - User's email address
   * @param {string} samlAttributes.uid - User's unique identifier
   * @param {string} samlAttributes.displayName - User's display name
   * @param {string} samlAttributes.schacHomeOrganization - User's home organization
   * @param {string} samlAttributes.eduPersonAffiliation - User's institutional affiliation
   * @param {string} samlAttributes.eduPersonScopedAffiliation - User's scoped affiliation
   * @returns {string} Signed JWT token
   * @throws {Error} If JWT generation fails
   */
  generateJwtForUser(samlAttributes) {
    try {
      // Load private key if not already loaded
      if (!this.privateKey) {
        this.loadPrivateKey();
      }

      // Check if key is available after loading attempt
      if (!this.privateKey) {
        throw new Error('JWT private key is not available. Check JWT_PRIVATE_KEY environment variable or key file.');
      }

      // Validate required attributes
      if (!samlAttributes || !samlAttributes.username) {
        throw new Error('Username is required for JWT generation');
      }

      // Create JWT payload with user information
      const payload = {
        sub: samlAttributes.username,                                    // Subject (username)
        email: samlAttributes.email || '',                              // User email
        uid: samlAttributes.uid || samlAttributes.username,             // User ID
        displayName: samlAttributes.displayName || samlAttributes.username, // Display name
        schacHomeOrganization: samlAttributes.schacHomeOrganization || '', // Home organization
        eduPersonAffiliation: samlAttributes.eduPersonAffiliation || '', // Institutional role
        eduPersonScopedAffiliation: samlAttributes.eduPersonScopedAffiliation || '', // Scoped role
        iss: process.env.JWT_ISSUER || 'marketplace',                   // Issuer
        iat: Math.floor(Date.now() / 1000),                            // Issued at
        exp: Math.floor(Date.now() / 1000) + parseInt(process.env.JWT_EXPIRATION_MS || '300000') / 1000 // Expires in
      };

      // Generate signed JWT
      const token = jwt.sign(payload, this.privateKey, {
        algorithm: 'RS256',
        issuer: payload.iss
      });

      devLog.success('JWT generated successfully for user:', samlAttributes.username);
      devLog.log('JWT payload (sanitized):', {
        sub: payload.sub,
        email: payload.email ? '***@***.***' : '',
        displayName: payload.displayName,
        organization: payload.schacHomeOrganization,
        exp: new Date(payload.exp * 1000).toISOString()
      });

      return token;

    } catch (error) {
      devLog.error('❌ Failed to generate JWT:', error.message);
      throw new Error(`JWT generation failed: ${error.message}`);
    }
  }

  /**
   * Validate JWT token structure (for testing purposes)
   * Note: This doesn't verify signature, only decodes the token
   * 
   * @param {string} token - JWT token to validate
   * @returns {Object} Decoded token payload
   */
  decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      devLog.error('❌ Failed to decode JWT:', error.message);
      throw new Error(`JWT decode failed: ${error.message}`);
    }
  }

  /**
   * Check if the JWT service is properly configured
   * @returns {boolean} True if service is ready to generate JWTs
   */
  isConfigured() {
    try {
      // If key is already loaded, return true
      if (this.privateKey !== null) {
        return true;
      }

      // If we haven't attempted to load yet, try now (but don't throw)
      if (!this.keyLoadAttempted) {
        this.loadPrivateKey();
        // Return true if loading succeeded
        if (this.privateKey !== null) {
          return true;
        }
      }

      // Check environment variable (without loading)
      if (process.env.JWT_PRIVATE_KEY) {
        return true;
      }

      // Check file system (local development)
      try {
        const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH || 
          path.join(process.cwd(), 'certificates', 'jwt', 'marketplace-private-key.pem');
        
        return fs.existsSync(privateKeyPath);
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }
}

// Create singleton instance
const marketplaceJwtService = new MarketplaceJwtService();

export default marketplaceJwtService;