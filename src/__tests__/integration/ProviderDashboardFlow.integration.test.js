/**
 * Integration Tests: Provider Dashboard Flow
 *
 * Test Behaviors:
 * - Provider dashboard displays owned labs correctly
 * - Lab selection updates calendar and actions
 * - Lab modal opens for creating new labs
 * - Lab modal opens for editing existing labs
 * - List/Unlist actions work with optimistic UI
 * - Delete action removes lab with confirmation
 * - Access control prevents non-providers from accessing dashboard
 * - Lab actions integrate with UserContext provider status
 *
 * @test-suite ProviderDashboardFlow
 */

import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithAllProviders } from "@/test-utils/test-providers";
import ProviderDashboardPage from "@/components/dashboard/provider/ProviderDashboardPage";
import { mockLab } from "@/test-utils/mocks/mockData";

/**
 * Mock lab mutations and queries
 */
const mockAddLabMutation = {
  mutateAsync: jest.fn(() =>
    Promise.resolve({ hash: "0xmockhash", labId: 3, id: 3 })
  ),
  isLoading: false,
  isError: false,
};

const mockUpdateLabMutation = {
  mutateAsync: jest.fn(() => Promise.resolve({ hash: "0xmockhash" })),
  isLoading: false,
  isError: false,
};

const mockDeleteLabMutation = {
  mutateAsync: jest.fn(() => Promise.resolve({ hash: "0xmockhash" })),
  isLoading: false,
  isError: false,
};

const mockListLabMutation = {
  mutateAsync: jest.fn(() => Promise.resolve({ hash: "0xmockhash" })),
  isLoading: false,
  isError: false,
};

const mockUnlistLabMutation = {
  mutateAsync: jest.fn(() => Promise.resolve({ hash: "0xmockhash" })),
  isLoading: false,
  isError: false,
};

const mockRequestFundsMutation = {
  mutateAsync: jest.fn(() => Promise.resolve({ hash: "0xmockhash" })),
  isLoading: false,
  isError: false,
};

jest.mock("@/hooks/lab/useLabAtomicMutations", () => ({
  useAddLab: jest.fn(() => mockAddLabMutation),
  useUpdateLab: jest.fn(() => mockUpdateLabMutation),
  useDeleteLab: jest.fn(() => mockDeleteLabMutation),
  useListLab: jest.fn(() => mockListLabMutation),
  useUnlistLab: jest.fn(() => mockUnlistLabMutation),
  useRequestFunds: jest.fn(() => mockRequestFundsMutation),
}));

/**
 * Mock provider hooks
 */
const mockSaveLabDataMutation = {
  mutateAsync: jest.fn(() => Promise.resolve({ success: true })),
  isLoading: false,
  isError: false,
};

const mockUploadFileMutation = {
  mutateAsync: jest.fn(() =>
    Promise.resolve({ url: "https://mock-file.com/image.jpg" })
  ),
  isLoading: false,
  isError: false,
};

const mockMoveFilesMutation = {
  mutateAsync: jest.fn(() => Promise.resolve({ success: true })),
  isLoading: false,
  isError: false,
};

const mockDeleteLabDataMutation = {
  mutateAsync: jest.fn(() => Promise.resolve({ success: true })),
  isLoading: false,
  isError: false,
};

jest.mock("@/hooks/provider/useProvider", () => ({
  useSaveLabData: jest.fn(() => mockSaveLabDataMutation),
  useUploadFile: jest.fn(() => mockUploadFileMutation),
  useMoveFiles: jest.fn(() => mockMoveFilesMutation),
  useDeleteLabData: jest.fn(() => mockDeleteLabDataMutation),
  useDeleteFile: jest.fn(() => ({
    mutateAsync: jest.fn(() => Promise.resolve({ success: true })),
    isLoading: false,
    isError: false,
  })),
}));

/**
 * Mock lab queries
 */
const mockProviderLabs = [
  {
    ...mockLab,
    id: 1,
    name: "AI Research Lab",
    isListed: true,
    availableBalance: "5000000000000000000", // 5 LAB tokens
  },
  {
    ...mockLab,
    id: 2,
    name: "Quantum Computing Lab",
    isListed: false,
    availableBalance: "2000000000000000000", // 2 LAB tokens
  },
];

jest.mock("@/hooks/lab/useLabs", () => ({
  useLabsForProvider: jest.fn(() => ({
    data: { labs: mockProviderLabs },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })),
  useLabReservations: jest.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
  })),
  // Re-export mutation hooks from useLabAtomicMutations
  useAddLab: jest.fn(() => mockAddLabMutation),
  useUpdateLab: jest.fn(() => mockUpdateLabMutation),
  useDeleteLab: jest.fn(() => mockDeleteLabMutation),
  useListLab: jest.fn(() => mockListLabMutation),
  useUnlistLab: jest.fn(() => mockUnlistLabMutation),
}));

/**
 * Mock booking hooks
 */
jest.mock("@/hooks/booking/useBookings", () => ({
  useRequestFunds: jest.fn(() => mockRequestFundsMutation),
  useLabBookingsDashboard: jest.fn(() => ({
    data: { bookings: [] },
    isLoading: false,
    isError: false,
  })),
  useBookingFilter: jest.fn(() => ({
    filteredBookings: [],
    dayClassName: jest.fn(() => ""),
  })),
}));

/**
 * Mock next/navigation router
 */
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/providerdashboard",
}));

/**
 * Mock User Context to simulate authenticated provider
 */
jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(() => ({
    isProvider: true,
    isProviderLoading: false,
    address: "0x1234567890123456789012345678901234567890",
    isSSO: true,
    isAuthenticated: true,
    isInstitutionRegistered: true,
    isInstitutionRegistrationLoading: false,
    institutionRegistrationStatus: "registered",
    user: {
      name: "Dr. Provider",
      email: "provider@university.edu",
      role: "faculty",
    },
  })),
  UserData: ({ children }) => children,
}));

/**
 * Mock Notification Context
 */
jest.mock("@/context/NotificationContext", () => ({
  NotificationProvider: ({ children }) => children,
  useNotifications: () => ({
    addTemporaryNotification: jest.fn(),
    addNotification: jest.fn(() => ({ id: 'notif_1' })),
    removeNotification: jest.fn(),
    addErrorNotification: jest.fn(),
    addSuccessNotification: jest.fn(),
  }),
}));

/**
 * Mock OptimisticUI Context
 */
jest.mock("@/context/OptimisticUIContext", () => ({
  OptimisticUIProvider: ({ children }) => children,
  useOptimisticUI: () => ({
    optimisticData: {},
    addOptimisticData: jest.fn(),
    removeOptimisticData: jest.fn(),
    getEffectiveListingState: jest.fn((labId, serverIsListed) => ({
      isListed: serverIsListed,
      isPending: false,
      operation: null,
    })),
  }),
}));

/**
 * Mock LabToken Context
 */
jest.mock("@/context/LabTokenContext", () => ({
  LabTokenProvider: ({ children }) => children,
  useLabToken: () => ({
    balance: BigInt("15500000000000000000"),
    allowance: BigInt("10000000000000000000"),
    decimals: 18,
    isLoading: false,
    labTokenAddress: "0xMockLabTokenAddress",
    formatTokenAmount: jest.fn((amount) => "5.00"),
    formatPrice: jest.fn((price) => "0.50"),
  }),
}));

/**
 * Mock next/image to avoid Next.js image optimization in tests
 */
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props) => {
    return <img {...props} />;
  },
}));

// Setup global mocks
beforeAll(() => {
  // Mock URL.createObjectURL for file uploads
  global.URL.createObjectURL = jest.fn(() => "https://mock-image.com/test.jpg");

  // Mock window.confirm for delete actions
  global.confirm = jest.fn(() => true);
});

describe("Provider Dashboard Flow Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Test Case: Dashboard displays provider's labs
   * Verifies that the dashboard correctly fetches and displays owned labs
   */
  test("displays provider's labs in dropdown selector", async () => {
    renderWithAllProviders(<ProviderDashboardPage />);

    // Wait for dropdown to be rendered
    const labSelector = await screen.findByRole("combobox");

    // Verify dropdown is present and first lab is auto-selected
    expect(labSelector).toBeInTheDocument();
    expect(labSelector.value).toBe("1"); // First lab should be auto-selected

    // Verify lab option exists in dropdown
    expect(
      screen.getByRole("option", { name: /AI Research Lab/i })
    ).toBeInTheDocument();
  });

  /**
   * Test Case: Lab selection updates displayed lab details
   * Verifies that selecting a different lab updates the view
   */
  test("updates lab details when different lab is selected", async () => {
    renderWithAllProviders(<ProviderDashboardPage />);

    // Wait for dropdown to be rendered with first lab selected
    const labSelector = await screen.findByRole("combobox");
    expect(labSelector.value).toBe("1");

    // Change selection to lab 2
    fireEvent.change(labSelector, { target: { value: "2" } });

    // Verify the selected lab changed
    await waitFor(() => {
      expect(labSelector.value).toBe("2");
    });
  });

  /**
   * Test Case: Add New Lab button opens modal
   * Verifies that clicking "Add New Lab" opens the lab creation modal
   */
  test("opens lab modal when Add New Lab button is clicked", async () => {
    renderWithAllProviders(<ProviderDashboardPage />);

    // Wait for dashboard to load by checking for the add button
    const addButton = await screen.findByRole("button", {
      name: /add new lab/i,
    });

    // Click the Add New Lab button
    fireEvent.click(addButton);

    // Verify modal opened by checking for the modal heading (h2 element)
    await waitFor(() => {
      const modalHeading = screen.getByRole("heading", {
        name: /add new lab/i,
        level: 2,
      });
      expect(modalHeading).toBeInTheDocument();
    });
  });

  /**
   * Test Case: Edit lab button opens modal with lab data
   * Verifies that clicking Edit loads existing lab data into the form
   */
  test("opens lab modal in edit mode with existing lab data", async () => {
    renderWithAllProviders(<ProviderDashboardPage />);

    // Wait for Edit button to be available
    const editButton = await screen.findByRole("button", { name: /edit/i });
    fireEvent.click(editButton);

    // Verify modal opened with "Edit Lab" heading
    const modalHeading = await screen.findByRole("heading", {
      name: /edit lab/i,
      level: 2,
    });
    expect(modalHeading).toBeInTheDocument();

    // Verify lab name is pre-filled: should appear in both dropdown (value="1") and modal textbox
    const labNameElements = screen.getAllByDisplayValue(/AI Research Lab/i);
    // Expect at least 2: one in the dropdown option, one in the modal's name input field
    expect(labNameElements).toHaveLength(2);
  });

  /**
   * Test Case: List action makes lab visible in marketplace
   * Verifies that clicking List triggers the mutation and updates optimistic UI
   */
  test("lists unlisted lab when List button is clicked", async () => {
    renderWithAllProviders(<ProviderDashboardPage />);

    // Wait for labs to load
    await waitFor(() => {
      const labSelector = screen.getByRole("combobox");
      expect(labSelector).toBeInTheDocument();
    });

    // Select the unlisted lab (lab 2 which is unlisted according to mockProviderLabs)
    const labSelector = screen.getByRole("combobox");
    fireEvent.change(labSelector, { target: { value: "2" } });

    // Find and click List button - use getAllByRole and find the specific one
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      const listButton = buttons.find(
        (btn) =>
          btn.textContent.match(/list/i) && !btn.textContent.match(/unlist/i)
      );
      expect(listButton).toBeDefined();
      fireEvent.click(listButton);
    });

    // Verify mutation was called
    await waitFor(() => {
      expect(mockListLabMutation.mutateAsync).toHaveBeenCalled();
    });
  });

  /**
   * Test Case: Unlist action removes lab from marketplace
   * Verifies that clicking Unlist triggers the mutation
   */
  test("unlists listed lab when Unlist button is clicked", async () => {
    renderWithAllProviders(<ProviderDashboardPage />);

    // Wait for Unlist button to appear (default is lab 1 which is listed)
    const unlistButton = await screen.findByRole("button", { name: /unlist/i });

    // Click Unlist button
    fireEvent.click(unlistButton);

    // Verify mutation was called
    await waitFor(() => {
      expect(mockUnlistLabMutation.mutateAsync).toHaveBeenCalled();
    });
  });

  /**
   * Test Case: Delete lab
   * Verifies that clicking Delete calls the delete mutation
   */
  test("deletes lab when Delete button is clicked", async () => {
    renderWithAllProviders(<ProviderDashboardPage />);

    // Wait for Delete button to appear
    const deleteButton = await screen.findByRole("button", { name: /delete/i });

    // Click Delete button
    fireEvent.click(deleteButton);

    // Verify mutation was called
    await waitFor(() => {
      expect(mockDeleteLabMutation.mutateAsync).toHaveBeenCalled();
    });
  });

  /**
   * Test Case: Collect All funds from labs
   * Verifies that clicking Collect All triggers fund collection mutation
   */
  test("collects all funds when Collect All button is clicked", async () => {
    renderWithAllProviders(<ProviderDashboardPage />);

    // Wait for Collect All button to appear
    const collectButton = await screen.findByRole("button", {
      name: /collect all/i,
    });

    // Click Collect All button
    fireEvent.click(collectButton);

    // Verify mutation was called
    await waitFor(() => {
      expect(mockRequestFundsMutation.mutateAsync).toHaveBeenCalled();
    });
  });

  /**
   * Test Case: Access control redirects non-providers
   * Verifies that non-providers are redirected to home page
   */
  test("redirects non-providers to home page", async () => {
    // Mock useUser to return non-provider
    const { useUser } = require("@/context/UserContext");
    useUser.mockReturnValue({
      isProvider: false,
      isProviderLoading: false,
      address: "0x1234567890123456789012345678901234567890",
      isSSO: true,
      isAuthenticated: true,
      isInstitutionRegistered: false,
      isInstitutionRegistrationLoading: false,
      institutionRegistrationStatus: "unregistered",
    });

    renderWithAllProviders(<ProviderDashboardPage />);

    // Verify redirect was called
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  /**
   * Test Case: Loading state while checking provider status
   * Verifies that connecting message is shown while provider status is being checked
   */
  test("shows connecting message while checking provider status", async () => {
    // Mock useUser to return loading state
    const { useUser } = require("@/context/UserContext");
    useUser.mockReturnValue({
      isProvider: false,
      isProviderLoading: true,
      address: null,
      isSSO: false,
      isAuthenticated: false,
      isLoading: true,
    });

    renderWithAllProviders(<ProviderDashboardPage />);

    // Verify connecting message is shown while loading
    await waitFor(() => {
      expect(screen.getByText(/connecting/i)).toBeInTheDocument();
    });
  });
});
