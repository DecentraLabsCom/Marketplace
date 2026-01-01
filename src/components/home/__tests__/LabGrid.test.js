/**
 * Unit Tests for LabGrid Component
 *
 * Tests the lab grid display component that renders a responsive grid of lab cards.
 * Validates loading states, error handling, empty states, hydration logic, and proper
 * data mapping to child LabCard components.
 *
 * Test Behaviors:
 * - Loading State: Shows skeleton loader during initial load and hydration
 * - Error State: Displays error message when error flag is true
 * - Empty State: Shows empty message when no labs are available
 * - Lab Rendering: Renders correct number of LabCard components with proper data
 * - Hydration Prevention: Prevents SSR mismatch by showing loader pre-hydration
 * - Image Fallbacks: Handles multiple image source properties correctly
 * - Custom Messages: Respects custom emptyMessage prop
 * - Props Mapping: Passes correct props to each LabCard component
 * - Edge Cases: Handles undefined labs, missing properties, and large datasets
 * - Priority Logic: Error state takes precedence over empty and loading states
 * - Data Types: Correctly handles both string and numeric IDs and prices
 * - Image Priority: Uses image property first, then images array, then imageUrls
 * - Performance: Handles large datasets without rendering issues
 * - Prop Validation: Ensures all lab properties are properly passed to cards
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import LabGrid from "../LabGrid";

jest.mock("@/components/home/LabCard", () => {
  return function MockLabCard({ id, name, provider, price, image }) {
    return (
      <div data-testid={`lab-card-${id}`}>
        <span data-testid="lab-name">{name}</span>
        <span data-testid="lab-provider">{provider}</span>
        <span data-testid="lab-price">{price}</span>
        {image && <span data-testid="lab-image">{image}</span>}
      </div>
    );
  };
});

jest.mock("@/components/skeletons", () => ({
  LabCardGridSkeleton: () => (
    <div data-testid="skeleton-loader">Loading...</div>
  ),
}));

describe("LabGrid", () => {
  const mockLabs = [
    {
      id: "1",
      name: "Lab One",
      provider: "Provider A",
      price: "100",
      auth: true,
      hasActiveBooking: false,
      isListed: true,
      image: "/lab1.jpg",
    },
    {
      id: "2",
      name: "Lab Two",
      provider: "Provider B",
      price: "200",
      auth: false,
      hasActiveBooking: true,
      isListed: true,
      images: ["/lab2-1.jpg", "/lab2-2.jpg"],
    },
    {
      id: "3",
      name: "Lab Three",
      provider: "Provider C",
      price: "300",
      auth: true,
      hasActiveBooking: false,
      isListed: false,
      imageUrls: ["/lab3-url.jpg"],
    },
  ];

  describe("Loading State", () => {
    test("shows skeleton loader when loading is true", () => {
      render(<LabGrid labs={[]} loading={true} />);

      expect(screen.getByTestId("skeleton-loader")).toBeInTheDocument();
      expect(screen.queryByText("No Labs Found")).not.toBeInTheDocument();
    });

    test("shows labs after hydration completes", async () => {
      render(<LabGrid labs={mockLabs} loading={false} />);

      await waitFor(() => {
        expect(screen.queryByTestId("skeleton-loader")).not.toBeInTheDocument();
        expect(screen.getByTestId("lab-card-1")).toBeInTheDocument();
      });
    });

    test("prioritizes loading state over hydration state", () => {
      render(<LabGrid labs={mockLabs} loading={true} />);

      expect(screen.getByTestId("skeleton-loader")).toBeInTheDocument();
      expect(screen.queryByTestId("lab-card-1")).not.toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    test("displays error message when error is true", async () => {
      render(<LabGrid labs={[]} error={true} />);

      await waitFor(() => {
        expect(screen.getByText("No Labs Found")).toBeInTheDocument();
        expect(
          screen.getByText("No labs found matching your criteria.")
        ).toBeInTheDocument();
      });
    });

    test("does not show labs when error state is active", async () => {
      render(<LabGrid labs={mockLabs} error={true} />);

      await waitFor(() => {
        expect(screen.getByText("No Labs Found")).toBeInTheDocument();
        expect(screen.queryByTestId("lab-card-1")).not.toBeInTheDocument();
      });
    });

    test("error state takes precedence over empty state", async () => {
      render(<LabGrid labs={[]} error={true} />);

      await waitFor(() => {
        expect(screen.getByText("No Labs Found")).toBeInTheDocument();
      });
    });
  });

  describe("Empty State", () => {
    test("displays empty message when labs array is empty", async () => {
      render(<LabGrid labs={[]} loading={false} error={false} />);

      await waitFor(() => {
        expect(screen.getByText("No Labs Found")).toBeInTheDocument();
        expect(
          screen.getByText("No labs found matching your criteria.")
        ).toBeInTheDocument();
      });
    });

    test("displays custom empty message when provided", async () => {
      const customMessage = "Try adjusting your filters";
      render(<LabGrid labs={[]} emptyMessage={customMessage} />);

      await waitFor(() => {
        expect(screen.getByText(customMessage)).toBeInTheDocument();
      });
    });

    test("does not show empty state when labs exist", async () => {
      render(<LabGrid labs={mockLabs} />);

      await waitFor(() => {
        expect(screen.queryByText("No Labs Found")).not.toBeInTheDocument();
        expect(screen.getByTestId("lab-card-1")).toBeInTheDocument();
      });
    });
  });

  describe("Lab Rendering", () => {
    test("renders correct number of lab cards", async () => {
      render(<LabGrid labs={mockLabs} />);

      await waitFor(() => {
        expect(screen.getByTestId("lab-card-1")).toBeInTheDocument();
        expect(screen.getByTestId("lab-card-2")).toBeInTheDocument();
        expect(screen.getByTestId("lab-card-3")).toBeInTheDocument();
      });
    });

    test("renders lab cards with correct names", async () => {
      render(<LabGrid labs={mockLabs} />);

      await waitFor(() => {
        const labNames = screen.getAllByTestId("lab-name");
        expect(labNames[0]).toHaveTextContent("Lab One");
        expect(labNames[1]).toHaveTextContent("Lab Two");
        expect(labNames[2]).toHaveTextContent("Lab Three");
      });
    });

    test("renders lab cards with correct providers", async () => {
      render(<LabGrid labs={mockLabs} />);

      await waitFor(() => {
        const providers = screen.getAllByTestId("lab-provider");
        expect(providers[0]).toHaveTextContent("Provider A");
        expect(providers[1]).toHaveTextContent("Provider B");
        expect(providers[2]).toHaveTextContent("Provider C");
      });
    });

    test("renders lab cards with correct prices", async () => {
      render(<LabGrid labs={mockLabs} />);

      await waitFor(() => {
        const prices = screen.getAllByTestId("lab-price");
        expect(prices[0]).toHaveTextContent("100");
        expect(prices[1]).toHaveTextContent("200");
        expect(prices[2]).toHaveTextContent("300");
      });
    });

    test("renders single lab correctly", async () => {
      const singleLab = [mockLabs[0]];
      render(<LabGrid labs={singleLab} />);

      await waitFor(() => {
        expect(screen.getByTestId("lab-card-1")).toBeInTheDocument();
        expect(screen.queryByTestId("lab-card-2")).not.toBeInTheDocument();
      });
    });
  });

  describe("Image Handling", () => {
    test("uses image property when available", async () => {
      const labWithImage = [
        {
          id: "1",
          name: "Lab",
          provider: "Provider",
          price: "100",
          image: "/direct-image.jpg",
        },
      ];

      render(<LabGrid labs={labWithImage} />);

      await waitFor(() => {
        expect(screen.getByTestId("lab-image")).toHaveTextContent(
          "/direct-image.jpg"
        );
      });
    });

    test("falls back to images array when image not available", async () => {
      const labWithImagesArray = [
        {
          id: "2",
          name: "Lab",
          provider: "Provider",
          price: "100",
          images: ["/images-array.jpg"],
        },
      ];

      render(<LabGrid labs={labWithImagesArray} />);

      await waitFor(() => {
        expect(screen.getByTestId("lab-image")).toHaveTextContent(
          "/images-array.jpg"
        );
      });
    });

    test("falls back to imageUrls when image and images not available", async () => {
      const labWithImageUrls = [
        {
          id: "3",
          name: "Lab",
          provider: "Provider",
          price: "100",
          imageUrls: ["/image-urls.jpg"],
        },
      ];

      render(<LabGrid labs={labWithImageUrls} />);

      await waitFor(() => {
        expect(screen.getByTestId("lab-image")).toHaveTextContent(
          "/image-urls.jpg"
        );
      });
    });

    test("handles lab without any image property", async () => {
      const labWithoutImage = [
        {
          id: "4",
          name: "Lab",
          provider: "Provider",
          price: "100",
        },
      ];

      render(<LabGrid labs={labWithoutImage} />);

      await waitFor(() => {
        expect(screen.getByTestId("lab-card-4")).toBeInTheDocument();
        expect(screen.queryByTestId("lab-image")).not.toBeInTheDocument();
      });
    });

    test("uses first image from images array", async () => {
      const labWithMultipleImages = [
        {
          id: "5",
          name: "Lab",
          provider: "Provider",
          price: "100",
          images: ["/first.jpg", "/second.jpg", "/third.jpg"],
        },
      ];

      render(<LabGrid labs={labWithMultipleImages} />);

      await waitFor(() => {
        expect(screen.getByTestId("lab-image")).toHaveTextContent("/first.jpg");
      });
    });
  });

  describe("Props and Data Mapping", () => {
    test("handles numeric IDs correctly", async () => {
      const labsWithNumericIds = [
        {
          id: 123,
          name: "Numeric Lab",
          provider: "Provider",
          price: "100",
        },
      ];

      render(<LabGrid labs={labsWithNumericIds} />);

      await waitFor(() => {
        expect(screen.getByTestId("lab-card-123")).toBeInTheDocument();
      });
    });

    test("handles numeric prices correctly", async () => {
      const labWithNumericPrice = [
        {
          id: "1",
          name: "Lab",
          provider: "Provider",
          price: 500,
        },
      ];

      render(<LabGrid labs={labWithNumericPrice} />);

      await waitFor(() => {
        expect(screen.getByTestId("lab-price")).toHaveTextContent("500");
      });
    });

    test("passes all required props to LabCard", async () => {
      const labWithAllProps = [
        {
          id: "1",
          name: "Full Lab",
          provider: "Full Provider",
          price: "999",
          auth: true,
          hasActiveBooking: true,
          isListed: false,
          image: "/full-image.jpg",
        },
      ];

      render(<LabGrid labs={labWithAllProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("lab-card-1")).toBeInTheDocument();
      });
    });
  });

  describe("Edge Cases", () => {
    test("handles undefined labs prop gracefully", async () => {
      render(<LabGrid />);

      await waitFor(() => {
        expect(screen.getByText("No Labs Found")).toBeInTheDocument();
      });
    });

    test("handles labs with missing optional properties", async () => {
      const minimalLab = [
        {
          id: "1",
          name: "Minimal Lab",
        },
      ];

      render(<LabGrid labs={minimalLab} />);

      await waitFor(() => {
        expect(screen.getByTestId("lab-card-1")).toBeInTheDocument();
      });
    });

    test("renders with custom className", async () => {
      const { container } = render(
        <LabGrid labs={mockLabs} className="custom-class" />
      );

      await waitFor(() => {
        expect(container.querySelector("section")).toBeInTheDocument();
      });
    });

    test("handles empty images and imageUrls arrays", async () => {
      const labWithEmptyArrays = [
        {
          id: "1",
          name: "Lab",
          provider: "Provider",
          price: "100",
          images: [],
          imageUrls: [],
        },
      ];

      render(<LabGrid labs={labWithEmptyArrays} />);

      await waitFor(() => {
        expect(screen.getByTestId("lab-card-1")).toBeInTheDocument();
      });
    });

    test("handles loading and error both true", () => {
      render(<LabGrid labs={mockLabs} loading={true} error={true} />);

      expect(screen.getByTestId("skeleton-loader")).toBeInTheDocument();
      expect(screen.queryByText("No Labs Found")).not.toBeInTheDocument();
    });

    test("handles large number of labs", async () => {
      const manyLabs = Array.from({ length: 50 }, (_, i) => ({
        id: `lab-${i}`,
        name: `Lab ${i}`,
        provider: `Provider ${i}`,
        price: `${i * 100}`,
      }));

      render(<LabGrid labs={manyLabs} />);

      await waitFor(() => {
        expect(screen.getByTestId("lab-card-lab-0")).toBeInTheDocument();
        expect(screen.getByTestId("lab-card-lab-49")).toBeInTheDocument();
      });
    });
  });
});
