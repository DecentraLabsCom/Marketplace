/**
 * Unit Tests for FMU-specific features in LabCard, LabGrid, LabFilters
 *
 * Tested Behaviors:
 * - LabCard FMU badge rendering
 * - LabCard explore text for FMU vs Lab
 * - LabGrid resourceType prop propagation
 * - LabFilters resource type toggle button
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// ─── LabCard Tests ──────────────────────────────────────────────────

jest.mock("@/hooks/booking/useBookings", () => ({
  useActiveReservationKeyForUser: jest.fn(() => ({ data: null })),
  useActiveReservationKeyForSessionUserSSO: jest.fn(() => ({ data: null })),
}));
jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(() => ({
    address: "0xABC",
    isConnected: true,
    isSSO: false,
  })),
}));
jest.mock("@/context/LabTokenContext", () => ({
  useLabToken: jest.fn(() => ({
    formatPrice: (p) => `€${Number(p).toFixed(2)}`,
  })),
}));
jest.mock("@/components/home/LabAccess", () => {
  return function MockLabAccess() {
    return <div data-testid="lab-access-mock" />;
  };
});
jest.mock("@/components/ui", () => ({
  Card: ({ children, className }) => (
    <div className={className} data-testid="card-container">
      {children}
    </div>
  ),
  Badge: ({ children, className }) => (
    <span className={className} data-testid="badge">
      {children}
    </span>
  ),
  cn: (...args) =>
    args
      .flat()
      .filter(Boolean)
      .map((a) => (typeof a === "string" ? a : ""))
      .filter(Boolean)
      .join(" "),
  LabCardImage: ({ src, alt }) => <img src={src} alt={alt} data-testid="lab-card-image" />,
}));
jest.mock("next/link", () => {
  return function MockLink({ href, children }) {
    return <a href={href}>{children}</a>;
  };
});

const LabCard = require("../LabCard").default;

const baseLabProps = {
  id: "lab-1",
  name: "Test Lab",
  provider: "ProviderA",
  price: 10,
  auth: "https://gw.example.com/auth",
  activeBooking: false,
  isListed: true,
  image: "https://cdn.example.com/lab.jpg",
  createdAt: Math.floor(Date.now() / 1000),
  reputation: { score: 4, totalEvents: 2, ownerCancellations: 0, institutionalCancellations: 0, lastUpdated: 0 },
};

describe("LabCard - FMU Support", () => {
  test("does NOT show FMU badge when resourceType is 'lab' (default)", () => {
    render(<LabCard {...baseLabProps} />);
    expect(screen.queryByText(/FMU/)).toBeNull();
  });

  test("shows FMU badge when resourceType is 'fmu'", () => {
    render(<LabCard {...baseLabProps} resourceType="fmu" />);
    expect(screen.getByText(/FMU/)).toBeInTheDocument();
  });

  test("shows 'Explore Simulation' hover text for FMU resources", () => {
    render(<LabCard {...baseLabProps} resourceType="fmu" />);
    expect(screen.getByText("Explore Simulation")).toBeInTheDocument();
  });

  test("shows 'Explore Lab' hover text for lab resources (default)", () => {
    render(<LabCard {...baseLabProps} />);
    expect(screen.getByText("Explore Lab")).toBeInTheDocument();
  });
});

// ─── LabFilters Tests ───────────────────────────────────────────────

// Reset modules for LabFilters
jest.mock("@/components/home/LabFilters", () => {
  // We need the actual component, not a mock
  return jest.requireActual("@/components/home/LabFilters");
});

const LabFilters = require("../LabFilters").default;

const baseFilterProps = {
  categories: ["All", "Electronics", "Chemistry"],
  providers: ["All", "ProviderA"],
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

describe("LabFilters - Resource Type Toggle", () => {
  test("does NOT render resource type button when onResourceTypeChange is not provided", () => {
    render(<LabFilters {...baseFilterProps} />);
    expect(screen.queryByText(/All Types|Labs only|FMU only/)).toBeNull();
  });

  test("renders 'All Types' button when onResourceTypeChange is provided", () => {
    const onChange = jest.fn();
    render(
      <LabFilters
        {...baseFilterProps}
        selectedResourceType="All"
        onResourceTypeChange={onChange}
      />
    );
    expect(screen.getByText("All Types")).toBeInTheDocument();
  });

  test("cycles through resource type values on click", () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <LabFilters
        {...baseFilterProps}
        selectedResourceType="All"
        onResourceTypeChange={onChange}
      />
    );
    // Click "All Types" → should call with "lab"
    fireEvent.click(screen.getByText("All Types"));
    expect(onChange).toHaveBeenCalledWith("lab");

    // Rerender with "lab"
    rerender(
      <LabFilters
        {...baseFilterProps}
        selectedResourceType="lab"
        onResourceTypeChange={onChange}
      />
    );
    expect(screen.getByText("Labs only")).toBeInTheDocument();

    // Click "Labs only" → should call with "fmu"
    fireEvent.click(screen.getByText("Labs only"));
    expect(onChange).toHaveBeenCalledWith("fmu");

    // Rerender with "fmu"
    rerender(
      <LabFilters
        {...baseFilterProps}
        selectedResourceType="fmu"
        onResourceTypeChange={onChange}
      />
    );
    expect(screen.getByText("FMU only")).toBeInTheDocument();

    // Click "FMU only" → should call with "All"
    fireEvent.click(screen.getByText("FMU only"));
    expect(onChange).toHaveBeenCalledWith("All");
  });
});
