/**
 * Environment-aware base URL utility
 * Automatically detects the correct base URL based on environment
 */

/**
 * Get the base URL for the current environment
 * @returns {string} The appropriate base URL
 */
export const getServerBaseUrl = () => {
  // Server environment - check NODE_ENV and deployment indicators
  const isDevelopment = process.env.NODE_ENV === 'development';
  const vercelUrl = String(process.env.VERCEL_URL || '').trim();
  const isLocalhost = process.env.HOSTNAME === 'localhost' || 
                     process.env.HOST === 'localhost' ||
                     !vercelUrl;
  
  // Priority order:
  // 1. Explicit server-side application URL
  const configuredBaseUrl = String(process.env.MARKETPLACE_BASE_URL || '').trim();
  if (configuredBaseUrl) {
    // Only use an explicit URL in development when it points to localhost.
    if (!isDevelopment || configuredBaseUrl.includes('localhost')) {
      return configuredBaseUrl.replace(/\/+$/, '');
    }
  }
  
  // 2. Development environment
  if (isDevelopment && isLocalhost) {
    return 'http://localhost:3000';
  }
  
  // 3. Vercel deployment
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  throw new Error(
    'Marketplace base URL is not configured. Set MARKETPLACE_BASE_URL or VERCEL_URL.',
  );
};

export const getBaseUrl = () => {
  // Browser environment - use current origin
  if (typeof window !== 'undefined') {
    const { protocol, host } = window.location;
    return `${protocol}//${host}`;
  }

  return getServerBaseUrl();
};

/**
 * Environment detection utilities
 */
export const envUtils = {
  isDevelopment: () => process.env.NODE_ENV === 'development',
  isProduction: () => process.env.NODE_ENV === 'production',
  isVercel: () => !!(process.env.VERCEL_URL || process.env.VERCEL),
  isLocalhost: () => {
    if (typeof window !== 'undefined') {
      return window.location.hostname === 'localhost' || 
             window.location.hostname === '127.0.0.1';
    }
    return process.env.HOSTNAME === 'localhost' || 
           process.env.HOST === 'localhost' ||
           !process.env.VERCEL_URL;
  }
};
