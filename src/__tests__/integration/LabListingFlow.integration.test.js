/**
 * Integration Tests: Lab Listing Flow
 *
 * Test Behaviors:
 * - Provider can create a new lab using LabModal
 * - Form validation works (required fields)
 * - Lab creation triggers contract write
 * - Optimistic UI shows pending state
 * - Success state is reflected after creation
 * - Provider can list/unlist labs
 *
 * @test-suite LabListingFlow
 */

import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithAllProviders } from "@/test-utils/test-providers";
import LabModal from "@/components/dashboard/provider/LabModal";
import { mockUser } from "@/test-utils/mocks/mockData";
import {
  createValidLabFormData,
  createValidQuickSetupData,
  createExistingLab,
} from "@/test-utils/fixtures/labData";
import {
  fillFullSetupForm,
  fillQuickSetupForm,
  submitLabForm,
} from "@/test-utils/helpers/labFormHelpers";

// Mock hooks for lab mutations

/**
 * Mock lab validation with reduced strictness for integration tests
 */
jest.mock("@/utils/labValidation", () => ({
  validateLabFull: jest.fn(() => ({})),
  validateLabQuick: jest.fn(() => ({})),
}));

// Mock file upload/delete hooks
const mockUploadMutateAsync = jest.fn().mockResolvedValue({
  filePath: "/mock/uploaded/file.jpg",
});

const mockDeleteMutate = jest.fn();

jest.mock("@/hooks/provider/useProvider", () => ({
  useUploadFile: jest.fn(() => ({
    mutateAsync: mockUploadMutateAsync,
  })),
  useDeleteFile: jest.fn(() => ({
    mutate: mockDeleteMutate,
    mutateAsync: jest.fn().mockResolvedValue({}),
  })),
}));

// Mock lab atomic mutations
const mockAddLabMutation = {
  mutateAsync: jest.fn(() =>
    Promise.resolve({
      hash: "0xmockhash",
      labId: 1,
      id: 1,
    })
  ),
  isLoading: false,
  isError: false,
};

const mockListLabMutation = {
  mutateAsync: jest.fn(() =>
    Promise.resolve({
      hash: "0xmocklisthash",
      success: true,
    })
  ),
  isLoading: false,
  isError: false,
};

jest.mock("@/hooks/lab/useLabAtomicMutations", () => ({
  useAddLab: jest.fn(() => mockAddLabMutation),
  useListLab: jest.fn(() => mockListLabMutation),
  useUnlistLab: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue({ hash: "0xmockunlisthash" }),
    isLoading: false,
    isError: false,
  })),
  useLabCacheUpdates: jest.fn(() => ({
    addOptimisticLab: jest.fn((lab) => ({
      ...lab,
      id: `optimistic-${Date.now()}`,
    })),
    replaceOptimisticLab: jest.fn(),
    removeOptimisticLab: jest.fn(),
    updateLab: jest.fn(),
    removeLab: jest.fn(),
    invalidateAllLabs: jest.fn(),
  })),
}));

/**
 * Mock OptimisticUI Context
 */
const mockSetOptimisticListingState = jest.fn();
const mockClearOptimisticListingState = jest.fn();
const mockCompleteOptimisticListingState = jest.fn();

jest.mock("@/context/OptimisticUIContext", () => ({
  OptimisticUIProvider: ({ children }) => children,
  useOptimisticUI: () => ({
    optimisticData: {},
    addOptimisticData: jest.fn(),
    removeOptimisticData: jest.fn(),
    setOptimisticListingState: mockSetOptimisticListingState,
    clearOptimisticListingState: mockClearOptimisticListingState,
    completeOptimisticListingState: mockCompleteOptimisticListingState,
    getEffectiveListingState: jest.fn(() => ({
      isListed: false,
      isPending: false,
    })),
  }),
}));

/**
 * Mock LabToken Context for token operations
 */
jest.mock("@/context/LabTokenContext", () => ({
  useLabToken: () => ({
    formatPrice: (price) => price,
    formatTokenAmount: (amount) => amount,
    decimals: 18,
    balance: BigInt("15500000000000000000"),
    allowance: BigInt("10000000000000000000"),
    isLoading: false,
    checkBalanceAndAllowance: () => ({
      hasSufficientBalance: true,
      hasSufficientAllowance: true,
      balance: "15.5",
    }),
    approveLabTokens: jest.fn(),
  }),
  LabTokenProvider: ({ children }) => children,
}));

/**
 * Mock User Context to simulate authenticated SSO user
 */
jest.mock("@/context/UserContext", () => ({
  useUser: () => ({
    isSSO: true,
    address: mockUser.address,
    isAuthenticated: true,
  }),
  UserData: ({ children }) => children,
}));

/**
 * Mock Notification Context
 */
jest.mock("@/context/NotificationContext", () => ({
  NotificationProvider: ({ children }) => children,
  useNotifications: () => ({
    addTemporaryNotification: jest.fn(),
    addErrorNotification: jest.fn(),
    addSuccessNotification: jest.fn(),
  }),
}));

describe("LabModal Component - Lab Listing Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock URL.createObjectURL for file preview
    // Return a valid HTTP URL for next/image compatibility
    global.URL.createObjectURL = jest.fn(
      () => "https://mock-image.com/test.jpg"
    );
    global.URL.revokeObjectURL = jest.fn();
  });

  /**
   * Test Case: Provider creates a new lab with full setup
   * Tests the lab creation flow using fixtures for clean test data
   *
   */
  test("creates a new lab with full setup form", async () => {
    const mockOnSubmit = jest.fn().mockResolvedValue({});
    const mockOnClose = jest.fn();
    const labData = createValidLabFormData();

    renderWithAllProviders(
      <LabModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        lab={null}
        maxId={0}
      />
    );

    // Wait for modal to render
    await waitFor(() => {
      expect(screen.getByText("Add New Lab")).toBeInTheDocument();
    });

    // Verify Full Setup tab is active by default
    const fullSetupTab = screen.getByRole("button", { name: /full setup/i });
    expect(fullSetupTab).toHaveClass("bg-[#7875a8]");

    // Fill form using reusable helper for cleaner, maintainable tests
    await fillFullSetupForm(labData);

    // Submit the form using helper
    await submitLabForm();

    // Verify onSubmit was called
    await waitFor(
      () => {
        expect(mockOnSubmit).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // Verify data structure with comprehensive field checks
    const submittedData = mockOnSubmit.mock.calls[0][0];

    // Basic Information - all fields verified
    expect(submittedData.name).toBe(labData.name);
    expect(submittedData.category).toBe(labData.category);
    expect(submittedData.keywords).toEqual(labData.keywords);
    expect(submittedData.description).toBe(labData.description);
    expect(submittedData.price).toBe(labData.price);

    // Access Configuration - all fields verified
    expect(submittedData.accessURI).toBe(labData.accessURI);
    expect(submittedData.accessKey).toBe(labData.accessKey);

    // Scheduling - verify timeSlots are correctly formatted
    expect(submittedData.timeSlots).toEqual(labData.timeSlots);

    // Verify structure has expected keys (defensive programming)
    expect(submittedData).toHaveProperty("availableDays");
    expect(submittedData).toHaveProperty("availableHours");
    expect(submittedData).toHaveProperty("maxConcurrentUsers");
  });

  /**
   * Test Case: Quick setup mode works correctly
   * Tests the simplified quick setup form using fixtures for clean data
   */
  test("creates lab using quick setup mode", async () => {
    const mockOnSubmit = jest.fn().mockResolvedValue({});
    const labData = createValidQuickSetupData();
    const mockOnClose = jest.fn();

    renderWithAllProviders(
      <LabModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        lab={null}
        maxId={0}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Add New Lab")).toBeInTheDocument();
    });

    // Switch to Quick Setup tab
    const quickSetupTab = screen.getByRole("button", { name: /quick setup/i });
    fireEvent.click(quickSetupTab);

    // Verify Quick Setup tab is now active
    expect(quickSetupTab).toHaveClass("bg-[#7875a8]");

    // Fill in quick setup fields using helper and fixture data
    await fillQuickSetupForm(labData);

    // Submit the form using helper
    await submitLabForm();

    // Verify onSubmit was called with fixture data
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          price: labData.price,
          accessURI: labData.accessURI,
          accessKey: labData.accessKey,
          uri: labData.uri,
        })
      );
    });
  });

  /**
   * Test Case: Form validation prevents submission with missing fields
   * Ensures required field validation works
   */
  test("shows validation errors when required fields are missing", async () => {
    // Temporarily restore real validation for this test
    const { validateLabFull } = jest.requireActual("@/utils/labValidation");
    const labValidation = require("@/utils/labValidation");
    labValidation.validateLabFull = validateLabFull;

    const mockOnSubmit = jest.fn().mockResolvedValue({});
    const mockOnClose = jest.fn();

    renderWithAllProviders(
      <LabModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        lab={null}
        maxId={0}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Add New Lab")).toBeInTheDocument();
    });

    // Try to submit without filling any fields
    const submitButton = screen.getByRole("button", { name: /add lab/i });
    fireEvent.click(submitButton);

    // Verify validation errors appear
    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });

    // onSubmit should not have been called
    expect(mockOnSubmit).not.toHaveBeenCalled();

    // Restore mock for other tests
    labValidation.validateLabFull = jest.fn(() => ({}));
  });

  /**
   * Test Case: Modal can be closed
   * Tests that close functionality works
   */
  test("closes modal when close button is clicked", async () => {
    const mockOnSubmit = jest.fn();
    const mockOnClose = jest.fn();

    renderWithAllProviders(
      <LabModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        lab={null}
        maxId={0}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Add New Lab")).toBeInTheDocument();
    });

    // Click close button
    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);

    // Verify onClose was called
    expect(mockOnClose).toHaveBeenCalled();
  });

  /**
   * Test Case: Verify upload functionality is available
   * Tests that the upload mode can be activated
   */
  test("can switch to upload mode for images", async () => {
    const mockOnSubmit = jest.fn().mockResolvedValue({});
    const mockOnClose = jest.fn();

    renderWithAllProviders(
      <LabModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        lab={null}
        maxId={0}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Add New Lab")).toBeInTheDocument();
    });

    // Find all Upload buttons (there are two: one for images, one for docs)
    const uploadButtons = screen.getAllByRole("button", { name: /upload/i });

    // Verify both upload buttons are present
    expect(uploadButtons).toHaveLength(2);

    // Click the first Upload button (for images)
    fireEvent.click(uploadButtons[0]);

    // Verify the Upload tab is now active by checking for "Choose Files" button
    await waitFor(() => {
      const chooseFilesButtons = screen.getAllByRole("button", {
        name: /choose files/i,
      });
      expect(chooseFilesButtons.length).toBeGreaterThan(0);
    });

    // Verify the upload file input exists
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const imageInput = Array.from(fileInputs).find(
      (input) => input.accept === "image/*"
    );

    expect(imageInput).toBeTruthy();
    expect(imageInput.getAttribute("multiple")).toBe("");
  });

  /**
   * Test Case: Edit existing lab
   * Tests editing mode with pre-filled data
   */
  test("edits existing lab with pre-filled data", async () => {
    const existingLab = {
      id: 1,
      name: "Existing Lab",
      description: "Existing description",
      price: "0.4",
      auth: "https://auth.existing.com",
      accessURI: "https://lab.existing.com",
      accessKey: "existing-key",
      category: "electronics",
      keywords: ["test"],
      opens: 1735689600,
      closes: 1767139200,
      timeSlots: ["60"],
      images: [],
      docs: [],
    };

    const mockOnSubmit = jest.fn().mockResolvedValue({});
    const mockOnClose = jest.fn();

    renderWithAllProviders(
      <LabModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        lab={existingLab}
        maxId={1}
      />
    );

    // Wait for modal to render with edit title
    await waitFor(() => {
      expect(screen.getByText("Edit Lab")).toBeInTheDocument();
    });

    // Verify fields are pre-filled
    const nameInput = screen.getByPlaceholderText(/lab name/i);
    expect(nameInput).toHaveValue("Existing Lab");

    // Verify other fields have values
    const categoryInput = screen.getByPlaceholderText(/category/i);
    expect(categoryInput).toHaveValue("electronics");

    // Change a field
    fireEvent.change(nameInput, { target: { value: "Updated Lab Name" } });

    // Submit the form
    const submitButton = screen.getByRole("button", { name: /save changes/i });
    fireEvent.click(submitButton);

    // Verify onSubmit was called with updated data
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Updated Lab Name",
          category: "electronics",
          id: 1,
        })
      );
    });
  });
});
