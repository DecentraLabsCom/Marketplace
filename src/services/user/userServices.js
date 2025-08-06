/**
 * Unified User Services - Authentication-Aware Router
 * Routes to appropriate service layer based on user authentication type:
 * - Currently mainly read operations from serverUserServices
 * - Future: Can add client-side user operations if needed
 */

import { serverUserServices } from './serverUserServices'

// Re-export all operations from server services as unified userServices object
// User operations are mainly read-only and go through server
export const userServices = {
  fetchUserData: serverUserServices.fetchUserData,
  fetchAllUsersComposed: serverUserServices.fetchAllUsersComposed,
  fetchProviderBalance: serverUserServices.fetchProviderBalance,
  fetchProviderStatus: serverUserServices.fetchProviderStatus,
  fetchProviderStatusComposed: serverUserServices.fetchProviderStatusComposed
};
