---
applyTo: '**'
---

This project follows a set of coding standards and best practices to ensure code quality, maintainability, and readability. Please adhere to the following guidelines when contributing:

1. **Data fetching and state management**: The project is structured to use React Query for data fetching, optimistic updates, retries, caching, and state management. Hooks, services and components should be designed to work seamlessly with this architecture.

2. **API endpoints**: All API endpoints should be atomic, with no business logic in the API layer. This means that each endpoint should perform a single, well-defined task. The API should be either GET (for queries) or POST (for mutations) and must receive and return data in a consistent format (including the appropiate HTTP codes for React Query to correctly identify errors), and any necessary transformations should be handled in the client-side code, particularly in the context of React Query (hooks). API endpoints in /app/api/contract call smart contracts, which are the source of truth for the data. The API endpoints are a subset of those in the diamond.js and the lab.js ABIs (in app/contracts/). Specification for the smart contract can be found at: https://github.com/DecentraLabsCom/Smart-Contract-Specifications

3. **Hooks**: Custom hooks follow patterns that optimize React Query's caching and error handling capabilities:
   - **Simple hooks call simple endpoints**: Single `useQuery` calls that send requests to specific API endpoints for either fetching or mutating data (1:1 relationship).
   - **Cache-extracting hooks**: Simple data extraction from shared cache using basic `find()` operations.
   - **Atomic hooks**: Available for specific use cases when individual data is needed.
   - **Specific hooks**: Create specific hooks for common use cases that require tailored logic or data transformations. These hooks should use 'select' to encapsulate the specific requirements of the use case while leveraging the underlying atomic hooks and React Query features. [NOT BEING USED AT THE MOMENT]
   - **Composed queries**: For complex data orchestration that requires multiple related queries, use composed queries with `useQueries` (`src/utils/hooks/queries/`) to maintain React Query's caching, retry, and error handling benefits while providing unified data composition. These query hooks are implemented using atomic hooks, not direct fetch calls.
   - **Mutation hooks**: Used for creating, updating, or deleting data. Three mutations must be provided for each operation: one for wallet-based actions e.g., `useCancelBookingWallet`), one for SSO users (e.g., `useCancelBookingSSO`), and one to route to the appropriate implementation (Wallet or SSO; e.g., `useCancelBooking`).
   - **Composed mutations**: For complex workflows that involve multiple sequential or parallel operations, use composed mutations (`src/utils/hooks/mutations/`). These provide atomic operations with rollback support, optimistic updates, and coordinated cache management. Examples include lab creation with image uploads (`useCreateLabComposed`), booking workflows with payment processing (`useCreateBookingComposed`), and provider registration with blockchain operations (`useProviderRegistrationComposed`). [NOT BEING USED AT THE MOMENT]
   - All hooks should use the `use` prefix. Complex React Query compositions like `useQueries` are allowed when they preserve caching and error handling benefits for composed data operations.
   - The goal is to balance simplicity with React Query's powerful caching and resilience features.

4. **Services**: Services are for composed fetch operations that are too computationally intensive for client-side orchestration:
   - Services are server-based and may compose multiple atomic api endpoint calls for heavy orchestration scenarios.
   - Atomic api endpoint calls must be handled through fetch.
   - Mutations are always handled through hooks, not services.
   - For most composed data needs, prefer using composed hooks with `useQueries` to maintain React Query's caching and error handling benefits.
   - There are currently no services defined in the project.

5. **Event Context**: Use event contexts to manage blockchain-related events and update cache granularly. This allows for better separation of concerns and makes it easier to manage complex interactions between components. Each context should be responsible for a specific domain (e.g., user events, lab events, booking events). Define and use helper functions with queryClient.fetchQuery on event listeners to keep React Query cache updates consistent (e.g., `queryClient.fetchQuery(['reservations', 'getReservation', reservationKey])`).

6. **Cache Management**: The project uses granular cache updates instead of full cache invalidation:
   - **Granular Updates**: When data changes, add, update, or remove specific records from cache without invalidating everything.
   - **Smart Cache Functions**: Use domain-specific cache update utilities (e.g., `useBookingCacheUpdates`, `useLabCacheUpdates`, `useUserCacheUpdates`).
   - **Fallback Invalidation**: Only fall back to full cache invalidation when granular updates fail or data is considered stale.
   - **Event-Driven Updates**: Blockchain events should trigger granular cache updates, not full invalidation.
   - **Manual UI Actions**: User actions (mutations) should also use granular cache updates for immediate UI feedback.

7. **Wagmi Integration**: The project uses Wagmi v.2 for Ethereum wallet connections and interactions from the client side. Ensure that all wallet-related functionality is implemented using Wagmi hooks and utilities. In particular, use the `useContractWriteFunction` hook for all contract write operations, and `useDefaultReadContract` for read operations.

8. **Ethers.js Integration**: The project uses Ethers.js v.6 for interacting with the Ethereum blockchain from the server side. Ensure that all blockchain interactions are also implemented using Ethers.js utilities and hooks. This includes creating and signing transactions, as well as reading data from the blockchain. Always use `contractInstance` for interacting with smart contracts.

9. **RPC Providers**: The project uses JSON-RPC providers for interacting with the blockchain. There are fallback mechanisms in place to switch between different RPC providers in case of failures, rate limits, or timeouts. Fallbacks are configured and used for both client (wagmi.js-based: `wagmiConfig`) and server (ethers.js-based: `getProvider`) interactions.

10. **Data storage**: The project uses no database for data storage. All data is fetched from smart contracts and stored in the client-side state using React Query. However, the app uses blobs (when deployed to Vercel) to store lab images, docs, and other metadata in JSON files. Ensure that any data that needs to be persisted is handled appropriately.

11. **Component Design**: Components should be modular and reusable. Avoid creating large monolithic components. Instead, break them down into smaller, manageable pieces that can be easily tested and maintained.

12. **Notification Context**: Use a notification context to manage and display user notifications throughout the application. This context should provide a way to trigger notifications from anywhere in the app and handle their display in a consistent manner.

13. **Documentation**: When generating new code or reviewing changes in existing code, make sure to include proptypes and JSDoc comments for all components and functions. This will help maintain code quality and improve developer experience.

14. **CSS**: Use tailwind CSS for styling. Ensure that styles are applied consistently across the application. Avoid inline styles and prefer using utility classes provided by Tailwind.

15. **Logging**: Implement logging for important events and errors. Use a centralized logging utility (devLog.xxx) to capture and format log messages consistently.

16. **SSR Strategy**: The project implements a hybrid Server-Side Rendering (SSR) strategy to optimize performance, SEO, and user experience:
   - **Hybrid SSR Approach**: Use SSR for public data and Client-Side Rendering (CSR) for private/user-specific data to ensure security and optimal UX.
   - **HydrationBoundary for Public Data**: Use `HydrationBoundary` with prefetched public data (labs, providers, lab details) on pages that need SEO and instant data display. This includes:
     - Homepage (`src/app/page.js`): Prefetch labs and providers
     - Lab detail pages (`src/app/lab/[id]/page.js`): Prefetch specific lab data
     - Dashboard pages (`src/app/providerdashboard/page.js`, `src/app/userdashboard/page.js`): Prefetch public labs data
     - Reservation pages (`src/app/reservation/page.js`): Prefetch public labs data
   - **Progressive Loading for Private Data**: Private data (user bookings, halos, wallet-specific information) should load client-side after hydration to prevent exposure in SSR and maintain security.
   - **Server Components for Static Content**: Convert static pages (about, contact, FAQ) to server components for optimal SEO and performance.
   - **SSR Prefetch Utilities**: Use centralized prefetch functions from `src/utils/ssr/prefetch.js` (e.g., `prefetchLabsData`, `prefetchLabDetails`, `prefetchProvidersOnly`) for consistent data fetching.
   - **Custom HydrationBoundary**: Use the custom `HydrationBoundary` component (`src/components/ui/HydrationBoundary.js`) for error handling and consistent hydration behavior.
   - **createSSRSafeQuery**: Use this utility for components that need to work in both SSR and CSR contexts without hydration mismatches.