/**
 * Lab authentication utilities
 * Handles the authentication flow for lab access (JWT-based and wallet-based)
 */
import devLog from '@/utils/dev/logger'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import authServiceClient from '@/utils/auth/authServiceClient'

/**
 * Authenticates SSO user for lab access using JWT flow
 * Generates JWT from user session and exchanges it with auth-service
 * @param {Object} userData - User data from SSO session
 * @param {string|number} labId - Lab ID to access
 * @returns {Promise<Object>} Authentication result with token and labURL or error
 * @throws {Error} If any step of the JWT authentication process fails
 */
export const authenticateLabAccessSSO = async (userData, labId) => {
  try {
    devLog.log('🔐 Starting JWT-based lab authentication for user:', userData.email);

    // Step 1: Check if JWT service is configured
    if (!marketplaceJwtService.isConfigured()) {
      throw new Error('JWT service is not properly configured');
    }

    // Step 2: Generate JWT for the authenticated user
    const marketplaceJwt = marketplaceJwtService.generateJwtForUser(userData);
    devLog.log('📝 Marketplace JWT generated successfully');

    // Step 3: Exchange JWT with auth-service for lab access token
    devLog.log('🔑 Exchanging JWT with auth-service for lab access...');
    
    const authResult = await authServiceClient.exchangeJwtForToken(marketplaceJwt, userData.affiliation, labId);
    devLog.log('✅ Lab access token received successfully');

    return authResult;

  } catch (error) {
    devLog.error('❌ SSO lab authentication failed:', error);
    throw error;
  }
};

/**
 * Authenticates user for lab access through wallet signature (WALLET FLOW)
 * @param {string} authEndpoint - Base authentication endpoint URL
 * @param {string} userWallet - User's wallet address
 * @param {string|number} labId - Lab ID to access
 * @param {Function} signMessageAsync - Function to sign the authentication message
 * @returns {Promise<Object>} Authentication result with token and labURL or error
 * @throws {Error} If any step of the authentication process fails
 */
export const authenticateLabAccess = async (authEndpoint, userWallet, labId, signMessageAsync) => {
  try {
    // Step 1: Request message to sign from authentication service
    devLog.log('🔐 Requesting authentication message from:', authEndpoint + "message");
    
    const responseMessage = await fetch(authEndpoint + "message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ wallet: userWallet }),
    });

    if (!responseMessage.ok) {
      throw new Error(`Failed to get authentication message. Status: ${responseMessage.status}`);
    }

    const { message } = await responseMessage.json();
    devLog.log('📝 Authentication message received, requesting signature...');

    // Step 2: Sign the message using the user's wallet
    const signature = await signMessageAsync({ message });
    devLog.log('✅ Message signed successfully');

    // Step 3: Send authentication data to verify signature and get access token
    devLog.log('🔑 Verifying signature and requesting lab access token...');
    
    const responseAuth = await fetch(authEndpoint + "auth2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        wallet: userWallet,
        signature: signature,
        labId: labId
      }),
    });

    if (!responseAuth.ok) {
      throw new Error(`Authentication service error. Status: ${responseAuth.status}`);
    }

    const authData = await responseAuth.json();
    devLog.log('🎯 Authentication response received:', authData);

    return authData;

  } catch (error) {
    devLog.error('❌ Lab authentication failed:', error);
    throw error;
  }
};

/**
 * Handles authentication errors and returns user-friendly messages
 * @param {Error} error - The error object from authentication process
 * @param {boolean} isJwtFlow - Whether this is from JWT flow or wallet flow
 * @returns {string} User-friendly error message
 */
export const getAuthErrorMessage = (error, isJwtFlow = false) => {
  if (isJwtFlow) {
    // JWT flow specific errors
    if (error.message.includes('JWT service is not properly configured')) {
      return 'Authentication system is not configured. Please contact support.';
    } else if (error.message.includes('Lab does not have a configured Lab Gateway')) {
      return 'This lab does not support SSO access. Please use wallet authentication.';
    } else if (error.message.includes('Failed to exchange JWT')) {
      return 'Failed to authenticate with lab service. Please try again.';
    } else {
      return 'There was an error with SSO authentication. Please try again or use wallet authentication.';
    }
  } else {
    // Wallet flow specific errors
    if (error.message.includes('User rejected')) {
      return 'Signature was cancelled. Please try again.';
    } else if (error.message.includes('Failed to get authentication message')) {
      return 'Failed to get the message to sign. Please try again.';
    } else if (error.message.includes('Authentication service error')) {
      return 'An error has occurred in the authentication service.';
    } else {
      return 'There was an error verifying your booking. Try again.';
    }
  }
};
