/**
 * Lab authentication utilities
 * Handles the authentication flow for lab access
 */
import devLog from '@/utils/dev/logger'

/**
 * Authenticates user for lab access through a multi-step process
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
 * @returns {string} User-friendly error message
 */
export const getAuthErrorMessage = (error) => {
  if (error.message.includes('User rejected')) {
    return 'Signature was cancelled. Please try again.';
  } else if (error.message.includes('Failed to get authentication message')) {
    return 'Failed to get the message to sign. Please try again.';
  } else if (error.message.includes('Authentication service error')) {
    return 'An error has occurred in the authentication service.';
  } else {
    return 'There was an error verifying your booking. Try again.';
  }
};
