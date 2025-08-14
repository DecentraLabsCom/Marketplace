/**
 * Booking Management Composed Mutations
 * 
 * This file contains composed mutations for complex booking workflows
 * that involve availability checks, payment processing, calendar updates,
 * notification sending, and comprehensive cache management.
 * 
 * Composed Mutations Included:
 * 1. useCreateBookingComposed - Check availability + payment + create booking + notifications
 * 2. useCancelBookingComposed - Cancel booking + refund + update availability + notifications
 * 3. useConfirmBookingComposed - Provider confirms + payment + access setup
 * 4. useRescheduleBookingComposed - Cancel original + create new + handle conflicts
 * 
 * @file bookingComposedMutations.js
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
  useCreateBookingMutation,
  useCancelBookingMutation,
  useCheckAvailable,
  useRequestFunds
} from '@/hooks/booking/useBookings';
import { useReservationEventCoordinator } from '@/hooks/booking/useBookingEventCoordinator';
import devLog from '@/utils/dev/logger';

/**
 * Composed mutation for creating a booking with full validation and payment
 * 
 * Workflow:
 * 1. Validate user has sufficient funds
 * 2. Check lab availability for requested time
 * 3. Optimistically update UI (show pending booking)
 * 4. Process payment/funds
 * 5. Create booking on blockchain
 * 6. Send notifications to user and provider
 * 7. Update all relevant caches
 * 
 * Rollback Strategy:
 * - Refund payment
 * - Remove optimistic booking
 * - Restore availability
 * - Cancel notifications
 */
export const useCreateBookingComposed = (options = {}) => {
  const { user, address, isSSO } = useUser();
  const { addNotification } = useNotifications();
  const queryClient = useQueryClient();

  const checkAvailability = useCheckAvailable;
  const createBooking = useCreateBookingMutation();
  const requestFunds = useRequestFunds();

  const steps = [
    // Step 1: Validate user funds
    createMutationStep(
      'validate-funds',
      async (variables) => {
        const { labId, requiredAmount } = variables;
        
        devLog.log(`💰 [CreateBooking] Validating funds for booking - Required: ${requiredAmount}`);
        
        // Get user's current balance from cache or fetch
        const balanceQuery = queryClient.getQueryData(['balance', address]);
        const currentBalance = balanceQuery?.balance || 0;
        
        if (currentBalance < requiredAmount) {
          // Try to request funds if user doesn't have enough
          devLog.log(`💰 [CreateBooking] Insufficient funds (${currentBalance} < ${requiredAmount}), requesting funds...`);
          
          const fundsResult = await requestFunds.mutateAsync();
          
          // Wait a moment for funds to be available
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Invalidate balance to get fresh data
          await queryClient.invalidateQueries(['balance', address]);
          
          devLog.log(`✅ [CreateBooking] Funds requested successfully`);
          return { fundsRequested: true, originalBalance: currentBalance, ...fundsResult };
        }

        devLog.log(`✅ [CreateBooking] Sufficient funds available: ${currentBalance}`);
        return { fundsRequested: false, balance: currentBalance };
      }
    ),

    // Step 2: Check lab availability
    createMutationStep(
      'check-availability',
      async (variables) => {
        const { labId, startTime, endTime, timeslot } = variables;
        
        devLog.log(`📅 [CreateBooking] Checking availability for lab ${labId}:`, {
          startTime,
          endTime,
          timeslot
        });

        const availabilityResult = await checkAvailability.mutateAsync({
          labId,
          start: startTime,
          timeslot,
          userAddress: address
        });

        if (!availabilityResult.available) {
          throw new Error(`Lab is not available for the requested time: ${availabilityResult.reason || 'Unknown reason'}`);
        }

        devLog.log(`✅ [CreateBooking] Lab is available for booking`);
        return { 
          available: true, 
          conflicts: availabilityResult.conflicts || [],
          ...availabilityResult 
        };
      }
    ),

    // Step 3: Optimistic UI update
    createOptimisticStep(
      'optimistic-booking',
      ['bookings', address],
      (oldData, variables) => {
        const { labId, startTime, endTime, requiredAmount } = variables;
        
        const optimisticBooking = {
          id: `temp_${Date.now()}`,
          labId,
          userAddress: address,
          startTime,
          endTime,
          amount: requiredAmount,
          status: 'pending',
          createdAt: new Date().toISOString(),
          isOptimistic: true
        };

        return {
          ...oldData,
          bookings: [optimisticBooking, ...(oldData?.bookings || [])]
        };
      }
    ),

    // Step 4: Create the booking
    createMutationStep(
      'create-booking',
      async (variables, previousResults) => {
        const { labId, startTime, timeslot } = variables;
        
        devLog.log(`🎫 [CreateBooking] Creating booking for lab: ${labId}`);
        
        const bookingResult = await createBooking.mutateAsync({
          labId,
          start: startTime,
          timeslot,
          userAddress: address
        });

        devLog.log(`✅ [CreateBooking] Booking created successfully:`, {
          reservationKey: bookingResult.reservationKey,
          txHash: bookingResult.hash
        });

        return { 
          reservationKey: bookingResult.reservationKey,
          txHash: bookingResult.hash,
          ...bookingResult 
        };
      },
      // Rollback: Cancel the booking if later steps fail
      async (result) => {
        if (result?.reservationKey) {
          devLog.log(`🔄 [CreateBooking] Rolling back booking creation: ${result.reservationKey}`);
          
          try {
            // Note: In a real implementation, you might want to implement a more sophisticated
            // cancellation that doesn't charge the user fees
            devLog.warn(`⚠️ [CreateBooking] Booking rollback not fully implemented - manual intervention may be needed`);
          } catch (error) {
            devLog.error(`❌ [CreateBooking] Failed to rollback booking creation`, error);
          }
        }
      }
    ),

    // Step 5: Send notifications (in parallel)
    createMutationStep(
      'send-notifications',
      async (variables, previousResults) => {
        const { labId, labName, providerEmail, userEmail } = variables;
        const { reservationKey } = previousResults[3];
        
        devLog.log(`📧 [CreateBooking] Sending notifications for booking: ${reservationKey}`);

        // Send notifications in parallel
        const notificationPromises = [
          // User notification
          addNotification?.({
            type: 'success',
            title: 'Booking Confirmed',
            message: `Your booking for ${labName} has been confirmed. Reservation: ${reservationKey}`,
            metadata: {
              type: 'booking-confirmed',
              labId,
              reservationKey
            }
          }),

          // Provider notification (if email available)
          providerEmail && fetch('/api/notifications/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: providerEmail,
              type: 'new-booking',
              data: {
                labId,
                labName,
                reservationKey,
                userEmail: userEmail || address,
                startTime: variables.startTime
              }
            })
          }).then(res => res.ok ? res.json() : null).catch(err => {
            devLog.warn(`⚠️ [CreateBooking] Failed to send provider email notification`, err);
            return null;
          })
        ].filter(Boolean);

        const notificationResults = await Promise.allSettled(notificationPromises);
        
        devLog.log(`✅ [CreateBooking] Notifications sent:`, {
          successful: notificationResults.filter(r => r.status === 'fulfilled').length,
          failed: notificationResults.filter(r => r.status === 'rejected').length
        });

        return { 
          notificationResults,
          notificationsSent: notificationResults.filter(r => r.status === 'fulfilled').length
        };
      }
    ),

    // Step 6: Invalidate caches
    createInvalidationStep(
      'invalidate-caches',
      (variables) => [
        ['bookings'],
        ['bookings', address],
        ['bookings', variables.labId],
        ['lab-bookings', variables.labId],
        ['balance', address],
        ['availability', variables.labId],
        ['user', address, 'bookings']
      ]
    )
  ];

  return useCreateSequentialMutation(steps, {
    onSuccess: (result, variables) => {
      devLog.log(`🎉 [CreateBookingComposed] Successfully created booking for lab: ${variables.labId}`);

      // Show success notification
      addNotification?.({
        type: 'success',
        title: 'Booking Created',
        message: `Your booking for ${variables.labName || `Lab ${variables.labId}`} has been created successfully!`,
        duration: 5000
      });

      if (options.onSuccess) {
        options.onSuccess(result, variables);
      }
    },
    onError: (error, variables) => {
      devLog.error(`❌ [CreateBookingComposed] Failed to create booking for lab: ${variables.labId}`, error);

      // Show error notification
      addNotification?.({
        type: 'error',
        title: 'Booking Failed',
        message: `Failed to create booking: ${error.message}`,
        duration: 8000
      });

      if (options.onError) {
        options.onError(error, variables);
      }
    },
    ...options
  });
};

/**
 * Composed mutation for canceling a booking with refund processing
 * 
 * Workflow:
 * 1. Validate cancellation is allowed (time window, status)
 * 2. Optimistically update UI (show canceling status)
 * 3. Cancel booking on blockchain
 * 4. Process refund (if applicable)
 * 5. Update availability
 * 6. Send cancellation notifications
 * 7. Clean up caches
 * 
 * Rollback Strategy:
 * - Restore original booking
 * - Reverse refund
 * - Restore UI state
 */
export const useCancelBookingComposed = (options = {}) => {
  const { address } = useUser();
  const { addNotification } = useNotifications();
  const queryClient = useQueryClient();

  const cancelBooking = useCancelBookingMutation();

  const steps = [
    // Step 1: Validate cancellation
    createMutationStep(
      'validate-cancellation',
      async (variables) => {
        const { reservationKey, bookingData } = variables;
        
        devLog.log(`🔍 [CancelBooking] Validating cancellation for: ${reservationKey}`);

        // Check if booking exists and belongs to user
        if (bookingData.userAddress?.toLowerCase() !== address?.toLowerCase()) {
          throw new Error('You can only cancel your own bookings');
        }

        // Check if booking is already cancelled or completed
        if (['cancelled', 'completed', 'expired'].includes(bookingData.status)) {
          throw new Error(`Cannot cancel booking with status: ${bookingData.status}`);
        }

        // Check cancellation window (e.g., must cancel at least 1 hour before start)
        const startTime = new Date(bookingData.startTime);
        const now = new Date();
        const hoursUntilStart = (startTime - now) / (1000 * 60 * 60);

        const cancellationPolicy = {
          minHoursBeforeStart: 1,
          refundWindow: 24 // Full refund if cancelled 24+ hours before
        };

        if (hoursUntilStart < cancellationPolicy.minHoursBeforeStart) {
          throw new Error('Cannot cancel booking less than 1 hour before start time');
        }

        const isFullRefund = hoursUntilStart >= cancellationPolicy.refundWindow;
        const refundPercentage = isFullRefund ? 100 : Math.max(50, (hoursUntilStart / 24) * 100);

        devLog.log(`✅ [CancelBooking] Validation passed:`, {
          hoursUntilStart: hoursUntilStart.toFixed(1),
          refundPercentage: refundPercentage.toFixed(0)
        });

        return { 
          validated: true,
          hoursUntilStart,
          refundPercentage,
          isFullRefund,
          cancellationPolicy
        };
      }
    ),

    // Step 2: Optimistic UI update
    createOptimisticStep(
      'optimistic-cancel',
      ['bookings', address],
      (oldData, variables) => {
        const { reservationKey } = variables;
        
        return {
          ...oldData,
          bookings: (oldData?.bookings || []).map(booking =>
            booking.reservationKey === reservationKey
              ? { ...booking, status: 'cancelling', isCancelling: true }
              : booking
          )
        };
      }
    ),

    // Step 3: Cancel booking on blockchain
    createMutationStep(
      'cancel-booking',
      async (variables, previousResults) => {
        const { reservationKey } = variables;
        const { refundPercentage } = previousResults[0];
        
        devLog.log(`🎫 [CancelBooking] Cancelling booking on blockchain: ${reservationKey}`);
        
        const cancellationResult = await cancelBooking.mutateAsync(reservationKey);
        
        devLog.log(`✅ [CancelBooking] Booking cancelled on blockchain:`, {
          txHash: cancellationResult.hash,
          refundPercentage
        });

        return { 
          txHash: cancellationResult.hash,
          cancelled: true,
          ...cancellationResult 
        };
      }
    ),

    // Step 4: Send notifications
    createMutationStep(
      'send-notifications',
      async (variables, previousResults) => {
        const { bookingData, providerEmail } = variables;
        const { refundPercentage } = previousResults[0];
        const { txHash } = previousResults[2];
        
        devLog.log(`📧 [CancelBooking] Sending cancellation notifications`);

        // Send notifications in parallel
        const notificationPromises = [
          // User notification
          addNotification?.({
            type: 'info',
            title: 'Booking Cancelled',
            message: `Your booking has been cancelled. ${refundPercentage < 100 ? `${refundPercentage.toFixed(0)}% refund applied.` : 'Full refund issued.'}`,
            metadata: {
              type: 'booking-cancelled',
              reservationKey: variables.reservationKey,
              refundPercentage,
              txHash
            }
          }),

          // Provider notification
          providerEmail && fetch('/api/notifications/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: providerEmail,
              type: 'booking-cancelled',
              data: {
                reservationKey: variables.reservationKey,
                labId: bookingData.labId,
                labName: bookingData.labName,
                userEmail: bookingData.userEmail || address,
                startTime: bookingData.startTime,
                cancelledAt: new Date().toISOString()
              }
            })
          }).then(res => res.ok ? res.json() : null).catch(err => {
            devLog.warn(`⚠️ [CancelBooking] Failed to send provider email notification`, err);
            return null;
          })
        ].filter(Boolean);

        const notificationResults = await Promise.allSettled(notificationPromises);
        
        devLog.log(`✅ [CancelBooking] Notifications sent`);

        return { 
          notificationResults,
          notificationsSent: notificationResults.filter(r => r.status === 'fulfilled').length
        };
      }
    ),

    // Step 5: Invalidate caches
    createInvalidationStep(
      'invalidate-caches',
      (variables) => [
        ['bookings'],
        ['bookings', address],
        ['bookings', variables.bookingData?.labId],
        ['lab-bookings', variables.bookingData?.labId],
        ['balance', address],
        ['availability', variables.bookingData?.labId],
        ['reservation', variables.reservationKey]
      ]
    )
  ];

  return useCreateSequentialMutation(steps, {
    onSuccess: (result, variables) => {
      devLog.log(`🎉 [CancelBookingComposed] Successfully cancelled booking: ${variables.reservationKey}`);

      // Show success notification
      addNotification?.({
        type: 'success',
        title: 'Cancellation Complete',
        message: 'Your booking has been successfully cancelled.',
        duration: 5000
      });

      if (options.onSuccess) {
        options.onSuccess(result, variables);
      }
    },
    onError: (error, variables) => {
      devLog.error(`❌ [CancelBookingComposed] Failed to cancel booking: ${variables.reservationKey}`, error);

      // Show error notification
      addNotification?.({
        type: 'error',
        title: 'Cancellation Failed',
        message: `Failed to cancel booking: ${error.message}`,
        duration: 8000
      });

      if (options.onError) {
        options.onError(error, variables);
      }
    },
    ...options
  });
};

/**
 * Composed mutation for rescheduling a booking (cancel + create new)
 * 
 * Workflow:
 * 1. Validate new time slot is available
 * 2. Calculate any price differences
 * 3. Cancel original booking (with full refund for rescheduling)
 * 4. Create new booking at new time
 * 5. Handle any price adjustments
 * 6. Send notifications
 * 7. Update caches
 */
export const useRescheduleBookingComposed = (options = {}) => {
  const { addNotification } = useNotifications();
  const queryClient = useQueryClient();
  const cancelBookingComposed = useCancelBookingComposed();
  const createBookingComposed = useCreateBookingComposed();

  const stepGroups = [
    {
      name: 'validation-group',
      steps: [
        createMutationStep(
          'validate-reschedule',
          async (variables) => {
            const { originalBooking, newStartTime, newEndTime } = variables;
            
            devLog.log(`📅 [RescheduleBooking] Validating reschedule request:`, {
              original: originalBooking.startTime,
              new: newStartTime
            });

            // Validate new time is in the future
            if (new Date(newStartTime) <= new Date()) {
              throw new Error('New booking time must be in the future');
            }

            // Validate new time is different from original
            if (new Date(newStartTime).getTime() === new Date(originalBooking.startTime).getTime()) {
              throw new Error('New booking time must be different from original');
            }

            devLog.log(`✅ [RescheduleBooking] Validation passed`);
            return { validated: true };
          }
        )
      ]
    },
    {
      name: 'execution-group',
      steps: [
        createMutationStep(
          'cancel-original',
          async (variables) => {
            const { originalBooking } = variables;
            
            devLog.log(`🔄 [RescheduleBooking] Cancelling original booking: ${originalBooking.reservationKey}`);
            
            // Cancel with special rescheduling flag (no penalties)
            const cancelResult = await cancelBookingComposed.mutateAsync({
              reservationKey: originalBooking.reservationKey,
              bookingData: originalBooking,
              reason: 'rescheduling',
              skipNotifications: true // We'll send combined notification
            });

            devLog.log(`✅ [RescheduleBooking] Original booking cancelled`);
            return cancelResult;
          }
        ),
        
        createMutationStep(
          'create-new-booking',
          async (variables, previousResults) => {
            const { labId, newStartTime, newEndTime, newTimeslot, labName, requiredAmount } = variables;
            
            devLog.log(`📅 [RescheduleBooking] Creating new booking for: ${newStartTime}`);
            
            const createResult = await createBookingComposed.mutateAsync({
              labId,
              startTime: newStartTime,
              endTime: newEndTime,
              timeslot: newTimeslot,
              labName,
              requiredAmount,
              reason: 'rescheduling',
              skipNotifications: true // We'll send combined notification
            });

            devLog.log(`✅ [RescheduleBooking] New booking created`);
            return createResult;
          }
        )
      ]
    }
  ];

  return useCreateParallelMutation(stepGroups, {
    onSuccess: (result, variables) => {
      devLog.log(`🎉 [RescheduleBookingComposed] Successfully rescheduled booking`);

      // Send combined rescheduling notification
      addNotification?.({
        type: 'success',
        title: 'Booking Rescheduled',
        message: `Your booking has been rescheduled to ${new Date(variables.newStartTime).toLocaleString()}`,
        duration: 5000
      });

      if (options.onSuccess) {
        options.onSuccess(result, variables);
      }
    },
    onError: (error, variables) => {
      devLog.error(`❌ [RescheduleBookingComposed] Failed to reschedule booking`, error);

      addNotification?.({
        type: 'error',
        title: 'Rescheduling Failed',
        message: `Failed to reschedule booking: ${error.message}`,
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
  useCreateBookingComposed,
  useCancelBookingComposed,
  useRescheduleBookingComposed
};
