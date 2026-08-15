/**
 * Unit tests for the marketplace search, filter panel, and sorting controls.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LabFilters from "../LabFilters";

describe("LabFilters - unit tests", () => {
  const mockCategories = ["Biology", "Chemistry", "Physics"];
  const mockProviders = ["Lab A", "Lab B", "Lab C"];

  const defaultProps = {
    categories: mockCategories,
    providers: mockProviders,
    selectedCategory: "All",
    selectedSort: "relevance",
    selectedProvider: "All",
    selectedFilter: "Keyword",
    selectedResourceType: "All",
    selectedListing: "listed",
    onCategoryChange: jest.fn(),
    onSortChange: jest.fn(),
    onProviderChange: jest.fn(),
    onFilterChange: jest.fn(),
    onResourceTypeChange: jest.fn(),
    onListingChange: jest.fn(),
    searchInputRef: { current: null },
    loading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const openFilterPanel = async (user) => {
    await user.click(screen.getByRole("button", { name: /^filters/i }));
    return screen.getByRole("region", { name: /filter options/i });
  };

  describe("Rendering", () => {
    test("renders the main search, filter, and sorting controls", () => {
      render(<LabFilters {...defaultProps} />);

      expect(screen.getByPlaceholderText(/type here/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^filters/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/sort labs/i)).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Sort by" })).toBeInTheDocument();
      expect(screen.getByLabelText(/sort labs/i)).toHaveValue("relevance");
      expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: /filter options/i })).not.toBeInTheDocument();
    });

    test("sizes the sort selector to its content with balanced horizontal padding", () => {
      render(<LabFilters {...defaultProps} />);

      const sortSelect = screen.getByLabelText(/sort labs/i);

      expect(sortSelect).toHaveClass("w-max", "px-4");
      expect(sortSelect.parentElement).toHaveClass("w-max");
    });

    test("places the keyword/name search in the centered desktop toolbar column", () => {
      render(<LabFilters {...defaultProps} />);

      const searchWrapper = screen.getByPlaceholderText(/type here/i).parentElement.parentElement;
      expect(searchWrapper).toHaveClass("lg:col-start-2", "lg:row-start-1");
    });

    test("renders all category options inside the filter panel", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} />);
      const panel = await openFilterPanel(user);

      expect(within(panel).getByRole("option", { name: "All Categories" })).toBeInTheDocument();
      expect(within(panel).getByRole("option", { name: "Biology" })).toBeInTheDocument();
      expect(within(panel).getByRole("option", { name: "Chemistry" })).toBeInTheDocument();
      expect(within(panel).getByRole("option", { name: "Physics" })).toBeInTheDocument();
    });

    test("renders all provider options inside the filter panel", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} />);
      const panel = await openFilterPanel(user);

      expect(within(panel).getByRole("option", { name: "All Providers" })).toBeInTheDocument();
      expect(within(panel).getByRole("option", { name: "Lab A" })).toBeInTheDocument();
      expect(within(panel).getByRole("option", { name: "Lab B" })).toBeInTheDocument();
      expect(within(panel).getByRole("option", { name: "Lab C" })).toBeInTheDocument();
    });

    test("renders search filter options", () => {
      render(<LabFilters {...defaultProps} />);

      expect(screen.getByRole("option", { name: "Keyword" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Name" })).toBeInTheDocument();
    });
  });

  describe("Filter Interactions", () => {
    test("groups catalogue filters behind a Filters menu", async () => {
      const user = userEvent.setup();
      const panel = await (async () => {
        render(<LabFilters {...defaultProps} />);
        return openFilterPanel(user);
      })();

      expect(panel).toBeInTheDocument();
      expect(within(panel).getByLabelText(/filter by category/i)).toBeInTheDocument();
      expect(within(panel).getByLabelText(/filter by provider/i)).toBeInTheDocument();
      expect(within(panel).getByLabelText(/filter by listing/i)).toBeInTheDocument();
      expect(within(panel).getByLabelText(/filter by type/i)).toBeInTheDocument();
      expect(within(panel).getByRole("option", { name: "All types" })).toBeInTheDocument();
      expect(within(panel).getByRole("option", { name: "Real" })).toBeInTheDocument();
      expect(within(panel).getByRole("option", { name: "Simulated" })).toBeInTheDocument();
      expect(within(panel).getByRole("option", { name: "Listed" })).toBeInTheDocument();
      expect(within(panel).getByRole("option", { name: "All" })).toBeInTheDocument();
      expect(within(panel).getByRole("option", { name: "Unlisted" })).toBeInTheDocument();
      expect([...within(panel).getByLabelText(/filter by listing/i).options].map((option) => option.value))
        .toEqual(["listed", "unlisted", "all"]);
      expect([...panel.querySelectorAll("label")].map((label) => label.textContent.trim()))
        .toEqual(["Filter by category", "Filter by provider", "Filter by type", "Filter by listing"]);
    });

    test("calls onSortChange with the selected catalogue order", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText(/sort labs/i), "rating_desc");

      expect(defaultProps.onSortChange).toHaveBeenCalledWith("rating_desc");
    });

    test("calls onCategoryChange when category is selected", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} />);
      await openFilterPanel(user);

      await user.selectOptions(screen.getByLabelText(/filter by category/i), "Biology");

      expect(defaultProps.onCategoryChange).toHaveBeenCalledWith("Biology");
    });

    test("calls onProviderChange when provider is selected", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} />);
      await openFilterPanel(user);

      await user.selectOptions(screen.getByLabelText(/filter by provider/i), "Lab A");

      expect(defaultProps.onProviderChange).toHaveBeenCalledWith("Lab A");
    });

    test("calls onFilterChange when search filter type changes", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText(/search filter/i), "Name");

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

    test("triggers search on Enter key press", async () => {
      const user = userEvent.setup();
      const searchInputRef = { current: null };
      render(<LabFilters {...defaultProps} searchInputRef={searchInputRef} />);

      const searchInput = screen.getByPlaceholderText(/type here/i);
      searchInputRef.current = searchInput;
      const dispatchEvent = jest.spyOn(searchInput, "dispatchEvent");

      await user.type(searchInput, "test{Enter}");

      expect(searchInput).toHaveValue("test");
      expect(dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "input", bubbles: true })
      );
    });

    test("triggers search when the search button is clicked", async () => {
      const user = userEvent.setup();
      const searchInputRef = { current: null };
      render(<LabFilters {...defaultProps} searchInputRef={searchInputRef} />);

      const searchInput = screen.getByPlaceholderText(/type here/i);
      searchInputRef.current = searchInput;
      const mockDispatchEvent = jest.fn();
      searchInput.dispatchEvent = mockDispatchEvent;

      await user.click(screen.getByRole("button", { name: /search/i }));

      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "input", bubbles: true })
      );
    });
  });

  describe("Listing Filter", () => {
    test("changes from listed labs to unlisted labs", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} selectedListing="listed" />);
      await openFilterPanel(user);

      await user.selectOptions(screen.getByLabelText(/filter by listing/i), "unlisted");

      expect(defaultProps.onListingChange).toHaveBeenCalledWith("unlisted");
    });

    test("changes from listed labs to all labs", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} selectedListing="listed" />);
      await openFilterPanel(user);

      await user.selectOptions(screen.getByLabelText(/filter by listing/i), "all");

      expect(defaultProps.onListingChange).toHaveBeenCalledWith("all");
    });
  });

  describe("Reset", () => {
    test("renders a clear button when filters are active", async () => {
      const user = userEvent.setup();
      render(
        <LabFilters
          {...defaultProps}
          selectedCategory="Biology"
          selectedSort="price_asc"
          selectedProvider="Lab A"
          selectedFilter="Name"
          selectedResourceType="lab"
          selectedListing="unlisted"
        />
      );
      const panel = await openFilterPanel(user);

      expect(within(panel).getByRole("button", { name: /clear filters/i })).toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    test("disables the visible controls when loading", () => {
      render(<LabFilters {...defaultProps} loading />);

      expect(screen.getByPlaceholderText(/type here/i)).toBeDisabled();
      expect(screen.getByLabelText(/sort labs/i)).toBeDisabled();
      expect(screen.getByRole("button", { name: /^filters/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /search/i })).toBeDisabled();
    });

    test("enables all controls when not loading", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} loading={false} />);
      const panel = await openFilterPanel(user);

      expect(within(panel).getByLabelText(/filter by category/i)).not.toBeDisabled();
      expect(within(panel).getByLabelText(/filter by provider/i)).not.toBeDisabled();
      expect(screen.getByPlaceholderText(/type here/i)).not.toBeDisabled();
      expect(screen.getByLabelText(/sort labs/i)).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /search/i })).not.toBeDisabled();
    });

    test("prevents hydration mismatch by using consistent initial state", async () => {
      render(<LabFilters {...defaultProps} loading />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^filters/i })).toBeDisabled();
      });
    });
  });

  describe("Edge Cases", () => {
    test("handles empty categories array", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} categories={[]} />);
      await openFilterPanel(user);

      expect(screen.getByLabelText(/filter by category/i).children).toHaveLength(1);
    });

    test("handles empty providers array", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} providers={[]} />);
      await openFilterPanel(user);

      expect(screen.getByLabelText(/filter by provider/i).children).toHaveLength(1);
    });

    test("handles a missing search input ref gracefully", async () => {
      const user = userEvent.setup();
      render(<LabFilters {...defaultProps} searchInputRef={{ current: null }} />);

      const searchButton = screen.getByRole("button", { name: /search/i });
      await user.click(searchButton);

      expect(searchButton).toBeInTheDocument();
    });

    test("reflects selected values in controls", async () => {
      const user = userEvent.setup();
      render(
        <LabFilters
          {...defaultProps}
          selectedCategory="Biology"
          selectedProvider="Lab A"
          selectedFilter="Name"
          selectedSort="price_asc"
        />
      );
      await openFilterPanel(user);

      expect(screen.getByLabelText(/filter by category/i)).toHaveValue("Biology");
      expect(screen.getByLabelText(/filter by provider/i)).toHaveValue("Lab A");
      expect(screen.getByLabelText(/search filter/i)).toHaveValue("Name");
      expect(screen.getByLabelText(/sort labs/i)).toHaveValue("price_asc");
    });
  });
});
