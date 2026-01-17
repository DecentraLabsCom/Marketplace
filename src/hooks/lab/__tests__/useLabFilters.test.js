/**
 * Unit Tests for useLabFilters hook.
 *
 * Tests the lab filtering and search functionality hook.
 *
 * Test Behaviors:
 *
 * - Initial State: Default filter values and empty arrays handling
 * - Category Filtering: Filters labs by selected category
 * - Price Sorting: Sorts labs by price (low-to-high, high-to-low)
 * - Provider Filtering: Filters labs by provider
 * - Search Filtering: Keyword and name-based filtering logic
 * - Active Booking Marking: Enriches labs with hasActiveBooking flag
 * - Combined Filters: Multiple filters applied simultaneously
 * - Reset Functionality: Clears all filters and search
 * - Edge Cases: Null/undefined/empty arrays handling
 *
 */

import { renderHook, act } from "@testing-library/react";
import { useLabFilters } from "../useLabFilters";

describe("useLabFilters", () => {
  const mockLabs = [
    {
      id: "1",
      name: "Advanced AI Lab",
      description: "Machine learning research",
      category: "AI",
      provider: "OpenAI",
      price: 100,
      keywords: ["machine learning", "neural networks"],
    },
    {
      id: "2",
      name: "Quantum Computing Lab",
      description: "Quantum research facility",
      category: "Quantum",
      provider: "IBM",
      price: 200,
      keywords: ["quantum", "computing"],
    },
    {
      id: "3",
      name: "Basic AI Lab",
      description: "Entry level AI",
      category: "AI",
      provider: "Google",
      price: 50,
      keywords: ["ai", "basics"],
    },
  ];

  const mockUserBookingsData = {
    hasBookingInLab: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Initial State", () => {
    test("initializes with default filter values", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      expect(result.current.selectedCategory).toBe("All");
      expect(result.current.selectedPrice).toBe("Sort by Price");
      expect(result.current.selectedProvider).toBe("All");
      expect(result.current.selectedFilter).toBe("Keyword");
      expect(result.current.showUnlisted).toBe(false);
      expect(result.current.searchDebounce).toBe("");
    });

    test("returns all labs when no filters applied", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      expect(result.current.searchFilteredLabs).toHaveLength(3);
    });

    test("handles empty labs array", () => {
      const { result } = renderHook(() => useLabFilters([]));

      expect(result.current.searchFilteredLabs).toEqual([]);
      expect(result.current.categories).toEqual([]);
      expect(result.current.providers).toEqual([]);
    });

    test("handles undefined labs parameter", () => {
      const { result } = renderHook(() => useLabFilters());

      expect(result.current.searchFilteredLabs).toEqual([]);
      expect(result.current.categories).toEqual([]);
    });
  });

  describe("Category Filtering", () => {
    test("filters labs by selected category", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      act(() => {
        result.current.setSelectedCategory("AI");
      });

      expect(result.current.searchFilteredLabs).toHaveLength(2);
      expect(
        result.current.searchFilteredLabs.every((lab) => {
          return Array.isArray(lab.category) ? lab.category.includes("AI") : lab.category === "AI"
        })
      ).toBe(true);
    });

    test("extracts unique categories sorted alphabetically", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      expect(result.current.categories).toEqual(["AI", "Quantum"]);
    });

    test("handles labs with multiple categories and populates categories list", () => {
      const multiCatLabs = [
        ...mockLabs,
        { id: '4', name: 'Multi Lab', category: ['AI', 'Robotics'], provider: 'Multi', price: 150 }
      ];

      const { result } = renderHook(() => useLabFilters(multiCatLabs));

      // Categories should include 'AI', 'Quantum', 'Robotics' and be sorted
      expect(result.current.categories).toEqual(["AI", "Quantum", "Robotics"]);
    });
  });

  describe("Price Sorting", () => {
    test("sorts labs from low to high price", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      act(() => {
        result.current.setSelectedPrice("Low to High");
      });

      const prices = result.current.searchFilteredLabs.map((lab) => lab.price);
      expect(prices).toEqual([50, 100, 200]);
    });

    test("sorts labs from high to low price", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      act(() => {
        result.current.setSelectedPrice("High to Low");
      });

      const prices = result.current.searchFilteredLabs.map((lab) => lab.price);
      expect(prices).toEqual([200, 100, 50]);
    });

    test("does not mutate original labs array when sorting", () => {
      const originalOrder = [...mockLabs];
      const { result } = renderHook(() => useLabFilters(mockLabs));

      act(() => {
        result.current.setSelectedPrice("Low to High");
      });

      expect(mockLabs).toEqual(originalOrder);
    });
  });

  describe("Provider Filtering", () => {
    test("filters labs by selected provider", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      act(() => {
        result.current.setSelectedProvider("OpenAI");
      });

      expect(result.current.searchFilteredLabs).toHaveLength(1);
      expect(result.current.searchFilteredLabs[0].provider).toBe("OpenAI");
    });

    test("extracts unique providers sorted alphabetically", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      expect(result.current.providers).toEqual(["Google", "IBM", "OpenAI"]);
    });
  });

  describe("Active Booking Marking", () => {
    test("marks labs with active bookings when logged in", () => {
      mockUserBookingsData.hasBookingInLab.mockImplementation(
        (id) => id === "1"
      );

      const { result } = renderHook(() =>
        useLabFilters(mockLabs, mockUserBookingsData, true, false)
      );

      expect(result.current.searchFilteredLabs[0].hasActiveBooking).toBe(true);
      expect(result.current.searchFilteredLabs[1].hasActiveBooking).toBe(false);
    });

    test("does not mark bookings when not logged in", () => {
      mockUserBookingsData.hasBookingInLab.mockReturnValue(true);

      const { result } = renderHook(() =>
        useLabFilters(mockLabs, mockUserBookingsData, false, false)
      );

      expect(result.current.searchFilteredLabs[0].hasActiveBooking).toBe(false);
    });

    test("does not mark bookings while bookings are loading", () => {
      mockUserBookingsData.hasBookingInLab.mockReturnValue(true);

      const { result } = renderHook(() =>
        useLabFilters(mockLabs, mockUserBookingsData, true, true)
      );

      expect(result.current.searchFilteredLabs[0].hasActiveBooking).toBe(false);
    });

    test("handles null userBookingsData gracefully", () => {
      const { result } = renderHook(() =>
        useLabFilters(mockLabs, null, true, false)
      );

      expect(
        result.current.searchFilteredLabs[0].hasActiveBooking
      ).toBeUndefined();
    });
  });

  describe("Combined Filters", () => {
    test("applies category and price filters together", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      act(() => {
        result.current.setSelectedCategory("AI");
        result.current.setSelectedPrice("Low to High");
      });

      expect(result.current.searchFilteredLabs).toHaveLength(2);
      const prices = result.current.searchFilteredLabs.map((lab) => lab.price);
      expect(prices).toEqual([50, 100]);
    });

    test("applies category and provider filters together", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      act(() => {
        result.current.setSelectedCategory("AI");
        result.current.setSelectedProvider("OpenAI");
      });

      expect(result.current.searchFilteredLabs).toHaveLength(1);
      expect(result.current.searchFilteredLabs[0].name).toBe("Advanced AI Lab");
    });

    test("filters cascade in correct order", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      act(() => {
        result.current.setSelectedCategory("AI");
        result.current.setSelectedPrice("High to Low");
        result.current.setSelectedProvider("Google");
      });

      expect(result.current.searchFilteredLabs).toHaveLength(1);
      expect(result.current.searchFilteredLabs[0].name).toBe("Basic AI Lab");
    });
  });

  describe("Reset Functionality", () => {
    test("resets all filters to default state", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      act(() => {
        result.current.setSelectedCategory("AI");
        result.current.setSelectedPrice("Low to High");
        result.current.setSelectedProvider("OpenAI");
        result.current.setShowUnlisted(true);
      });

      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.selectedCategory).toBe("All");
      expect(result.current.selectedPrice).toBe("Sort by Price");
      expect(result.current.selectedProvider).toBe("All");
      expect(result.current.showUnlisted).toBe(false);
      expect(result.current.searchDebounce).toBe("");
    });

    test("clears search input ref when resetting", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      const mockInput = { value: "test" };
      result.current.searchInputRef.current = mockInput;

      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.searchInputRef.current.value).toBe("");
    });
  });

  describe("Edge Cases", () => {
    test("handles labs with null category gracefully", () => {
      const labsWithNull = [{ ...mockLabs[0], category: null }];
      const { result } = renderHook(() => useLabFilters(labsWithNull));

      expect(result.current.categories).toEqual([]);
    });

    test("handles labs with null provider gracefully", () => {
      const labsWithNull = [{ ...mockLabs[0], provider: null }];
      const { result } = renderHook(() => useLabFilters(labsWithNull));

      expect(result.current.providers).toEqual([]);
    });

    test("handles mixed null and valid categories", () => {
      const labsWithMixed = [
        { ...mockLabs[0], category: "AI" },
        { ...mockLabs[1], category: null },
        { ...mockLabs[2], category: "Quantum" },
      ];
      const { result } = renderHook(() => useLabFilters(labsWithMixed));

      expect(result.current.categories).toEqual(["AI", "Quantum"]);
    });

    test("returns empty array when filter removes all labs", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      act(() => {
        result.current.setSelectedProvider("NonExistent");
      });

      expect(result.current.searchFilteredLabs).toEqual([]);
    });
  });

  describe("Derived Data Stability", () => {
    test("categories array remains stable when labs unchanged", () => {
      const { result, rerender } = renderHook(() => useLabFilters(mockLabs));

      const firstCategories = result.current.categories;
      rerender();
      const secondCategories = result.current.categories;

      expect(firstCategories).toBe(secondCategories);
    });

    test("providers array remains stable when labs unchanged", () => {
      const { result, rerender } = renderHook(() => useLabFilters(mockLabs));

      const firstProviders = result.current.providers;
      rerender();
      const secondProviders = result.current.providers;

      expect(firstProviders).toBe(secondProviders);
    });
  });
});
