/**
 * Unit tests for LabFormWizard component
 *
 * Tested Behaviors:
 * - Modal renders when open, hidden when closed
 * - Tab switching changes active view correctly
 * - Form data updates propagate to child components
 * - File upload managers handle images and documents
 * - Form validation prevents invalid submissions
 * - Submit calls onSubmit with correct data structure
 * - Reset restores initial lab state
 * - Loading states disable controls during submission
 * - Close button and cancel work correctly
 * - Edge cases (empty lab, new lab vs edit) handled properly
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// Mock external hooks
jest.mock("@/hooks/lab/useLabs", () => ({
  useLabValidation: jest.fn(),
}));

jest.mock("@/hooks/provider/useProvider", () => ({
  useUploadFile: jest.fn(),
}));

// Mock child components - we test these separately
jest.mock("@/components/dashboard/provider/LabFormFullSetup", () => ({
  __esModule: true,
  default: ({ localLab, setLocalLab, errors }) => (
    <div data-testid="full-setup-form">
      <span>Full Setup Form</span>
      <span data-testid="form-data">{JSON.stringify(localLab)}</span>
      <span data-testid="form-errors">{JSON.stringify(errors)}</span>
      <button onClick={() => setLocalLab({ ...localLab, name: "Updated" })}>
        Update Form
      </button>
    </div>
  ),
}));

jest.mock("@/components/dashboard/provider/LabFormQuickSetup", () => ({
  __esModule: true,
  default: ({ localLab }) => (
    <div data-testid="quick-setup-form">
      <span>Quick Setup Form</span>
      <span data-testid="form-data">{JSON.stringify(localLab)}</span>
    </div>
  ),
}));

jest.mock("@/components/ui/FileUploadManager", () => ({
  __esModule: true,
  default: ({
    type,
    inputType,
    urls,
    files,
    labId,
    onFileUpload,
    onUrlAdd,
  }) => (
    <div data-testid={`file-manager-${type}`}>
      <span>{type} Manager</span>
      <span data-testid={`${type}-urls`}>{urls.length} URLs</span>
      <span data-testid={`${type}-files`}>{files.length} files</span>
      <button onClick={() => onUrlAdd("http://test.url")}>Add URL</button>
      <button
        onClick={() => onFileUpload([new File([""], "test.jpg")], type, labId)}
      >
        Upload File
      </button>
    </div>
  ),
}));

// Mock logger
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import mocked hooks to configure them
import { useLabValidation } from "@/hooks/lab/useLabs";
import { useUploadFile } from "@/hooks/provider/useProvider";

// Test fixtures
const mockLab = {
  id: "1",
  name: "Test Lab",
  category: "Biology",
  keywords: ["bio", "lab"],
  description: "Test description",
  price: "100",
  imageUrls: [],
  docUrls: [],
};

const mockValidation = {
  validateLab: jest.fn(() => ({ isValid: true, errors: {} })),
  getErrors: jest.fn(() => ({})),
  isValid: jest.fn(() => true),
};

const mockUploadFile = {
  mutateAsync: jest.fn(async ({ file }) => ({
    url: `http://uploaded.com/${file.name}`,
  })),
};

/**
 * Helper to render wizard with default props
 */
const renderWizard = (props = {}) => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onSubmit: jest.fn(),
    lab: mockLab,
    maxId: 5,
    ...props,
  };

  return {
    ...render(<LabFormWizard {...defaultProps} />),
    props: defaultProps,
  };
};

// Helper to get the submit button regardless of Create/Update
const getSubmitButton = () =>
  screen.getByRole("button", { name: /create lab|update lab/i });

import LabFormWizard from "../LabFormWizard";
import { useUserEventContext } from "@/context/UserEventContext";

describe("LabFormWizard - Unit tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // default mocks set here so individual tests can override them before/after calling renderWizard
    useLabValidation.mockReturnValue(mockValidation);
    useUploadFile.mockReturnValue(mockUploadFile);
  });

  describe("Modal Visibility", () => {
    test("renders modal when isOpen is true (create mode)", () => {
      // render explicitly in "create" mode
      renderWizard({ isOpen: true, lab: {} });

      expect(screen.getByText("Create New Lab")).toBeInTheDocument();
      expect(screen.getByText("Full Setup")).toBeInTheDocument();
    });

    test("does not render modal when isOpen is false", () => {
      renderWizard({ isOpen: false });

      expect(screen.queryByText("Create New Lab")).not.toBeInTheDocument();
    });

    test('displays "Edit Lab" title for existing lab', () => {
      renderWizard({ lab: mockLab });

      expect(screen.getByText("Edit Lab")).toBeInTheDocument();
    });

    test('displays "Create New Lab" title for new lab', () => {
      renderWizard({ lab: {} });

      expect(screen.getByText("Create New Lab")).toBeInTheDocument();
    });
  });

  describe("Tab Navigation", () => {
    test("renders Full Setup tab as active by default", () => {
      renderWizard();

      expect(screen.getByTestId("full-setup-form")).toBeInTheDocument();
      expect(screen.queryByTestId("quick-setup-form")).not.toBeInTheDocument();
    });

    test("switches to Quick Setup when tab clicked", async () => {
      const user = userEvent.setup();
      renderWizard();

      await user.click(screen.getByText("Quick Setup"));

      expect(screen.getByTestId("quick-setup-form")).toBeInTheDocument();
      expect(screen.queryByTestId("full-setup-form")).not.toBeInTheDocument();
    });

    test("switches back to Full Setup when tab clicked", async () => {
      const user = userEvent.setup();
      renderWizard();

      // Go to Quick Setup
      await user.click(screen.getByText("Quick Setup"));
      expect(screen.getByTestId("quick-setup-form")).toBeInTheDocument();

      // Go back to Full Setup
      await user.click(screen.getByText("Full Setup"));
      expect(screen.getByTestId("full-setup-form")).toBeInTheDocument();
    });
  });

  describe("Form Data Management", () => {
    test("initializes form with lab data", () => {
      renderWizard({ lab: mockLab });

      const formDataElement = screen.getByTestId("form-data");
      const formData = JSON.parse(formDataElement.textContent);

      expect(formData.name).toBe("Test Lab");
      expect(formData.category).toBe("Biology");
    });

    test("updates form data through child component", async () => {
      const user = userEvent.setup();
      renderWizard({ lab: mockLab });

      // Trigger update from child component
      await user.click(screen.getByText("Update Form"));

      const formDataElement = screen.getByTestId("form-data");
      const formData = JSON.parse(formDataElement.textContent);

      expect(formData.name).toBe("Updated");
    });

    test("initializes with empty lab for new lab creation", () => {
      renderWizard({ lab: {}, maxId: 10 });

      const formDataElement = screen.getByTestId("form-data");
      const formData = JSON.parse(formDataElement.textContent);

      expect(formData.name).toBeUndefined();
    });
  });

  describe("File Upload Integration", () => {
    test("renders file managers for images and documents", () => {
      renderWizard();

      expect(screen.getByTestId("file-manager-image")).toBeInTheDocument();
      expect(screen.getByTestId("file-manager-document")).toBeInTheDocument();
    });
  });

  describe("Validation & Submission", () => {
    test("calls onSubmit with correct data structure on submit (create)", async () => {
      const user = userEvent.setup();
      // render in create mode to get new id behavior
      const { props } = renderWizard({ lab: {}, maxId: 5 });

      await user.click(getSubmitButton());

      await waitFor(() => {
        expect(props.onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 6, // maxId + 1
            imageUrls: [],
            docUrls: [],
          }),
          "full" // active tab
        );
      });
    });

    test('submits with "quick" tab when in Quick Setup Mode', async () => {
      const user = userEvent.setup();
      const { props } = renderWizard({ lab: {} });

      await user.click(screen.getByText("Quick Setup"));
      await user.click(getSubmitButton());

      await waitFor(() =>
        expect(props.onSubmit).toHaveBeenCalledWith(expect.any(Object), "quick")
      );
    });

    test("does not submit when validation fails", async () => {
      const user = userEvent.setup();
      const invalidValidation = {
        ...mockValidation,
        validateLab: jest.fn(() => ({
          isValid: false,
          errors: { name: "Required" },
        })),
        isValid: jest.fn(() => false),
      };
      // override the hook mock BEFORE render
      useLabValidation.mockReturnValue(invalidValidation);

      const { props } = renderWizard({ lab: {} });

      await user.click(getSubmitButton());

      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    test("disables submit button when form is invalid", () => {
      const invalidValidation = {
        ...mockValidation,
        isValid: jest.fn(() => false),
      };
      // override the hook mock BEFORE render
      useLabValidation.mockReturnValue(invalidValidation);

      renderWizard({ lab: {} });

      expect(getSubmitButton()).toBeDisabled();
    });

    test("closes modal after successful submission", async () => {
      const user = userEvent.setup();
      const { props } = renderWizard({ lab: {} });

      await user.click(getSubmitButton());

      await waitFor(() => {
        expect(props.onClose).toHaveBeenCalled();
      });
    });

    test('displays "Update Lab" for existing lab', () => {
      renderWizard({ lab: mockLab });

      expect(screen.getByText("Update Lab")).toBeInTheDocument();
    });
  });

  describe("Modal Actions", () => {
    test("calls onClose when close button clicked", async () => {
      const user = userEvent.setup();
      const { props } = renderWizard();

      const closeButton = screen
        .getByRole("button", { name: "" })
        .closest("button");
      await user.click(closeButton);

      expect(props.onClose).toHaveBeenCalled();
    });

    test("calls onClose when Cancel button clicked", async () => {
      const user = userEvent.setup();
      const { props } = renderWizard();

      await user.click(screen.getByText("Cancel"));

      expect(props.onClose).toHaveBeenCalled();
    });

    test("resets form to initial state when Reset clicked", async () => {
      const user = userEvent.setup();
      renderWizard({ lab: mockLab });

      // Update form
      await user.click(screen.getByText("Update Form"));

      // Reset form
      await user.click(screen.getByText("Reset"));

      // Should be back to original
      const formDataElement = screen.getByTestId("form-data");
      const formData = JSON.parse(formDataElement.textContent);
      expect(formData.name).toBe("Test Lab");
    });
  });

  describe("Loading States", () => {
    test("disables controls during submission", async () => {
      const user = userEvent.setup();
      const slowSubmit = jest.fn(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      renderWizard({ onSubmit: slowSubmit, lab: {} });

      const submitButton = getSubmitButton();
      await user.click(submitButton);

      // Should show loading state
      expect(screen.getByText("Saving...")).toBeInTheDocument();
      expect(screen.getByText("Full Setup")).toBeDisabled();
      expect(screen.getByText("Quick Setup")).toBeDisabled();
      expect(screen.getByText("Reset")).toBeDisabled();

      await waitFor(() => {
        expect(slowSubmit).toHaveBeenCalled();
      });
    });

    test('shows "Saving..." text during submission', async () => {
      const user = userEvent.setup();
      const slowSubmit = jest.fn(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      renderWizard({ onSubmit: slowSubmit, lab: {} });

      await user.click(getSubmitButton());

      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    test("handles empty lab object for new creation", () => {
      renderWizard({ lab: {}, maxId: 0 });

      expect(screen.getByText("Create New Lab")).toBeInTheDocument();
      expect(screen.getByTestId("full-setup-form")).toBeInTheDocument();
    });

    test("generates correct ID for new lab", async () => {
      const user = userEvent.setup();
      const maxId = 42;
      const { props } = renderWizard({ lab: {}, maxId });

      await user.click(getSubmitButton());

      await waitFor(() => {
        expect(props.onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 43, // maxId + 1
          }),
          expect.any(String)
        );
      });
    });

    test("uses existing lab ID when editing", async () => {
      const user = userEvent.setup();
      const labWithId = { ...mockLab, id: "99" };
      const { props } = renderWizard({ lab: labWithId });

      await user.click(screen.getByText("Update Lab"));

      await waitFor(() => {
        expect(props.onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "99", // Uses existing ID
          }),
          expect.any(String)
        );
      });
    });

    test("handles submission error gracefully", async () => {
      const user = userEvent.setup();
      const errorSubmit = jest
        .fn()
        .mockRejectedValue(new Error("Submit failed"));
      const { props } = renderWizard({ onSubmit: errorSubmit, lab: {} });

      await user.click(getSubmitButton());

      await waitFor(() => {
        expect(errorSubmit).toHaveBeenCalled();
        // Should not close modal on error — still in create view
        expect(screen.getByText("Create New Lab")).toBeInTheDocument();
      });
    });
  });
});
