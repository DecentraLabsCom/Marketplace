---
applyTo: '**'
---
This project follows a set of coding standards and best practices to ensure code quality, maintainability, and readability. Please adhere to the following guidelines when contributing:

1. **Data fetching and state management**: The project is structured to use React Query for data fetching and state management. Components should be designed to work seamlessly with this architecture.

2. **API endpoints**: All API endpoints should be atomic, with no business logic in the API layer. This means that each endpoint should perform a single, well-defined task. The API should return data in a consistent format, and any necessary transformations should be handled in the client-side code, particularly in the context of React Query (hooks). Most of the API endpoints in this project call smart contracts, which are the source of truth for the data.

3. **Services**: Services follow a dual-layer pattern with authentication-based routing:
   - **Atomic services**: 1:1 relationship with API endpoints for individual operations (e.g., `fetchLabData`, `fetchLabOwner`)
   - **Composed services**: Orchestrate multiple atomic services to provide complete data sets (e.g., `fetchAllLabsComposed`)
   - **Client services**: Direct blockchain interactions for wallet-connected users (e.g., `clientBookingServices`, `clientLabServices`)
   - **Authentication-based routing**: Mutations must route based on user authentication type:
     - **Wallet users**: Use `clientXXXServices` → `useContractWriteFunction` → User's wallet → Blockchain
     - **SSO users**: Use `XXXServices` → API endpoints → Server wallet → Blockchain
   - The service layer handles data composition, coordination, and authentication-aware transaction routing
   - This pattern optimizes both network efficiency, code maintainability, and ensures correct wallet usage

4. **Hooks**: Custom hooks follow a simplified pattern that eliminates complex compositions:
   - **Simple hooks with composed services**: Single `useQuery` calls that use composed services (e.g., `useAllLabsQuery` calling `fetchAllLabsComposed`)
   - **Cache-extracting hooks**: Simple data extraction from shared cache using basic `find()` operations (e.g., `useLabDataQuery` extracting from `useAllLabsQuery` cache)
   - **Atomic hooks**: Available for specific use cases when individual data is needed
   - **Mutation hooks**: Must use authentication-aware service routing:
     - Check user authentication type (`isSSO` from `useUser()`)
     - Route to appropriate service layer (`clientXXXServices` for wallet users, `XXXServices` for SSO users)
     - Never use `useContractWriteFunction` directly in components
   - All hooks should use the `use` prefix and avoid complex React Query compositions like `useQueries` with dynamic arrays
   - The goal is to move complexity from React hooks to service layer for better performance and stability

5. **Event Context**: Use event contexts to manage blockchain-related events and update cache granularly. This allows for better separation of concerns and makes it easier to manage complex interactions between components. Each context should be responsible for a specific domain (e.g., user events, lab events, booking events).

6. **Cache Management**: The project uses granular cache updates instead of full cache invalidation:
   - **Granular Updates**: When data changes, add, update, or remove specific records from cache without invalidating everything
   - **Smart Cache Functions**: Use domain-specific cache update utilities (e.g., `useBookingCacheUpdates`, `useLabCacheUpdates`, `useUserCacheUpdates`)
   - **Fallback Invalidation**: Only fall back to full cache invalidation when granular updates fail
   - **Event-Driven Updates**: Blockchain events should trigger granular cache updates, not full invalidation
   - **Manual UI Actions**: User actions (mutations) should also use granular cache updates for immediate UI feedback

7. **Data storage**: The project uses no database for data storage. All data is fetched from smart contracts and stored in the client-side state using React Query. However, the app uses blobs (when deployed to Vercel) to store lab images, docs, and other metadata in JSON files. Ensure that any data that needs to be persisted is handled appropriately.

8. **Component Design**: Components should be modular and reusable. Avoid creating large monolithic components. Instead, break them down into smaller, manageable pieces that can be easily tested and maintained.

9. **Documentation**: When generating new code or reviewing changes in existing code, make sure to include proptypes and JSDoc comments for all components and functions. This will help maintain code quality and improve developer experience.

10. **CSS**: Use tailwind CSS for styling. Ensure that styles are applied consistently across the application. Avoid inline styles and prefer using utility classes provided by Tailwind.

11. **Logging**: Implement logging for important events and errors. Use a centralized logging utility (devLog.xxx) to capture and format log messages consistently.