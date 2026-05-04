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
import { render, screen, fireEvent, within } from "@testing-library/react";

// â”€â”€â”€ LabCard Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(() => ({
    address: "0xABC",
    isConnected: true,
    isSSO: false,
  })),
}));
jest.mock("@/context/LabCreditContext", () => ({
  useLabCredit: jest.fn(() => ({
    formatPrice: (p) => `â‚¬${Number(p).toFixed(2)}`,
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
  test("shows 'Real' badge when resourceType is 'lab' (default)", () => {
    render(<LabCard {...baseLabProps} />);
    expect(screen.getByText("Real")).toBeInTheDocument();
    expect(screen.queryByText("Sim")).toBeNull();
  });

  test("shows 'Sim' badge when resourceType is 'fmu'", () => {
    render(<LabCard {...baseLabProps} resourceType="fmu" />);
    expect(screen.getByText("Sim")).toBeInTheDocument();
    expect(screen.queryByText("Real")).toBeNull();
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

// â”€â”€â”€ LabFilters Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

describe("LabFilters - Resource Type Dropdown", () => {
  test("renders resource type dropdown even when onResourceTypeChange is not provided", () => {
    render(<LabFilters {...baseFilterProps} />);
    expect(screen.getByRole("combobox", { name: /filter by type/i })).toBeInTheDocument();
  });

  test("renders dropdown with correct options", () => {
    const onChange = jest.fn();
    render(
      <LabFilters
        {...baseFilterProps}
        selectedResourceType="All"
        onResourceTypeChange={onChange}
      />
    );
    const select = screen.getByRole("combobox", { name: /filter by type/i });
    expect(select).toBeInTheDocument();
    const selectEl = within(select.closest('div'));
    expect(selectEl.getByRole("option", { name: "All" })).toBeInTheDocument();
    expect(selectEl.getByRole("option", { name: "Real" })).toBeInTheDocument();
    expect(selectEl.getByRole("option", { name: "Simulations" })).toBeInTheDocument();
  });

  test("calls onResourceTypeChange with 'lab' when 'Real' is selected", () => {
    const onChange = jest.fn();
    render(
      <LabFilters
        {...baseFilterProps}
        selectedResourceType="All"
        onResourceTypeChange={onChange}
      />
    );
    const select = screen.getByRole("combobox", { name: /filter by type/i });
    fireEvent.change(select, { target: { value: "lab" } });
    expect(onChange).toHaveBeenCalledWith("lab");
  });

  test("calls onResourceTypeChange with 'fmu' when 'Simulations' is selected", () => {
    const onChange = jest.fn();
    render(
      <LabFilters
        {...baseFilterProps}
        selectedResourceType="lab"
        onResourceTypeChange={onChange}
      />
    );
    const select = screen.getByRole("combobox", { name: /filter by type/i });
    fireEvent.change(select, { target: { value: "fmu" } });
    expect(onChange).toHaveBeenCalledWith("fmu");
  });

  test("calls onResourceTypeChange with 'All' when 'All' is selected", () => {
    const onChange = jest.fn();
    render(
      <LabFilters
        {...baseFilterProps}
        selectedResourceType="fmu"
        onResourceTypeChange={onChange}
      />
    );
    const select = screen.getByRole("combobox", { name: /filter by type/i });
    fireEvent.change(select, { target: { value: "All" } });
    expect(onChange).toHaveBeenCalledWith("All");
  });
});
