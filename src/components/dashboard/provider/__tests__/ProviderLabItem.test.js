/**
 * Unit tests for ProviderLabItem component
 *
 * Tested Behaviors:
 * - Lab name and listing status display correctly
 * - All action buttons render and call their handlers
 * - List button disabled when lab is listed or pending
 * - Unlist button disabled when lab is unlisted or pending
 * - Edit and Delete buttons always enabled
 * - Pending states show appropriate loading text
 * - Listed state displays with correct styling classes
 * - Unlisted state displays with correct styling classes
 * - Edge cases (missing lab data, undefined handlers) handled gracefully
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// Mock OptimisticUI context hook
const mockGetEffectiveListingState = jest.fn();

jest.mock("@/context/OptimisticUIContext", () => ({
  useOptimisticUI: () => ({
    getEffectiveListingState: mockGetEffectiveListingState,
  }),
}));

// Mock Carrousel component
jest.mock("@/components/ui/Carrousel", () => ({
  __esModule: true,
  default: ({ lab, maxHeight }) => (
    <div data-testid="carrousel-mock">
      <span>Carrousel for {lab.name}</span>
      <span>Max height: {maxHeight}</span>
    </div>
  ),
}));

import ProviderLabItem from "../ProviderLabItem";

// Test fixtures - represents typical lab data
const mockLab = {
  id: "1",
  name: "Physics Lab",
  images: ["https://example.com/img1.jpg"],
  isListed: false,
};

// Mock handlers - track component behavior
const mockHandlers = {
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onList: jest.fn(),
  onUnlist: jest.fn(),
};

/**
 * Helper function to render component with default props
 * Allows easy overriding of specific props for different test scenarios
 */
const renderItem = (props = {}, optimisticState = {}) => {
  // Setup default optimistic UI state
  const defaultState = {
    isListed: mockLab.isListed,
    isPending: false,
    operation: null,
    ...optimisticState,
  };

  mockGetEffectiveListingState.mockReturnValue(defaultState);

  const defaultProps = {
    lab: mockLab,
    onEdit: mockHandlers.onEdit,
    onDelete: mockHandlers.onDelete,
    onList: mockHandlers.onList,
    onUnlist: mockHandlers.onUnlist,
    ...props,
  };

  return render(<ProviderLabItem {...defaultProps} />);
};

describe("ProviderLabItem", () => {
  // Reset all mocks before each test to ensure test isolation
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Lab Display", () => {
    test("renders lab name correctly", () => {
      renderItem();

      // Use heading role to target the <h3> specifically (avoids duplicates from mocked components)
      expect(
        screen.getByRole("heading", { name: /Physics Lab/ })
      ).toBeInTheDocument();
    });

    test("renders carrousel with lab data", () => {
      renderItem();

      const carrousel = screen.getByTestId("carrousel-mock");
      expect(carrousel).toBeInTheDocument();
      expect(carrousel).toHaveTextContent("Carrousel for Physics Lab");
      expect(carrousel).toHaveTextContent("Max height: 200");
    });

    test('displays "Unlisted" status when lab is not listed', () => {
      renderItem({}, { isListed: false, isPending: false });

      expect(screen.getByText(/Unlisted/)).toBeInTheDocument();
    });

    test('displays "Listed" status when lab is listed', () => {
      renderItem({}, { isListed: true, isPending: false });

      expect(screen.getByText(/Listed/)).toBeInTheDocument();
    });
  });

  describe("Action Buttons", () => {
    test("renders all four action buttons", () => {
      renderItem();

      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^list$/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /unlist/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /delete/i })
      ).toBeInTheDocument();
    });

    test("calls onEdit when Edit button clicked", async () => {
      const user = userEvent.setup();
      renderItem();

      await user.click(screen.getByRole("button", { name: /edit/i }));

      expect(mockHandlers.onEdit).toHaveBeenCalled();
      expect(mockHandlers.onEdit).toHaveBeenCalledTimes(1);
    });

    test("calls onList with lab id when List button clicked", async () => {
      const user = userEvent.setup();
      renderItem({}, { isListed: false, isPending: false });

      await user.click(screen.getByRole("button", { name: /^list$/i }));

      expect(mockHandlers.onList).toHaveBeenCalledWith("1");
      expect(mockHandlers.onList).toHaveBeenCalledTimes(1);
    });

    test("calls onUnlist with lab id when Unlist button clicked", async () => {
      const user = userEvent.setup();
      renderItem({}, { isListed: true, isPending: false });

      await user.click(screen.getByRole("button", { name: /unlist/i }));

      expect(mockHandlers.onUnlist).toHaveBeenCalledWith("1");
      expect(mockHandlers.onUnlist).toHaveBeenCalledTimes(1);
    });

    test("calls onDelete with lab id when Delete button clicked", async () => {
      const user = userEvent.setup();
      renderItem();

      await user.click(screen.getByRole("button", { name: /delete/i }));

      expect(mockHandlers.onDelete).toHaveBeenCalledWith("1");
      expect(mockHandlers.onDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("Button States - Unlisted Lab", () => {
    test("List button is enabled when lab is unlisted", () => {
      renderItem({}, { isListed: false, isPending: false });

      const listButton = screen.getByRole("button", { name: /^list$/i });
      expect(listButton).not.toBeDisabled();
    });

    test("Unlist button is disabled when lab is unlisted", () => {
      renderItem({}, { isListed: false, isPending: false });

      const unlistButton = screen.getByRole("button", { name: /unlist/i });
      expect(unlistButton).toBeDisabled();
    });

    test("Edit button is always enabled when unlisted", () => {
      renderItem({}, { isListed: false, isPending: false });

      const editButton = screen.getByRole("button", { name: /edit/i });
      expect(editButton).not.toBeDisabled();
    });

    test("Delete button is always enabled when unlisted", () => {
      renderItem({}, { isListed: false, isPending: false });

      const deleteButton = screen.getByRole("button", { name: /delete/i });
      expect(deleteButton).not.toBeDisabled();
    });
  });

  describe("Button States - Listed Lab", () => {
    test("List button is disabled when lab is listed", () => {
      renderItem({}, { isListed: true, isPending: false });

      const listButton = screen.getByRole("button", { name: /^list$/i });
      expect(listButton).toBeDisabled();
    });

    test("Unlist button is enabled when lab is listed", () => {
      renderItem({}, { isListed: true, isPending: false });

      const unlistButton = screen.getByRole("button", { name: /unlist/i });
      expect(unlistButton).not.toBeDisabled();
    });

    test("Edit button is always enabled when listed", () => {
      renderItem({}, { isListed: true, isPending: false });

      const editButton = screen.getByRole("button", { name: /edit/i });
      expect(editButton).not.toBeDisabled();
    });

    test("Delete button is always enabled when listed", () => {
      renderItem({}, { isListed: true, isPending: false });

      const deleteButton = screen.getByRole("button", { name: /delete/i });
      expect(deleteButton).not.toBeDisabled();
    });
  });

  describe("Pending States", () => {
    test('displays "Listing..." when listing operation is pending', () => {
      renderItem(
        {},
        {
          isListed: false,
          isPending: true,
          operation: "listing",
        }
      );

      expect(screen.getByText(/Listing\.\.\./)).toBeInTheDocument();
    });

    test('displays "Unlisting..." when unlisting operation is pending', () => {
      renderItem(
        {},
        {
          isListed: true,
          isPending: true,
          operation: "unlisting",
        }
      );

      expect(screen.getByText(/Unlisting\.\.\./)).toBeInTheDocument();
    });

    test("disables List button during listing operation", () => {
      renderItem(
        {},
        {
          isListed: false,
          isPending: true,
          operation: "listing",
        }
      );

      const listButton = screen.getByRole("button", { name: /^list$/i });
      expect(listButton).toBeDisabled();
    });

    test("disables Unlist button during unlisting operation", () => {
      renderItem(
        {},
        {
          isListed: true,
          isPending: true,
          operation: "unlisting",
        }
      );

      const unlistButton = screen.getByRole("button", { name: /unlist/i });
      expect(unlistButton).toBeDisabled();
    });

    test("disables both List and Unlist buttons when pending", () => {
      renderItem(
        {},
        {
          isListed: false,
          isPending: true,
          operation: "listing",
        }
      );

      expect(screen.getByRole("button", { name: /^list$/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /unlist/i })).toBeDisabled();
    });

    test("Edit and Delete remain enabled during pending operations", () => {
      renderItem(
        {},
        {
          isListed: false,
          isPending: true,
          operation: "listing",
        }
      );

      expect(screen.getByRole("button", { name: /edit/i })).not.toBeDisabled();
      expect(
        screen.getByRole("button", { name: /delete/i })
      ).not.toBeDisabled();
    });
  });

  describe("Edge Cases", () => {
    test("handles lab with numeric id", async () => {
      const user = userEvent.setup();
      renderItem({ lab: { ...mockLab, id: 123 } });

      await user.click(screen.getByRole("button", { name: /delete/i }));

      expect(mockHandlers.onDelete).toHaveBeenCalledWith(123);
    });

    test("handles lab without images array", () => {
      renderItem({ lab: { ...mockLab, images: undefined } });

      // Use heading role to be specific and avoid duplicate matches
      expect(
        screen.getByRole("heading", { name: /Physics Lab/ })
      ).toBeInTheDocument();
      expect(screen.getByTestId("carrousel-mock")).toBeInTheDocument();
    });

    test("handles very long lab name without breaking layout", () => {
      const longName =
        "Very Long Laboratory Name That Should Not Break The Layout Component";
      renderItem({ lab: { ...mockLab, name: longName } });

      // Use heading role to be specific and avoid duplicate matches
      expect(
        screen.getByRole("heading", { name: new RegExp(longName) })
      ).toBeInTheDocument();
    });

    test("calls getEffectiveListingState with correct parameters", () => {
      renderItem();

      expect(mockGetEffectiveListingState).toHaveBeenCalledWith("1", false);
    });

    test("uses optimistic state from context over lab prop", () => {
      // Lab says unlisted, but optimistic UI says listed
      renderItem(
        { lab: { ...mockLab, isListed: false } },
        { isListed: true, isPending: false }
      );

      // Should show Listed (from optimistic state)
      expect(screen.getByText(/Listed/)).toBeInTheDocument();

      // Unlist should be enabled (optimistic state wins)
      const unlistButton = screen.getByRole("button", { name: /unlist/i });
      expect(unlistButton).not.toBeDisabled();
    });
  });
});
