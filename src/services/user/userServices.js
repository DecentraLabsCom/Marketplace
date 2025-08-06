/**
 * Unified User Services - Authentication-Aware Router
 * Routes to appropriate service layer based on user authentication type:
 * - Currently mainly read operations from serverUserServices
 * - Future: Can add client-side user operations if needed
 */

import { serverUserServices } from './serverUserServices'
import { devLog } from '@/utils/dev/logger'

// Re-export all operations from server services
// User operations are mainly read-only and go through server
export const {
  fetchUserData,
  fetchAllUsersComposed,
  fetchProviderBalance,
  fetchProviderStatus
} = serverUserServices;

export const userServices = {
  fetchUserData,
  fetchAllUsersComposed,
  fetchProviderBalance,
  fetchProviderStatus
};
