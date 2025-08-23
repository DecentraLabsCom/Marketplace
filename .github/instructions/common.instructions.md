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

4. **Services**: Services are for composed fetch operations that are too computationally intensive for client-side orchestration:
   - Services are server-based and compose multiple atomic api endpoint calls for heavy orchestration scenarios.
   - Atomic api endpoint calls are handled through fetch.
   - Mutations are always handled through hooks, not services.
   - For most composed data needs, prefer using composed hooks with `useQueries` to maintain React Query's caching and error handling benefits.
   - There are currently no services defined in the project.

5. **Event Context and Cache Validation**: Use event contexts to manage blockchain-related events and validate or update cache granularly. This allows for better separation of concerns and makes it easier to manage complex interactions between components:
   - **Domain-Specific Contexts**: Each context should be responsible for a specific domain (e.g., `UserEventContext`, `LabEventContext`, `BookingEventContext`).
   - **Event-Driven Cache Updates**: Blockchain events should trigger granular cache updates through helper functions with `queryClient.fetchQuery` on event listeners to keep React Query cache consistent (e.g., `queryClient.fetchQuery(bookingQueryKeys.byReservationKey(reservationKey))`). Always use the centralized `queryKeys.js` file instead of hardcoding query keys.
   - **Cache Validation**: Event contexts should validate cache data against blockchain state and update only when necessary.
   - **Optimistic Updates**: For immediate UI feedback, mutations should implement optimistic updates that are later validated against blockchain events.
   - **Error Recovery**: If optimistic updates fail validation, the cache should be corrected based on the actual blockchain state.

6. **Cache Management**: The project uses granular cache updates instead of full cache invalidation for optimal performance and user experience:
   - **Optimistic Updates**: Mutations should implement optimistic updates to provide immediate UI feedback. Use `queryClient.setQueryData` to update cache optimistically before the mutation completes.
   - **Granular Cache Updates**: When data changes, add, update, or remove specific records from cache without invalidating everything. Use domain-specific cache update utilities (e.g., `useBookingCacheUpdates`, `useLabCacheUpdates`, `useUserCacheUpdates`).
   - **Event-Driven Validation**: Blockchain events validate optimistic updates and correct the cache if necessary. Use event contexts to listen for blockchain events and update cache accordingly.
   - **Fallback Invalidation**: Only fall back to full cache invalidation (`queryClient.invalidateQueries`) when granular updates fail, data is considered stale, or complex data relationships make granular updates impractical.
   - **Cache Update Strategy**: 
     * Manual UI Actions → Optimistic updates + granular cache manipulation
     * Blockchain Events → Cache validation + granular corrections
     * Error Recovery → Targeted invalidation or full fallback
   - **Performance Optimization**: Prefer granular updates over invalidation to maintain UI responsiveness and minimize unnecessary re-fetches.

7. **Wagmi Integration**: The project uses Wagmi v.2 for Ethereum wallet connections and interactions from the client side. Ensure that all wallet-related functionality is implemented using Wagmi hooks and utilities. In particular, use the `useContractWriteFunction` hook for all contract write operations, and `useDefaultReadContract` for read operations.

8. **Ethers.js Integration**: The project uses Ethers.js v.6 for interacting with the Ethereum blockchain from the server side. Ensure that all blockchain interactions are also implemented using Ethers.js utilities and hooks. This includes creating and signing transactions, as well as reading data from the blockchain. Always use `contractInstance` for interacting with smart contracts.

9. **RPC Providers**: The project uses JSON-RPC providers for interacting with the blockchain. There are fallback mechanisms in place to switch between different RPC providers in case of failures, rate limits, or timeouts. Fallbacks are configured and used for both client (wagmi.js-based: `wagmiConfig`) and server (ethers.js-based: `getProvider`) interactions.

10. **Data storage**: The project uses no database for data storage. All data is fetched from smart contracts and stored in the client-side state using React Query. However, the app uses blobs (when deployed to Vercel) to store lab images, docs, and other metadata in JSON files. Ensure that any data that needs to be persisted is handled appropriately.

11. **Component Design**: Components should be modular and reusable. Avoid creating large monolithic components. Instead, break them down into smaller, manageable pieces that can be easily tested and maintained.

12. **Notification Context**: Use a notification context to manage and display user notifications throughout the application. This context should provide a way to trigger notifications from anywhere in the app and handle their display in a consistent manner.

13. **Documentation**: When generating new code or reviewing changes in existing code, make sure to include proptypes and JSDoc comments for all components and functions. This will help maintain code quality and improve developer experience.

14. **CSS**: Use tailwind CSS for styling. Ensure that styles are applied consistently across the application. Avoid inline styles and prefer using utility classes provided by Tailwind.

15. **Logging**: Implement logging for important events and errors. Use a centralized logging utility (devLog.xxx) to capture and format log messages consistently.