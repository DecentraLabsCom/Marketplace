/**
 * Composed Mutations Index
 * 
 * This file exports all composed mutations for easy importing throughout the application.
 * Composed mutations orchestrate multiple operations, handle rollbacks, and manage
 * complex state coordination that spans multiple data sources and UI components.
 * 
 * Usage Examples:
 * ```javascript
 * // Lab management
 * import { useCreateLabComposed, useUpdateLabComposed } from '@/utils/mutations';
 * 
 * // Booking workflows
 * import { useCreateBookingComposed, useCancelBookingComposed } from '@/utils/mutations';
 * 
 * // Provider registration
 * import { useProviderRegistrationComposed } from '@/utils/mutations';
 * ```
 * 
 * @file index.js
 */

// Core composed mutation utilities
export {
  ComposedMutation,
  useCreateSequentialMutation,
  useCreateParallelMutation,
  createMutationStep,
  createInvalidationStep,
  createOptimisticStep,
  createApiStep
} from './composedMutations';

// Lab management composed mutations
export {
  useCreateLabComposed,
  useUpdateLabComposed,
  useDeleteLabComposed
} from './labComposedMutations';

// Booking management composed mutations
export {
  useCreateBookingComposed,
  useCancelBookingComposed,
  useRescheduleBookingComposed
} from './bookingComposedMutations';

// Provider registration and management composed mutations
export {
  useProviderRegistrationComposed,
  useProviderOnboardingComposed,
  useProviderStatusUpdateComposed
} from './providerComposedMutations';

// Re-export default collections for convenience
export { default as labMutations } from './labComposedMutations';
export { default as bookingMutations } from './bookingComposedMutations';
export { default as providerMutations } from './providerComposedMutations';
export { default as composedUtils } from './composedMutations';

/**
 * Composed mutations provide several key benefits:
 * 
 * 1. **Atomic Operations**: Multiple API calls treated as single units
 * 2. **Rollback Support**: Automatic cleanup when operations fail
 * 3. **Optimistic Updates**: UI updates before server confirmation
 * 4. **Cache Coordination**: Intelligent invalidation across related data
 * 5. **Error Handling**: Centralized error management with context
 * 6. **Progress Tracking**: Step-by-step execution monitoring
 * 7. **Parallel Execution**: Operations that can run concurrently
 * 8. **Dependency Management**: Sequential operations with data flow
 * 
 * Best Practices:
 * 
 * - Use composed mutations for workflows that involve 3+ related operations
 * - Always implement rollback strategies for destructive operations
 * - Leverage optimistic updates for better user experience
 * - Coordinate cache invalidation to prevent stale data
 * - Provide clear error messages with actionable information
 * - Log operation progress for debugging and monitoring
 * - Test rollback scenarios thoroughly
 * - Consider performance implications of parallel vs sequential execution
 */
