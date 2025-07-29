/**
 * User API Services
 * Follows dual-layer pattern: atomic services + composed services
 */
import devLog from '@/utils/dev/logger'

export const userServices = {
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
      devLog.log(`✅ Successfully fetched ${result.providers?.length || 0} providers`);
      
      return result.providers || [];
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
   * Check if address is a provider
   */
  async checkIsProvider(address) {
    if (!address) {
      throw new Error('Address is required');
    }

    try {
      devLog.log(`Checking if ${address} is a provider`);
      
      const response = await fetch(`/api/contract/provider/isLabProvider?address=${address}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      devLog.log(`✅ Is provider check: ${result.isProvider}`);
      
      return result.isProvider;
    } catch (error) {
      devLog.error('Error checking provider status:', error);
      throw new Error(`Failed to check provider status: ${error.message}`);
    }
  },

  // === COMPOSED SERVICES (orchestrate multiple atomic calls) ===

  /**
   * Fetch all provider-related data in a single composed call
   * Orchestrates multiple atomic services with parallel execution
   * @returns {Promise<Object>} Complete provider ecosystem data
   */
  async fetchAllProvidersComposed() {
    try {
      devLog.log('🔄 Starting composed fetch for all provider data...');

      // Execute all provider-related fetches in parallel
      const [providersList, providerCount] = await Promise.all([
        this.fetchProvidersList(),
        this.fetchProviderCount(),
      ]);

      devLog.log('✅ All provider data fetched successfully');

      return {
        providers: providersList,
        count: providerCount,
        lastUpdated: Date.now(),
      };
    } catch (error) {
      devLog.error('Error in composed provider fetch:', error);
      throw new Error(`Failed to fetch provider data: ${error.message}`);
    }
  },

  /**
   * Fetch complete user data including profile, status, and provider info
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<Object>} Complete user data
   */
  async fetchUserDataComposed(userAddress) {
    if (!userAddress) {
      throw new Error('User address is required');
    }

    try {
      devLog.log(`🔄 Starting composed fetch for user data: ${userAddress}...`);

      // Execute all user-related fetches in parallel
      const [profile, status, isProvider] = await Promise.all([
        this.fetchUserProfile(userAddress),
        this.fetchUserStatus(userAddress),
        this.checkIsProvider(userAddress),
      ]);

      devLog.log('✅ All user data fetched successfully');

      return {
        ...profile,
        ...status,
        isProvider,
        lastUpdated: Date.now(),
      };
    } catch (error) {
      devLog.error('Error in composed user fetch:', error);
      throw new Error(`Failed to fetch user data: ${error.message}`);
    }
  },
};
