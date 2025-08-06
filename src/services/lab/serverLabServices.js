/**
 * Server Lab Services - Atomic and Composed
 * Handles API calls to server endpoints (server wallet transactions)
 * Used for SSO authenticated users
 * Follows dual-layer pattern: atomic services (1:1 with endpoints) + composed services (orchestrate multiple calls)
 */
import devLog from '@/utils/dev/logger'

export const serverLabServices = {
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
      devLog.log(`Fetching metadata for ${labId || 'lab'}`);
      
      // Use the metadata API for better handling of local vs remote files
      const apiUrl = `/api/metadata?uri=${encodeURIComponent(metadataUri)}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(apiUrl, { 
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
      return result.data || result;
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
      return result.data || result;
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
      return result.data || result;
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
      return result.data || result;
    } catch (error) {
      devLog.error('Error toggling lab status:', error);
      throw new Error(`Failed to toggle lab status: ${error.message}`);
    }
  },

  // ===== COMPOSED SERVICES (orchestrate multiple atomic calls) =====
  
  /**
   * Fetch all labs with complete details in a single orchestrated call
   * This service composes multiple atomic services with parallel execution
   * @returns {Promise<Array>} Array of fully composed lab objects
   * @throws {Error} When any required API call fails
   */
  async fetchAllLabsComposed() {
    try {
      devLog.log('🔄 Starting composed fetch for all labs with complete details');
      
      // Import helpers here to avoid circular dependencies
      const { composeLabObject, createProviderMap, createFallbackLab } = await import('@/utils/hooks/labHelpers');
      
      // Step 1: Get base data in parallel
      devLog.log('📡 Fetching base data (lab list, decimals, providers)...');
      const [labList, decimals, providers] = await Promise.all([
        labServices.fetchLabList().catch(error => {
          devLog.warn('Failed to fetch lab list, using empty array:', error);
          return [];
        }),
        labServices.fetchLabDecimals().catch(error => {
          devLog.warn('Failed to fetch decimals, using default 18:', error);
          return 18;
        }),
        labServices.fetchProvidersList().catch(error => {
          devLog.warn('Failed to fetch providers, using empty array:', error);
          return [];
        })
      ]);
      
      devLog.log(`✅ Base data fetched: ${labList.length} labs, ${decimals} decimals, ${providers.length} providers`);
      
      if (!labList || labList.length === 0) {
        devLog.log('⚠️ No labs found in list, returning empty array');
        return [];
      }
      
      // Step 2: Get lab details in parallel
      devLog.log('📡 Fetching lab details and owners...');
      const labDetailsPromises = labList.map(labId => 
        Promise.all([
          labServices.fetchLabData(labId),
          labServices.fetchLabOwner(labId),
        ]).catch(error => {
          devLog.warn(`Failed to fetch details for lab ${labId}:`, error);
          return [null, null]; // Return nulls for failed requests
        })
      );
      
      const labDetails = await Promise.all(labDetailsPromises);
      devLog.log(`✅ Lab details fetched for ${labDetails.length} labs`);
      
      // Step 3: Get metadata in parallel (only for labs with valid URIs)
      devLog.log('📡 Fetching metadata...');
      const metadataPromises = labDetails.map(([labData], index) => {
        const labId = labList[index];
        const uri = labData?.base?.uri || labData?.[1]?.[0];
        
        if (!uri) {
          devLog.warn(`No metadata URI found for lab ${labId}`);
          return Promise.resolve(null);
        }
        
        return labServices.fetchLabMetadata(uri, labId).catch(error => {
          devLog.warn(`Failed to fetch metadata for lab ${labId}:`, error);
          return null; // Return null for failed metadata requests
        });
      });
      
      const metadataResults = await Promise.all(metadataPromises);
      devLog.log(`✅ Metadata fetched for ${metadataResults.filter(Boolean).length}/${metadataResults.length} labs`);
      
      // Step 4: Compose final lab objects
      devLog.log('🔧 Composing final lab objects...');
      const providerMap = createProviderMap(providers);
      
      const composedLabs = labList.map((labId, index) => {
        const [labData, owner] = labDetails[index];
        const metadata = metadataResults[index];
        
        if (labData && owner && metadata) {
          // Full composition with all data
          return composeLabObject(labId, labData, owner, metadata, decimals, providerMap);
        } else {
          // Fallback composition for partial data
          const uri = labData?.base?.uri || labData?.[1]?.[0] || '';
          devLog.warn(`Creating fallback lab for ${labId} due to missing data - labData: ${!!labData}, owner: ${!!owner}, metadata: ${!!metadata}`);
          return createFallbackLab(labId, uri);
        }
      });
      
      const successCount = composedLabs.filter(lab => lab && !lab.isFallback).length;
      const fallbackCount = composedLabs.filter(lab => lab && lab.isFallback).length;
      
      devLog.log(`🎯 Composition complete: ${successCount} full labs, ${fallbackCount} fallback labs`);
      
      return composedLabs.filter(Boolean); // Remove any null/undefined labs
      
    } catch (error) {
      devLog.warn('❌ Error in fetchAllLabsComposed, returning empty array:', error);
      // Return empty array instead of throwing - this prevents React Query from marking as error
      return [];
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
  fetchAllLabsComposed,
  createLab,
  updateLab,
  deleteLab,
  toggleLabStatus
} = serverLabServices;
