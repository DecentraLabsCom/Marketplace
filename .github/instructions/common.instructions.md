---
applyTo: '**'
---

This project follows a set of coding standards and best practices to ensure code quality, maintainability, and readability. Please adhere to the following guidelines when contributing:

1. **Data fetching and state management**: The project is structured to use React Query for data fetching, optimistic updates, retries, caching, and state management. Hooks, services and components should be designed to work seamlessly with this architecture.

2. **API endpoints**: All API endpoints should be atomic, with no business logic in the API layer. This means that each endpoint should perform a single, well-defined task. The API should be either GET (for queries) or POST (for mutations) and must receive and return data in a consistent format (including the appropiate HTTP codes for React Query to correctly identify errors), and any necessary transformations should be handled in the client-side code, particularly in the context of React Query (hooks). API endpoints in /app/api/contract call smart contracts, which are the source of truth for the data. The API endpoints are a subset of those in the diamond.js and the lab.js ABIs (in app/contracts/). Specification for the smart contract can be found at: https://github.com/DecentraLabsCom/Smart-Contract-Specifications

3. **Hooks Architecture**: Custom hooks follow a modular, domain-based architecture that optimizes React Query's caching and error handling capabilities:
   - **Index/Barrel Files**: Each domain has an index file (e.g., `useLabs.js`, `useBookings.js`...) that exports all hooks for that domain. Components should import from these index files rather than individual hook files to maintain architectural consistency and enable easier refactoring.
   - **Atomic Query Hooks**: Single `useQuery` calls that fetch specific data pieces (1:1 relationship with API endpoints). These are the building blocks for composed hooks.
   - **Atomic Mutation Hooks**: Single mutation operations. Three mutations must be provided for each operation: one for wallet-based actions (e.g., `useCancelBookingWallet`), one for SSO users (e.g., `useCancelBookingSSO`), and one to route to the appropriate implementation (Wallet or SSO; e.g., `useCancelBooking`).
   - **Composed and Specialized Query Hooks**: For complex data orchestration that requires multiple related queries, use `useQueries` to maintain React Query's caching, retry, and error handling benefits while providing unified data composition. These hooks are implemented using atomic hooks, not direct fetch calls.
   - **Cache Update Utility Hooks**: Domain-specific cache management utilities (e.g., `useBookingCacheUpdates`, `useLabCacheUpdates`...) that provide granular cache manipulation functions.
   - **Cache-extracting hooks**: Simple data extraction from shared cache using basic `find()` operations for performance optimization.
   - **QueryFn Pattern**: All atomic hooks should define and export a centralized, (SSR-safe, when needed) queryFn function that is reused by both the corresponding atomic hook implementation and external composed hooks.
   - All hooks should use the `use` prefix. The goal is to balance simplicity with React Query's powerful caching and resilience features while maintaining clear domain separation.

4. **Event Context and Cache Management**: The project uses event contexts to manage blockchain-related events and implements granular cache updates for optimal performance and user experience:

   **Event Context Architecture**:
   - **Domain-Specific Contexts**: Each context should be responsible for a specific domain (e.g., `UserEventContext`, `LabEventContext`, `BookingEventContext`).
   - **Event-Driven Cache Updates**: Blockchain events should trigger granular cache updates through helper functions with `queryClient.fetchQuery` on event listeners to keep React Query cache consistent (e.g., `queryClient.fetchQuery(bookingQueryKeys.byReservationKey(reservationKey))`). Always use the centralized `queryKeys.js` file instead of hardcoding query keys.
   - **Cache Validation**: Event contexts should validate cache data against blockchain state and update only when necessary.

   **Optimistic Updates Strategy**:
   - **OptimisticUIContext**: Use the `OptimisticUIContext` to manage local UI state independently from React Query cache. This provides clean separation between server state (React Query) and optimistic UI state (local context).
   - **OptimisticUIContext Pattern**: 
     * Use `setOptimisticListingState(labId, targetState, isPending: true)` to set immediate UI feedback when mutations start
     * Use `completeOptimisticListingState(labId)` when transactions are successfully sent (marks as non-pending but keeps the new state)
     * Use `clearOptimisticListingState(labId)` when blockchain events confirm the final state or when errors occur
     * The context automatically cleans up stale states (1 minute for pending, 10 minutes for completed)

   **Cache Management Strategies**:
   - **Granular Cache Updates**: When data changes, add, update, or remove specific records from cache without invalidating everything. Use domain-specific cache update utilities (e.g., `useBookingCacheUpdates`, `useLabCacheUpdates`, `useUserCacheUpdates`).
   - **Fallback Invalidation**: Only fall back to full cache invalidation (`queryClient.invalidateQueries`) when granular updates fail, data is considered stale, or complex data relationships make granular updates impractical.
   - **Cache Update Flow**: 
     * Manual UI Actions → OptimisticUIContext for immediate feedback + granular cache manipulation for server state
     * Transaction Success → Complete optimistic state (keep new state, mark as non-pending) + update relevant cache keys
     * Blockchain Events → Cache validation + clear optimistic state
     * Error Recovery → Clear optimistic state + targeted invalidation or full fallback
   - **Performance Optimization**: Prefer OptimisticUIContext for UI state and granular cache updates for server state to maintain UI responsiveness and minimize unnecessary re-fetches.

5. **Wagmi Integration**: The project uses Wagmi v.2 for Ethereum wallet connections and interactions from the client side. Ensure that all wallet-related functionality is implemented using Wagmi hooks and utilities. In particular, use the `useContractWriteFunction` hook for all contract write operations, and `useDefaultReadContract` for read operations.

6. **Ethers.js Integration**: The project uses Ethers.js v.6 for interacting with the Ethereum blockchain from the server side. Ensure that all blockchain interactions are also implemented using Ethers.js utilities and hooks. This includes creating and signing transactions, as well as reading data from the blockchain. Always use `contractInstance` for interacting with smart contracts.

7. **RPC Providers**: The project uses JSON-RPC providers for interacting with the blockchain. There are fallback mechanisms in place to switch between different RPC providers in case of failures, rate limits, or timeouts. Fallbacks are configured and used for both client (wagmi.js-based: `wagmiConfig`) and server (ethers.js-based: `getProvider`) interactions.

8. **Data storage**: The project uses no database for data storage. All data is fetched from smart contracts and stored in the client-side state using React Query. However, the app uses blobs (when deployed to Vercel) to store lab images, docs, and other metadata in JSON files. Ensure that any data that needs to be persisted is handled appropriately.

9. **Component Design**: Components should be modular and reusable. Avoid creating large monolithic components. Instead, break them down into smaller, manageable pieces that can be easily tested and maintained.

10. **Notification Context**: Use a notification context to manage and display user notifications throughout the application. This context should provide a way to trigger notifications from anywhere in the app and handle their display in a consistent manner.

11. **Documentation**: When generating new code or reviewing changes in existing code, make sure to include proptypes and JSDoc comments for all components and functions. This will help maintain code quality and improve developer experience.

12. **CSS**: Use tailwind CSS for styling. Ensure that styles are applied consistently across the application. Avoid inline styles and prefer using utility classes provided by Tailwind.

13. **Logging**: Implement logging for important events and errors. Use a centralized logging utility (devLog.xxx) to capture and format log messages consistently.