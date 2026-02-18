import React from "react";
import { render } from "@testing-library/react";
import Market from "../Market";

jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(),
}));

jest.mock("@/hooks/lab/useLabs", () => ({
  useLabsForMarket: jest.fn(),
  useLabFilters: jest.fn(),
}));

jest.mock("@/hooks/booking/useBookings", () => ({
  useUserBookingsForMarket: jest.fn(),
}));

jest.mock("@/components/ui", () => ({
  Container: ({ children }) => <div data-testid="container">{children}</div>,
}));

jest.mock("@/components/home/LabFilters", () => () => (
  <div data-testid="lab-filters" />
));

jest.mock("@/components/home/LabGrid", () => () => (
  <div data-testid="lab-grid" />
));

const mockUseUser = require("@/context/UserContext").useUser;
const mockUseLabsForMarket = require("@/hooks/lab/useLabs").useLabsForMarket;
const mockUseLabFilters = require("@/hooks/lab/useLabs").useLabFilters;
const mockUseUserBookingsForMarket =
  require("@/hooks/booking/useBookings").useUserBookingsForMarket;

const getDefaultLabFiltersResult = () => ({
  selectedCategory: "All",
  selectedPrice: "Sort by Price",
  selectedProvider: "All",
  selectedFilter: "Keyword",
  searchFilteredLabs: [],
  setSelectedCategory: jest.fn(),
  setSelectedPrice: jest.fn(),
  setSelectedProvider: jest.fn(),
  setSelectedFilter: jest.fn(),
  categories: [],
  providers: [],
  searchInputRef: { current: null },
  resetFilters: jest.fn(),
});

const getLastBookingsCallEnabled = () => {
  const calls = mockUseUserBookingsForMarket.mock.calls;
  const lastCall = calls[calls.length - 1];
  return lastCall?.[1]?.enabled;
};

describe("Market", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseLabsForMarket.mockReturnValue({
      data: { labs: [] },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    });

    mockUseLabFilters.mockReturnValue(getDefaultLabFiltersResult());

    mockUseUserBookingsForMarket.mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: false,
    });
  });

  test("enables bookings query for logged-in SSO users without wallet session", () => {
    mockUseUser.mockReturnValue({
      isLoggedIn: true,
      address: null,
      isWalletLoading: false,
      hasWalletSession: false,
      isSSO: true,
    });

    render(<Market />);

    expect(getLastBookingsCallEnabled()).toBe(true);
  });

  test("keeps bookings query enabled for wallet users with active wallet session", () => {
    mockUseUser.mockReturnValue({
      isLoggedIn: true,
      address: "0x123",
      isWalletLoading: false,
      hasWalletSession: true,
      isSSO: false,
    });

    render(<Market />);

    expect(getLastBookingsCallEnabled()).toBe(true);
  });

  test("disables bookings query for wallet users while wallet state is loading", () => {
    mockUseUser.mockReturnValue({
      isLoggedIn: true,
      address: "0x123",
      isWalletLoading: true,
      hasWalletSession: true,
      isSSO: false,
    });

    render(<Market />);

    expect(getLastBookingsCallEnabled()).toBe(false);
  });
});
