/**
 * User API Services
 * Handles all user-related API operations
 */
import devLog from '@/utils/dev/logger'

export const userServices = {
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

  // === PROVIDER SERVICES ===

  /**
   * Get total provider count
   */
  async getProviderCount() {
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
  async getProviderById(providerId) {
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
};
