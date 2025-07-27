/**
 * Retry utility function for handling transient failures
 * Attempts to execute a function with exponential backoff on failure
 * 
 * @description Use ONLY for read operations and network-level errors
 * @warning NEVER use for blockchain transactions - risk of duplicate transactions
 * 
 * @param {Function} fn - Async function to retry
 * @param {Object} [options] - Retry configuration
 * @param {number} [options.maxRetries=3] - Maximum number of retry attempts
 * @param {number} [options.baseDelay=200] - Base delay in milliseconds
 * @param {number} [options.backoffFactor=2] - Exponential backoff multiplier
 * @param {string[]} [options.retryableErrors] - Error messages that should trigger retry
 * @returns {Promise<any>} Result of the successful function execution
 * @throws {Error} Last error encountered if all retry attempts fail
 */
export default async function retry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 200,
    backoffFactor = 2,
    retryableErrors = ['timeout', 'network', 'rate limit', 'connection', 'ECONNRESET', 'ETIMEDOUT']
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      const isRetryable = retryableErrors.some(retryableError => 
        error.message?.toLowerCase().includes(retryableError.toLowerCase())
      );
      
      // Don't retry on last attempt or non-retryable errors
      if (attempt === maxRetries || !isRetryable) {
        break;
      }
      
      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(backoffFactor, attempt);
      
      console.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms. Error: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Safe retry specifically for blockchain read operations
 * Includes blockchain-specific retryable error patterns
 */
export async function retryBlockchainRead(fn, options = {}) {
  const blockchainRetryableErrors = [
    'timeout', 'network', 'rate limit', 'connection', 'ECONNRESET', 'ETIMEDOUT',
    'insufficient funds for intrinsic transaction cost', // Gas estimation issues
    'nonce too low', 'replacement transaction underpriced', // Nonce issues
    'server is overloaded', 'too many requests', // Rate limiting
    'execution reverted', // Temporary contract state issues
  ];
  
  return retry(fn, {
    maxRetries: 3,
    baseDelay: 1000,
    backoffFactor: 2,
    retryableErrors: blockchainRetryableErrors,
    ...options
  });
}

/**
 * NO RETRY for blockchain transactions
 * Returns immediately on any error to prevent duplicate transactions
 */
export async function executeBlockchainTransaction(fn) {
  try {
    return await fn();
  } catch (error) {
    // Log the error but don't retry
    console.error('Blockchain transaction failed (no retry):', error.message);
    throw error;
  }
}