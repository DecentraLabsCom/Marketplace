/**
 * Lab API Services
 * Handles all lab-related API operations
 */
import devLog from '@/utils/logger';

export const labServices = {
  /**
   * Fetch all labs using existing API endpoint
   */
  async fetchAllLabs() {
    try {
      devLog.log('Fetching all labs');
      
      const response = await fetch('/api/contract/lab/getAllLabs');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // The endpoint may return directly the array of labs, not an object
      const labs = await response.json();
      
      devLog.log(`Fetched ${Array.isArray(labs) ? labs.length : 0} labs`);
      return Array.isArray(labs) ? labs : [];
    } catch (error) {
      devLog.error('Error fetching all labs:', error);
      throw new Error(`Failed to fetch labs: ${error.message}`);
    }
  },

  /**
   * Fetch lab details by ID - derived from getAllLabs for now
   */
  async fetchLabById(labId) {
    if (!labId) {
      throw new Error('Lab ID is required');
    }

    try {
      devLog.log(`Fetching lab details for ${labId}`);
      
      // For now, we get all labs and filter by ID
      // This can be optimized later with a specific endpoint
      const allLabs = await this.fetchAllLabs();
      const lab = allLabs.find(l => l.id === labId || l.id === labId.toString());
      
      if (!lab) {
        throw new Error(`Lab with ID ${labId} not found`);
      }
      
      devLog.log('Fetched lab details:', lab);
      return lab;
    } catch (error) {
      devLog.error('Error fetching lab details:', error);
      throw new Error(`Failed to fetch lab details: ${error.message}`);
    }
  },

  /**
   * Fetch labs by provider - derived from getAllLabs for now
   */
  async fetchLabsByProvider(providerId) {
    if (!providerId) {
      throw new Error('Provider ID is required');
    }

    try {
      devLog.log(`Fetching labs for provider ${providerId}`);
      
      // For now, we get all labs and filter by provider
      const allLabs = await this.fetchAllLabs();
      const labs = allLabs.filter(lab => lab.provider === providerId);
      
      devLog.log(`Fetched ${labs.length} labs for provider`);
      return labs;
    } catch (error) {
      devLog.error('Error fetching labs by provider:', error);
      throw new Error(`Failed to fetch labs by provider: ${error.message}`);
    }
  },

  /**
   * Create a new lab
   */
  async createLab(labData) {
    try {
      devLog.log('Creating lab:', labData);
      
      const response = await fetch('/api/contract/lab/create', {
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
   * Update an existing lab
   */
  async updateLab(labId, labData) {
    try {
      devLog.log(`Updating lab ${labId}:`, labData);
      
      const response = await fetch(`/api/contract/lab/update`, {
        method: 'PUT',
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
   * Delete a lab
   */
  async deleteLab(labId) {
    try {
      devLog.log(`Deleting lab ${labId}`);
      
      const response = await fetch(`/api/contract/lab/delete`, {
        method: 'DELETE',
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
   * Toggle lab listing status
   */
  async toggleLabStatus(labId, isListed) {
    try {
      devLog.log(`Toggling lab ${labId} status to:`, isListed);
      
      const endpoint = isListed ? 'list' : 'unlist';
      const response = await fetch(`/api/contract/lab/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labId })
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
  },
};
