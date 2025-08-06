/**
 * Client-side lab contract services
 * Handles direct blockchain interactions using user's connected wallet
 * These services execute transactions from the frontend, not through API
 */
import { devLog } from '@/utils/dev/logger'

/**
 * Create a lab using user's wallet
 * @param {Object} labData - Lab data
 * @param {string} labData.uri - Lab metadata URI
 * @param {string} labData.price - Lab price per second in token units
 * @param {string} labData.auth - Authentication method
 * @param {string} labData.accessURI - Lab access URI
 * @param {string} labData.accessKey - Lab access key
 * @param {Function} contractWriteFunction - Contract write function from useContractWriteFunction
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<string>} Transaction hash
 */
export const createLab = async (labData, contractWriteFunction, userAddress) => {
  if (!labData) {
    throw new Error('Lab data is required');
  }

  if (!contractWriteFunction) {
    throw new Error('Contract write function is required');
  }

  if (!userAddress) {
    throw new Error('User address is required');
  }

  const { uri, price, auth, accessURI, accessKey } = labData;

  // Validate required lab data
  if (!uri) {
    throw new Error('Lab URI is required');
  }

  if (!price) {
    throw new Error('Lab price is required');
  }

  if (!auth) {
    throw new Error('Authentication method is required');
  }

  if (!accessURI) {
    throw new Error('Access URI is required');
  }

  if (!accessKey) {
    throw new Error('Access key is required');
  }

  try {
    devLog.log('🚀 [CLIENT] Creating lab with wallet:', {
      uri,
      price,
      auth,
      accessURI,
      userAddress
    });

    // Call the contract function through the provided contractWriteFunction
    const txHash = await contractWriteFunction([
      uri,        // Lab metadata URI
      price,      // Price per second in token units
      auth,       // Authentication method
      accessURI,  // Lab access URI
      accessKey   // Lab access key
    ]);

    devLog.log('✅ [CLIENT] Lab creation transaction sent:', {
      txHash,
      uri
    });

    return txHash;
    
  } catch (error) {
    devLog.error(`❌ [CLIENT] Lab creation failed:`, error);
    
    // Enhance error messages for common issues
    if (error.message?.includes('user rejected')) {
      throw new Error('Transaction was cancelled by user');
    } else if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient funds for gas fees');
    } else if (error.message?.includes('URI already exists')) {
      throw new Error('Lab with this URI already exists');
    } else {
      throw new Error(`Failed to create lab: ${error.message}`);
    }
  }
};

/**
 * Update a lab using user's wallet
 * @param {Object} updateData - Update data
 * @param {string|number} updateData.labId - Lab ID to update
 * @param {string} updateData.uri - Lab metadata URI
 * @param {string} updateData.price - Lab price per second in token units
 * @param {string} updateData.auth - Authentication method
 * @param {string} updateData.accessURI - Lab access URI
 * @param {string} updateData.accessKey - Lab access key
 * @param {Function} contractWriteFunction - Contract write function from useContractWriteFunction
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<string>} Transaction hash
 */
export const updateLab = async (updateData, contractWriteFunction, userAddress) => {
  if (!updateData) {
    throw new Error('Update data is required');
  }

  if (!contractWriteFunction) {
    throw new Error('Contract write function is required');
  }

  if (!userAddress) {
    throw new Error('User address is required');
  }

  const { labId, uri, price, auth, accessURI, accessKey } = updateData;

  // Validate required update data
  if (labId === undefined || labId === null) {
    throw new Error('Lab ID is required');
  }

  if (!uri) {
    throw new Error('Lab URI is required');
  }

  if (!price) {
    throw new Error('Lab price is required');
  }

  if (!auth) {
    throw new Error('Authentication method is required');
  }

  if (!accessURI) {
    throw new Error('Access URI is required');
  }

  if (!accessKey) {
    throw new Error('Access key is required');
  }

  try {
    devLog.log('🚀 [CLIENT] Updating lab with wallet:', {
      labId: labId.toString(),
      uri,
      price,
      auth,
      accessURI,
      userAddress
    });

    // Call the contract function through the provided contractWriteFunction
    const txHash = await contractWriteFunction([
      labId,      // Lab ID to update
      uri,        // Lab metadata URI
      price,      // Price per second in token units
      auth,       // Authentication method
      accessURI,  // Lab access URI
      accessKey   // Lab access key
    ]);

    devLog.log('✅ [CLIENT] Lab update transaction sent:', {
      txHash,
      labId: labId.toString()
    });

    return txHash;
    
  } catch (error) {
    devLog.error(`❌ [CLIENT] Lab update failed:`, error);
    
    // Enhance error messages for common issues
    if (error.message?.includes('user rejected')) {
      throw new Error('Transaction was cancelled by user');
    } else if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient funds for gas fees');
    } else if (error.message?.includes('Only owner')) {
      throw new Error('Only the lab owner can update this lab');
    } else if (error.message?.includes('Lab not found')) {
      throw new Error('Lab not found');
    } else {
      throw new Error(`Failed to update lab: ${error.message}`);
    }
  }
};

/**
 * Delete a lab using user's wallet
 * @param {string|number} labId - Lab ID to delete
 * @param {Function} contractWriteFunction - Contract write function from useContractWriteFunction
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<string>} Transaction hash
 */
export const deleteLab = async (labId, contractWriteFunction, userAddress) => {
  if (labId === undefined || labId === null) {
    throw new Error('Lab ID is required');
  }

  if (!contractWriteFunction) {
    throw new Error('Contract write function is required');
  }

  if (!userAddress) {
    throw new Error('User address is required');
  }

  try {
    devLog.log('🚀 [CLIENT] Deleting lab with wallet:', {
      labId: labId.toString(),
      userAddress
    });

    // Call the contract function through the provided contractWriteFunction
    const txHash = await contractWriteFunction([labId]);

    devLog.log('✅ [CLIENT] Lab deletion transaction sent:', {
      txHash,
      labId: labId.toString()
    });

    return txHash;
    
  } catch (error) {
    devLog.error(`❌ [CLIENT] Lab deletion failed:`, error);
    
    // Enhance error messages for common issues
    if (error.message?.includes('user rejected')) {
      throw new Error('Transaction was cancelled by user');
    } else if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient funds for gas fees');
    } else if (error.message?.includes('Only owner')) {
      throw new Error('Only the lab owner can delete this lab');
    } else if (error.message?.includes('Lab not found')) {
      throw new Error('Lab not found');
    } else if (error.message?.includes('Lab has active reservations')) {
      throw new Error('Cannot delete lab with active reservations');
    } else {
      throw new Error(`Failed to delete lab: ${error.message}`);
    }
  }
};

/**
 * Toggle lab listing status using user's wallet
 * @param {Object} toggleData - Toggle data
 * @param {string|number} toggleData.labId - Lab ID to toggle
 * @param {boolean} toggleData.isListed - Whether to list (true) or unlist (false) the lab
 * @param {Function} contractWriteFunction - Contract write function from useContractWriteFunction
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<string>} Transaction hash
 */
export const toggleLabStatus = async (toggleData, contractWriteFunction, userAddress) => {
  if (!toggleData) {
    throw new Error('Toggle data is required');
  }

  if (!contractWriteFunction) {
    throw new Error('Contract write function is required');
  }

  if (!userAddress) {
    throw new Error('User address is required');
  }

  const { labId, isListed } = toggleData;

  // Validate required toggle data
  if (labId === undefined || labId === null) {
    throw new Error('Lab ID is required');
  }

  if (typeof isListed !== 'boolean') {
    throw new Error('isListed must be a boolean');
  }

  try {
    const action = isListed ? 'listing' : 'unlisting';
    devLog.log(`🚀 [CLIENT] ${action} lab with wallet:`, {
      labId: labId.toString(),
      isListed,
      userAddress
    });

    // Call the contract function through the provided contractWriteFunction
    const txHash = await contractWriteFunction([labId]);

    devLog.log(`✅ [CLIENT] Lab ${action} transaction sent:`, {
      txHash,
      labId: labId.toString()
    });

    return txHash;
    
  } catch (error) {
    devLog.error(`❌ [CLIENT] Lab status toggle failed:`, error);
    
    // Enhance error messages for common issues
    if (error.message?.includes('user rejected')) {
      throw new Error('Transaction was cancelled by user');
    } else if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient funds for gas fees');
    } else if (error.message?.includes('Only owner')) {
      throw new Error('Only the lab owner can change the listing status');
    } else if (error.message?.includes('Lab not found')) {
      throw new Error('Lab not found');
    } else {
      throw new Error(`Failed to change lab status: ${error.message}`);
    }
  }
};

export const clientLabServices = {
  createLab,
  updateLab,
  deleteLab,
  toggleLabStatus
};
