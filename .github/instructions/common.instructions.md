---
applyTo: '**'
---
This project follows a set of coding standards and best practices to ensure code quality, maintainability, and readability. Please adhere to the following guidelines when contributing:

1. **Data fetching and state management**: The project is structured to use React Query for data fetching and state management. Components should be designed to work seamlessly with this architecture.

2. **API endpoints**: All API endpoints should be atomic, with no business logic in the API layer. This means that each endpoint should perform a single, well-defined task. The API should return data in a consistent format, and any necessary transformations should be handled in the client-side code, particularly in the context of React Query (hooks). Most of the API endpoints in this project call smart contracts, which are the source of truth for the data.

3. **Services**: Services should be used to encapsulate API calls in a 1:1 relationship. Each service should be responsible for a specific domain or feature of the application. This helps keep the code organized and makes it easier to test and maintain.

4. **Hooks**: Custom hooks should be used to encapsulate logic that can be reused across components. This includes data fetching, state management, and any other shared functionality. Hooks should be named using the `use` prefix (e.g., `useFetchData`, `useAuth`).

5. **Event Context**: Use event contexts to manage blockchain-related events and invalidate cache. This allows for better separation of concerns and makes it easier to manage complex interactions between components. Each context should be responsible for a specific domain (e.g., user events, lab events, booking events).

6. **Data storage**: The project uses no database for data storage. All data is fetched from smart contracts and stored in the client-side state using React Query. However, the app uses blobs (when deployed to Vercel) to store lab images, docs, and other metadata in JSON files. Ensure that any data that needs to be persisted is handled appropriately.

7. **Component Design**: Components should be modular and reusable. Avoid creating large monolithic components. Instead, break them down into smaller, manageable pieces that can be easily tested and maintained.

8. **Documentation**: When generating new code or reviewing changes in existing code, make sure to include proptypes and JSDoc comments for all components and functions. This will help maintain code quality and improve developer experience.

9. **CSS**: Use tailwind CSS for styling. Ensure that styles are applied consistently across the application. Avoid inline styles and prefer using utility classes provided by Tailwind.

10. **Logging**: Implement logging for important events and errors. Use a centralized logging utility (devLog.xxx) to capture and format log messages consistently.