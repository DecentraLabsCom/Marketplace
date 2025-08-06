/**
 * Unified Lab Services - Authentication-Aware Router
 * Routes to appropriate service layer based on user authentication type:
 * - SSO users → serverLabServices (API endpoints → server wallet)
 * - Wallet users → clientLabServices (direct contract calls → user wallet)
 */

import { serverLabServices } from './serverLabServices'
import { clientLabServices } from './clientLabServices'
import { devLog } from '@/utils/dev/logger'

/**
 * Create a lab with authentication-aware routing
 * @param {Object} labData - Lab data
 * @param {Object} authContext - Authentication context
 * @param {boolean} authContext.isSSO - Whether user is SSO authenticated
 * @param {Function} [authContext.contractWriteFunction] - Contract write function (wallet users)
 * @param {string} [authContext.userAddress] - User wallet address (wallet users)
 * @param {string} [authContext.userEmail] - User email (SSO users)
 * @returns {Promise<string|Object>} Transaction hash (wallet) or result object (SSO)
 */
export const createLab = async (labData, authContext) => {
  const { isSSO, contractWriteFunction, userAddress, userEmail } = authContext;

  devLog.log('🔀 [ROUTER] Creating lab via', isSSO ? 'server (SSO)' : 'client (wallet)');

  if (isSSO) {
    // SSO users → Server-side transaction via API
    const ssoLabData = { ...labData, userEmail };
    return await serverLabServices.createLab(ssoLabData);
  } else {
    // Wallet users → Client-side transaction via user's wallet
    if (!contractWriteFunction || !userAddress) {
      throw new Error('Contract write function and user address required for wallet users');
    }

    return await clientLabServices.createLab(
      labData,
      contractWriteFunction,
      userAddress
    );
  }
};

/**
 * Update a lab with authentication-aware routing
 * @param {Object} updateData - Update data including labId
 * @param {Object} authContext - Authentication context
 * @param {boolean} authContext.isSSO - Whether user is SSO authenticated
 * @param {Function} [authContext.contractWriteFunction] - Contract write function (wallet users)
 * @param {string} [authContext.userAddress] - User wallet address (wallet users)
 * @param {string} [authContext.userEmail] - User email (SSO users)
 * @returns {Promise<string|Object>} Transaction hash (wallet) or result object (SSO)
 */
export const updateLab = async (updateData, authContext) => {
  const { isSSO, contractWriteFunction, userAddress, userEmail } = authContext;

  devLog.log('🔀 [ROUTER] Updating lab via', isSSO ? 'server (SSO)' : 'client (wallet)');

  if (isSSO) {
    // SSO users → Server-side transaction via API
    const ssoUpdateData = { ...updateData, userEmail };
    return await serverLabServices.updateLab(ssoUpdateData);
  } else {
    // Wallet users → Client-side transaction via user's wallet
    if (!contractWriteFunction || !userAddress) {
      throw new Error('Contract write function and user address required for wallet users');
    }

    return await clientLabServices.updateLab(
      updateData,
      contractWriteFunction,
      userAddress
    );
  }
};

/**
 * Delete a lab with authentication-aware routing
 * @param {string|number} labId - Lab ID to delete
 * @param {Object} authContext - Authentication context
 * @param {boolean} authContext.isSSO - Whether user is SSO authenticated
 * @param {Function} [authContext.contractWriteFunction] - Contract write function (wallet users)
 * @param {string} [authContext.userAddress] - User wallet address (wallet users)
 * @param {string} [authContext.userEmail] - User email (SSO users)
 * @returns {Promise<string|Object>} Transaction hash (wallet) or result object (SSO)
 */
export const deleteLab = async (labId, authContext) => {
  const { isSSO, contractWriteFunction, userAddress, userEmail } = authContext;

  devLog.log('🔀 [ROUTER] Deleting lab via', isSSO ? 'server (SSO)' : 'client (wallet)');

  if (isSSO) {
    // SSO users → Server-side transaction via API
    return await serverLabServices.deleteLab(labId, userEmail);
  } else {
    // Wallet users → Client-side transaction via user's wallet
    if (!contractWriteFunction || !userAddress) {
      throw new Error('Contract write function and user address required for wallet users');
    }

    return await clientLabServices.deleteLab(
      labId,
      contractWriteFunction,
      userAddress
    );
  }
};

/**
 * Toggle lab status with authentication-aware routing
 * @param {Object} toggleData - Toggle data including labId and isListed
 * @param {Object} authContext - Authentication context
 * @param {boolean} authContext.isSSO - Whether user is SSO authenticated
 * @param {Function} [authContext.contractWriteFunction] - Contract write function (wallet users)
 * @param {string} [authContext.userAddress] - User wallet address (wallet users)
 * @param {string} [authContext.userEmail] - User email (SSO users)
 * @returns {Promise<string|Object>} Transaction hash (wallet) or result object (SSO)
 */
export const toggleLabStatus = async (toggleData, authContext) => {
  const { isSSO, contractWriteFunction, userAddress, userEmail } = authContext;

  devLog.log('🔀 [ROUTER] Toggling lab status via', isSSO ? 'server (SSO)' : 'client (wallet)');

  if (isSSO) {
    // SSO users → Server-side transaction via API
    const ssoToggleData = { ...toggleData, userEmail };
    return await serverLabServices.toggleLabStatus(ssoToggleData);
  } else {
    // Wallet users → Client-side transaction via user's wallet
    if (!contractWriteFunction || !userAddress) {
      throw new Error('Contract write function and user address required for wallet users');
    }

    return await clientLabServices.toggleLabStatus(
      toggleData,
      contractWriteFunction,
      userAddress
    );
  }
};

// Re-export all read operations from server services (same for both auth types)
export const {
  fetchLabList,
  fetchLabData,
  fetchLabOwner,
  fetchAllLabsComposed
} = serverLabServices;

export const labServices = {
  createLab,
  updateLab,
  deleteLab,
  toggleLabStatus,
  fetchLabList,
  fetchLabData,
  fetchLabOwner,
  fetchAllLabsComposed
};
