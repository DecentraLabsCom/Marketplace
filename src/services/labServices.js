/**
 * Lab API Services - Atomic Operations Only
 * Handles individual API endpoint calls with consistent error handling
 * Optimized for React Query composition patterns
 */
import devLog from '@/utils/dev/logger'

export const labServices = {
  // ===== ATOMIC ENDPOINT SERVICES (1:1 with API endpoints) =====
  
  /**
   * Fetch basic lab list from contract
   * @returns {Promise<Array>} Array of basic lab information from the blockchain
   * @throws {Error} When API call fails
   */
  async fetchLabList() {
    try {
      devLog.log('Fetching basic lab list');
      
      const response = await fetch('/api/contract/lab/getLabList');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const labList = await response.json();
      devLog.log(`Fetched ${Array.isArray(labList) ? labList.length : 0} basic labs`);
      return Array.isArray(labList) ? labList : [];
    } catch (error) {
      devLog.error('Error fetching lab list:', error);
      throw new Error(`Failed to fetch lab list: ${error.message}`);
    }
  },

  /**
   * Fetch LAB token decimals
   * @returns {Promise<number>} Number of decimals for the LAB token
   * @throws {Error} When API call fails
   */
  async fetchLabDecimals() {
    try {
      devLog.log('Fetching LAB token decimals');
      
      const response = await fetch('/api/contract/lab/getLabDecimals');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      devLog.log(`LAB token decimals: ${result.decimals}`);
      return result.decimals;
    } catch (error) {
      devLog.error('Error fetching LAB decimals:', error);
      throw new Error(`Failed to fetch LAB decimals: ${error.message}`);
    }
  },

  /**
   * Fetch specific lab data from contract
   * @param {string|number} labId - The lab ID to fetch data for
   * @returns {Promise<Object>} Lab data from the blockchain
   * @throws {Error} When lab ID is missing or API call fails
   */
  async fetchLabData(labId) {
    if (!labId) {
      throw new Error('Lab ID is required');
    }

    try {
      devLog.log(`Fetching lab data for ${labId}`);
      
      const response = await fetch(`/api/contract/lab/getLabData?labId=${labId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const labData = await response.json();
      devLog.log(`Fetched lab data for ${labId}`);
      return labData;
    } catch (error) {
      devLog.error(`Error fetching lab ${labId} data:`, error);
      throw new Error(`Failed to fetch lab ${labId} data: ${error.message}`);
    }
  },

  /**
   * Fetch lab owner
   */
  async fetchLabOwner(labId) {
    if (!labId) {
      throw new Error('Lab ID is required');
    }

    try {
      devLog.log(`Fetching owner for lab ${labId}`);
      
      const response = await fetch(`/api/contract/lab/getLabOwner?labId=${labId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      devLog.log(`Fetched owner for lab ${labId}`);
      return result.owner;
    } catch (error) {
      devLog.error(`Error fetching lab ${labId} owner:`, error);
      throw new Error(`Failed to fetch lab ${labId} owner: ${error.message}`);
    }
  },

  /**
   * Fetch providers list
   */
  async fetchProvidersList() {
    try {
      devLog.log('Fetching providers list');
      
      const response = await fetch('/api/contract/provider/getProvidersList');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const providers = await response.json();
      devLog.log(`Fetched ${Array.isArray(providers) ? providers.length : 0} providers`);
      return Array.isArray(providers) ? providers : [];
    } catch (error) {
      devLog.error('Error fetching providers list:', error);
      throw new Error(`Failed to fetch providers list: ${error.message}`);
    }
  },

  /**
   * Fetch lab metadata from URI with optimized fallbacks
   */
  async fetchLabMetadata(metadataUri, labId = null) {
    if (!metadataUri) {
      throw new Error('Metadata URI is required');
    }

    try {
      devLog.log(`Fetching metadata from ${metadataUri.slice(0, 50)}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(metadataUri, { 
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const metadata = await response.json();
      devLog.log(`Fetched metadata for ${labId || 'lab'}`);
      return metadata;
    } catch (error) {
      devLog.warn(`Error fetching metadata for ${labId || 'lab'}:`, error.message);
      
      // Return fallback metadata
      return {
        name: labId ? `Lab ${labId}` : 'Unknown Lab',
        description: 'Metadata temporarily unavailable',
        image: null,
        attributes: []
      };
    }
  },

  // ===== MUTATIONS =====

  /**
   * Create lab
   */
  async createLab(labData) {
    try {
      devLog.log('Creating lab:', labData);
      
      const response = await fetch('/api/contract/lab/createLab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(labData)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      devLog.log('Lab created successfully:', result);
      return result;
    } catch (error) {
      devLog.error('Error creating lab:', error);
      throw new Error(`Failed to create lab: ${error.message}`);
    }
  },

  /**
   * Update lab
   */
  async updateLab(labId, labData) {
    try {
      devLog.log('Updating lab:', { labId, labData });
      
      const response = await fetch('/api/contract/lab/updateLab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labId, ...labData })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      devLog.log('Lab updated successfully:', result);
      return result;
    } catch (error) {
      devLog.error('Error updating lab:', error);
      throw new Error(`Failed to update lab: ${error.message}`);
    }
  },

  /**
   * Delete lab
   */
  async deleteLab(labId) {
    try {
      devLog.log('Deleting lab:', labId);
      
      const response = await fetch('/api/contract/lab/deleteLab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labId })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      devLog.log('Lab deleted successfully:', result);
      return result;
    } catch (error) {
      devLog.error('Error deleting lab:', error);
      throw new Error(`Failed to delete lab: ${error.message}`);
    }
  },

  /**
   * Toggle lab status (enable/disable)
   */
  async toggleLabStatus(labId, status) {
    try {
      devLog.log('Toggling lab status:', { labId, status });
      
      const response = await fetch('/api/contract/lab/toggleLabStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labId, status })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      devLog.log('Lab status toggled successfully:', result);
      return result;
    } catch (error) {
      devLog.error('Error toggling lab status:', error);
      throw new Error(`Failed to toggle lab status: ${error.message}`);
    }
  }
}

// Named exports for direct function access
export const {
  fetchLabList,
  fetchLabDecimals,
  fetchLabData,
  fetchLabOwner,
  fetchProvidersList,
  fetchLabMetadata,
  createLab,
  updateLab,
  deleteLab,
  toggleLabStatus
} = labServices;
