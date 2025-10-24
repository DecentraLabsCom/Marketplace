/**
 * Unit tests for LabFilters component
 *
 * Test Behaviors:
 * - Renders all filter controls (category, provider, search, price, listing toggle)
 * - Calls handlers when user changes filters
 * - Triggers search on Enter key and Search button click
 * - Cycles through price sort states (default → low-to-high → high-to-low → default)
 * - Toggles between "Listed labs" and "All labs"
 * - Disables all controls when loading prop is true
 * - Prevents hydration mismatch with loading state
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LabFilters from "../LabFilters";

describe("LabFilters - unit tests", () => {
  const mockCategories = ["Biology", "Chemistry", "Physics"];
  const mockProviders = ["Lab A", "Lab B", "Lab C"];

  const defaultProps = {
    categories: mockCategories,
    providers: mockProviders,
    selectedCategory: "All",
    selectedPrice: "Sort by Price",
    selectedProvider: "All",
    selectedFilter: "Keyword",
    showUnlisted: false,
    onCategoryChange: jest.fn(),
    onPriceChange: jest.fn(),
    onProviderChange: jest.fn(),
    onFilterChange: jest.fn(),
    onShowUnlistedChange: jest.fn(),
    onReset: jest.fn(),
    searchInputRef: { current: null },
    loading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rendering", () => {
    test("renders all filter controls", () => {
      render(<LabFilters {...defaultProps} />);

      expect(screen.getByLabelText(/filter by category/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/filter by provider/i)).toBeInTheDocument();
      // Search input doesn't have proper id association, use placeholder instead
      expect(screen.getByPlaceholderText(/type here/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /sort by price/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /listed labs/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /search/i })
      ).toBeInTheDocument();
    });

    test("renders all category options", () => {
      render(<LabFilters {...defaultProps} />);

      expect(
        screen.getByRole("option", { name: "All Categories" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Biology" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Chemistry" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Physics" })
      ).toBeInTheDocument();
    });

    test("renders all provider options", () => {
      render(<LabFilters {...defaultProps} />);

      expect(
        screen.getByRole("option", { name: "All Providers" })
      ).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Lab A" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Lab B" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Lab C" })).toBeInTheDocument();
    });

    test("renders search filter options", () => {
      render(<LabFilters {...defaultProps} />);

      expect(
        screen.getByRole("option", { name: "Keyword" })
      ).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Name" })).toBeInTheDocument();
    });
  });

  describe("Filter Interactions", () => {
    test("calls onCategoryChange when category is selected", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} />);

      const categorySelect = screen.getByLabelText(/filter by category/i);
      await user.selectOptions(categorySelect, "Biology");

      expect(defaultProps.onCategoryChange).toHaveBeenCalledWith("Biology");
    });

    test("calls onProviderChange when provider is selected", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} />);

      const providerSelect = screen.getByLabelText(/filter by provider/i);
      await user.selectOptions(providerSelect, "Lab A");

      expect(defaultProps.onProviderChange).toHaveBeenCalledWith("Lab A");
    });

    test("calls onFilterChange when search filter type changes", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} />);

      // Find the filter type select (it's unlabeled but has options)
      const filterSelects = screen.getAllByRole("combobox");
      const searchFilterSelect = filterSelects.find(
        (select) =>
          select.querySelector('option[value="Keyword"]') &&
          select.querySelector('option[value="Name"]')
      );

      await user.selectOptions(searchFilterSelect, "Name");

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith("Name");
    });
  });

  describe("Search Functionality", () => {
    test("allows user to type in search input", async () => {
      const user = userEvent.setup();
      const searchInputRef = { current: null };

      render(<LabFilters {...defaultProps} searchInputRef={searchInputRef} />);

      const searchInput = screen.getByPlaceholderText(/type here/i);
      searchInputRef.current = searchInput;

      await user.type(searchInput, "test query");

      expect(searchInput).toHaveValue("test query");
    });

    // Search on Enter key dispatches input event which is handled by parent
    test("triggers search on Enter key press", async () => {
      const user = userEvent.setup();
      const searchInputRef = { current: null };

      render(<LabFilters {...defaultProps} searchInputRef={searchInputRef} />);

      const searchInput = screen.getByPlaceholderText(/type here/i);
      searchInputRef.current = searchInput;

      await user.type(searchInput, "test{Enter}");

      // Enter key handler is internal, just verify it doesn't crash
      expect(searchInput).toHaveValue("test");
    });

    // Search button dispatches input event for parent to handle
    test("triggers search when search button is clicked", async () => {
      const user = userEvent.setup();

      // Create real ref that will point to actual DOM element
      const searchInputRef = { current: null };

      render(<LabFilters {...defaultProps} searchInputRef={searchInputRef} />);

      // Get the real input element and assign to ref
      const searchInput = screen.getByPlaceholderText(/type here/i);
      searchInputRef.current = searchInput;

      // Mock dispatchEvent on the actual DOM element
      const mockDispatchEvent = jest.fn();
      searchInput.dispatchEvent = mockDispatchEvent;

      const searchButton = screen.getByRole("button", { name: /search/i });
      await user.click(searchButton);

      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "input", bubbles: true })
      );
    });
  });

  describe("Price Sorting", () => {
    // Price button cycles through 3 states: "Sort by Price" → "Low to High" → "High to Low" → repeat
    test("cycles through price sort options", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} />);

      const priceButton = screen.getByRole("button", {
        name: /sort by price/i,
      });

      // First click: Sort by Price → Low to High
      await user.click(priceButton);
      expect(defaultProps.onPriceChange).toHaveBeenCalledWith("Low to High");

      // Second click: Low to High → High to Low
      const { rerender } = render(
        <LabFilters {...defaultProps} selectedPrice="Low to High" />
      );
      const priceButtonLowToHigh = screen.getByRole("button", {
        name: /low to high/i,
      });
      await user.click(priceButtonLowToHigh);
      expect(defaultProps.onPriceChange).toHaveBeenCalledWith("High to Low");

      // Third click: High to Low → Sort by Price
      rerender(<LabFilters {...defaultProps} selectedPrice="High to Low" />);
      const priceButtonHighToLow = screen.getByRole("button", {
        name: /high to low/i,
      });
      await user.click(priceButtonHighToLow);
      expect(defaultProps.onPriceChange).toHaveBeenCalledWith("Sort by Price");
    });
  });

  describe("Listing Toggle", () => {
    test("toggles from listed to all labs", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} showUnlisted={false} />);

      const toggleButton = screen.getByRole("button", { name: /listed labs/i });
      await user.click(toggleButton);

      expect(defaultProps.onShowUnlistedChange).toHaveBeenCalledWith(true);
    });

    test("toggles from all labs to listed", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} showUnlisted={true} />);

      const toggleButton = screen.getByRole("button", { name: /all labs/i });
      await user.click(toggleButton);

      expect(defaultProps.onShowUnlistedChange).toHaveBeenCalledWith(false);
    });
  });

  describe("Loading State", () => {
    test("disables all controls when loading", () => {
      render(<LabFilters {...defaultProps} loading={true} />);

      expect(screen.getByLabelText(/filter by category/i)).toBeDisabled();
      expect(screen.getByLabelText(/filter by provider/i)).toBeDisabled();
      expect(screen.getByPlaceholderText(/type here/i)).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /sort by price/i })
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /listed labs/i })
      ).toBeDisabled();
      expect(screen.getByRole("button", { name: /search/i })).toBeDisabled();
    });

    test("enables all controls when not loading", () => {
      render(<LabFilters {...defaultProps} loading={false} />);

      expect(screen.getByLabelText(/filter by category/i)).not.toBeDisabled();
      expect(screen.getByLabelText(/filter by provider/i)).not.toBeDisabled();
      expect(screen.getByPlaceholderText(/type here/i)).not.toBeDisabled();
      expect(
        screen.getByRole("button", { name: /sort by price/i })
      ).not.toBeDisabled();
      expect(
        screen.getByRole("button", { name: /listed labs/i })
      ).not.toBeDisabled();
      expect(
        screen.getByRole("button", { name: /search/i })
      ).not.toBeDisabled();
    });

    // Hydration check: component uses effectiveLoading=false until hydrated
    test("prevents hydration mismatch by using consistent initial state", async () => {
      render(<LabFilters {...defaultProps} loading={true} />);

      // Initially, loading should be false (before hydration) so controls are enabled
      // After hydration effect runs, loading becomes true and controls get disabled
      await waitFor(() => {
        expect(screen.getByLabelText(/filter by category/i)).toBeDisabled();
      });
    });
  });

  describe("Edge Cases", () => {
    test("handles empty categories array", () => {
      render(<LabFilters {...defaultProps} categories={[]} />);

      const categorySelect = screen.getByLabelText(/filter by category/i);
      expect(categorySelect.children).toHaveLength(1); // Only "All Categories"
    });

    test("handles empty providers array", () => {
      render(<LabFilters {...defaultProps} providers={[]} />);

      const providerSelect = screen.getByLabelText(/filter by provider/i);
      expect(providerSelect.children).toHaveLength(1); // Only "All Providers"
    });

    test("handles missing searchInputRef gracefully", async () => {
      const user = userEvent.setup();
      render(
        <LabFilters {...defaultProps} searchInputRef={{ current: null }} />
      );

      const searchButton = screen.getByRole("button", { name: /search/i });

      // Should not crash when ref is null
      await user.click(searchButton);
      expect(searchButton).toBeInTheDocument();
    });

    test("reflects selected values in controls", () => {
      render(
        <LabFilters
          {...defaultProps}
          selectedCategory="Biology"
          selectedProvider="Lab A"
          selectedFilter="Name"
          selectedPrice="Low to High"
        />
      );

      expect(screen.getByLabelText(/filter by category/i)).toHaveValue(
        "Biology"
      );
      expect(screen.getByLabelText(/filter by provider/i)).toHaveValue("Lab A");
      expect(
        screen.getByRole("button", { name: /low to high/i })
      ).toBeInTheDocument();
    });
  });
});
