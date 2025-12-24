/**
 * Lab authentication utilities
 * Handles the authentication flow for lab access (JWT-based and wallet-based)
 */
import devLog from '@/utils/dev/logger'

/**
 * Authenticates SSO user for lab access using marketplace-backed flow.
 * @param {Object} params
 * @param {string|number} params.labId - Lab ID to access
 * @param {string} [params.reservationKey] - Optional reservation key for validation
 * @param {string} [params.authEndpoint] - Optional auth endpoint override
 * @param {boolean} [params.skipCheckIn] - Skip on-chain check-in step
 * @returns {Promise<Object>} Authentication result with token and labURL or error
 * @throws {Error} If any step of the SSO authentication process fails
 */
export const authenticateLabAccessSSO = async ({
  labId,
  reservationKey = null,
  authEndpoint = null,
  skipCheckIn = false,
} = {}) => {
  try {
    if (!labId && !reservationKey) {
      throw new Error('Missing labId or reservationKey for SSO access');
    }

    if (!skipCheckIn) {
      await submitInstitutionalCheckIn({ reservationKey, labId, authEndpoint });
    }

    const response = await fetch('/api/auth/lab-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ labId, reservationKey, authEndpoint }),
    });

    if (!response.ok) {
      throw new Error(`SSO authentication failed. Status: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    devLog.error('ERROR: SSO lab authentication failed:', error);
    throw error;
  }
};

export const submitInstitutionalCheckIn = async ({
  reservationKey = null,
  labId = null,
  authEndpoint = null,
} = {}) => {
  const response = await fetch('/api/auth/checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reservationKey, labId, authEndpoint }),
  });

  if (!response.ok) {
    throw new Error(`Institutional check-in failed. Status: ${response.status}`);
  }

  return response.json();
};

/**
 * Authenticates user for lab access through wallet signature (WALLET FLOW)
 * @param {string} authEndpoint - Base authentication endpoint URL
 * @param {string} userWallet - User's wallet address
 * @param {string|number} labId - Lab ID to access
 * @param {Function} signMessageAsync - Function to sign the authentication message
 * @param {string} [reservationKey] - Optional reservation key for optimized validation
 * @returns {Promise<Object>} Authentication result with token and labURL or error
 * @throws {Error} If any step of the authentication process fails
 */
/**
 * Helper function to properly construct auth endpoint URLs
 * Ensures proper URL formatting with correct slashes
 */
const buildAuthUrl = (baseUrl, endpoint) => {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error(`Invalid auth endpoint: ${baseUrl}. Expected a valid URL string.`);
  }
  
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBase}/${endpoint}`;
};

const buildCheckInMessageUrl = (baseUrl, reservationKey, labId, signer, puc) => {
  if ((!reservationKey && !labId) || !signer) {
    throw new Error('Missing reservationKey or labId or signer for check-in');
  }

  const base = buildAuthUrl(baseUrl, "message");
  const params = new URLSearchParams({
    purpose: "checkin",
    signer,
  });
  if (reservationKey) {
    params.set("reservationKey", reservationKey);
  } else if (labId) {
    params.set("labId", labId);
  }
  if (puc) {
    params.set("puc", puc);
  }
  return `${base}?${params.toString()}`;
};

const normalizeTypedDataTypes = (types) => {
  if (!types || typeof types !== 'object') {
    return {};
  }
  const { EIP712Domain, ...rest } = types;
  return rest;
};

/**
 * Extracts timestamp (ms) from auth-service /message response.
 * Backend returns both the message ("Login request: <timestampMs>") and timestampMs.
 */
const extractTimestampMs = (messageData) => {
  const rawTimestamp = messageData.timestamp ?? messageData.timestampMs;
  if (rawTimestamp !== undefined && rawTimestamp !== null) {
    const numeric = Number(rawTimestamp);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }

  if (typeof messageData.message === 'string') {
    const match = messageData.message.match(/(\d+)\s*$/);
    if (match && match[1]) {
      const numeric = Number(match[1]);
      if (!Number.isNaN(numeric)) {
        return numeric;
      }
    }
  }

  throw new Error('Authentication message missing timestamp');
};

// Build the 13-char hex suffix expected by backend (no 0x prefix)
const buildTimestampHex = (timestampMs) => {
  return BigInt(timestampMs).toString(16).padStart(13, '0');
};

const submitReservationCheckIn = async ({
  authEndpoint,
  reservationKey,
  labId,
  signer,
  puc = null,
  signTypedDataAsync,
  signature = null,
  timestamp = null,
}) => {
  if (!reservationKey && !labId) {
    throw new Error('Missing reservationKey or labId for check-in');
  }
  if (!signer) {
    throw new Error('Missing signer for check-in');
  }

  let resolvedSignature = signature;
  let resolvedTimestamp = timestamp;

  if (!resolvedSignature) {
    if (!signTypedDataAsync) {
      throw new Error('Missing signTypedDataAsync for check-in');
    }

    const messageUrl = buildCheckInMessageUrl(authEndpoint, reservationKey, labId, signer, puc);
    const checkInMessageResponse = await fetch(messageUrl, { method: "GET" });
    if (!checkInMessageResponse.ok) {
      throw new Error(`Failed to get check-in message. Status: ${checkInMessageResponse.status}`);
    }

    const messageData = await checkInMessageResponse.json();
    const typedData = messageData?.typedData;
    if (!typedData) {
      throw new Error('Check-in message missing typedData');
    }

    resolvedTimestamp = messageData?.timestamp ?? typedData?.message?.timestamp;
    if (!resolvedTimestamp) {
      throw new Error('Check-in message missing timestamp');
    }

    const resolvedReservationKey = messageData?.reservationKey ?? typedData?.message?.reservationKey ?? reservationKey;
    if (!resolvedReservationKey) {
      throw new Error('Check-in message missing reservationKey');
    }

    reservationKey = resolvedReservationKey;

    resolvedSignature = await signTypedDataAsync({
      domain: typedData.domain,
      types: normalizeTypedDataTypes(typedData.types),
      primaryType: typedData.primaryType,
      message: typedData.message,
    });
  }

  const checkInUrl = buildAuthUrl(authEndpoint, "checkin");
  const response = await fetch(checkInUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reservationKey,
      signer,
      signature: resolvedSignature,
      timestamp: resolvedTimestamp,
      puc: puc || undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`Check-in failed. Status: ${response.status}`);
  }

  return response.json();
};

export const authenticateLabAccess = async (
  authEndpoint,
  userWallet,
  labId,
  signMessageAsync,
  reservationKey = null,
  options = {},
) => {
  try {
    const { signTypedDataAsync, puc, skipCheckIn } = options || {};

    if (!skipCheckIn && (reservationKey || labId) && signTypedDataAsync) {
      await submitReservationCheckIn({
        authEndpoint,
        reservationKey,
        labId,
        signer: userWallet,
        puc,
        signTypedDataAsync,
      });
    } else if (!skipCheckIn && (reservationKey || labId) && !signTypedDataAsync) {
      devLog.log('INFO: Check-in skipped (signTypedDataAsync missing).');
    }

    // Step 1: Request message to sign from authentication service
    const messageUrl = buildAuthUrl(authEndpoint, "message");
    devLog.log('🔐 Requesting authentication message from:', messageUrl);
    
    const responseMessage = await fetch(messageUrl, {
      method: "GET",
    });

    if (!responseMessage.ok) {
      throw new Error(`Failed to get authentication message. Status: ${responseMessage.status}`);
    }

    const messageData = await responseMessage.json();
    const { message } = messageData;
    const timestampMs = extractTimestampMs(messageData);
    const timestampHex = buildTimestampHex(timestampMs);
    devLog.log('📝 Authentication message received, requesting signature...');

    // Step 2: Sign the message using the user's wallet (personal_sign)
    const signature = await signMessageAsync({ message });
    const fullSignature = `${signature}${timestampHex}`; // backend expects signature + timestampHex suffix
    devLog.log('✅ Message signed successfully');
    devLog.log('⏱️ Appended timestamp hex to signature for auth:', { timestampHex, timestampMs });

    // Step 3: Send authentication data to verify signature and get access token
    devLog.log('🔑 Verifying signature and requesting lab access token...');
    
    const auth2Payload = {
      wallet: userWallet,
      signature: fullSignature,
      labId: labId
    };
    
    // Include reservationKey if available for optimized validation
    if (reservationKey) {
      auth2Payload.reservationKey = reservationKey;
      devLog.log('📋 Including reservationKey in auth2:', reservationKey);
    }
    
    const auth2Url = buildAuthUrl(authEndpoint, "wallet-auth2");
    const responseAuth = await fetch(auth2Url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(auth2Payload),
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
    if (error.message.includes('Missing labId') || error.message.includes('Missing reservationKey')) {
      return 'Missing booking details for SSO access. Please try again.';
    } else if (error.message.includes('Institutional check-in failed')) {
      return 'Unable to record check-in. Please try again.';
    } else if (error.message.includes('SSO authentication failed')) {
      return 'Failed to authenticate with lab service. Please try again.';
    } else if (error.message.includes('Missing SSO session')) {
      return 'Please sign in with your institution and try again.';
    } else if (error.message.includes('Lab does not have a configured Lab Gateway')) {
      return 'This lab does not support SSO access. Please use wallet authentication.';
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
