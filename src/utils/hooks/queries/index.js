/**
 * Composed Queries Index
 * 
 * This file exports all composed queries for easy importing throughout the application.
 * Composed queries orchestrate multiple data operations, handle complex data coordination,
 * and manage state that spans multiple data sources and UI components.
 * 
 * Usage Examples:
 * ```javascript
 * // Lab queries
 * import { useAllLabsComposed, useProviderLabsComposed } from '@/utils/hooks/queries';
 * 
 * // Booking queries
 * import { useUserBookingsComposed, useLabBookingsComposed } from '@/utils/hooks/queries';
 * 
 * // User queries
 * import { useProvidersWithNames, useAllUsersComposed } from '@/utils/hooks/queries';
 * ```
 * 
 * @file index.js
 */

// Lab composed queries
export {
  useAllLabsComposed,
  useAllLabsBasic,
  useAllLabsFull,
  useAllLabsForCards,
  useAllLabsForMarketplace,
  useProviderLabsComposed,
} from './labsComposedQueries';

// Booking composed queries
export {
  useUserBookingsComposed,
  useLabBookingsComposed,
  useMultiLabBookingsComposed,
  useCurrentUserBookingsComposed,
  extractBookingFromUser,
  useUserBookingsForCalendar,
  useUserBookingsForDashboard,
  useUserCancellableBookings,
} from './bookingsComposedQueries';

// User and provider composed queries
export {
  useProvidersWithNames,
  useBatchProviderCheck,
  useProviderDetails,
  useAllUsersComposed,
  useProviderStatusComposed,
  useAllUsersBasic,
  useAllUsersFull,
} from './usersComposedQueries';

// Re-export all for convenience
export * from './labsComposedQueries';
export * from './bookingsComposedQueries';
export * from './usersComposedQueries';

/**
 * Composed queries provide several key benefits:
 * 
 * 1. **Data Orchestration**: Coordinate multiple related queries
 * 2. **Cache Optimization**: Leverage React Query's caching strategies
 * 3. **Complex Data Relationships**: Handle inter-dependent data fetching
 * 4. **Performance**: Use useQueries for parallel data fetching
 * 5. **Error Handling**: Centralized error management with context
 * 6. **Loading States**: Unified loading state management
 * 7. **Data Transformation**: Apply consistent data processing
 * 8. **Selective Data**: Use select for specific data extraction
 * 
 * Best Practices:
 * 
 * - Use composed queries for workflows that involve 2+ related data sources
 * - Leverage useQueries to maintain React Query's caching benefits
 * - Always provide fallback values for undefined data
 * - Use select functions for data transformation and optimization
 * - Implement proper error boundaries for complex queries
 * - Consider data freshness requirements when setting staleTime
 * - Test loading and error states thoroughly
 * - Document data dependencies clearly
 */
