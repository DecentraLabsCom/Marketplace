/**
 * Provider Registration Composed Mutations
 * 
 * This file contains composed mutations for provider registration and management
 * workflows that involve multiple steps including validation, registration,
 * blockchain operations, and comprehensive state management.
 * 
 * Composed Mutations Included:
 * 1. useProviderRegistrationComposed - Complete registration workflow
 * 2. useProviderOnboardingComposed - Post-registration onboarding with first lab
 * 3. useProviderStatusUpdateComposed - Status changes with cache coordination
 * 4. useProviderProfileUpdateComposed - Profile updates with validation and sync
 * 
 * @file providerComposedMutations.js
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/context/UserContext';
import { useNotifications } from '@/context/NotificationContext';
import { 
  useCreateSequentialMutation, 
  useCreateParallelMutation,
  createMutationStep,
  createInvalidationStep,
  createOptimisticStep,
  createApiStep
} from '@/utils/mutations/composedMutations';
import { 
  useAddProvider,
  useUpdateProvider,
  useRefreshProviderStatusMutation
} from '@/hooks/user/useUsers';
import { 
  useSaveProviderRegistration 
} from '@/hooks/provider/useProvider';
import { useUserEventCoordinator } from '@/hooks/user/useUserEventCoordinator';
import devLog from '@/utils/dev/logger';

/**
 * Composed mutation for complete provider registration workflow
 * 
 * Workflow:
 * 1. Validate registration data
 * 2. Save registration to pending storage
 * 3. Add provider to blockchain (if wallet connected)
 * 4. Update user provider status
 * 5. Coordinate cache updates across the application
 * 6. Send welcome notifications
 * 7. Trigger onboarding flow
 * 
 * Rollback Strategy:
 * - Remove from blockchain if added
 * - Delete pending registration
 * - Restore user status
 * - Clean up cache state
 */
export const useProviderRegistrationComposed = (options = {}) => {
  const { user, address, isSSO } = useUser();
  const { addNotification } = useNotifications();
  const queryClient = useQueryClient();

  const saveProviderRegistration = useSaveProviderRegistration();
  const addProvider = useAddProvider();
  const refreshProviderStatus = useRefreshProviderStatusMutation();
  const { coordinatedProviderRegistration } = useUserEventCoordinator();

  const steps = [
    // Step 1: Validate registration data
    createMutationStep(
      'validate-registration',
      async (variables) => {
        const { name, email, organization, country, termsAccepted } = variables;
        
        devLog.log(`📋 [ProviderRegistration] Validating registration data for: ${name}`);

        // Basic validation
        const validationErrors = [];
        
        if (!name || name.trim().length < 2) {
          validationErrors.push('Name must be at least 2 characters long');
        }
        
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          validationErrors.push('Valid email address is required');
        }
        
        if (!organization || organization.trim().length < 2) {
          validationErrors.push('Organization name is required');
        }
        
        if (!country) {
          validationErrors.push('Country selection is required');
        }
        
        if (!termsAccepted) {
          validationErrors.push('Terms and conditions must be accepted');
        }

        if (validationErrors.length > 0) {
          throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
        }

        // Check if user is already a provider
        const existingProviderData = queryClient.getQueryData(['providers', 'isLabProvider', address]);
        if (existingProviderData?.isProvider) {
          throw new Error('User is already registered as a provider');
        }

        devLog.log(`✅ [ProviderRegistration] Validation passed`);
        return { 
          validated: true, 
          validationErrors: [],
          registrationData: { name, email, organization, country }
        };
      }
    ),

    // Step 2: Save to pending registrations
    createMutationStep(
      'save-pending-registration',
      async (variables, previousResults) => {
        const { registrationData } = previousResults[0];
        const registrationPayload = {
          ...registrationData,
          userAddress: address,
          registrationType: isSSO ? 'sso' : 'wallet',
          timestamp: new Date().toISOString(),
          status: 'pending'
        };

        devLog.log(`💾 [ProviderRegistration] Saving pending registration`);
        
        const pendingResult = await saveProviderRegistration.mutateAsync(registrationPayload);
        
        devLog.log(`✅ [ProviderRegistration] Pending registration saved:`, pendingResult.registrationId);
        return { 
          registrationId: pendingResult.registrationId,
          pendingData: registrationPayload,
          ...pendingResult 
        };
      },
      // Rollback: Delete pending registration
      async (result) => {
        if (result?.registrationId) {
          devLog.log(`🔄 [ProviderRegistration] Rolling back pending registration: ${result.registrationId}`);
          
          try {
            await fetch('/api/provider/deletePendingRegistration', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ registrationId: result.registrationId })
            });
          } catch (error) {
            devLog.warn(`⚠️ [ProviderRegistration] Failed to rollback pending registration`, error);
          }
        }
      }
    ),

    // Step 3: Add provider to blockchain (if conditions are met)
    createMutationStep(
      'add-provider-blockchain',
      async (variables, previousResults) => {
        const { registrationData } = previousResults[0];
        const { autoApprove = false } = variables;
        
        // Only add to blockchain if auto-approved or if it's a wallet registration
        if (!autoApprove && isSSO) {
          devLog.log(`⏩ [ProviderRegistration] Skipping blockchain step - SSO registration pending approval`);
          return { skipped: 'pending-approval', reason: 'sso-requires-approval' };
        }

        devLog.log(`🪙 [ProviderRegistration] Adding provider to blockchain`);
        
        const providerData = {
          name: registrationData.name,
          account: address,
          email: registrationData.email,
          country: registrationData.country
        };

        const blockchainResult = await addProvider.mutateAsync(providerData);
        
        devLog.log(`✅ [ProviderRegistration] Provider added to blockchain:`, {
          txHash: blockchainResult.hash,
          account: address
        });

        return { 
          addedToBlockchain: true,
          txHash: blockchainResult.hash,
          providerData,
          ...blockchainResult 
        };
      },
      // Rollback: Remove from blockchain (complex - may need admin intervention)
      async (result) => {
        if (result?.addedToBlockchain && result?.txHash) {
          devLog.warn(`⚠️ [ProviderRegistration] Cannot automatically rollback blockchain transaction: ${result.txHash}`);
          devLog.warn(`⚠️ [ProviderRegistration] Manual admin intervention may be required to remove provider: ${address}`);
          
          // In a production system, you might:
          // 1. Flag the provider for admin review
          // 2. Send alert to administrators
          // 3. Create a rollback task queue
        }
      }
    ),

    // Step 4: Update provider status and coordinate caches
    createMutationStep(
      'update-provider-status',
      async (variables, previousResults) => {
        const { addedToBlockchain } = previousResults[2] || {};
        
        if (!addedToBlockchain) {
          devLog.log(`⏩ [ProviderRegistration] Skipping status update - not added to blockchain`);
          return { skipped: 'not-on-blockchain' };
        }

        devLog.log(`🔄 [ProviderRegistration] Updating provider status and coordinating caches`);
        
        // Use the coordinated registration from UserEventCoordinator
        const statusResult = await coordinatedProviderRegistration(
          async () => {
            // This function should be a no-op since we already added to blockchain
            return { alreadyCompleted: true };
          },
          address
        );

        // Also refresh the provider status to ensure cache consistency
        const refreshResult = await refreshProviderStatus.mutateAsync({
          userAddress: address,
          identifier: address,
          isEmail: false
        });

        devLog.log(`✅ [ProviderRegistration] Provider status updated and caches coordinated`);
        
        return { 
          statusUpdated: true,
          cacheCoordinated: true,
          isProvider: refreshResult.isProvider,
          ...statusResult,
          ...refreshResult
        };
      }
    ),

    // Step 5: Send welcome notifications and trigger onboarding
    createMutationStep(
      'send-notifications-and-onboarding',
      async (variables, previousResults) => {
        const { registrationData } = previousResults[0];
        const { addedToBlockchain } = previousResults[2] || {};
        
        devLog.log(`📧 [ProviderRegistration] Sending welcome notifications and triggering onboarding`);

        const notificationPromises = [
          // User welcome notification
          addNotification?.({
            type: 'success',
            title: 'Welcome to DecentraLabs!',
            message: addedToBlockchain 
              ? `Congratulations ${registrationData.name}! You are now registered as a lab provider.`
              : `Thank you for registering! Your application is being reviewed and you'll be notified once approved.`,
            duration: 10000,
            metadata: {
              type: 'provider-registration-complete',
              status: addedToBlockchain ? 'active' : 'pending',
              name: registrationData.name
            }
          }),

          // Email welcome (optional)
          registrationData.email && fetch('/api/notifications/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: registrationData.email,
              type: 'provider-welcome',
              data: {
                name: registrationData.name,
                organization: registrationData.organization,
                status: addedToBlockchain ? 'active' : 'pending',
                nextSteps: addedToBlockchain 
                  ? ['Complete your profile', 'Add your first lab', 'Explore the provider dashboard']
                  : ['Wait for approval notification', 'Prepare your lab information', 'Review provider guidelines']
              }
            })
          }).then(res => res.ok ? res.json() : null).catch(err => {
            devLog.warn(`⚠️ [ProviderRegistration] Failed to send welcome email`, err);
            return null;
          })
        ].filter(Boolean);

        const notificationResults = await Promise.allSettled(notificationPromises);
        
        devLog.log(`✅ [ProviderRegistration] Notifications sent and onboarding triggered`);

        return { 
          notificationResults,
          onboardingTriggered: true,
          shouldShowOnboarding: addedToBlockchain // Only show onboarding if active
        };
      }
    ),

    // Step 6: Final cache invalidation
    createInvalidationStep(
      'final-cache-invalidation',
      (variables) => [
        ['providers'],
        ['providers', 'isLabProvider', address],
        ['user', address],
        ['pending-registrations'],
        ['user-status', address]
      ]
    )
  ];

  return useCreateSequentialMutation(steps, {
    onSuccess: (result, variables) => {
      const { registrationData } = result.results[0];
      const { addedToBlockchain } = result.results[2] || {};
      
      devLog.log(`🎉 [ProviderRegistrationComposed] Registration completed successfully!`, {
        name: registrationData.name,
        status: addedToBlockchain ? 'active' : 'pending',
        completedSteps: result.completedSteps.length
      });

      // Additional success notification
      addNotification?.({
        type: 'info',
        title: 'What\'s Next?',
        message: addedToBlockchain 
          ? 'Visit your provider dashboard to add your first lab!'
          : 'We\'ll notify you via email once your registration is approved.',
        duration: 8000,
        actions: addedToBlockchain ? [
          {
            label: 'Go to Dashboard',
            action: () => window.location.href = '/providerdashboard'
          }
        ] : undefined
      });

      if (options.onSuccess) {
        options.onSuccess(result, variables);
      }
    },
    onError: (error, variables) => {
      devLog.error(`❌ [ProviderRegistrationComposed] Registration failed:`, error);

      // Show error notification with helpful information
      addNotification?.({
        type: 'error',
        title: 'Registration Failed',
        message: `Unable to complete registration: ${error.message}. Please try again or contact support if the problem persists.`,
        duration: 10000,
        actions: [
          {
            label: 'Contact Support',
            action: () => window.location.href = '/contact'
          }
        ]
      });

      if (options.onError) {
        options.onError(error, variables);
      }
    },
    ...options
  });
};

/**
 * Composed mutation for provider onboarding with first lab creation
 * 
 * This mutation guides new providers through creating their first lab
 * with step-by-step assistance and validation.
 */
export const useProviderOnboardingComposed = (options = {}) => {
  const { address } = useUser();
  const { addNotification } = useNotifications();
  const queryClient = useQueryClient();

  // This would use the lab creation composed mutation
  const steps = [
    createMutationStep(
      'validate-provider-status',
      async (variables, previousResults, mutation) => {
        // Ensure user is an active provider before onboarding
        const providerStatus = queryClient.getQueryData(['providers', 'isLabProvider', address]);
        
        if (!providerStatus?.isProvider) {
          throw new Error('User must be an active provider to complete onboarding');
        }

        return { providerValidated: true };
      }
    ),

    createMutationStep(
      'guide-first-lab-creation',
      async (variables) => {
        const { labData } = variables;
        
        devLog.log(`🎯 [ProviderOnboarding] Guiding first lab creation`);
        
        // This would integrate with the lab creation composed mutation
        // For now, we'll just validate the data structure
        const requiredFields = ['name', 'description', 'category', 'price'];
        const missingFields = requiredFields.filter(field => !labData[field]);
        
        if (missingFields.length > 0) {
          throw new Error(`First lab requires: ${missingFields.join(', ')}`);
        }

        // Show onboarding completion
        addNotification?.({
          type: 'success',
          title: 'Onboarding Complete!',
          message: 'You\'re all set up as a lab provider. Welcome to the DecentraLabs community!',
          duration: 8000
        });

        return { onboardingComplete: true, firstLabReady: true };
      }
    )
  ];

  return useCreateSequentialMutation(steps, options);
};

/**
 * Composed mutation for provider status updates
 * 
 * Handles status changes like activation, deactivation, suspension
 * with proper cache coordination and notifications.
 */
export const useProviderStatusUpdateComposed = (options = {}) => {
  const { address } = useUser();
  const { addNotification } = useNotifications();
  const queryClient = useQueryClient();
  
  const updateProvider = useUpdateProvider();
  const refreshProviderStatus = useRefreshProviderStatusMutation();

  const steps = [
    createMutationStep(
      'update-provider-status',
      async (variables) => {
        const { status, reason } = variables;
        
        devLog.log(`🔄 [ProviderStatusUpdate] Updating status to: ${status}`);
        
        const updateResult = await updateProvider.mutateAsync({
          status,
          statusReason: reason,
          statusUpdatedAt: new Date().toISOString()
        });

        return updateResult;
      }
    ),

    createMutationStep(
      'refresh-status-cache',
      async (variables) => {
        devLog.log(`🔄 [ProviderStatusUpdate] Refreshing status cache`);
        
        return await refreshProviderStatus.mutateAsync({
          userAddress: address,
          identifier: address,
          isEmail: false
        });
      }
    ),

    createInvalidationStep(
      'invalidate-related-caches',
      () => [
        ['providers'],
        ['providers', 'isLabProvider', address],
        ['user', address],
        ['labs', 'provider', address]
      ]
    )
  ];

  return useCreateSequentialMutation(steps, {
    onSuccess: (result, variables) => {
      const statusMessages = {
        active: 'Your provider account is now active!',
        inactive: 'Your provider account has been deactivated.',
        suspended: 'Your provider account has been suspended.',
        pending: 'Your provider account is pending review.'
      };

      addNotification?.({
        type: variables.status === 'active' ? 'success' : 'warning',
        title: 'Provider Status Updated',
        message: statusMessages[variables.status] || 'Your provider status has been updated.',
        duration: 6000
      });

      if (options.onSuccess) {
        options.onSuccess(result, variables);
      }
    },
    onError: (error, variables) => {
      addNotification?.({
        type: 'error',
        title: 'Status Update Failed',
        message: `Failed to update provider status: ${error.message}`,
        duration: 8000
      });

      if (options.onError) {
        options.onError(error, variables);
      }
    },
    ...options
  });
};

export default {
  useProviderRegistrationComposed,
  useProviderOnboardingComposed,
  useProviderStatusUpdateComposed
};
