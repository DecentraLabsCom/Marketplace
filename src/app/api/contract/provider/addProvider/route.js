/**
 * API endpoint for registering new lab providers on the blockchain
 * Handles POST requests to add provider information to the smart contract
 * 
 * @description Optimized for React Query with proper validation and blockchain best practices
 * @version 2.0.0 - No server-side cache, React Query friendly with transaction support
 */

import { getContractInstance } from '../../utils/contractInstance'
import { requireAuth, handleGuardError, ForbiddenError } from '@/utils/auth/guards'
import { hasAdminRole } from '@/utils/auth/roleValidation'

/**
 * Registers a new lab provider on the blockchain
 * @param {Request} request - HTTP request with provider details
 * @param {Object} request.body - Request body
 * @param {string} request.body.name - Provider's full name (required)
 * @param {string} request.body.email - Provider's email address (required)
 * @param {string} request.body.wallet - Provider's wallet address (required)
 * @param {string} request.body.country - Provider's country (required)
 * @param {boolean} [request.body.validateOnly=false] - If true, only validates without executing transaction
 * @returns {Response} JSON response with registration result, transaction hash, or detailed error
 */
export async function POST(request) {
  const startTime = Date.now();
  
  try {
    // Authentication check - only authenticated users with admin role can add providers
    const session = await requireAuth();
    
    // Admin role check - this operation requires DEFAULT_ADMIN_ROLE on-chain
    // Only SSO users with institutional admin privileges can perform this
    if (!hasAdminRole(session.role, session.scopedRole)) {
      throw new ForbiddenError('Admin privileges required to add providers');
    }
    
    // Parse and validate request body
    const body = await request.json();
    const { name, email, wallet, country, validateOnly = false } = body;
    
    // Comprehensive input validation
    const validationErrors = [];
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      validationErrors.push({ field: 'name', message: 'Required field missing or empty' });
    } else if (name.trim().length < 2) {
      validationErrors.push({ field: 'name', message: 'Name must be at least 2 characters long' });
    }
    
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      validationErrors.push({ field: 'email', message: 'Required field missing or empty' });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      validationErrors.push({ field: 'email', message: 'Invalid email format' });
    }
    
    if (!wallet || typeof wallet !== 'string' || wallet.trim().length === 0) {
      validationErrors.push({ field: 'wallet', message: 'Required field missing or empty' });
    } else if (!/^0x[a-fA-F0-9]{40}$/.test(wallet.trim())) {
      validationErrors.push({ field: 'wallet', message: 'Invalid wallet address format' });
    }
    
    if (!country || typeof country !== 'string' || country.trim().length === 0) {
      validationErrors.push({ field: 'country', message: 'Required field missing or empty' });
    } else if (country.trim().length < 2) {
      validationErrors.push({ field: 'country', message: 'Country must be at least 2 characters long' });
    }
    
    if (validationErrors.length > 0) {
      return Response.json({ 
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validationErrors
      }, {status: 400 });
    }

    // Normalize inputs
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedWallet = wallet.trim();
    const normalizedCountry = country.trim();

    console.log(`Registering provider - name: ${normalizedName}, email: ${normalizedEmail}, wallet: ${normalizedWallet}, country: ${normalizedCountry}`);

    // If only validation requested, return early
    if (validateOnly) {
      return Response.json({
        data: {
          name: normalizedName,
          email: normalizedEmail,
          wallet: normalizedWallet,
          country: normalizedCountry,
          validated: true
        },
        meta: {
          timestamp: new Date().toISOString(),
          validationOnly: true
        }
      }, {status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    // Get contract instance with error handling
    let contract;
    try {
      contract = await getContractInstance();
    } catch (contractError) {
      console.error('Failed to get contract instance:', contractError);
      return Response.json({ 
        error: 'Blockchain connection failed',
        code: 'CONTRACT_ERROR',
        retryable: true
      }, {status: 503 });
    }

    // Execute blockchain transaction WITHOUT retry (prevents duplicates)
    let transactionHash;
    let receipt;
    
    try {
      const tx = await contract.addProvider(normalizedName, normalizedWallet, normalizedEmail, normalizedCountry);
      
      transactionHash = tx.hash;
      console.log('Provider registration transaction submitted:', transactionHash);
      
      // Wait for confirmation
      receipt = await tx.wait();
      console.log('Provider registration confirmed:', receipt.transactionHash);
      
    } catch (blockchainError) {
      console.error('Blockchain transaction failed:', blockchainError);
      
      // Parse blockchain error for better client handling
      let errorCode = 'BLOCKCHAIN_ERROR';
      let retryable = true;
      
      if (blockchainError.message?.includes('user rejected')) {
        errorCode = 'USER_REJECTED';
        retryable = false;
      } else if (blockchainError.message?.includes('insufficient funds')) {
        errorCode = 'INSUFFICIENT_FUNDS';
        retryable = false;
      } else if (blockchainError.message?.includes('already exists')) {
        errorCode = 'PROVIDER_ALREADY_EXISTS';
        retryable = false;
      } else if (blockchainError.message?.includes('not authorized')) {
        errorCode = 'NOT_AUTHORIZED';
        retryable = false;
      } else if (blockchainError.message?.includes('nonce')) {
        errorCode = 'NONCE_ERROR';
        retryable = true;
      }
      
      return Response.json({ 
        error: 'Provider registration failed',
        code: errorCode,
        retryable,
        details: blockchainError.message,
        wallet: normalizedWallet
      }, {status: 500 });
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Return success response optimized for React Query
    return Response.json({
      data: {
        transactionHash,
        blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString(),
        provider: {
          name: normalizedName,
          email: normalizedEmail,
          wallet: normalizedWallet,
          country: normalizedCountry
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        duration,
        confirmed: true
      }
    }, {status: 201,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    // Handle guard errors (401, 403) separately from other errors
    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error);
    }
    
    console.error('Unexpected error in addProvider:', error);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    return Response.json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      retryable: true,
      meta: {
        timestamp: new Date().toISOString(),
        duration
      }
    }, {status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}
