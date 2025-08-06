/**
 * Server User Services - Atomic and Composed
 * Handles API calls to server endpoints for user data
 * Used for both SSO and wallet authenticated users (read operations)
 * Follows dual-layer pattern: atomic services (1:1 with endpoints) + composed services (orchestrate multiple calls)
 */
import devLog from '@/utils/dev/logger'

export const serverUserServices = {
  // === ATOMIC SERVICES (1:1 with API endpoints) ===

  /**
   * Fetch user profile - placeholder for now
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<Object>} User profile data
   * @throws {Error} If userAddress is not provided or fetch fails
   */
  async fetchUserProfile(userAddress) {
    if (!userAddress) {
      throw new Error('User address is required');
    }

    try {
      devLog.log(`Fetching user profile for ${userAddress}`);
      
      // Placeholder - implement when user profile API is available
      const profile = {
        address: userAddress,
        name: null,
        email: null,
        createdAt: null,
      };
      
      devLog.log('Fetched user profile:', profile);
      return profile;
    } catch (error) {
      devLog.error('Error fetching user profile:', error);
      throw new Error(`Failed to fetch user profile: ${error.message}`);
    }
  },

  /**
   * Fetch user status/permissions - placeholder for now  
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<Object>} User status and permissions data
   * @throws {Error} If userAddress is not provided or fetch fails
   */
  async fetchUserStatus(userAddress) {
    if (!userAddress) {
      throw new Error('User address is required');
    }

    try {
      devLog.log(`Fetching user status for ${userAddress}`);
      
      // Placeholder - implement when user status API is available
      const status = {
        isProvider: false,
        permissions: [],
        isActive: true,
      };
      
      devLog.log('Fetched user status:', status);
      return status;
    } catch (error) {
      devLog.error('Error fetching user status:', error);
      throw new Error(`Failed to fetch user status: ${error.message}`);
    }
  },

  /**
   * Get providers list from contract
   */
  async fetchProvidersList() {
    try {
      devLog.log('🔍 Fetching providers list');
      
      const response = await fetch('/api/contract/provider/getProvidersList', {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      devLog.log(`✅ Successfully fetched ${Array.isArray(result) ? result.length : 0} providers`);
      
      // The endpoint returns the array directly, not wrapped in an object
      return Array.isArray(result) ? result : [];
    } catch (error) {
      devLog.error('Error fetching providers list:', error);
      throw new Error(`Failed to fetch providers list: ${error.message}`);
    }
  },

  /**
   * Get total provider count
   */
  async fetchProviderCount() {
    try {
      devLog.log('Fetching provider count');
      
      const response = await fetch('/api/contract/provider/getProviderCount', {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      devLog.log(`✅ Provider count: ${result.providerCount}`);
      
      return result.providerCount;
    } catch (error) {
      devLog.error('Error fetching provider count:', error);
      throw new Error(`Failed to fetch provider count: ${error.message}`);
    }
  },

  /**
   * Get provider details by ID
   */
  async fetchProviderById(providerId) {
    if (!providerId) {
      throw new Error('Provider ID is required');
    }

    try {
      devLog.log(`Fetching provider details for ID: ${providerId}`);
      
      const response = await fetch(`/api/contract/provider/getProvider?providerId=${providerId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null; // Provider not found
        }
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      devLog.log(`✅ Provider details:`, result.provider);
      
      return result.provider;
    } catch (error) {
      devLog.error('Error fetching provider details:', error);
      throw new Error(`Failed to fetch provider details: ${error.message}`);
    }
  },

  /**
   * Fetch provider status
   * @param {string} wallet - Wallet address to check
   * @returns {Promise<Object>} Provider status data
   */
  async fetchProviderStatus(wallet) {
    if (!wallet) {
      throw new Error('Wallet address is required');
    }

    try {
      devLog.log(`Fetching provider status for ${wallet}`);
      
      const response = await fetch(`/api/contract/provider/isLabProvider?wallet=${wallet}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 404) {
        return { isLabProvider: false };
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        devLog.warn(`Provider status API error for ${wallet}:`, errorData.error || response.status);
        
        // Return safe default instead of throwing
        return { isLabProvider: false };
      }

      const result = await response.json();
      const data = result.data || result;
      
      devLog.log('Provider status fetched:', data);
      
      return {
        isLabProvider: data.isLabProvider === true || data.isLabProvider === 'true' || data.isLabProvider === 1
      };
    } catch (error) {
      devLog.warn('Provider status fetch failed, using safe default:', error.message);
      
      // Return safe default instead of throwing
      return { isLabProvider: false };
    }
  },

  /**
   * Fetch provider name
   * @param {string} wallet - Wallet address to get the name for
   * @returns {Promise<string|null>} Provider name or null
   */
  async fetchProviderName(wallet) {
    if (!wallet) {
      throw new Error('Wallet address is required');
    }

    try {
      devLog.log(`Fetching provider name for ${wallet}`);
      
      const response = await fetch('/api/contract/provider/getLabProviderName', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wallet }),
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Provider name fetch failed: ${response.status}`);
      }

      const result = await response.json();
      const providerName = result.providerName || (result.data && result.data.name) || null;
      
      devLog.log('Provider name fetched:', providerName);
      
      return providerName;
    } catch (error) {
      devLog.error('Error fetching provider name:', error);
      throw new Error(`Failed to fetch provider name: ${error.message}`);
    }
  },

  // === COMPOSED SERVICES (orchestrate multiple atomic calls) ===

  /**
   * Fetch complete provider status and name
   * @param {string} wallet - Wallet address
   * @returns {Promise<Object>} Complete provider information
   */
  async fetchProviderStatusComposed(wallet) {
    if (!wallet) {
      return {
        isLabProvider: false,
        providerName: null
      };
    }

    try {
      devLog.log(`🔄 Starting composed fetch for provider status: ${wallet}...`);

      // First check if they're a provider
      const statusResult = await this.fetchProviderStatus(wallet);
      
      let providerName = null;
      
      // Only fetch name if they are a provider
      if (statusResult.isLabProvider) {
        try {
          providerName = await this.fetchProviderName(wallet);
        } catch (nameError) {
          devLog.warn('Could not fetch provider name:', nameError);
          // Continue without name - it's not critical
        }
      }

      const result = {
        isLabProvider: statusResult.isLabProvider,
        providerName: providerName
      };

      devLog.log('✅ Provider status composed fetch complete:', result);
      
      return result;
    } catch (error) {
      devLog.warn('Error in composed provider status fetch, using safe default:', error.message);
      
      // Return safe default instead of throwing
      return {
        isLabProvider: false,
        providerName: null
      };
    }
  },
};
