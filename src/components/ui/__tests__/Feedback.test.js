/**
 * Unit Tests for Feedback Component
 *
 * Test Behaviors:
 * - Alert component renders with all variants and handles dismissal
 * - Badge component displays all variants, sizes, and removable state
 * - Spinner component renders with different sizes and accessibility
 * - Progress bar shows correct percentage and labels
 * - Skeleton loader handles multiple variants and line counts
 * - EmptyState displays icon, title, description and actions
 *
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  Alert,
  Badge,
  Spinner,
  Progress,
  Skeleton,
  EmptyState,
} from "../Feedback";

describe("Feedback Components", () => {
  describe("Alert", () => {
    test("renders info alert by default", () => {
      render(<Alert>Test message</Alert>);

      expect(screen.getByText("Test message")).toBeInTheDocument();
      const alertDiv = document.querySelector(".rounded-md.border.p-4");
      expect(alertDiv).toBeInTheDocument();
    });

    test("renders all alert variants correctly", () => {
      const variants = ["info", "success", "warning", "error"];

      variants.forEach((variant) => {
        const { container } = render(
          <Alert variant={variant}>{variant} alert</Alert>
        );
        expect(screen.getByText(`${variant} alert`)).toBeInTheDocument();

        const alertElement = container.querySelector(".rounded-md.border.p-4");
        expect(alertElement).toHaveClass(
          `bg-${variant}-light`,
          `border-${variant}`,
          `text-${variant}-dark`
        );
      });
    });

    test("displays title when provided", () => {
      render(<Alert title="Alert Title">Alert content</Alert>);

      expect(screen.getByText("Alert Title")).toBeInTheDocument();
      expect(screen.getByText("Alert content")).toBeInTheDocument();
    });

    test("handles dismissible alert", () => {
      const onDismiss = jest.fn();
      render(
        <Alert dismissible onDismiss={onDismiss}>
          Dismissible alert
        </Alert>
      );

      const dismissButton = screen.getByRole("button", { name: /dismiss/i });
      fireEvent.click(dismissButton);

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    test("hides alert after dismissal", () => {
      const { container } = render(<Alert dismissible>Test alert</Alert>);

      const alertElement = container.querySelector(".rounded-md.border.p-4");
      expect(alertElement).toBeInTheDocument();

      const dismissButton = screen.getByRole("button", { name: /dismiss/i });
      fireEvent.click(dismissButton);

      expect(
        container.querySelector(".rounded-md.border.p-4")
      ).not.toBeInTheDocument();
    });

    test("accepts custom icon", () => {
      const CustomIcon = () => <span data-testid="custom-icon">🎯</span>;
      render(<Alert icon={<CustomIcon />}>Custom icon alert</Alert>);

      expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
    });
  });

  describe("Badge", () => {
    test("renders badge with default variant", () => {
      render(<Badge>Default badge</Badge>);

      expect(screen.getByText("Default badge")).toBeInTheDocument();
    });

    test("renders different sizes correctly", () => {
      const sizes = ["sm", "md", "lg"];

      sizes.forEach((size) => {
        render(<Badge size={size}>{size} badge</Badge>);
        expect(screen.getByText(`${size} badge`)).toBeInTheDocument();
      });
    });

    test("renders as dot when dot prop is true", () => {
      const { container } = render(<Badge dot />);

      const badge = container.querySelector("span");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("justify-center");
    });

    test("handles removable badge", () => {
      const onRemove = jest.fn();
      render(
        <Badge removable onRemove={onRemove}>
          Removable badge
        </Badge>
      );

      const removeButton = screen.getByRole("button", {
        name: /remove badge/i,
      });
      fireEvent.click(removeButton);

      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    test("renders without children when dot is true", () => {
      const { container } = render(<Badge dot />);

      const badge = container.querySelector("span");
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe("");
    });
  });

  describe("Spinner", () => {
    test("renders spinner with default props", () => {
      render(<Spinner />);

      // SVG is present and has the correct class.
      const svg = document.querySelector("svg.animate-spin");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveClass("size-8"); // default size 'md'
      expect(screen.getByLabelText("Loading...")).toBeInTheDocument();
    });

    test("renders different sizes", () => {
      const sizeMap = {
        sm: "size-4",
        md: "size-8",
        lg: "size-12",
        xl: "size-16",
      };

      Object.entries(sizeMap).forEach(([size, expectedClass]) => {
        const { container } = render(<Spinner size={size} />);
        const svg = container.querySelector("svg");
        expect(svg).toHaveClass(expectedClass);
      });
    });

    test("uses custom label for accessibility", () => {
      render(<Spinner label="Custom loading text" />);

      expect(screen.getByLabelText("Custom loading text")).toBeInTheDocument();
      expect(screen.getByText("Custom loading text")).toHaveClass("sr-only");
    });
  });

  describe("Progress", () => {
    test("renders progress bar with default values", () => {
      render(<Progress />);

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveAttribute("aria-valuenow", "0");
      expect(progressBar).toHaveAttribute("aria-valuemin", "0");
      expect(progressBar).toHaveAttribute("aria-valuemax", "100");
    });

    test("displays correct progress percentage", () => {
      render(<Progress value={75} />);

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "75");
    });

    test("shows label when showLabel is true", () => {
      render(<Progress value={50} showLabel />);

      expect(screen.getByText("Progress")).toBeInTheDocument();
      expect(screen.getByText("50%")).toBeInTheDocument();
    });

    test("uses custom label when provided", () => {
      render(<Progress value={25} showLabel label="Upload progress" />);

      expect(screen.getByText("Upload progress")).toBeInTheDocument();
      expect(screen.getByText("25%")).toBeInTheDocument();
    });

    test("respects max value for percentage calculation", () => {
      render(<Progress value={50} max={200} showLabel />);

      expect(screen.getByText("25%")).toBeInTheDocument();
    });

    test("clamps value between 0 and max", () => {
      const { rerender } = render(<Progress value={150} max={100} />);
      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "150");

      rerender(<Progress value={-50} />);
      expect(screen.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "-50"
      );
    });
  });

  describe("Skeleton", () => {
    test("renders rectangle skeleton by default", () => {
      render(<Skeleton />);

      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveClass("rounded");
    });

    test("renders different variants", () => {
      const variants = ["text", "circle", "rect"];

      variants.forEach((variant) => {
        render(<Skeleton variant={variant} />);
        const skeleton = document.querySelector(".animate-pulse");
        expect(skeleton).toBeInTheDocument();
      });
    });

    test("renders multiple text lines", () => {
      render(<Skeleton variant="text" lines={3} />);

      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons).toHaveLength(3);
    });

    test("applies custom width and height", () => {
      render(<Skeleton width="200px" height="50px" />);

      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toHaveStyle({ width: "200px", height: "50px" });
    });
  });

  describe("EmptyState", () => {
    test("renders empty state with title and description", () => {
      render(
        <EmptyState
          title="No items found"
          description="Please add some items to get started"
        />
      );

      expect(screen.getByText("No items found")).toBeInTheDocument();
      expect(
        screen.getByText("Please add some items to get started")
      ).toBeInTheDocument();
    });

    test("renders with custom icon", () => {
      const CustomIcon = () => <span data-testid="empty-icon">📭</span>;
      render(<EmptyState icon={<CustomIcon />} title="Empty" />);

      expect(screen.getByTestId("empty-icon")).toBeInTheDocument();
    });

    test("renders actions when provided", () => {
      const MockButton = () => <button>Add Item</button>;
      render(<EmptyState title="Empty" actions={<MockButton />} />);

      expect(screen.getByText("Add Item")).toBeInTheDocument();
    });

    test("renders without optional props", () => {
      render(<EmptyState />);

      // Should render without errors even with no props
      const emptyState = document.querySelector(".text-center");
      expect(emptyState).toBeInTheDocument();
    });
  });

  describe("PropTypes validation", () => {
    test("Alert has correct PropTypes", () => {
      expect(Alert.propTypes.children).toBeDefined();
      expect(Alert.propTypes.variant).toBeDefined();
      expect(Alert.propTypes.dismissible).toBeDefined();
    });

    test("Badge has correct PropTypes", () => {
      expect(Badge.propTypes.variant).toBeDefined();
      expect(Badge.propTypes.size).toBeDefined();
      expect(Badge.propTypes.removable).toBeDefined();
    });

    test("All components have PropTypes defined", () => {
      expect(Spinner.propTypes).toBeDefined();
      expect(Progress.propTypes).toBeDefined();
      expect(Skeleton.propTypes).toBeDefined();
      expect(EmptyState.propTypes).toBeDefined();
    });
  });
});
