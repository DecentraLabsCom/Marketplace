/**
 * Unit tests for LabFormQuickSetup component
 *
 * Tested Behaviors:
 * - Form renders with correct initial values
 * - Text and number inputs update lab state correctly
 * - URI field has special readonly/edit mode behavior
 * - isLocalURI mode disables form fields appropriately
 * - Warning messages display in correct scenarios
 * - Validation errors display for invalid fields
 * - Submit and cancel buttons work correctly
 * - Edge cases (empty lab, null values) handled gracefully
 */

import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import LabFormQuickSetup from "../LabFormQuickSetup";

// Test fixtures - represents typical lab data for quick setup
const mockLab = {
  id: "1",
  price: "100",
  accessURI: "https://access.test.com",
  accessKey: "key123",
  uri: "https://lab-data.json",
};

// Mock handlers - track component behavior
const mockHandlers = {
  setLocalLab: jest.fn(),
  setClickedToEditUri: jest.fn(),
  handleUriChange: jest.fn(),
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
    isLocalURI: false,
    priceRef: { current: null },
    accessURIRef: { current: null },
    accessKeyRef: { current: null },
    uriRef: { current: null },
    clickedToEditUri: false,
    setClickedToEditUri: mockHandlers.setClickedToEditUri,
    handleUriChange: mockHandlers.handleUriChange,
    onSubmit: mockHandlers.onSubmit,
    onCancel: mockHandlers.onCancel,
    lab: mockLab,
    ...overrides,
  };
  return render(<LabFormQuickSetup {...props} />);
};

describe("LabFormQuickSetup", () => {
  // Reset all mocks before each test to ensure test isolation
  beforeEach(() => jest.clearAllMocks());

  describe("Form Rendering", () => {
    test("renders all quick setup fields with correct values", () => {
      renderForm();

      expect(screen.getByDisplayValue("100")).toBeInTheDocument();
      expect(
        screen.getByDisplayValue("https://access.test.com")
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue("key123")).toBeInTheDocument();
      expect(
        screen.getByDisplayValue("https://lab-data.json")
      ).toBeInTheDocument();
    });

    test("displays correct button text based on lab id", () => {
      // New lab (no id) shows "Add Lab"
      const { unmount } = renderForm({ lab: {} });
      expect(screen.getByText("Add Lab")).toBeInTheDocument();
      unmount();

      // Existing lab (with id) shows "Save Changes"
      renderForm({ lab: mockLab });
      expect(screen.getByText("Save Changes")).toBeInTheDocument();
    });

    test("renders submit and close buttons", () => {
      renderForm();

      expect(screen.getByText("Save Changes")).toBeInTheDocument();
      expect(screen.getByText("Close")).toBeInTheDocument();
    });
  });

  describe("Field Updates", () => {
    test("updates price field with correct value", () => {
      renderForm();

      const priceInput = screen.getByPlaceholderText("Price per hour");
      fireEvent.change(priceInput, { target: { value: "250" } });

      expect(mockHandlers.setLocalLab).toHaveBeenCalledWith({
        ...mockLab,
        price: "250",
      });
    });

    test("updates access URI field with correct value", () => {
      renderForm();

      const accessInput = screen.getByPlaceholderText("Access URI");
      fireEvent.change(accessInput, {
        target: { value: "https://newaccess.com" },
      });

      expect(mockHandlers.setLocalLab).toHaveBeenCalledWith({
        ...mockLab,
        accessURI: "https://newaccess.com",
      });
    });

    test("updates access key field with correct value", () => {
      renderForm();

      const keyInput = screen.getByPlaceholderText("Access Key");
      fireEvent.change(keyInput, { target: { value: "newkey456" } });

      expect(mockHandlers.setLocalLab).toHaveBeenCalledWith({
        ...mockLab,
        accessKey: "newkey456",
      });
    });
  });

  describe("URI Field Special Behavior", () => {
    test("calls handleUriChange when URI field changes", () => {
      renderForm();

      const uriInput = screen.getByPlaceholderText("Lab Data URL (JSON)");
      fireEvent.change(uriInput, {
        target: { value: "https://new-data.json" },
      });

      expect(mockHandlers.handleUriChange).toHaveBeenCalled();
    });

    test("URI field is readonly when isLocalURI is true and not clicked", () => {
      renderForm({ isLocalURI: true, clickedToEditUri: false });

      const uriInput = screen.getByPlaceholderText("Lab Data URL (JSON)");
      expect(uriInput).toHaveAttribute("readonly");
    });

    test("URI field becomes editable when clicked in isLocalURI mode", async () => {
      const user = userEvent.setup();
      renderForm({ isLocalURI: true, clickedToEditUri: false });

      const uriInput = screen.getByPlaceholderText("Lab Data URL (JSON)");
      await user.click(uriInput);

      expect(mockHandlers.setClickedToEditUri).toHaveBeenCalledWith(true);
    });

    test("URI field exits edit mode on blur when isLocalURI", () => {
      renderForm({ isLocalURI: true, clickedToEditUri: true });

      const uriInput = screen.getByPlaceholderText("Lab Data URL (JSON)");
      fireEvent.blur(uriInput);

      expect(mockHandlers.setClickedToEditUri).toHaveBeenCalledWith(false);
    });

    test("URI field is always editable when isLocalURI is false", () => {
      renderForm({ isLocalURI: false });

      const uriInput = screen.getByPlaceholderText("Lab Data URL (JSON)");
      expect(uriInput).not.toHaveAttribute("readonly");
    });
  });

  describe("Warning Messages", () => {
    test("displays grey out warning when isLocalURI and not in edit mode", () => {
      renderForm({ isLocalURI: true, clickedToEditUri: false });

      expect(
        screen.getByText(/While greyed out, you may edit the JSON file/)
      ).toBeInTheDocument();
    });

    test("does not display grey out warning when in edit mode", () => {
      renderForm({ isLocalURI: true, clickedToEditUri: true });

      expect(
        screen.queryByText(/While greyed out, you may edit the JSON file/)
      ).not.toBeInTheDocument();
    });

    test("displays edit mode warnings when clicked to edit", () => {
      renderForm({ isLocalURI: true, clickedToEditUri: true });

      expect(
        screen.getByText(/Name changes to the JSON file are not allowed/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Introducing a link to a JSON file will replace/)
      ).toBeInTheDocument();
    });

    test("does not display warnings when isLocalURI is false", () => {
      renderForm({ isLocalURI: false });

      expect(screen.queryByText(/While greyed out/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Name changes to the JSON file/)
      ).not.toBeInTheDocument();
    });
  });

  describe("Local URI Mode", () => {
    test("disables all fields except URI when isLocalURI is true", () => {
      renderForm({ isLocalURI: true });

      expect(screen.getByPlaceholderText("Price per hour")).toBeDisabled();
      expect(screen.getByPlaceholderText("Access URI")).toBeDisabled();
      expect(screen.getByPlaceholderText("Access Key")).toBeDisabled();

      // URI field should not be disabled, but readonly
      const uriInput = screen.getByPlaceholderText("Lab Data URL (JSON)");
      expect(uriInput).not.toBeDisabled();
    });

    test("enables all fields when isLocalURI is false", () => {
      renderForm({ isLocalURI: false });

      expect(screen.getByPlaceholderText("Price per hour")).not.toBeDisabled();
      expect(screen.getByPlaceholderText("Access URI")).not.toBeDisabled();
      expect(screen.getByPlaceholderText("Access Key")).not.toBeDisabled();
    });
  });

  describe("Validation Errors", () => {
    test("displays single validation error", () => {
      renderForm({ errors: { price: "Price is required" } });

      expect(screen.getByText("Price is required")).toBeInTheDocument();
    });

    test("displays multiple validation errors simultaneously", () => {
      const errors = {
        price: "Price must be a number",
        accessURI: "Access URI is required",
      };

      renderForm({ errors });

      expect(screen.getByText("Price must be a number")).toBeInTheDocument();
      expect(screen.getByText("Access URI is required")).toBeInTheDocument();
    });

    test("hides URI error when in edit mode with isLocalURI", () => {
      renderForm({
        isLocalURI: true,
        clickedToEditUri: true,
        errors: { uri: "URI is invalid" },
      });

      expect(screen.queryByText("URI is invalid")).not.toBeInTheDocument();
    });

    test("displays URI error when not in edit mode", () => {
      renderForm({
        isLocalURI: true,
        clickedToEditUri: false,
        errors: { uri: "URI is invalid" },
      });

      expect(screen.getByText("URI is invalid")).toBeInTheDocument();
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

      expect(screen.getByPlaceholderText("Price per hour")).toHaveValue(null);
      expect(screen.getByPlaceholderText("Access URI")).toHaveValue("");
      expect(screen.getByPlaceholderText("Access Key")).toHaveValue("");
    });

    test("handles null values in lab object", () => {
      renderForm({
        localLab: {
          price: null,
          accessURI: null,
          accessKey: null,
          uri: null,
        },
      });

      expect(screen.getByPlaceholderText("Price per hour")).toHaveValue(null);
      expect(screen.getByPlaceholderText("Lab Data URL (JSON)")).toHaveValue(
        ""
      );
    });

    test("handles undefined lab prop", () => {
      renderForm({ lab: undefined });

      // Should still render without crashing
      expect(screen.getByPlaceholderText("Price per hour")).toBeInTheDocument();
    });
  });
});
