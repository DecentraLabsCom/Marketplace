---
applyTo: '**'
---

This project follows a set of coding standards and best practices to ensure code quality, maintainability, and readability. Please adhere to the following guidelines when contributing:

1. **Data fetching and state management**: The project uses React Query for server-side data fetching (SSO users via API + Ethers.js) and Wagmi for client-side blockchain interactions (wallet users), with optimistic updates, retries, caching, and state management. Hooks, services and components should be designed to work seamlessly with this dual-path architecture.

2. **API endpoints**: All API endpoints should be atomic, with no business logic in the API layer. This means that each endpoint should perform a single, well-defined task. The API should be either GET (for queries) or POST (for mutations) and must receive and return data in a consistent format (including the appropiate HTTP codes for React Query to correctly identify errors), and any necessary transformations should be handled in the client-side code, particularly in the context of React Query (hooks). API endpoints in /app/api/contract call smart contracts, which are the source of truth for the data. The API endpoints are a subset of those in the diamond.js and the lab.js ABIs (in app/contracts/). Specification for the smart contract can be found at: https://github.com/DecentraLabsCom/Smart-Contract-Specifications

3. **Hooks Architecture**: Custom hooks follow a modular, domain-based architecture that optimizes React Query's (for SSO) and Wagmi's (for wallet, built on React Query) caching and error handling capabilities:
   - **Index/Barrel Files**: Each domain has an index file (e.g., `useLabs.js`, `useBookings.js`...) that exports all hooks for that domain. Components should import from these index files rather than individual hook files to maintain architectural consistency and enable easier refactoring.
   - **Atomic Query Hooks**: Single `useQuery` calls that fetch specific data pieces. Three variants must be provided for each query: one for SSO users using API + Ethers (e.g., `useReservationSSO`) -with 1:1 relationship with API endpoints-, one for wallet users using Wagmi (e.g., `useReservationWallet`), and one router that auto-detects user type (e.g., `useReservation`). SSO variants must export a `.queryFn` for use in composed hooks.
   - **Atomic Mutation Hooks**: Single mutation operations. Three mutations must be provided for each operation (except for a few exceptions): one for wallet-based actions (e.g., `useCancelBookingWallet`), one for SSO users (e.g., `useCancelBookingSSO`), and one to route to the appropriate implementation (Wallet or SSO; e.g., `useCancelBooking`).
   - **Composed and Specialized Query Hooks**: For complex data orchestration that requires multiple related queries, use `useQueries` to maintain React Query's caching, retry, and error handling benefits while providing unified data composition. These hooks use SSO variants exclusively (via `.queryFn`) because Wagmi hooks cannot be extracted as functions for `useQueries`. Atomic routers already provide SSO/Wallet routing for simple cases.
   - **Cache Update Utility Hooks**: Domain-specific cache management utilities (e.g., `useBookingCacheUpdates`, `useLabCacheUpdates`...) that provide granular cache manipulation functions.
   - **Cache-extracting hooks**: Simple data extraction from shared cache using basic `find()` operations for performance optimization.
   - **QueryFn Pattern**: All atomic SSO hooks should define and export a centralized, SSR-safe queryFn function that is reused by both the corresponding atomic hook implementation and external composed hooks.
   - All hooks should use the `use` prefix. The goal is to balance simplicity with React Query's powerful caching and resilience features while maintaining clear domain separation.

4. **Event Context and Cache Management**: The project uses event contexts to manage blockchain-related events and implements granular cache updates for optimal performance and user experience:

   **Event Context Architecture**:
   - **Domain-Specific Contexts**: Each context should be responsible for a specific domain (e.g., `UserEventContext`, `LabEventContext`, `BookingEventContext`).
   - **Event-Driven Cache Updates**: Blockchain events should trigger **specific** cache invalidations using `queryClient.invalidateQueries` with precise query keys (e.g., `queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) })`). Always use the centralized `queryKeys.js` file instead of hardcoding query keys.
   - **Avoid Redundant Invalidations**: Never use global patterns (e.g., `all()`, `['lab']`, `['bookings']`) when specific invalidations are already being used. Global patterns match ALL queries in that domain, making specific invalidations redundant.
   - **Lazy Refetch Strategy**: Use `invalidateQueries` (not `fetchQuery`) in event listeners because it's lazy - only refetches queries that are currently active in components. This prevents unnecessary network requests for data that's not being displayed.
   - **Cache Validation**: Event contexts should only invalidate queries that actually changed based on the event data.

   **Optimistic Updates Strategy**:
   - **OptimisticUIContext**: Use the `OptimisticUIContext` to manage local UI state independently from React Query cache. This provides clean separation between server state (React Query) and optimistic UI state (local context).
   - **OptimisticUIContext Pattern**: 
     * Use `setOptimisticListingState(labId, targetState, isPending: true)` to set immediate UI feedback when mutations start
     * Use `completeOptimisticListingState(labId)` when transactions are successfully sent (marks as non-pending but keeps the new state)
     * Use `clearOptimisticListingState(labId)` when blockchain events confirm the final state or when errors occur
     * The context automatically cleans up stale states (1 minute for pending, 10 minutes for completed)

   **Cache Management Strategies**:
   - **Event Listeners (Blockchain Events)**: Use `invalidateQueries` with specific query keys. This is lazy and efficient - only refetches queries that are currently active.
   - **Manual Cache Updates (Cache Utilities)**: When you know the exact new state, use `setQueryData` for immediate updates without network requests. Use domain-specific cache update utilities (e.g., `useBookingCacheUpdates`, `useLabCacheUpdates`, `useUserCacheUpdates`).
     ```javascript
     // ✅ PREFERRED - Immediate update, no network request
     queryClient.setQueryData(key, (oldData) => ({ ...oldData, status: 4 }));
     // ✅ ACCEPTABLE - When you don't know the exact new state
     queryClient.invalidateQueries({ queryKey: key });
     ```
   - **Query Key Hierarchy**: Understand that parent patterns match all children:
     ```javascript
     // ['bookings'] matches ALL of:
     // - ['bookings', 'reservation', key]
     // - ['bookings', 'list']
     // - ['bookings', 'reservationsOf', address]
     // Therefore, invalidating ['bookings'] along with specific keys is 100% redundant
     ```
   - **When to Invalidate Array Queries**: Only invalidate list/array queries when the array itself changes (items added/removed), not when individual item data changes:
   - **Cache Update Flow**: 
     * Manual UI Actions → OptimisticUIContext for immediate feedback + `setQueryData` for server state (if known) or `invalidateQueries` (if unknown)
     * Transaction Success → Complete optimistic state + invalidate relevant specific cache keys
     * Blockchain Events → Clear optimistic state + invalidate only specific queries that changed (never use global patterns redundantly)
     * Error Recovery → Clear optimistic state + targeted invalidation
   - **Performance Optimization**: Prefer OptimisticUIContext for UI state, `setQueryData` for known updates, and specific `invalidateQueries` (never global patterns) for lazy refetching. This minimizes unnecessary re-fetches and network requests.

5. **Wagmi Integration**: The project uses Wagmi v.2 for Ethereum wallet connections and interactions from the client side. Ensure that all wallet-related functionality is implemented using Wagmi hooks and utilities. In particular, use the `useContractWriteFunction` hook for all contract write operations, and `useDefaultReadContract` for read operations.

6. **Ethers.js Integration**: The project uses Ethers.js v.6 for interacting with the Ethereum blockchain from the server side. Ensure that all blockchain interactions are also implemented using Ethers.js utilities and hooks. This includes creating and signing transactions, as well as reading data from the blockchain. Always use `contractInstance` for interacting with smart contracts.

7. **RPC Providers**: The project uses JSON-RPC providers for interacting with the blockchain. There are fallback mechanisms in place to switch between different RPC providers in case of failures, rate limits, or timeouts. Fallbacks are configured and used for both client (wagmi.js-based: `wagmiConfig`) and server (ethers.js-based: `getProvider`) interactions.

8. **Data storage**: The project uses no database for data storage. All data is fetched from smart contracts and stored in the client-side state using React Query (SSO users) and Wagmi (wallet users). However, the app uses blobs (when deployed to Vercel) to store lab images, docs, and other metadata in JSON files. Ensure that any data that needs to be persisted is handled appropriately.

9. **Component Design**: Components should be modular and reusable. Avoid creating large monolithic components. Instead, break them down into smaller, manageable pieces that can be easily tested and maintained.

10. **Notification Context**: Use a notification context to manage and display user notifications throughout the application. This context should provide a way to trigger notifications from anywhere in the app and handle their display in a consistent manner.

11. **Documentation**: When generating new code or reviewing changes in existing code, make sure to include proptypes and JSDoc comments for all components and functions. This will help maintain code quality and improve developer experience.

12. **CSS**: Use tailwind CSS for styling. Ensure that styles are applied consistently across the application. Avoid inline styles and prefer using utility classes provided by Tailwind.

13. **Logging**: Implement logging for important events and errors. Use a centralized logging utility (devLog.xxx) to capture and format log messages consistently.