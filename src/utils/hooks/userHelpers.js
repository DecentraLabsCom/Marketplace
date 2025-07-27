/**
 * User helper functions for composed operations
 * Contains complex logic that combines multiple atomic services
 * CLIENT-SIDE ONLY - Server-side logic should be in endpoint implementations
 */
import devLog from '@/utils/dev/logger'

export const userHelpers = {
  /**
   * Process reservation request by checking lab metadata and deciding approval/denial
   * Uses metadata API endpoint for both local and external URIs
   * @param {Object} params - Parameters object
   * @param {string} params.reservationKey - Reservation key
   * @param {string} params.labId - Lab ID
   * @param {number} params.start - Start timestamp
   * @param {number} params.end - End timestamp
   * @param {string} params.metadataUri - Lab metadata URI
   * @returns {Object} - { action: 'confirmed'|'denied', reason: string }
   */
  async processReservationRequest({ reservationKey, labId, start, end, metadataUri }) {
    if (!reservationKey || !labId || !start || !end || !metadataUri) {
      throw new Error('Missing required fields');
    }

    try {
      devLog.log(`Processing reservation request: ${reservationKey}`);

      // Fetch and parse metadata via API endpoint
      const metadata = await this.fetchLabMetadata(metadataUri);
      
      // Extract lab operating dates
      const { labOpens, labCloses } = this.extractLabOperatingDates(metadata);
      
      // Check if reservation is within allowed dates
      const reservationStart = parseInt(start);
      const reservationEnd = parseInt(end);
      
      if (reservationStart >= labOpens && reservationEnd <= labCloses) {
        return {
          action: 'confirmed',
          reason: 'Reservation within allowed dates'
        };
      } else {
        let reason = 'Reservation outside allowed dates';
        if (reservationStart < labOpens) {
          reason = 'Reservation starts before lab opens';
        } else if (reservationEnd > labCloses) {
          reason = 'Reservation ends after lab closes';
        }
        
        return {
          action: 'denied',
          reason: reason
        };
      }
    } catch (error) {
      devLog.error('Error processing reservation request:', error);
      throw error;
    }
  },

  /**
   * Fetch lab metadata via API endpoint (client-safe)
   * Handles both local and external metadata URIs
   * @param {string} metadataUri - Metadata URI
   * @returns {Object} - Parsed metadata
   */
  async fetchLabMetadata(metadataUri) {
    const response = await fetch(`/api/metadata?uri=${encodeURIComponent(metadataUri)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.statusText}`);
    }
    return await response.json();
  },

  /**
   * Extract lab operating dates from metadata
   * @param {Object} metadata - Lab metadata
   * @returns {Object} - { labOpens: timestamp, labCloses: timestamp }
   */
  extractLabOperatingDates(metadata) {
    if (!metadata.attributes || !Array.isArray(metadata.attributes)) {
      throw new Error('No attributes array found in metadata');
    }
    
    const opensAttr = metadata.attributes.find(attr => attr.trait_type === 'opens');
    const closesAttr = metadata.attributes.find(attr => attr.trait_type === 'closes');
    
    if (!opensAttr || !closesAttr) {
      throw new Error('Could not find opens/closes attributes in metadata');
    }
    
    const opensDate = new Date(opensAttr.value);
    const closesDate = new Date(closesAttr.value);
    
    if (isNaN(opensDate.getTime()) || isNaN(closesDate.getTime())) {
      throw new Error('Invalid date format in metadata');
    }
    
    const labOpens = Math.floor(opensDate.getTime() / 1000);
    const labCloses = Math.floor(closesDate.getTime() / 1000);
    
    return { labOpens, labCloses };
  },

  /**
   * Check if email is an SSO provider by searching through all providers
   * @param {string} email - Email to search for
   * @param {Function} getProviderCount - Function to get provider count
   * @param {Function} getProviderById - Function to get provider by ID
   * @returns {boolean} - True if email is found in providers
   */
  async checkSSOProvider(email, getProviderCount, getProviderById) {
    if (!email) {
      throw new Error('Email is required');
    }

    try {
      devLog.log(`Checking SSO provider status for email: ${email}`);
      
      // Get total provider count
      const providerCount = await getProviderCount();
      
      // Search through all providers
      for (let i = 1; i <= providerCount; i++) {
        try {
          const provider = await getProviderById(i);
          
          if (!provider) continue; // Skip if provider doesn't exist
          
          // Check if email matches (case insensitive)
          if (provider.email && provider.email.toLowerCase() === email.toLowerCase()) {
            devLog.log(`✅ Found SSO provider: ${email} (ID: ${i})`);
            return true;
          }
        } catch (error) {
          devLog.warn(`Failed to fetch provider ${i}:`, error.message);
          continue; // Skip this provider and continue
        }
      }
      
      devLog.log(`❌ Email not found in providers: ${email}`);
      return false;
    } catch (error) {
      devLog.error('Error checking SSO provider status:', error);
      throw error;
    }
  },

  /**
   * Get all providers (for admin/debugging purposes)
   * @param {Function} getProviderCount - Function to get provider count
   * @param {Function} getProviderById - Function to get provider by ID
   * @returns {Array} - Array of all providers
   */
  async getAllProviders(getProviderCount, getProviderById) {
    try {
      devLog.log('Fetching all providers');
      
      const providerCount = await getProviderCount();
      const providers = [];
      
      for (let i = 1; i <= providerCount; i++) {
        try {
          const provider = await getProviderById(i);
          if (provider) {
            providers.push(provider);
          }
        } catch (error) {
          devLog.warn(`Failed to fetch provider ${i}:`, error.message);
          continue; // Skip this provider
        }
      }
      
      devLog.log(`✅ Fetched ${providers.length} providers`);
      return providers;
    } catch (error) {
      devLog.error('Error fetching all providers:', error);
      throw error;
    }
  }
};
