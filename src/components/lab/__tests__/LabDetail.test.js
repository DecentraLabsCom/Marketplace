/**
 * Unit Tests for LabDetail Component
 *
 * Tests the detailed lab information display component that shows comprehensive lab data.
 * Validates data fetching states, booking functionality, and conditional rendering of lab metadata.
 *
 * Test Behaviors:
 *
 * - Data Fetching States: Loading, error with retry, and not found states
 * - Booking Functionality: Enable/disable button based on isListed and router navigation
 * - Unlisted Badge: Shows warning only for unlisted labs
 * - Price Formatting: Uses formatPrice callback for displaying lab price
 * - Documentation Display: Carousel vs empty state based on docs availability
 * - Array Safety: Handles non-array keywords and docs gracefully
 * - Conditional Rendering: Provider info visibility based on availability
 *
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import LabDetail from "../LabDetail";
import { useLabById } from "@/hooks/lab/useLabs";
import { useLabToken } from "@/context/LabTokenContext";
import { useRouter } from "next/navigation";

jest.mock("@/hooks/lab/useLabs");
jest.mock("@/context/LabTokenContext");
jest.mock("next/navigation");
jest.mock("@/components/ui", () => ({
  Container: ({ children, as = "div" }) =>
    React.createElement(as, { "data-testid": "container" }, children),
}));
jest.mock("@/components/ui/Carrousel", () => {
  return function MockCarrousel({ lab }) {
    return <div data-testid="carousel">{lab?.name} Images</div>;
  };
});
jest.mock("@/components/ui/DocsCarrousel", () => {
  return function MockDocsCarrousel({ docs }) {
    return <div data-testid="docs-carousel">{docs?.length} documents</div>;
  };
});
jest.mock("@/components/skeletons", () => ({
  LabHeroSkeleton: () => <div data-testid="skeleton-loader">Loading...</div>,
}));

describe("LabDetail", () => {
  const mockRouter = {
    push: jest.fn(),
  };

  const mockLabData = {
    id: "lab-123",
    name: "Advanced Chemistry Lab",
    description:
      "A state-of-the-art chemistry laboratory with modern equipment.",
    price: "150",
    provider: "University Research Center",
    category: "Chemistry",
    keywords: ["chemistry", "research", "experiments"],
    isListed: true,
    docs: [
      { id: 1, title: "Safety Manual", url: "/docs/safety.pdf" },
      { id: 2, title: "Equipment Guide", url: "/docs/equipment.pdf" },
    ],
  };

  const defaultMockResponse = {
    data: mockLabData,
    isLoading: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue(mockRouter);
    useLabToken.mockReturnValue({
      formatPrice: jest.fn((price) => price),
    });
    useLabById.mockReturnValue(defaultMockResponse);
  });

  describe("Data Fetching States", () => {
    test("shows skeleton loader while fetching", () => {
      useLabById.mockReturnValue({
        data: null,
        isLoading: true,
        isError: false,
        error: null,
      });

      render(<LabDetail id="lab-123" />);

      expect(screen.getByTestId("skeleton-loader")).toBeInTheDocument();
    });

    test("shows error message with retry button on fetch failure", () => {
      const reloadSpy = jest.fn();
      delete window.location;
      window.location = { reload: reloadSpy };

      useLabById.mockReturnValue({
        data: null,
        isLoading: false,
        isError: true,
        error: { message: "Network error" },
      });

      render(<LabDetail id="lab-123" />);

      expect(screen.getByText("Error Loading Lab")).toBeInTheDocument();
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });

    test("shows not found message when lab is null", () => {
      useLabById.mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
        error: null,
      });

      render(<LabDetail id="lab-123" />);

      expect(screen.getByText("Lab not found.")).toBeInTheDocument();
    });
  });

  describe("Price Display", () => {
    test("displays formatted price using formatPrice function", () => {
      const formatPrice = jest.fn((price) => `$${price}`);
      useLabToken.mockReturnValue({ formatPrice });

      render(<LabDetail id="lab-123" />);

      expect(formatPrice).toHaveBeenCalledWith("150");
      expect(screen.getByText("$150 $LAB / hour")).toBeInTheDocument();
    });
  });
  describe("Booking Functionality", () => {
    test("enables booking button and navigates for listed lab", () => {
      render(<LabDetail id="lab-123" />);

      const bookButton = screen.getByRole("button", {
        name: /Rent Advanced Chemistry Lab/i,
      });
      expect(bookButton).not.toBeDisabled();

      fireEvent.click(bookButton);
      expect(mockRouter.push).toHaveBeenCalledWith("/reservation/lab-123");
    });

    test("disables booking button and prevents navigation for unlisted lab", () => {
      const unlistedLab = { ...mockLabData, isListed: false };
      useLabById.mockReturnValue({
        ...defaultMockResponse,
        data: unlistedLab,
      });

      render(<LabDetail id="lab-123" />);

      const bookButton = screen.getByRole("button", {
        name: /Lab not available/i,
      });
      expect(bookButton).toBeDisabled();
      expect(screen.getByText("Not Available")).toBeInTheDocument();

      fireEvent.click(bookButton);
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  describe("Unlisted Lab Badge", () => {
    test("shows warning badge only for unlisted labs", () => {
      const unlistedLab = { ...mockLabData, isListed: false };
      useLabById.mockReturnValue({
        ...defaultMockResponse,
        data: unlistedLab,
      });

      render(<LabDetail id="lab-123" />);

      expect(
        screen.getByText(/currently unlisted and not available/i)
      ).toBeInTheDocument();
    });

    test("hides warning badge for listed labs", () => {
      render(<LabDetail id="lab-123" />);

      expect(screen.queryByText(/currently unlisted/i)).not.toBeInTheDocument();
    });
  });

  describe("Documentation Display", () => {
    test("shows docs carousel when documents available", () => {
      render(<LabDetail id="lab-123" />);

      expect(screen.getByTestId("docs-carousel")).toBeInTheDocument();
      expect(
        screen.queryByText("No documents available")
      ).not.toBeInTheDocument();
    });

    test("shows empty state when no documents available", () => {
      const labWithoutDocs = { ...mockLabData, docs: [] };
      useLabById.mockReturnValue({
        ...defaultMockResponse,
        data: labWithoutDocs,
      });

      render(<LabDetail id="lab-123" />);

      expect(screen.getByText("No documents available")).toBeInTheDocument();
      expect(screen.queryByTestId("docs-carousel")).not.toBeInTheDocument();
    });
  });

  describe("Array Safety", () => {
    test("handles non-array keywords gracefully", () => {
      const labWithInvalidKeywords = {
        ...mockLabData,
        keywords: "not-an-array",
      };
      useLabById.mockReturnValue({
        ...defaultMockResponse,
        data: labWithInvalidKeywords,
      });

      render(<LabDetail id="lab-123" />);

      expect(
        screen.getByRole("heading", { name: "Advanced Chemistry Lab" })
      ).toBeInTheDocument();
    });

    test("handles non-array docs gracefully", () => {
      const labWithInvalidDocs = { ...mockLabData, docs: null };
      useLabById.mockReturnValue({
        ...defaultMockResponse,
        data: labWithInvalidDocs,
      });

      render(<LabDetail id="lab-123" />);

      expect(screen.getByText("No documents available")).toBeInTheDocument();
    });
  });

  describe("Conditional Rendering", () => {
    test("shows provider info when available", () => {
      render(<LabDetail id="lab-123" />);

      expect(
        screen.getByText(/Provider: University Research Center/)
      ).toBeInTheDocument();
    });

    test("hides provider info when not available", () => {
      const labWithoutProvider = { ...mockLabData, provider: null };
      useLabById.mockReturnValue({
        ...defaultMockResponse,
        data: labWithoutProvider,
      });

      render(<LabDetail id="lab-123" />);

      expect(screen.queryByText(/Provider:/)).not.toBeInTheDocument();
    });
  });
});
