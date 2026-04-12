import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationProvider } from "@/context/NotificationContext";
import { OptimisticUIProvider } from "@/context/OptimisticUIContext";
import { UserData } from "@/context/UserContext";
import { LabCreditProvider } from "@/context/LabCreditContext";

/**
 * Factory function that creates a test wrapper with all necessary providers.
 * Each wrapper instance gets its own QueryClient to ensure test isolation.
 *
 * @returns {React.Component} A wrapper component with all providers configured for testing
 */
export function createTestWrapper() {
  // Create a new QueryClient instance for each test to prevent state leakage
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Disable retries to make tests faster and more predictable
        gcTime: 0, // Garbage collection time (formerly cacheTime) - disable caching
        staleTime: 0, // Consider data stale immediately for consistent test behavior
      },
      mutations: {
        retry: false, // Disable retries for mutations to avoid flaky tests
      },
    },
  });

  return function TestWrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          <OptimisticUIProvider>
            <UserData>
              <LabCreditProvider>{children}</LabCreditProvider>
            </UserData>
          </OptimisticUIProvider>
        </NotificationProvider>
      </QueryClientProvider>
    );
  };
}

/**
 * Utility function to render components with all application providers.
 * Wraps the component in QueryClient and all application context providers.
 *
 * @param {React.ReactElement} ui - The component to render
 * @param {Object} options - Additional options to pass to the render function
 * @returns {RenderResult} The result of the render function from @testing-library/react
 *
 * @example
 * const { getByText } = renderWithAllProviders(<MyComponent />);
 */
export function renderWithAllProviders(ui, options = {}) {
  const Wrapper = createTestWrapper();
  return render(ui, { wrapper: Wrapper, ...options });
}

