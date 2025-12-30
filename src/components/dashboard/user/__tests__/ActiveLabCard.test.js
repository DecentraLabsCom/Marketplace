/**
 * Unit tests for ActiveLabCard component
 *
 * Tested Behaviors:
 * - Card displays "no lab" message when lab is null
 * - Active lab shows border animation and current status
 * - Upcoming lab shows formatted date and no access button
 * - Documents display in iframe when available
 * - "No documents" message shows when docs array is empty
 * - LabAccess component renders only for active bookings
 * - Booking times display correctly
 * - Explore link navigates to correct lab detail page
 * - Edge cases (null docs, invalid dates, missing booking data) handled gracefully
 */

// Testing utilities from React Testing Library
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock Next.js Link component
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }) => <a href={href}>{children}</a>,
}));

// Mock Carrousel component
jest.mock("@/components/ui/Carrousel", () => ({
  __esModule: true,
  default: ({ lab }) => (
    <div data-testid="carrousel-mock">Carrousel for lab {lab.id}</div>
  ),
}));

// Mock LabAccess component
jest.mock("@/components/home/LabAccess", () => ({
  __esModule: true,
  default: ({ id, userWallet, hasActiveBooking, auth, reservationKey }) => (
    <div data-testid="lab-access-mock">
      <span>Lab Access for {id}</span>
      <span>User: {userWallet}</span>
      <span>Active: {hasActiveBooking ? "yes" : "no"}</span>
      <span>Auth: {auth}</span>
      <span>Key: {reservationKey}</span>
    </div>
  ),
}));

// Mock logger utility
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import ActiveLabCard from "../ActiveLabCard";

// Test fixtures - represents typical lab and booking data
const mockLab = {
  id: "1",
  name: "Physics Lab",
  docs: ["https://example.com/doc1.pdf", "https://example.com/doc2.pdf"],
  auth: "https://auth.example.com/auth",
  images: ["https://example.com/img1.jpg"],
};

const mockBooking = {
  date: "2024-03-15",
  reservationKey: "abc123xyz",
  start: 1710489600, // Unix timestamp for 2024-03-15 08:00:00
  end: 1710496800, // Unix timestamp for 2024-03-15 10:00:00
};

const mockBookingTimes = {
  start: "08:00",
  end: "10:00",
};

/**
 * Helper function to render component with default props
 * Allows easy overriding of specific props for different test scenarios
 */
const renderCard = (props = {}) => {
  const defaultProps = {
    lab: mockLab,
    booking: mockBooking,
    userAddress: "0x1234567890abcdef",
    isActive: false,
    bookingTimes: mockBookingTimes,
    ...props,
  };
  return render(<ActiveLabCard {...defaultProps} />);
};

describe("ActiveLabCard", () => {
  describe("No Lab State", () => {
    test('displays "no lab" message when lab is null', () => {
      renderCard({ lab: null });

      expect(screen.getByText("No upcoming or active lab")).toBeInTheDocument();
    });

    test("does not render any lab content when lab is null", () => {
      renderCard({ lab: null });

      expect(screen.queryByTestId("carrousel-mock")).not.toBeInTheDocument();
      expect(screen.queryByText("Explore this lab")).not.toBeInTheDocument();
    });
  });

  describe("Card Rendering", () => {
    test("renders carrousel with lab data", () => {
      renderCard();

      const carrousel = screen.getByTestId("carrousel-mock");
      expect(carrousel).toBeInTheDocument();
      expect(carrousel).toHaveTextContent("Carrousel for lab 1");
    });

    test("displays booking start and end times", () => {
      renderCard();

      expect(screen.getByText("Start time: 08:00")).toBeInTheDocument();
      expect(screen.getByText("End time: 10:00")).toBeInTheDocument();
    });

    test("renders explore lab link with correct href", () => {
      renderCard();

      const link = screen.getByRole("link", { name: /explore this lab/i });
      expect(link).toHaveAttribute("href", "/lab/1");
    });
  });

  describe("Active Lab State", () => {
    test('displays "Available today" for active lab', () => {
      renderCard({ isActive: true });

      expect(screen.getByText("Available today")).toBeInTheDocument();
    });

    test("renders LabAccess component when lab is active", () => {
      renderCard({ isActive: true });

      const labAccess = screen.getByTestId("lab-access-mock");
      expect(labAccess).toBeInTheDocument();
      expect(labAccess).toHaveTextContent("Lab Access for 1");
      expect(labAccess).toHaveTextContent("User: 0x1234567890abcdef");
      expect(labAccess).toHaveTextContent("Active: yes");
      expect(labAccess).toHaveTextContent("Key: abc123xyz");
    });

    test("applies border animation class for active lab", () => {
      const { container } = renderCard({ isActive: true });

      const card = container.querySelector(".border-4");
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass("animate-glow");
    });
  });

  describe("Upcoming Lab State", () => {
    test("displays formatted date for upcoming lab", () => {
      renderCard({ isActive: false });

      // Date formatted as YYYY-MM-DD from Unix timestamp
      expect(screen.getByText(/Available: 2024-03-15/)).toBeInTheDocument();
    });

    test("does not render LabAccess component when lab is upcoming", () => {
      renderCard({ isActive: false });

      expect(screen.queryByTestId("lab-access-mock")).not.toBeInTheDocument();
    });

    test("applies standard border without animation for upcoming lab", () => {
      const { container } = renderCard({ isActive: false });

      const card = container.querySelector(".border-2");
      expect(card).toBeInTheDocument();
      expect(card).not.toHaveClass("border-4");
      expect(card).not.toHaveClass("animate-glow");
    });
  });

  describe("Documents Display", () => {
    test("displays iframe with first document when docs available", () => {
      renderCard();

      const iframe = screen.getByTitle("description");
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute("src", "https://example.com/doc1.pdf");
    });

    test('displays "no documents" message when docs array is empty', () => {
      renderCard({ lab: { ...mockLab, docs: [] } });

      expect(screen.getByText("No documents available")).toBeInTheDocument();
      expect(screen.queryByTitle("description")).not.toBeInTheDocument();
    });

    test('displays "no documents" message when docs is null', () => {
      renderCard({ lab: { ...mockLab, docs: null } });

      expect(screen.getByText("No documents available")).toBeInTheDocument();
    });

    test('displays "no documents" message when docs is undefined', () => {
      renderCard({ lab: { ...mockLab, docs: undefined } });

      expect(screen.getByText("No documents available")).toBeInTheDocument();
    });

    test("only displays first document even when multiple docs exist", () => {
      renderCard();

      const iframes = screen.getAllByTitle("description");
      expect(iframes).toHaveLength(1);
      expect(iframes[0]).toHaveAttribute("src", "https://example.com/doc1.pdf");
    });
  });

  describe("Booking Times", () => {
    test("displays custom booking times when provided", () => {
      renderCard({
        bookingTimes: { start: "14:30", end: "16:45" },
      });

      expect(screen.getByText("Start time: 14:30")).toBeInTheDocument();
      expect(screen.getByText("End time: 16:45")).toBeInTheDocument();
    });

    test("handles null booking times gracefully", () => {
      renderCard({
        bookingTimes: { start: null, end: null },
      });

      expect(screen.getByText("Start time:")).toBeInTheDocument();
      expect(screen.getByText("End time:")).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    test("handles booking without start timestamp", () => {
      renderCard({
        booking: { ...mockBooking, start: null },
        isActive: false,
      });

      // Should show generic available text without date
      expect(screen.getByText("Available:")).toBeInTheDocument();
    });

    test("handles invalid booking timestamp", () => {
      renderCard({
        booking: { ...mockBooking, start: "invalid" },
        isActive: false,
      });

      // Should handle gracefully without crashing
      expect(screen.getByText("Available:")).toBeInTheDocument();
    });

    test("handles missing booking object for active lab", () => {
      renderCard({
        booking: null,
        isActive: true,
      });

      const labAccess = screen.getByTestId("lab-access-mock");
      expect(labAccess).toHaveTextContent("Active: no");
      expect(labAccess).toHaveTextContent("Key:"); // Empty key
    });

    test("renders without crashing when all optional props are null", () => {
      renderCard({
        lab: { id: "1", name: "Test Lab" },
        booking: null,
        bookingTimes: { start: null, end: null },
      });

      expect(screen.getByText("Explore this lab")).toBeInTheDocument();
    });

    test("handles lab without auth field", () => {
      renderCard({
        lab: { ...mockLab, auth: undefined },
        isActive: true,
      });

      const labAccess = screen.getByTestId("lab-access-mock");
      expect(labAccess).toBeInTheDocument();
    });
  });
});
