/**
 * Unit Tests for BookingCalendarSection Component
 *
 * Tests the booking calendar section that handles date/time selection and availability display.
 * Validates booking filtering, calendar key generation, form interactions, and conditional
 * rendering based on authentication type (SSO vs Wallet).
 *
 * Test Behaviors:
 * - Null Safety: Returns null when lab prop is not provided
 * - Booking Filtering: Filters out cancelled bookings from calendar display
 * - Calendar Rendering: Renders calendar with correct date and triggers callbacks
 * - Duration Selection: Dropdown with lab time slots and default fallback
 * - Time Selection: Available times with disabled states for reserved slots
 * - SSO Conditional: Shows/hides payment info based on authentication type
 * - Calendar Key: Regenerates on booking status or refresh changes
 * - Edge Cases: Empty arrays, formatPrice callback handling
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import BookingCalendarSection from "../BookingCalendarSection";
import { isCancelledBooking } from "@/utils/booking/bookingStatus";

jest.mock("@/components/booking/CalendarWithBookings", () => {
  return function MockCalendar({
    selectedDate,
    onDateChange,
    bookingInfo,
    minDate,
    maxDate,
    displayMode,
  }) {
    return (
      <div data-testid="calendar-component">
        <span data-testid="calendar-date">{selectedDate.toISOString()}</span>
        <span data-testid="calendar-bookings">{bookingInfo?.length || 0}</span>
        <span data-testid="calendar-mode">{displayMode}</span>
        <button onClick={() => onDateChange(new Date("2025-12-25"))}>
          Change Date
        </button>
      </div>
    );
  };
});

jest.mock("@/components/reservation/LabTokenInfo", () => {
  return function MockLabTokenInfo({ labPrice, durationMinutes, className }) {
    return (
      <div data-testid="lab-token-info" className={className}>
        <span data-testid="token-price">{labPrice}</span>
        <span data-testid="token-duration">{durationMinutes}</span>
      </div>
    );
  };
});

jest.mock("@/utils/booking/bookingStatus", () => ({
  isCancelledBooking: jest.fn(),
}));

describe("BookingCalendarSection", () => {
  const mockLab = {
    id: "lab-123",
    name: "Test Lab",
    price: "100",
    timeSlots: [15, 30, 45, 60],
  };

  const mockDate = new Date("2025-11-01T10:00:00Z");
  const mockMinDate = new Date("2025-11-01T00:00:00Z");
  const mockMaxDate = new Date("2025-12-31T23:59:59Z");

  const mockBookings = [
    {
      reservationKey: "booking-1",
      status: "confirmed",
      startTime: "10:00",
      endTime: "11:00",
    },
    {
      reservationKey: "booking-2",
      status: "completed",
      startTime: "14:00",
      endTime: "15:00",
    },
    {
      reservationKey: "booking-3",
      status: "cancelled",
      startTime: "16:00",
      endTime: "17:00",
    },
  ];

  const mockAvailableTimes = [
    { value: "09:00", label: "09:00 AM", disabled: false, isReserved: false },
    { value: "10:00", label: "10:00 AM", disabled: true, isReserved: true },
    { value: "11:00", label: "11:00 AM", disabled: false, isReserved: false },
  ];

  const defaultProps = {
    lab: mockLab,
    date: mockDate,
    onDateChange: jest.fn(),
    bookings: mockBookings,
    duration: 30,
    onDurationChange: jest.fn(),
    selectedTime: "09:00",
    onTimeChange: jest.fn(),
    availableTimes: mockAvailableTimes,
    minDate: mockMinDate,
    maxDate: mockMaxDate,
    forceRefresh: 0,
    isSSO: false,
    formatPrice: jest.fn((price) => price),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    isCancelledBooking.mockImplementation(
      (booking) => booking.status === "cancelled"
    );
  });

  describe("Null Safety", () => {
    test("returns null when lab is not provided", () => {
      const { container } = render(
        <BookingCalendarSection {...defaultProps} lab={null} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe("Booking Filtering", () => {
    test("filters out cancelled bookings from calendar display", () => {
      render(<BookingCalendarSection {...defaultProps} />);

      expect(isCancelledBooking).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId("calendar-bookings")).toHaveTextContent("2");
    });

    test("handles empty or null bookings array", () => {
      render(<BookingCalendarSection {...defaultProps} bookings={null} />);

      expect(screen.getByTestId("calendar-bookings")).toHaveTextContent("0");
    });
  });

  describe("Calendar Component", () => {
    test("renders calendar with correct date and display mode", () => {
      render(<BookingCalendarSection {...defaultProps} />);

      expect(screen.getByTestId("calendar-component")).toBeInTheDocument();
      expect(screen.getByTestId("calendar-date")).toHaveTextContent(
        mockDate.toISOString()
      );
      expect(screen.getByTestId("calendar-mode")).toHaveTextContent(
        "lab-reservation"
      );
    });

    test("triggers onDateChange callback", () => {
      render(<BookingCalendarSection {...defaultProps} />);

      fireEvent.click(screen.getByText("Change Date"));

      expect(defaultProps.onDateChange).toHaveBeenCalledWith(
        new Date("2025-12-25")
      );
    });
  });

  describe("Duration Selection", () => {
    test("renders duration dropdown with lab time slots", () => {
      render(<BookingCalendarSection {...defaultProps} />);

      expect(screen.getByLabelText("Duration:")).toHaveValue("30");
      expect(screen.getByText("15 minutes")).toBeInTheDocument();
      expect(screen.getByText("60 minutes")).toBeInTheDocument();
    });

    test("triggers onDurationChange callback", () => {
      render(<BookingCalendarSection {...defaultProps} />);

      fireEvent.change(screen.getByLabelText("Duration:"), {
        target: { value: "60" },
      });

      expect(defaultProps.onDurationChange).toHaveBeenCalledWith(60);
    });

    test("uses default time slots when not provided", () => {
      const labWithoutSlots = { ...mockLab, timeSlots: undefined };
      render(
        <BookingCalendarSection {...defaultProps} lab={labWithoutSlots} />
      );

      expect(screen.getByText("15 minutes")).toBeInTheDocument();
      expect(screen.getByText("30 minutes")).toBeInTheDocument();
    });
  });

  describe("Time Selection", () => {
    test("renders time dropdown with available times", () => {
      render(<BookingCalendarSection {...defaultProps} />);

      expect(screen.getByLabelText("Starting time:")).toHaveValue("09:00");
      expect(screen.getByText("09:00 AM")).toBeInTheDocument();
    });

    test("triggers onTimeChange callback", () => {
      render(<BookingCalendarSection {...defaultProps} />);

      fireEvent.change(screen.getByLabelText("Starting time:"), {
        target: { value: "11:00" },
      });

      expect(defaultProps.onTimeChange).toHaveBeenCalledWith("11:00");
    });

    test("disables time select when no available slots", () => {
      const allDisabledTimes = [
        { value: "09:00", label: "09:00 AM", disabled: true, isReserved: true },
      ];

      render(
        <BookingCalendarSection
          {...defaultProps}
          availableTimes={allDisabledTimes}
        />
      );

      expect(screen.getByLabelText("Starting time:")).toBeDisabled();
    });

    test("disables individual reserved time options", () => {
      render(<BookingCalendarSection {...defaultProps} />);

      const timeSelect = screen.getByLabelText("Starting time:");
      const options = Array.from(timeSelect.querySelectorAll("option"));
      const reservedOption = options.find((opt) => opt.value === "10:00");

      expect(reservedOption).toBeDisabled();
    });
  });

  describe("SSO Conditional Rendering", () => {
    test("shows payment info for wallet users", () => {
      render(<BookingCalendarSection {...defaultProps} isSSO={false} />);

      expect(screen.getByTestId("lab-token-info")).toBeInTheDocument();
      expect(screen.getByText(/\$LAB \/ hour/)).toBeInTheDocument();
    });

    test("hides payment info for SSO users", () => {
      render(<BookingCalendarSection {...defaultProps} isSSO={true} />);

      expect(screen.queryByTestId("lab-token-info")).not.toBeInTheDocument();
    });

    test("passes correct props to LabTokenInfo", () => {
      render(
        <BookingCalendarSection {...defaultProps} isSSO={false} duration={45} />
      );

      expect(screen.getByTestId("token-price")).toHaveTextContent("100");
      expect(screen.getByTestId("token-duration")).toHaveTextContent("45");
    });
  });

  describe("Calendar Key Generation", () => {
    test("regenerates key when booking statuses change", () => {
      const { rerender } = render(<BookingCalendarSection {...defaultProps} />);

      const updatedBookings = [
        { ...mockBookings[0], status: "completed" },
        mockBookings[1],
      ];
      rerender(
        <BookingCalendarSection {...defaultProps} bookings={updatedBookings} />
      );

      expect(screen.getByTestId("calendar-component")).toBeInTheDocument();
    });

    test("regenerates key when forceRefresh changes", () => {
      const { rerender } = render(
        <BookingCalendarSection {...defaultProps} forceRefresh={0} />
      );

      rerender(<BookingCalendarSection {...defaultProps} forceRefresh={1} />);

      expect(screen.getByTestId("calendar-component")).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    test("handles empty available times array", () => {
      render(<BookingCalendarSection {...defaultProps} availableTimes={[]} />);

      expect(screen.getByLabelText("Starting time:")).toBeDisabled();
    });

    test("handles formatPrice callback correctly", () => {
      const formatPrice = jest.fn((price) => `${price}.00`);
      render(
        <BookingCalendarSection
          {...defaultProps}
          isSSO={false}
          formatPrice={formatPrice}
        />
      );

      expect(formatPrice).toHaveBeenCalledWith("100");
      expect(screen.getByText("100.00 $LAB / hour")).toBeInTheDocument();
    });
  });
});
