/**
 *
 * Unit tests for LabFormFullSetup component
 *
 * Tested Behaviors:
 * - Form renders correctly with lab data
 * - Text inputs update lab state with correct values
 * - Array fields split comma-separated values correctly
 * - Image/doc toggles switch between link and upload modes
 * - File upload displays selected files and allows removal
 * - Preview lists display URLs and handle removal
 * - External URI mode disables all form controls
 * - Validation errors display for invalid fields
 * - Form submission and cancellation work correctly
 * - Edge cases (empty, null, undefined values) are handled gracefully
 */

import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// Polyfill for jsdom environment (form.requestSubmit not available in jest)
if (!HTMLFormElement.prototype.requestSubmit) {
  HTMLFormElement.prototype.requestSubmit = function () {
    this.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
  };
}

// Mock icon components from lucide-react
// Use data-testid for reliable element selection in tests
jest.mock("lucide-react", () => ({
  UploadCloud: () => <span data-testid="upload-icon">Upload</span>,
  Link: () => <span data-testid="link-icon">Link</span>,
  XCircle: () => <span data-testid="x-icon">X</span>,
}));

// Mock ImagePreviewList component
// Simplified version for testing - only tests the contract/interface
jest.mock("@/components/ui/media/ImagePreviewList.js", () => ({
  __esModule: true,
  default: ({ imageUrls, removeImage }) => (
    <div data-testid="image-preview-list">
      {imageUrls.map((url, i) => (
        <div key={i} data-testid={`image-preview-${i}`}>
          <span>{url}</span>
          <button type="button" onClick={() => removeImage(i)}>
            Remove Image
          </button>
        </div>
      ))}
    </div>
  ),
}));

// Mock DocPreviewList component
jest.mock("@/components/ui/media/DocPreviewList.js", () => ({
  __esModule: true,
  default: ({ docUrls, removeDoc }) => (
    <div data-testid="doc-preview-list">
      {docUrls.map((url, i) => (
        <div key={i} data-testid={`doc-preview-${i}`}>
          <span>{url}</span>
          <button type="button" onClick={() => removeDoc(i)}>
            Remove Doc
          </button>
        </div>
      ))}
    </div>
  ),
}));

// Component under test
import LabFormFullSetup from "@/components/dashboard/provider/LabFormFullSetup";

// Test fixtures - represents typical lab data
const mockLab = {
  id: "1",
  name: "Test Lab",
  category: "Biology",
  keywords: ["bio", "lab"],
  description: "Test description",
  price: "100",
  auth: "https://auth.test.com",
  accessURI: "https://access.test.com",
  accessKey: "key123",
  timeSlots: ["9-12", "14-17"],
  opens: "01/15/2024",
  closes: "12/31/2024",
  images: [],
  docs: [],
};

// Mock handlers - track component behavior without executing real logic
const mockHandlers = {
  setLocalLab: jest.fn(),
  setImageInputType: jest.fn(),
  setDocInputType: jest.fn(),
  handleImageChange: jest.fn(),
  removeImage: jest.fn(),
  handleDocChange: jest.fn(),
  removeDoc: jest.fn(),
  onSubmit: jest.fn((e) => e?.preventDefault()),
  onCancel: jest.fn(),
};

/**
 * Helper function to render component with default props
 * Allows easy overriding of specific props for different test scenarios
 */
const renderForm = (overrides = {}) => {
  const props = {
    localLab: mockLab,
    setLocalLab: mockHandlers.setLocalLab,
    errors: {},
    isExternalURI: false,
    imageInputType: "link",
    setImageInputType: mockHandlers.setImageInputType,
    imageUrls: [],
    imageLinkRef: { current: null },
    imageUploadRef: { current: null },
    handleImageChange: mockHandlers.handleImageChange,
    removeImage: mockHandlers.removeImage,
    localImages: [],
    docInputType: "link",
    setDocInputType: mockHandlers.setDocInputType,
    docUrls: [],
    docLinkRef: { current: null },
    docUploadRef: { current: null },
    handleDocChange: mockHandlers.handleDocChange,
    removeDoc: mockHandlers.removeDoc,
    localDocs: [],
    nameRef: { current: null },
    categoryRef: { current: null },
    keywordsRef: { current: null },
    descriptionRef: { current: null },
    priceRef: { current: null },
    authRef: { current: null },
    accessURIRef: { current: null },
    accessKeyRef: { current: null },
    timeSlotsRef: { current: null },
    opensRef: { current: null },
    closesRef: { current: null },
    onSubmit: mockHandlers.onSubmit,
    onCancel: mockHandlers.onCancel,
    ...overrides,
  };
  return render(<LabFormFullSetup {...props} />);
};

describe("LabFormFullSetup", () => {
  // Reset all mocks before each test to ensure test isolation
  beforeEach(() => jest.clearAllMocks());

  describe("Form Rendering", () => {
    test("renders all form fields with correct initial values", () => {
      renderForm();

      // Test representative fields (not every single one)
      // Covers different input types: text, number, textarea
      expect(screen.getByDisplayValue("Test Lab")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Biology")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Test description")).toBeInTheDocument();
      expect(screen.getByDisplayValue("100")).toBeInTheDocument();
      expect(screen.getByDisplayValue("bio,lab")).toBeInTheDocument();
      expect(screen.getByDisplayValue("9-12,14-17")).toBeInTheDocument();
    });

    test("displays correct button text based on lab id", () => {
      // New lab (no id) shows "Add Lab"
      const { unmount } = renderForm({
        localLab: { ...mockLab, id: undefined },
      });
      expect(screen.getByText("Add Lab")).toBeInTheDocument();
      unmount();

      // Existing lab (with id) shows "Save Changes"
      renderForm({ localLab: mockLab });
      expect(screen.getByText("Save Changes")).toBeInTheDocument();
    });
  });

  describe("Form Input Updates", () => {
    test("updates text inputs with correct values", () => {
      renderForm();

      // Test a few representative text inputs
      // Pattern is the same for all, no need to test every single one
      const nameInput = screen.getByPlaceholderText("Lab Name");
      fireEvent.change(nameInput, { target: { value: "New Lab Name" } });

      expect(mockHandlers.setLocalLab).toHaveBeenCalledWith({
        ...mockLab,
        name: "New Lab Name",
      });

      const categoryInput = screen.getByPlaceholderText("Category");
      fireEvent.change(categoryInput, { target: { value: "Chemistry" } });

      expect(mockHandlers.setLocalLab).toHaveBeenCalledWith({
        ...mockLab,
        category: "Chemistry",
      });
    });

    test("splits comma-separated values into arrays", () => {
      renderForm();

      // Test keywords splitting
      const keywordsInput = screen.getByPlaceholderText(
        "Keywords (comma-separated)"
      );
      fireEvent.change(keywordsInput, {
        target: { value: "physics,chemistry,biology" },
      });

      expect(mockHandlers.setLocalLab).toHaveBeenCalledWith({
        ...mockLab,
        keywords: ["physics", "chemistry", "biology"],
      });

      // Test timeSlots splitting (same pattern, verify it works)
      const slotsInput = screen.getByPlaceholderText(
        "Time Slots (comma-separated)"
      );
      fireEvent.change(slotsInput, { target: { value: "8-10,10-12" } });

      expect(mockHandlers.setLocalLab).toHaveBeenCalledWith({
        ...mockLab,
        timeSlots: ["8-10", "10-12"],
      });
    });
  });

  describe("Image Upload Toggle", () => {
    test("switches between link and upload modes", async () => {
      const user = userEvent.setup();
      renderForm({ imageInputType: "link" });

      // Switch to upload mode
      const uploadButtons = screen.getAllByText("Upload");
      await user.click(uploadButtons[0]); // First Upload button (for images)

      expect(mockHandlers.setImageInputType).toHaveBeenCalledWith("upload");
      expect(mockHandlers.setImageInputType).toHaveBeenCalledTimes(1);
    });

    test("displays appropriate input for selected mode", () => {
      // Link mode shows URL input
      const { unmount } = renderForm({ imageInputType: "link" });
      expect(
        screen.getByPlaceholderText("Image URLs (comma-separated)")
      ).toBeInTheDocument();
      unmount();

      // Upload mode shows file chooser button
      renderForm({ imageInputType: "upload" });
      expect(screen.getAllByText("Choose Files")[0]).toBeInTheDocument();
    });

    test("updates image URLs when in link mode", () => {
      renderForm({ imageInputType: "link" });

      const input = screen.getByPlaceholderText("Image URLs (comma-separated)");
      fireEvent.change(input, {
        target: { value: "http://img1.jpg,http://img2.jpg" },
      });

      expect(mockHandlers.setLocalLab).toHaveBeenCalledWith({
        ...mockLab,
        images: ["http://img1.jpg", "http://img2.jpg"],
      });
    });
  });

  describe("Document Upload Toggle", () => {
    test("displays appropriate input for selected mode", () => {
      // Link mode shows URL input
      renderForm({ docInputType: "link" });
      expect(
        screen.getByPlaceholderText("Docs URLs (comma-separated)")
      ).toBeInTheDocument();
    });
  });

  describe("File Upload Handling", () => {
    test("displays selected image files with correct names", () => {
      const files = [
        new File([""], "photo1.jpg", { type: "image/jpeg" }),
        new File([""], "photo2.png", { type: "image/png" }),
      ];

      renderForm({ imageInputType: "upload", localImages: files });

      expect(screen.getByText("photo1.jpg")).toBeInTheDocument();
      expect(screen.getByText("photo2.png")).toBeInTheDocument();
    });

    test("displays selected document files with correct names", () => {
      const files = [new File([""], "manual.pdf", { type: "application/pdf" })];

      renderForm({ docInputType: "upload", localDocs: files });

      expect(screen.getByText("manual.pdf")).toBeInTheDocument();
    });

    test("removes file when remove button clicked", async () => {
      const user = userEvent.setup();
      const files = [
        new File([""], "image1.jpg", { type: "image/jpeg" }),
        new File([""], "image2.jpg", { type: "image/jpeg" }),
      ];

      renderForm({ imageInputType: "upload", localImages: files });

      // Click remove button for second file
      const removeButtons = screen.getAllByTestId("x-icon");
      await user.click(removeButtons[1]);

      expect(mockHandlers.removeImage).toHaveBeenCalledWith(1);
      expect(mockHandlers.removeImage).toHaveBeenCalledTimes(1);
    });
  });

  describe("Preview Lists", () => {
    test("displays image preview list with URLs", () => {
      renderForm({
        imageInputType: "upload",
        imageUrls: ["http://img1.jpg", "http://img2.jpg"],
      });

      const preview = screen.getByTestId("image-preview-list");
      expect(preview).toBeInTheDocument();
      expect(screen.getByText("http://img1.jpg")).toBeInTheDocument();
      expect(screen.getByText("http://img2.jpg")).toBeInTheDocument();
    });

    test("removes image from preview list when clicked", async () => {
      const user = userEvent.setup();
      renderForm({
        imageInputType: "upload",
        imageUrls: ["http://img1.jpg"],
      });

      await user.click(screen.getByText("Remove Image"));

      expect(mockHandlers.removeImage).toHaveBeenCalledWith(0);
    });

    test("displays doc preview list with URLs", () => {
      renderForm({
        docInputType: "upload",
        docUrls: ["http://doc1.pdf"],
      });

      const preview = screen.getByTestId("doc-preview-list");
      expect(preview).toBeInTheDocument();
      expect(screen.getByText("http://doc1.pdf")).toBeInTheDocument();
    });
  });

  describe("External URI Mode", () => {
    test("disables all form controls when external URI is active", () => {
      renderForm({ isExternalURI: true });

      // Check that key inputs are disabled
      expect(screen.getByPlaceholderText("Lab Name")).toBeDisabled();
      expect(screen.getByPlaceholderText("Category")).toBeDisabled();
      expect(screen.getByPlaceholderText("Price")).toBeDisabled();
      expect(screen.getByText("Save Changes")).toBeDisabled();

      // Check that toggle buttons are disabled
      const buttons = screen
        .getAllByRole("button")
        .filter(
          (btn) =>
            btn.textContent.includes("Link") ||
            btn.textContent.includes("Upload")
        );
      buttons.forEach((btn) => expect(btn).toBeDisabled());
    });

    test("displays warning message in external URI mode", () => {
      renderForm({ isExternalURI: true });

      expect(
        screen.getByText(/To edit these fields, first remove the link/)
      ).toBeInTheDocument();
    });

    test("enables all controls when external URI is not active", () => {
      renderForm({ isExternalURI: false });

      expect(screen.getByPlaceholderText("Lab Name")).not.toBeDisabled();
      expect(screen.getByPlaceholderText("Category")).not.toBeDisabled();
      expect(screen.getByText("Save Changes")).not.toBeDisabled();
    });
  });

  describe("Validation Errors", () => {
    test("displays single validation error", () => {
      renderForm({ errors: { name: "Name is required" } });

      expect(screen.getByText("Name is required")).toBeInTheDocument();
    });

    test("displays multiple validation errors simultaneously", () => {
      const errors = {
        name: "Name is required",
        category: "Category is required",
        price: "Price must be a number",
      };

      renderForm({ errors });

      expect(screen.getByText("Name is required")).toBeInTheDocument();
      expect(screen.getByText("Category is required")).toBeInTheDocument();
      expect(screen.getByText("Price must be a number")).toBeInTheDocument();
    });
  });

  describe("Form Actions", () => {
    test("calls onSubmit when form is submitted", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByText("Save Changes"));

      expect(mockHandlers.onSubmit).toHaveBeenCalled();
      expect(mockHandlers.onSubmit).toHaveBeenCalledTimes(1);
    });

    test("calls onCancel when close button is clicked", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByText("Close"));

      expect(mockHandlers.onCancel).toHaveBeenCalled();
      expect(mockHandlers.onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("Edge Cases", () => {
    test("handles empty lab object gracefully", () => {
      renderForm({ localLab: {} });

      expect(screen.getByPlaceholderText("Lab Name")).toHaveValue("");
      expect(screen.getByPlaceholderText("Category")).toHaveValue("");
      expect(screen.getByPlaceholderText("Price")).toHaveValue(null);
    });

    test("handles null and undefined array values", () => {
      renderForm({
        localLab: { ...mockLab, keywords: null, timeSlots: undefined },
      });

      expect(
        screen.getByPlaceholderText("Keywords (comma-separated)")
      ).toHaveValue("");
      expect(
        screen.getByPlaceholderText("Time Slots (comma-separated)")
      ).toHaveValue("");
    });

    test("handles empty arrays correctly", () => {
      renderForm({
        localLab: {
          ...mockLab,
          keywords: [],
          timeSlots: [],
          images: [],
          docs: [],
        },
      });

      expect(
        screen.getByPlaceholderText("Keywords (comma-separated)")
      ).toHaveValue("");
      expect(
        screen.getByPlaceholderText("Time Slots (comma-separated)")
      ).toHaveValue("");
    });
  });
});
