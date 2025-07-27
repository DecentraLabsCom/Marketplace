/**
 * Retry utility function for handling transient failures
 * Attempts to execute a function with exponential backoff on failure
 * @param {Function} fn - Async function to retry
 * @param {number} [retries=3] - Maximum number of retry attempts
 * @param {number} [delay=200] - Base delay in milliseconds between attempts (increases exponentially)
 * @returns {Promise<any>} Result of the successful function execution
 * @throws {Error} Last error encountered if all retry attempts fail
 */
export default async function retry(fn, retries = 3, delay = 200) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1)));
    }
  }
}