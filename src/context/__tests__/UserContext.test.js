import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserData, useUser } from "../UserContext";
import * as userHooks from "@/hooks/user/useUsers";
import * as errorBoundaries from "@/utils/errorBoundaries";

jest.mock("@/hooks/user/useUsers", () => ({
  useSSOSessionQuery: jest.fn(),
  useIsLabProvider: jest.fn(),
  useGetLabProviders: jest.fn(),
  useUserCacheUpdates: jest.fn(),
  useInstitutionResolve: jest.fn(),
}));

jest.mock("@/utils/errorBoundaries", () => ({
  ErrorBoundary: ({ children }) => children,
  useErrorHandler: jest.fn(),
  ErrorSeverity: {},
  ErrorCategory: {},
}));

jest.mock("@/utils/optimizedContext", () => ({
  createOptimizedContext: () => {
    const React = require("react");
    const Context = React.createContext(null);
    return {
      Context,
      Provider: Context.Provider,
      useContext: () => React.useContext(Context),
    };
  },
}));

jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

global.fetch = jest.fn();

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const createWrapper = (queryClient) => ({ children }) => (
  <QueryClientProvider client={queryClient}>
    <UserData>{children}</UserData>
  </QueryClientProvider>
);

describe("UserData Context", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockReset();

    errorBoundaries.useErrorHandler.mockReturnValue({
      handleError: jest.fn(),
    });

    userHooks.useUserCacheUpdates.mockReturnValue({
      refreshProviderStatus: jest.fn(),
      clearSSOSession: jest.fn(),
    });

    userHooks.useSSOSessionQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    userHooks.useIsLabProvider.mockReturnValue({
      data: { isLabProvider: false },
      isLoading: false,
      error: null,
    });

    userHooks.useGetLabProviders.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    userHooks.useInstitutionResolve.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  test("provides default unauthenticated state", () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useUser(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isSSO).toBeUndefined();
    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  test("hydrates institutional SSO user data", async () => {
    userHooks.useSSOSessionQuery.mockReturnValue({
      data: {
        user: {
          name: "Test User",
          email: "test@uned.es",
          affiliation: "uned.es",
          organizationName: "UNED",
        },
        isSSO: true,
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useUser(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSSO).toBe(true);
      expect(result.current.isLoggedIn).toBe(true);
      expect(result.current.user).toMatchObject({
        name: "Test User",
        email: "test@uned.es",
        institutionName: "UNED",
      });
    });
  });

  test("marks provider state from provider query", async () => {
    userHooks.useSSOSessionQuery.mockReturnValue({
      data: {
        user: {
          name: "Faculty User",
          email: "faculty@example.edu",
          affiliation: "example.edu",
        },
        isSSO: true,
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    userHooks.useIsLabProvider.mockReturnValue({
      data: { isLabProvider: true },
      isLoading: false,
      error: null,
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useUser(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isProvider).toBe(true);
      expect(result.current.isLoggedIn).toBe(true);
    });
  });
});
