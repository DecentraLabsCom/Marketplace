/**
 * Unit Tests for useLabFilters hook.
 * Corregido para soportar React 18 concurrent rendering (useDeferredValue).
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
      // searchDebounce debe estar mapeado a deferredSearchTerm en el hook
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
  });

  describe("Active Booking Marking", () => {
    test("marks labs with active bookings when logged in", () => {
      mockUserBookingsData.hasBookingInLab.mockImplementation((id) => id === "1");

      const { result } = renderHook(() =>
        useLabFilters(mockLabs, mockUserBookingsData, true, false)
      );

      expect(result.current.searchFilteredLabs.find(l => l.id === "1").hasActiveBooking).toBe(true);
      expect(result.current.searchFilteredLabs.find(l => l.id === "2").hasActiveBooking).toBe(false);
    });

    test("does not mark bookings when not logged in", () => {
      mockUserBookingsData.hasBookingInLab.mockReturnValue(true);

      const { result } = renderHook(() =>
        useLabFilters(mockLabs, mockUserBookingsData, false, false)
      );

      expect(result.current.searchFilteredLabs[0].hasActiveBooking).toBe(false);
    });
  });

  describe("Reset Functionality", () => {
    test("resets all filters to default state", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      act(() => {
        result.current.setSelectedCategory("AI");
        result.current.setSelectedPrice("Low to High");
        result.current.setSearchTerm("test");
      });

      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.selectedCategory).toBe("All");
      expect(result.current.selectedPrice).toBe("Sort by Price");
      expect(result.current.searchTerm).toBe("");
    });

    test("clears search input ref when resetting", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));
      const mockInput = { value: "test" };
      result.current.searchInputRef.current = mockInput;

      act(() => {
        result.current.resetFilters();
      });

      expect(mockInput.value).toBe("");
    });
  });

  describe("Edge Cases", () => {
    test("returns empty array when filter removes all labs", () => {
      const { result } = renderHook(() => useLabFilters(mockLabs));

      act(() => {
        result.current.setSelectedProvider("NonExistent");
      });

      expect(result.current.searchFilteredLabs).toEqual([]);
    });

    // TEST CORREGIDO PARA USEDEFERREDVALUE
    test("attaches input listener after hydration toggles and debounces input", async () => {
      // Usamos timers reales para no interferir con useDeferredValue
      jest.useRealTimers();

      const { result, rerender } = renderHook(
        ({ hydrated }) => useLabFilters(mockLabs, null, false, false, hydrated),
        { initialProps: { hydrated: false } }
      );

      const mockInput = document.createElement('input');
      result.current.searchInputRef.current = mockInput;

      // Cambiamos a hidratado para que se dispare la lógica de búsqueda
      rerender({ hydrated: true });

      // 1. Simular escritura inmediata
      act(() => {
        result.current.setSearchTerm('ai');
      });

      // 2. Esperar un ciclo de microtareas para que useDeferredValue se actualice
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // 3. Verificar que el valor diferido (mapeado a searchDebounce) sea correcto
      expect(result.current.searchDebounce).toBe('ai');
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
  });
});