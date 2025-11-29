/**
 * Authentication and Authorization Guards
 * 
 * Centralized guards for protecting API endpoints with authentication (authN)
 * and authorization (authZ) checks. These guards should be called at the
 * start of any protected endpoint before executing the main logic.
 * 
 * Usage:
 *   import { requireAuth, requireLabOwner } from '@/utils/auth/guards';
 *   
 *   export async function POST(req) {
 *     const session = await requireAuth(); // Throws if not authenticated
 *     await requireLabOwner(session, labId); // Throws if not owner
 *     // ... endpoint logic
 *   }
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSessionFromCookies } from './sessionCookie';
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import devLog from '@/utils/dev/logger';

// ===== Custom Error Classes =====

/**
 * HTTP Error base class
 */
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'HttpError';
  }
}

/**
 * 401 Unauthorized - No valid authentication
 */
export class UnauthorizedError extends HttpError {
  constructor(message = 'Authentication required') {
    super(401, message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * 403 Forbidden - Authenticated but not authorized
 */
export class ForbiddenError extends HttpError {
  constructor(message = 'Access denied') {
    super(403, message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * 400 Bad Request - Invalid input
 */
export class BadRequestError extends HttpError {
  constructor(message = 'Invalid request') {
    super(400, message, 'BAD_REQUEST');
    this.name = 'BadRequestError';
  }
}

// ===== Authentication Guards =====

/**
 * Requires a valid authenticated session (SSO or wallet users)
 * Both user types now have session cookies:
 *   - SSO users: Session created during SAML callback
 *   - Wallet users: Session created on wallet connection
 * 
 * @returns {Promise<Object>} Session data if authenticated
 * @throws {UnauthorizedError} If no valid session exists
 */
export async function requireAuth() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  
  if (!session) {
    devLog.warn('🚫 requireAuth: No valid session found');
    throw new UnauthorizedError('No valid session. Please log in.');
  }
  
  devLog.log('✅ requireAuth: Session validated for:', session.id || session.email);
  return session;
}

/**
 * Gets session from cookie if available, returns null otherwise (no throw)
 * Useful for endpoints that need optional authentication
 * 
 * @returns {Promise<Object|null>} Session data or null if not authenticated
 */
export async function getOptionalSession() {
  try {
    const cookieStore = await cookies();
    return getSessionFromCookies(cookieStore);
  } catch {
    return null;
  }
}

/**
 * Requires a valid session with a linked wallet address
 * @returns {Promise<Object>} Session data with wallet
 * @throws {UnauthorizedError} If no valid session
 * @throws {ForbiddenError} If session has no wallet linked
 */
export async function requireAuthWithWallet() {
  const session = await requireAuth();
  
  if (!session.wallet || !isValidAddress(session.wallet)) {
    devLog.warn('🚫 requireAuthWithWallet: No wallet linked to session');
    throw new ForbiddenError('No wallet linked to your account. Please link a wallet first.');
  }
  
  return session;
}

// ===== Authorization Guards =====

/**
 * Requires the user to be the owner of a specific lab
 * Works for BOTH authentication methods since both now have session cookies:
 *   - SSO users: Session with linked wallet from SAML
 *   - Wallet users: Session with wallet address created on connection
 * 
 * @param {Object} session - Authenticated session (from requireAuth)
 * @param {string|number} labId - Lab ID to check ownership for
 * @returns {Promise<Object>} Session data if authorized
 * @throws {BadRequestError} If labId is invalid
 * @throws {ForbiddenError} If user is not the lab owner
 */
export async function requireLabOwner(session, labId) {
  // Validate labId
  if (labId === undefined || labId === null || labId === '') {
    throw new BadRequestError('Lab ID is required');
  }
  
  const numericLabId = Number(labId);
  if (isNaN(numericLabId) || numericLabId < 0) {
    throw new BadRequestError('Invalid lab ID format');
  }
  
  // Get wallet from session (works for both SSO and wallet users)
  const userWallet = session?.wallet;
  
  if (!userWallet || !isValidAddress(userWallet)) {
    devLog.warn('🚫 requireLabOwner: No wallet linked to session');
    throw new ForbiddenError('No wallet linked to your account. Please link a wallet first.');
  }
  
  try {
    // Query on-chain ownership
    const contract = await getContractInstance();
    const labOwner = await contract.ownerOf(numericLabId);
    
    // Compare addresses (case-insensitive)
    const isOwner = labOwner.toLowerCase() === userWallet.toLowerCase();
    
    if (!isOwner) {
      devLog.warn(`🚫 requireLabOwner: Wallet ${userWallet.slice(0, 8)}... is not owner of lab ${labId}`);
      throw new ForbiddenError(`You are not the owner of lab ${labId}`);
    }
    
    devLog.log(`✅ requireLabOwner: Verified ownership of lab ${labId} for ${userWallet.slice(0, 8)}...`);
    return session;
    
  } catch (error) {
    // Re-throw our custom errors
    if (error instanceof HttpError) {
      throw error;
    }
    
    // Handle contract errors (e.g., lab doesn't exist)
    devLog.error(`❌ requireLabOwner: Contract error for lab ${labId}:`, error.message);
    
    if (error.message?.includes('nonexistent token') || error.message?.includes('invalid token')) {
      throw new BadRequestError(`Lab ${labId} does not exist`);
    }
    
    throw new ForbiddenError(`Unable to verify ownership of lab ${labId}`);
  }
}

/**
 * Requires the authenticated user to be a registered provider
 * Note: This checks if the user has the provider role in their session
 * For on-chain verification, use requireLabOwner instead
 * 
 * @param {Object} session - Authenticated session (from requireAuth)
 * @returns {Object} Session data if authorized
 * @throws {ForbiddenError} If user is not a provider
 */
export function requireProviderRole(session) {
  // Check session role or affiliation
  // This depends on your SAML/SSO attributes structure
  const role = session.role?.toLowerCase();
  const scopedRole = session.scopedRole?.toLowerCase();
  
  const providerRoles = ['provider', 'staff', 'faculty', 'admin'];
  const isProvider = providerRoles.some(r => 
    role?.includes(r) || scopedRole?.includes(r)
  );
  
  // Also check if they have a linked wallet (providers typically need wallets)
  const hasWallet = session.wallet && isValidAddress(session.wallet);
  
  if (!isProvider && !hasWallet) {
    devLog.warn('🚫 requireProviderRole: User is not a provider:', session.id || session.email);
    throw new ForbiddenError('Provider access required');
  }
  
  return session;
}

// ===== Helper Functions =====

/**
 * Validates an Ethereum address format
 * @param {string} address - Address to validate
 * @returns {boolean} True if valid Ethereum address format
 */
export function isValidAddress(address) {
  if (!address || typeof address !== 'string') {
    return false;
  }
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Extracts lab ID from various request body formats
 * Handles both FormData and JSON body formats
 * 
 * @param {Request} req - HTTP request
 * @param {string[]} [fieldNames] - Field names to check (default: ['labId'])
 * @returns {Promise<string|null>} Lab ID or null if not found
 */
export async function extractLabIdFromRequest(req, fieldNames = ['labId']) {
  try {
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Clone request to avoid consuming the body
      const formData = await req.clone().formData();
      for (const field of fieldNames) {
        const value = formData.get(field);
        if (value !== null && value !== '') {
          return String(value);
        }
      }
    } else if (contentType.includes('application/json')) {
      const body = await req.clone().json();
      for (const field of fieldNames) {
        const value = body[field] ?? body.labData?.[field];
        if (value !== undefined && value !== null && value !== '') {
          return String(value);
        }
      }
    }
    
    return null;
  } catch (error) {
    devLog.warn('extractLabIdFromRequest: Failed to extract labId:', error.message);
    return null;
  }
}

/**
 * Extracts lab ID from a file path
 * Handles paths like "/123/images/file.jpg" or "123/docs/doc.pdf"
 * 
 * @param {string} filePath - File path to extract from
 * @returns {string|null} Lab ID or null if not found
 */
export function extractLabIdFromPath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }
  
  // Normalize path separators
  const normalized = filePath.replace(/\\/g, '/');
  
  // Skip temp folder paths
  if (normalized.includes('/temp/') || normalized.startsWith('temp/')) {
    return null;
  }
  
  // Extract first numeric segment
  // Handles: "/123/images/file.jpg", "123/docs/doc.pdf", etc.
  const match = normalized.match(/^\/?(\d+)\//);
  if (match) {
    return match[1];
  }
  
  return null;
}

// ===== Response Helpers =====

/**
 * Creates a standardized error response from an HttpError
 * @param {Error} error - Error to convert to response
 * @returns {NextResponse} JSON error response
 */
export function handleGuardError(error) {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { 
        error: error.message,
        code: error.code 
      },
      { status: error.status }
    );
  }
  
  // Unexpected error
  devLog.error('Unexpected error in guard:', error);
  return NextResponse.json(
    { 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    },
    { status: 500 }
  );
}

/**
 * Wraps an endpoint handler with authentication and optional authorization
 * 
 * @param {Function} handler - Async handler function (session, req) => Response
 * @param {Object} [options] - Guard options
 * @param {boolean} [options.requireWallet] - Require linked wallet
 * @param {boolean} [options.requireProvider] - Require provider role
 * @param {boolean} [options.requireLabOwnership] - Require lab ownership (needs labId in request)
 * @param {string[]} [options.labIdFields] - Field names to extract labId from
 * @returns {Function} Wrapped handler
 * 
 * @example
 * export const POST = withAuth(async (session, req) => {
 *   // Your endpoint logic here
 *   return NextResponse.json({ success: true });
 * }, { requireLabOwnership: true });
 */
export function withAuth(handler, options = {}) {
  return async (req) => {
    try {
      // Step 1: Authenticate
      let session;
      if (options.requireWallet) {
        session = await requireAuthWithWallet();
      } else {
        session = await requireAuth();
      }
      
      // Step 2: Check provider role if required
      if (options.requireProvider) {
        requireProviderRole(session);
      }
      
      // Step 3: Check lab ownership if required
      if (options.requireLabOwnership) {
        const labIdFields = options.labIdFields || ['labId'];
        const labId = await extractLabIdFromRequest(req, labIdFields);
        
        if (!labId) {
          throw new BadRequestError('Lab ID is required for this operation');
        }
        
        await requireLabOwner(session, labId);
      }
      
      // Step 4: Execute the actual handler
      return await handler(session, req);
      
    } catch (error) {
      return handleGuardError(error);
    }
  };
}

export default {
  // Guards
  requireAuth,
  requireAuthWithWallet,
  requireLabOwner,
  requireProviderRole,
  
  // Errors
  HttpError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  
  // Helpers
  isValidAddress,
  extractLabIdFromRequest,
  extractLabIdFromPath,
  handleGuardError,
  withAuth,
};
