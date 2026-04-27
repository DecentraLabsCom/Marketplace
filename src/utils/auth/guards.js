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
import { readLabCreatorPucHash, ZERO_BYTES32 } from '@/utils/blockchain/labCreatorHash';
import { getPucHashFromSession } from './puc';
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
  constructor(message = 'Access denied', code = 'FORBIDDEN') {
    super(403, message, code);
    this.name = 'ForbiddenError';
  }
}

/**
 * 409 Conflict - Authenticated but current resource state blocks the action
 */
export class ConflictError extends HttpError {
  constructor(message = 'Conflict', code = 'CONFLICT') {
    super(409, message, code);
    this.name = 'ConflictError';
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
 * Requires a valid authenticated session.
 *
 * @returns {Promise<Object>} Session data if authenticated
 * @throws {UnauthorizedError} If no valid session exists
 */
export async function requireAuth() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);

  if (!session) {
    devLog.warn('requireAuth: No valid session found');
    throw new UnauthorizedError('No valid session. Please log in.');
  }

  devLog.log('requireAuth: Session validated for:', session.id || session.email);
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
    devLog.warn('requireAuthWithWallet: No wallet linked to session');
    throw new ForbiddenError('No wallet linked to your account. Please link a wallet first.');
  }

  return session;
}

// ===== Authorization Guards =====

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const waitForRetryDelay = (attempt, baseDelayMs) => {
  if (process.env.NODE_ENV === 'test') {
    return Promise.resolve();
  }
  return sleep(baseDelayMs * attempt);
}

const TRANSIENT_OWNERSHIP_ERROR_PATTERNS = [
  'nonexistent token',
  'invalid token',
  'header not found',
  'missing trie node',
  'timeout',
  'network',
  'rate limit',
  'temporarily unavailable'
];

function isTransientOwnershipError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (!message) return false;
  return TRANSIENT_OWNERSHIP_ERROR_PATTERNS.some(pattern => message.includes(pattern));
}

function normalizeOrganizationDomain(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[a-z0-9.-]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

async function resolveInstitutionWalletFromSession(session) {
  const organization =
    session?.affiliation ||
    session?.schacHomeOrganization ||
    session?.organizationName ||
    session?.organization ||
    session?.institutionId ||   // Entra ID sessions set this via entraIdAdapter
    null;


  const normalized = normalizeOrganizationDomain(organization);
  if (!normalized) return null;

  try {
    const contract = await getContractInstance();
    const wallet = await contract.resolveSchacHomeOrganization(normalized);
    if (!wallet || wallet === ZERO_ADDRESS) {
      return null;
    }
    return wallet;
  } catch (error) {
    devLog.warn('requireLabOwner: Failed resolving institution wallet', error?.message || error);
    return null;
  }
}

/**
 * Requires the user to be the owner of a specific lab.
 * Institutional sessions may resolve an organization wallet when no direct wallet
 * is linked on the session.
 *
 * @param {Object} session - Authenticated session (from requireAuth)
 * @param {string|number} labId - Lab ID to check ownership for
 * @returns {Promise<Object>} Session data if authorized
 * @throws {BadRequestError} If labId is invalid
 * @throws {ForbiddenError} If user is not the lab owner
 */
export async function requireLabOwner(session, labId) {
  if (labId === undefined || labId === null || labId === '') {
    throw new BadRequestError('Lab ID is required');
  }

  const numericLabId = Number(labId);
  if (isNaN(numericLabId) || numericLabId < 0) {
    throw new BadRequestError('Invalid lab ID format');
  }

  const isSsoSession = Boolean(session?.authType === 'sso' || session?.isSSO || session?.samlAssertion);
  let userWallet = session?.wallet;
  if ((!userWallet || !isValidAddress(userWallet)) && isSsoSession) {
    const institutionalWallet = await resolveInstitutionWalletFromSession(session);
    if (institutionalWallet && isValidAddress(institutionalWallet)) {
      userWallet = institutionalWallet;
    }
  }

  if (!userWallet || !isValidAddress(userWallet)) {
    devLog.warn('requireLabOwner: No wallet linked to session');
    throw new ForbiddenError('No wallet linked to your account. Please link a wallet first.');
  }

  const maxAttempts = isSsoSession ? 5 : 3;
  const baseDelayMs = isSsoSession ? 250 : 150;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const contract = await getContractInstance();
      const labOwner = await contract.ownerOf(numericLabId);
      const isOwner = labOwner.toLowerCase() === userWallet.toLowerCase();

      if (!isOwner) {
        devLog.warn(`requireLabOwner: Wallet ${userWallet.slice(0, 8)}... is not owner of lab ${labId}`);
        throw new ForbiddenError(`You are not the owner of lab ${labId}`);
      }

      if (isSsoSession) {
        const expectedCreatorHash = getPucHashFromSession(session);
        if (!expectedCreatorHash) {
          throw new ForbiddenError('Missing stable SSO identity', 'MISSING_SSO_IDENTITY');
        }

        const creatorPucHash = await readLabCreatorPucHash(contract, numericLabId);
        if (!creatorPucHash || creatorPucHash.toLowerCase() === ZERO_BYTES32) {
          // Right after creation, creator hash can lag briefly on some RPC providers.
          if (attempt < maxAttempts) {
            await waitForRetryDelay(attempt, baseDelayMs);
            continue;
          }
          throw new ConflictError(
            'This laboratory is legacy and pending migration.',
            'LAB_LEGACY_BLOCKED'
          );
        }

        if (creatorPucHash.toLowerCase() !== expectedCreatorHash.toLowerCase()) {
          throw new ForbiddenError(
            'You are not the creator of this laboratory.',
            'LAB_CREATOR_MISMATCH'
          );
        }
      }

      devLog.log(`requireLabOwner: Verified ownership of lab ${labId} for ${userWallet.slice(0, 8)}...`);
      return session;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      const transient = isTransientOwnershipError(error);
      const hasMoreAttempts = attempt < maxAttempts;
      if (transient && hasMoreAttempts) {
        devLog.warn(
          `requireLabOwner: transient verification error on attempt ${attempt}/${maxAttempts} for lab ${labId}; retrying`,
          error?.message || error
        );
        await waitForRetryDelay(attempt, baseDelayMs);
        continue;
      }

      devLog.error(`requireLabOwner: Contract error for lab ${labId}:`, error.message);

      if (error.message?.includes('nonexistent token') || error.message?.includes('invalid token')) {
        throw new BadRequestError(`Lab ${labId} does not exist`);
      }

      throw new ForbiddenError(`Unable to verify ownership of lab ${labId}`);
    }
  }

  throw new ForbiddenError(`Unable to verify ownership of lab ${labId}`);
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
  const role = session.role?.toLowerCase();
  const scopedRole = session.scopedRole?.toLowerCase();

  const providerRoles = ['provider', 'staff', 'faculty', 'admin'];
  const isProvider = providerRoles.some(r =>
    role?.includes(r) || scopedRole?.includes(r)
  );

  const hasWallet = session.wallet && isValidAddress(session.wallet);

  if (!isProvider && !hasWallet) {
    devLog.warn('requireProviderRole: User is not a provider:', session.id || session.email);
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

  const normalized = filePath.replace(/\\/g, '/');

  if (normalized.includes('/temp/') || normalized.startsWith('temp/')) {
    return null;
  }

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
 */
export function withAuth(handler, options = {}) {
  return async (req) => {
    try {
      let session;
      if (options.requireWallet) {
        session = await requireAuthWithWallet();
      } else {
        session = await requireAuth();
      }

      if (options.requireProvider) {
        requireProviderRole(session);
      }

      if (options.requireLabOwnership) {
        const labIdFields = options.labIdFields || ['labId'];
        const labId = await extractLabIdFromRequest(req, labIdFields);

        if (!labId) {
          throw new BadRequestError('Lab ID is required for this operation');
        }

        await requireLabOwner(session, labId);
      }

      return await handler(session, req);
    } catch (error) {
      return handleGuardError(error);
    }
  };
}

export default {
  requireAuth,
  requireAuthWithWallet,
  requireLabOwner,
  requireProviderRole,
  HttpError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
  isValidAddress,
  extractLabIdFromRequest,
  extractLabIdFromPath,
  handleGuardError,
  withAuth,
};
