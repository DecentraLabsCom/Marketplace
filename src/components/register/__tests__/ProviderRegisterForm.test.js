/**
 * Unit tests for ProviderRegisterForm component
 *
 * Test Behaviors:
 * - Displays loading state when checking user authentication status
 * - Shows "already registered" message for users who are already providers
 * - Renders complete registration form for new provider candidates
 * - Updates form fields responsively when user types
 * - Synchronizes wallet address field with context changes
 * - Clears validation errors immediately when user corrects input
 * - Validates all required fields before submission
 * - Validates wallet address format (0x prefix and length)
 * - Submits valid form data via POST to registration API
 * - Shows loading indicator during async form submission
 * - Displays success modal after successful registration
 * - Resets form to initial state after successful submission
 * - Supports keyboard accessibility (Escape key to close modal)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useUser } from "@/context/UserContext";
import ProviderRegisterForm from "../ProviderRegisterForm";

// Mock UserContext
jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(),
}));

// Mock AccessControl
jest.mock("@/components/auth/AccessControl", () => ({
  __esModule: true,
  default: ({ children }) => <>{children}</>,
}));

// Mock ReactFlagsSelect (third-party library)
jest.mock("react-flags-select", () => ({
  __esModule: true,
  default: ({ selected, onSelect, placeholder }) => (
    <select
      value={selected}
      onChange={(e) => onSelect(e.target.value)}
      aria-label="Country"
    >
      <option value="">{placeholder}</option>
      <option value="US">United States</option>
      <option value="GB">United Kingdom</option>
      <option value="ES">Spain</option>
    </select>
  ),
}));

describe("ProviderRegisterForm Component", () => {
  const mockUserDefaults = {
    user: null,
    isSSO: false,
    isProvider: false,
    address: "0x1234567890123456789012345678901234567890",
    isLoading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    useUser.mockReturnValue(mockUserDefaults);
  });

  afterEach(() => {
    delete global.fetch;
  });

  describe("Loading and User States", () => {
    test("shows loading state while checking user status", () => {
      useUser.mockReturnValue({ ...mockUserDefaults, isLoading: true });

      render(<ProviderRegisterForm />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: /register as provider/i })
      ).not.toBeInTheDocument();
    });

    test("shows already registered message for existing providers", () => {
      useUser.mockReturnValue({ ...mockUserDefaults, isProvider: true });

      render(<ProviderRegisterForm />);

      expect(
        screen.getByText(/you are already registered as a provider/i)
      ).toBeInTheDocument();
    });

    test("renders form for new providers", () => {
      render(<ProviderRegisterForm />);

      expect(
        screen.getByRole("heading", { name: /register as provider/i })
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/provider name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/wallet address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/country/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /register as provider/i })
      ).toBeInTheDocument();
    });
  });

  describe("Form Input Handling", () => {
    test("updates form fields when user types", async () => {
      const user = userEvent.setup();
      render(<ProviderRegisterForm />);

      const nameInput = screen.getByLabelText(/provider name/i);
      const emailInput = screen.getByLabelText(/email address/i);

      await user.type(nameInput, "Test Lab");
      await user.type(emailInput, "test@lab.com");

      expect(nameInput).toHaveValue("Test Lab");
      expect(emailInput).toHaveValue("test@lab.com");
    });

    test("updates wallet field when address changes from context", () => {
      const { rerender } = render(<ProviderRegisterForm />);

      const walletInput = screen.getByLabelText(/wallet address/i);
      expect(walletInput).toHaveValue(
        "0x1234567890123456789012345678901234567890"
      );

      useUser.mockReturnValue({
        ...mockUserDefaults,
        address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      });

      rerender(<ProviderRegisterForm />);

      expect(walletInput).toHaveValue(
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
      );
    });

    test("clears field error when user starts typing", async () => {
      const user = userEvent.setup();
      render(<ProviderRegisterForm />);

      // Submit empty form
      const submitButton = screen.getByRole("button", {
        name: /register as provider/i,
      });
      await user.click(submitButton);

      // Wait for error
      expect(
        await screen.findByText(/provider name is required/i)
      ).toBeInTheDocument();

      // Start typing
      const nameInput = screen.getByLabelText(/provider name/i);
      await user.type(nameInput, "T");

      // Error should clear
      await waitFor(() => {
        expect(
          screen.queryByText(/provider name is required/i)
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Form Validation", () => {
    test("shows validation errors for empty required fields", async () => {
      const user = userEvent.setup();
      render(<ProviderRegisterForm />);

      const submitButton = screen.getByRole("button", {
        name: /register as provider/i,
      });
      await user.click(submitButton);

      expect(
        await screen.findByText(/provider name is required/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/country is required/i)).toBeInTheDocument();

      expect(global.fetch).not.toHaveBeenCalled();
    });
    test("validates wallet address format", async () => {
      const user = userEvent.setup();
      useUser.mockReturnValue({
        ...mockUserDefaults,
        address: "invalid-wallet",
      });

      render(<ProviderRegisterForm />);

      await user.type(screen.getByLabelText(/provider name/i), "Test Lab");
      await user.type(screen.getByLabelText(/email address/i), "test@lab.com");

      const countrySelect = screen.getByLabelText(/country/i);
      await user.selectOptions(countrySelect, "US");

      const submitButton = screen.getByRole("button", {
        name: /register as provider/i,
      });
      await user.click(submitButton);

      expect(
        await screen.findByText(/wallet address must start with 0x/i)
      ).toBeInTheDocument();

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("Form Submission", () => {
    test("submits valid form data to API", async () => {
      const user = userEvent.setup();
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<ProviderRegisterForm />);

      await user.type(screen.getByLabelText(/provider name/i), "Test Lab");
      await user.type(screen.getByLabelText(/email address/i), "test@lab.com");

      const countrySelect = screen.getByLabelText(/country/i);
      await user.selectOptions(countrySelect, "US");

      const submitButton = screen.getByRole("button", {
        name: /register as provider/i,
      });
      await user.click(submitButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/provider/saveRegistration",
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Test Lab",
              email: "test@lab.com",
              wallet: "0x1234567890123456789012345678901234567890",
              country: "US",
            }),
          })
        );
      });
    });

    test("shows loading state during submission", async () => {
      const user = userEvent.setup();
      global.fetch.mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 100))
      );

      render(<ProviderRegisterForm />);

      await user.type(screen.getByLabelText(/provider name/i), "Test Lab");
      await user.type(screen.getByLabelText(/email address/i), "test@lab.com");

      const countrySelect = screen.getByLabelText(/country/i);
      await user.selectOptions(countrySelect, "US");

      const submitButton = screen.getByRole("button", {
        name: /register as provider/i,
      });
      await user.click(submitButton);

      expect(await screen.findByText(/registering/i)).toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /register as provider/i })
        ).toBeInTheDocument();
      });
    });

    test("shows success modal after successful submission", async () => {
      const user = userEvent.setup();
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<ProviderRegisterForm />);

      await user.type(screen.getByLabelText(/provider name/i), "Test Lab");
      await user.type(screen.getByLabelText(/email address/i), "test@lab.com");

      const countrySelect = screen.getByLabelText(/country/i);
      await user.selectOptions(countrySelect, "US");

      await user.click(
        screen.getByRole("button", { name: /register as provider/i })
      );

      expect(
        await screen.findByText(/registration submitted/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /your provider registration request has been submitted/i
        )
      ).toBeInTheDocument();
    });

    test("resets form after successful submission", async () => {
      const user = userEvent.setup();
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<ProviderRegisterForm />);

      const nameInput = screen.getByLabelText(/provider name/i);
      const emailInput = screen.getByLabelText(/email address/i);
      const countrySelect = screen.getByLabelText(/country/i);

      await user.type(nameInput, "Test Lab");
      await user.type(emailInput, "test@lab.com");
      await user.selectOptions(countrySelect, "US");

      await user.click(
        screen.getByRole("button", { name: /register as provider/i })
      );

      expect(
        await screen.findByText(/registration submitted/i)
      ).toBeInTheDocument();

      const closeButton = screen.getByRole("button", { name: /close/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(nameInput).toHaveValue("");
        expect(emailInput).toHaveValue("");
        expect(countrySelect).toHaveValue("");
      });
    });

    test("handles API errors gracefully", async () => {
      const user = userEvent.setup();
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Provider already exists" }),
      });

      render(<ProviderRegisterForm />);

      await user.type(screen.getByLabelText(/provider name/i), "Test Lab");
      await user.type(screen.getByLabelText(/email address/i), "test@lab.com");

      const countrySelect = screen.getByLabelText(/country/i);
      await user.selectOptions(countrySelect, "US");

      await user.click(
        screen.getByRole("button", { name: /register as provider/i })
      );

      expect(
        await screen.findByText(/provider already exists/i)
      ).toBeInTheDocument();
    });

    test("handles network errors", async () => {
      const user = userEvent.setup();
      global.fetch.mockRejectedValueOnce(new Error("Network error"));

      render(<ProviderRegisterForm />);

      await user.type(screen.getByLabelText(/provider name/i), "Test Lab");
      await user.type(screen.getByLabelText(/email address/i), "test@lab.com");

      const countrySelect = screen.getByLabelText(/country/i);
      await user.selectOptions(countrySelect, "US");

      await user.click(
        screen.getByRole("button", { name: /register as provider/i })
      );

      expect(
        await screen.findByText(
          /network error|registration failed|please try again/i
        )
      ).toBeInTheDocument();
    });
  });

  describe("Keyboard Accessibility", () => {
    test("closes success modal with Escape or Enter key", async () => {
      const user = userEvent.setup();
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<ProviderRegisterForm />);

      await user.type(screen.getByLabelText(/provider name/i), "Test Lab");
      await user.type(screen.getByLabelText(/email address/i), "test@lab.com");

      const countrySelect = screen.getByLabelText(/country/i);
      await user.selectOptions(countrySelect, "US");

      await user.click(
        screen.getByRole("button", { name: /register as provider/i })
      );

      expect(
        await screen.findByText(/registration submitted/i)
      ).toBeInTheDocument();

      // Test Escape key
      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(
          screen.queryByText(/registration submitted/i)
        ).not.toBeInTheDocument();
      });
    });
  });
});
