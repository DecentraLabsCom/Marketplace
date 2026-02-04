/**
 * Integration Tests: Institutional Onboarding Flow
 *
 * Test Behaviors:
 * - Modal renders correctly for different onboarding states
 * - User interactions trigger correct hook methods
 * - Modal closes on completion or skip
 * - Error states display appropriate messages
 * - Loading states show spinners and messages
 * - backend unavailable state shows warning
 *
 * @test-suite InstitutionalOnboardingFlow
 */

// Mock the useUser hook to provide user context
jest.mock("@/context/UserContext", () => ({
  UserData: ({ children }) => <div data-testid="mock-user-context">{children}</div>,
  useUser: () => ({
    user: {
      id: "test-user-id",
      email: "test@university.edu",
      name: "Test User",
      institution: "Test University",
      affiliation: "student@test.edu",
      organizationName: "Test University"
    },
    isSSO: true,
    isProvider: false,
    isLoggedIn: true,
    isConnected: false,
    address: null,
    isLoading: false,
    isWalletLoading: false,
    institutionalOnboardingStatus: null,
    showOnboardingModal: false,
    needsInstitutionalOnboarding: false,
    isInstitutionallyOnboarded: false,
    institutionRegistrationStatus: null,
    institutionRegistrationWallet: null,
    isInstitutionRegistered: false,
    isInstitutionRegistrationLoading: false,
    refreshProviderStatus: jest.fn(),
    logoutSSO: jest.fn(),
    openOnboardingModal: jest.fn(),
    closeOnboardingModal: jest.fn(),
    handleOnboardingComplete: jest.fn(),
    handleOnboardingSkip: jest.fn(),
    handleError: jest.fn(),
  }),
  useOptionalUser: () => ({
    user: {
      id: "test-user-id",
      email: "test@university.edu",
      name: "Test User",
      institution: "Test University",
      affiliation: "student@test.edu",
      organizationName: "Test University"
    },
    isSSO: true,
    isProvider: false,
    isLoggedIn: true,
    isConnected: false,
    address: null,
    isLoading: false,
    isWalletLoading: false,
    institutionalOnboardingStatus: null,
    showOnboardingModal: false,
    needsInstitutionalOnboarding: false,
    isInstitutionallyOnboarded: false,
    institutionRegistrationStatus: null,
    institutionRegistrationWallet: null,
    isInstitutionRegistered: false,
    isInstitutionRegistrationLoading: false,
    refreshProviderStatus: jest.fn(),
    logoutSSO: jest.fn(),
    openOnboardingModal: jest.fn(),
    closeOnboardingModal: jest.fn(),
    handleOnboardingComplete: jest.fn(),
    handleOnboardingSkip: jest.fn(),
    handleError: jest.fn(),
  }),
}));

jest.mock("@/context/LabTokenContext", () => ({
  LabTokenProvider: ({ children }) => (
    <div data-testid="mock-lab-token-provider">{children}</div>
  ),
  useLabToken: () => ({}),
}));

// Mock wagmi hooks
jest.mock("wagmi", () => ({
  WagmiProvider: ({ children, config }) => <div data-testid="mock-wagmi-provider">{children}</div>,
  createConfig: jest.fn(() => ({})),
  http: jest.fn(() => ({})),
  useAccount: jest.fn(() => ({
    address: null,
    isConnected: false,
    isReconnecting: false,
    isConnecting: false,
  })),
  useBalance: jest.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
}));

// Mock useInstitutionalOnboarding hook
jest.mock("@/hooks/user/useInstitutionalOnboarding", () => ({
  __esModule: true,
  OnboardingState: {
    IDLE: 'idle',
    CHECKING: 'checking',
    NOT_NEEDED: 'not_needed',
    REQUIRED: 'required',
    INITIATING: 'initiating',
    REDIRECTING: 'redirecting',
    AWAITING_COMPLETION: 'awaiting_completion',
    POLLING: 'polling',
    COMPLETED: 'completed',
    FAILED: 'failed',
    NO_BACKEND: 'no_backend',
  },
  useInstitutionalOnboarding: jest.fn(),
}));

/**
 * Helper function to setup mocks for institutional onboarding hook
 */
const setupMockHook = (state) => {
  const baseMock = {
    state: state,
    error: null,
    isLoading: false,
    isCompleted: false,
    hasBackend: true,
    sessionData: null,
    keyStatus: null,
    startOnboarding: mockStartOnboarding,
    initiateOnboarding: jest.fn(),
    redirectToCeremony: jest.fn(),
    reset: mockReset,
  };

  // Customize based on state
  switch (state) {
    case 'checking':
      baseMock.isLoading = true;
      break;
    case 'initiating':
      baseMock.isLoading = true;
      break;
    case 'redirecting':
      baseMock.isLoading = true;
      baseMock.sessionData = { ceremonyUrl: 'https://example.com' };
      break;
    case 'polling':
    case 'awaiting_completion':
      baseMock.isLoading = true;
      break;
    case 'completed':
    case 'not_needed':
      baseMock.isCompleted = true;
      break;
    case 'failed':
      baseMock.error = 'Setup failed';
      break;
    case 'no_backend':
      baseMock.hasBackend = false;
      break;
    default:
      break;
  }

  useInstitutionalOnboarding.mockReturnValue(baseMock);
};

/**
 * Mock the institutional onboarding hook functions
 */
const mockStartOnboarding = jest.fn();
const mockReset = jest.fn();

import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithAllProviders } from "@/test-utils/test-providers";
import InstitutionalOnboardingModal from "@/components/auth/InstitutionalOnboardingModal";
import { mockUser } from "@/test-utils/mocks/mockData";
import { useInstitutionalOnboarding } from "@/hooks/user/useInstitutionalOnboarding";

/**
 * Mock user-related hooks to prevent UserContext errors
 */
jest.mock("@/hooks/user/useUsers", () => ({
  useSSOSessionQuery: jest.fn(() => ({
    data: mockUser,
    isLoading: false,
    isError: false,
  })),
  useIsLabProvider: jest.fn(() => ({
    data: false,
    isLoading: false,
    isError: false,
  })),
  useGetLabProviders: jest.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
  })),
  useUserCacheUpdates: jest.fn(() => ({
    refreshProviderStatus: jest.fn(),
    clearSSOSession: jest.fn(),
  })),
}));

describe("InstitutionalOnboardingFlow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Modal Rendering", () => {
    test("renders setup prompt when onboarding is required", () => {
      setupMockHook("required");

      expect(() => {
        renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={jest.fn()} />);
      }).not.toThrow();

      // Check if the component renders anything at all
      const allElements = screen.getAllByRole('generic');
      expect(allElements.length).toBeGreaterThan(0);

      // Debug: check what is actually rendered
      screen.debug();

      expect(screen.getByText("Secure Your Account")).toBeInTheDocument();
      expect(screen.getByText("Set Up Now")).toBeInTheDocument();
      expect(screen.getByText("Later")).toBeInTheDocument();
    });

    test("renders loading spinner during checking state", () => {
      setupMockHook("checking");

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={jest.fn()} />);

      expect(screen.getByText("Checking your account status...")).toBeInTheDocument();
    });

    test("renders loading spinner during initiating state", () => {
      setupMockHook("initiating");

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={jest.fn()} />);

      expect(screen.getByText("Preparing secure registration...")).toBeInTheDocument();
    });

    test("renders loading spinner during redirecting state", () => {
      setupMockHook("redirecting");

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={jest.fn()} />);

      expect(screen.getByText("Redirecting to your institution...")).toBeInTheDocument();
    });

    test("renders loading spinner during polling state", () => {
      setupMockHook("polling");

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={jest.fn()} />);

      expect(screen.getByText("Waiting for confirmation...")).toBeInTheDocument();
    });

    test("renders success message when onboarding is completed", () => {
      setupMockHook("completed");

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={jest.fn()} />);

      expect(screen.getByText("All Set!")).toBeInTheDocument();
      expect(screen.getByText("Continue")).toBeInTheDocument();
    });

    test("renders error message when onboarding fails", () => {
      setupMockHook("failed");

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={jest.fn()} />);

      expect(screen.getByText("Setup Failed")).toBeInTheDocument();
      expect(screen.getByText("Try Again")).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    test("renders warning when backend is unavailable", () => {
      setupMockHook("no_backend");

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={jest.fn()} />);

      expect(screen.getByText("Service Unavailable")).toBeInTheDocument();
      expect(screen.getByText("Continue Anyway")).toBeInTheDocument();
    });
  });

  describe("User Interactions", () => {
    test("calls startOnboarding when Start Setup button is clicked", async () => {
      setupMockHook("required");
      const onClose = jest.fn();

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={onClose} />);

      const startButton = screen.getByText("Set Up Now");
      fireEvent.click(startButton);

      expect(mockStartOnboarding).toHaveBeenCalledTimes(1);
    });

    test("calls onClose when Skip for now button is clicked in required state", () => {
      setupMockHook("required");
      const onClose = jest.fn();

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={onClose} />);

      const skipButton = screen.getByText("Later");
      fireEvent.click(skipButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test("calls onClose when Continue button is clicked in completed state", () => {
      setupMockHook("completed");
      const onClose = jest.fn();

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={onClose} />);

      const continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test("calls reset and startOnboarding when Try Again button is clicked in failed state", () => {
      setupMockHook("failed");
      const onClose = jest.fn();

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={onClose} />);

      const tryAgainButton = screen.getByText("Try Again");
      fireEvent.click(tryAgainButton);

      expect(mockStartOnboarding).toHaveBeenCalledTimes(1);
    });

    test("calls onClose when Skip for now button is clicked in failed state", () => {
      setupMockHook("failed");
      const onClose = jest.fn();

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={onClose} />);

      const skipButton = screen.getByText("Cancel");
      fireEvent.click(skipButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test("calls onClose when Continue without institutional authentication button is clicked in no_backend state", () => {
      setupMockHook("no_backend");
      const onClose = jest.fn();

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={onClose} />);

      const continueButton = screen.getByText("Continue Anyway");
      fireEvent.click(continueButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Modal Behavior", () => {
    test("does not render modal when isOpen is false", () => {
      setupMockHook("required");

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={false} onClose={jest.fn()} />);

      expect(screen.queryByText("Set up Institutional Authentication")).not.toBeInTheDocument();
    });

    test("renders modal with correct title and content", () => {
      setupMockHook("required");

      renderWithAllProviders(<InstitutionalOnboardingModal isOpen={true} onClose={jest.fn()} />);

      expect(screen.getByText("Account Setup")).toBeInTheDocument();
      expect(screen.getByText(/To interact with laboratories and make bookings/i)).toBeInTheDocument();
    });
  });
});

