/**
 * Marketplace JWT Service
 * 
 * Handles JWT generation for secure communication with auth-service.
 * Uses RSA private key to sign JWTs containing user information from SAML2 sessions.
 * 
 * Security Features:
 * - RSA-256 signatures for cryptographic authentication
 * - 1-minute token expiration to prevent replay attacks
 * - Proper claim mapping from SAML2 attributes
 */

import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import devLog from '@/utils/dev/logger';

class MarketplaceJwtService {
  constructor() {
    this.privateKey = null;
    this.keyLoadAttempted = false;
    // Don't load the key in constructor - wait until it's actually needed
  }

  /**
   * Load and cache the RSA private key for JWT signing
   * Only works on server-side (Node.js environment)
   * @private
   */
  async loadPrivateKey() {
    // Browser-side guard - immediately return
    if (typeof window !== 'undefined') {
      throw new Error('JWT key loading is not available in browser environment');
    }

    // Avoid multiple load attempts
    if (this.keyLoadAttempted) {
      return;
    }
    
    this.keyLoadAttempted = true;

    try {
      // Try environment variable first (for Vercel deployment)
      if (process.env.JWT_PRIVATE_KEY) {
        this.privateKey = process.env.JWT_PRIVATE_KEY;
        devLog.log('✅ JWT private key loaded from environment variable');
        return;
      }

      // Fallback to file system (for local development)
      // Use eval to prevent webpack from bundling these modules
      const fs = eval('require')('fs');
      const path = eval('require')('path');

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

      devLog.log('✅ JWT private key loaded from file system');
      
    } catch (error) {
      devLog.error('❌ Failed to load JWT private key:', error.message);
      // Don't throw error here - let it be handled when actually needed
      this.privateKey = null;
    }
  }

  /**
   * Expose the PEM-encoded private key once loaded.
   * Ensures the key is available and throws if misconfigured.
   * @returns {Promise<string>} RSA private key in PEM format
   */
  async getPrivateKeyPem() {
    if (!this.privateKey) {
      await this.loadPrivateKey();
    }

    if (!this.privateKey) {
      throw new Error('JWT private key is not available. Check JWT_PRIVATE_KEY or JWT_PRIVATE_KEY_PATH.');
    }

    return this.privateKey;
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
  async generateJwtForUser(samlAttributes) {
    try {
      // Load private key if not already loaded
      if (!this.privateKey) {
        await this.loadPrivateKey();
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
        iat: Math.floor(Date.now() / 1000),                            // Issued at
        exp: Math.floor(Date.now() / 1000) + parseInt(process.env.JWT_EXPIRATION_MS || '60000') / 1000 // Expires in
      };

      // Generate signed JWT with issuer in options (not payload)
      const token = jwt.sign(payload, this.privateKey, {
        algorithm: 'RS256',
        issuer: process.env.JWT_ISSUER || 'marketplace'
      });

      devLog.log('✅ JWT generated successfully for user:', samlAttributes.username);
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
      throw new Error(`JWT generation failed: ${error.message}`, { cause: error });
    }
  }


  /**
   * Generate a signed JWT token for SAML auth-service access.
   * Includes the claims expected by blockchain-services saml-auth2.
   *
   * @param {Object} params
   * @param {string} params.userId - User ID matching SAML assertion
   * @param {string} params.affiliation - Institution domain (schacHomeOrganization)
   * @param {string} params.institutionalProviderWallet - Institution wallet address
   * @param {string} [params.puc] - Personal unique code (optional)
   * @param {string|string[]} [params.scope] - OAuth-style scope for booking info
   * @param {boolean} [params.bookingInfoAllowed] - Allow booking info claims
   * @returns {Promise<string>} Signed JWT token
   */
  async generateSamlAuthToken({
    userId,
    affiliation,
    institutionalProviderWallet,
    puc,
    scope = 'booking:read',
    bookingInfoAllowed = true,
  } = {}) {
    try {
      if (!this.privateKey) {
        await this.loadPrivateKey();
      }

      if (!this.privateKey) {
        throw new Error('JWT private key is not available. Check JWT_PRIVATE_KEY environment variable or key file.');
      }

      if (!userId) {
        throw new Error('userId is required for SAML auth token generation');
      }

      if (!affiliation) {
        throw new Error('affiliation is required for SAML auth token generation');
      }

      if (institutionalProviderWallet) {
        const trimmed = institutionalProviderWallet.trim();
        if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
          throw new Error('Invalid institutionalProviderWallet address format');
        }
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const expSec = nowSec + parseInt(process.env.JWT_EXPIRATION_MS || '60000', 10) / 1000;

      const payload = {
        userid: userId,
        affiliation,
        bookingInfoAllowed,
        scope,
        iat: nowSec,
        exp: expSec,
      };

      if (institutionalProviderWallet) {
        payload.institutionalProviderWallet = institutionalProviderWallet;
      }

      if (puc) {
        payload.puc = puc;
      }

      const token = jwt.sign(payload, this.privateKey, {
        algorithm: 'RS256',
        issuer: process.env.JWT_ISSUER || 'marketplace',
      });

      devLog.log('INFO: SAML auth JWT generated successfully for user:', userId);

      return token;
    } catch (error) {
      devLog.error('ERROR: Failed to generate SAML auth JWT:', error.message);
      throw new Error(`SAML auth JWT generation failed: ${error.message}`, { cause: error });
    }
  }

  /**
   * Generate a signed JWT token for intent backend authorization.
   * Intended for short-lived service-to-service calls to /intents endpoints.
   *
   * @param {Object} [options]
   * @param {string} [options.scope] - Space-delimited scope string
   * @param {string} [options.audience] - JWT audience
   * @param {number} [options.expiresInSeconds] - TTL in seconds
   * @param {string} [options.subject] - JWT subject
   * @returns {Promise<{ token: string, expiresAt: string }>}
   */
  async generateIntentBackendToken({
    scope,
    audience,
    expiresInSeconds,
    subject,
  } = {}) {
    try {
      if (!this.privateKey) {
        await this.loadPrivateKey();
      }

      if (!this.privateKey) {
        throw new Error('JWT private key is not available. Check JWT_PRIVATE_KEY environment variable or key file.');
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const ttlSeconds = parseInt(
        expiresInSeconds ?? process.env.INTENTS_JWT_EXPIRATION_SECONDS ?? '60',
        10,
      );
      const safeTtl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 60;
      const expSec = nowSec + safeTtl;

      const payload = {
        scope: scope || process.env.INTENTS_JWT_SCOPE || 'intents:submit intents:status',
        iat: nowSec,
        exp: expSec,
      };

      const token = jwt.sign(payload, this.privateKey, {
        algorithm: 'RS256',
        issuer: process.env.JWT_ISSUER || 'marketplace',
        audience: audience || process.env.INTENTS_JWT_AUDIENCE || 'blockchain-services',
        subject: subject || process.env.INTENTS_JWT_SUBJECT || 'marketplace-intents',
        jwtid: randomUUID(),
      });

      return {
        token,
        expiresAt: new Date(expSec * 1000).toISOString(),
      };
    } catch (error) {
      devLog.error('ERROR: Failed to generate intent backend JWT:', error.message);
      throw new Error(`Intent backend JWT generation failed: ${error.message}`, { cause: error });
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
      throw new Error(`JWT decode failed: ${error.message}`, { cause: error });
    }
  }

  /**
   * Check if the JWT service is properly configured
   * @returns {Promise<boolean>} True if service is ready to generate JWTs
   */
  async isConfigured() {
    try {
      // Browser-side guard
      if (typeof window !== 'undefined') {
        return false; // Client-side, JWT service not available
      }

      // If key is already loaded, return true
      if (this.privateKey !== null) {
        return true;
      }

      // Check environment variable (without loading)
      if (process.env.JWT_PRIVATE_KEY) {
        return true;
      }

      // Check file system (local development)
      try {
        const fs = eval('require')('fs');
        const path = eval('require')('path');
        
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

  /**
   * Normalize schacHomeOrganization-style domains using the same rules
   * as LibInstitutionalOrg.normalizeOrganization (lowercase + charset)
   * @param {string} domain
   * @returns {string}
   * @throws {Error} If domain is invalid
   */
  normalizeOrganizationDomain(domain) {
    if (!domain || typeof domain !== 'string') {
      throw new Error('Organization domain is required');
    }

    const input = domain.trim();
    if (input.length < 3 || input.length > 255) {
      throw new Error('Invalid organization domain length');
    }

    let normalized = '';
    for (let i = 0; i < input.length; i += 1) {
      let code = input.charCodeAt(i);

      // Uppercase A-Z -> lowercase a-z
      if (code >= 0x41 && code <= 0x5a) {
        code += 32;
      }

      const ch = String.fromCharCode(code);

      const isLower = code >= 0x61 && code <= 0x7a;
      const isDigit = code >= 0x30 && code <= 0x39;
      const isDash = ch === '-';
      const isDot = ch === '.';

      if (!isLower && !isDigit && !isDash && !isDot) {
        throw new Error('Invalid character in organization domain');
      }

      normalized += ch;
    }

    return normalized;
  }

  /**
   * Generate a signed JWT invite token for institutional onboarding
   * @param {Object} params
   * @param {Object} params.samlUser - User object from SAML session (src/utils/auth/sso.js)
   * @param {string[]} params.domains - Candidate organization domains (schacHomeOrganization-style)
   * @param {string} [params.expectedWallet] - Optional pre-approved wallet address
   * @returns {Promise<{ token: string, payload: Object }>}
   */
  async generateInstitutionInviteToken({ samlUser, domains, expectedWallet }) {
    try {
      if (!samlUser) {
        throw new Error('SAML user is required for invite token');
      }

      if (!Array.isArray(domains) || domains.length === 0) {
        throw new Error('At least one organization domain is required for invite token');
      }

      // Load signing key
      if (!this.privateKey) {
        await this.loadPrivateKey();
      }
      if (!this.privateKey) {
        throw new Error('JWT private key is not available for invite token');
      }

      // Normalize and deduplicate domains
      const normalizedDomains = Array.from(new Set(
        domains
          .filter((d) => typeof d === 'string' && d.trim().length > 0)
          .map((d) => this.normalizeOrganizationDomain(d))
      ));

      if (normalizedDomains.length === 0) {
        throw new Error('No valid organization domains after normalization');
      }

      // Optional wallet sanity check
      let wallet = undefined;
      if (expectedWallet) {
        const trimmed = expectedWallet.trim();
        if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
          throw new Error('Invalid expected wallet address format');
        }
        wallet = trimmed;
      }

      // Basic issuer identity from SAML user
      const issuerId =
        samlUser.id ||
        samlUser.uid ||
        samlUser.username ||
        samlUser.email ||
        'unknown';

      const issuerEmail = samlUser.email || '';
      const primaryOrg =
        samlUser.affiliation ||
        samlUser.schacHomeOrganization ||
        normalizedDomains[0];

      const nowSec = Math.floor(Date.now() / 1000);
      const ttlSeconds = parseInt(process.env.INSTITUTION_INVITE_EXPIRATION_SECONDS || '259200', 10); // 3 days

      const payload = {
        type: 'institution_invite',
        organizationDomains: normalizedDomains,
        issuerUserId: issuerId,
        issuerEmail,
        issuerInstitution: primaryOrg,
        expectedWallet: wallet,
        nonce: `${issuerId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        iat: nowSec,
        exp: nowSec + ttlSeconds,
        aud: process.env.INSTITUTION_INVITE_AUDIENCE || 'blockchain-services',
      };

      const token = jwt.sign(payload, this.privateKey, {
        algorithm: 'RS256',
        issuer: process.env.JWT_ISSUER || 'marketplace',
      });

      devLog.log('? Institution invite token generated for:', issuerId, 'domains:', normalizedDomains);

      return { token, payload };
    } catch (error) {
      devLog.error('? Failed to generate institution invite token:', error.message);
      throw new Error(`Institution invite token generation failed: ${error.message}`, { cause: error });
    }
  }
}

// Create singleton instance
const marketplaceJwtService = new MarketplaceJwtService();

export default marketplaceJwtService;
