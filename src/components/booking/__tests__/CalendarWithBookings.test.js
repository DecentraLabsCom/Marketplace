/**
 * Unit tests for CalendarWithBookings component
 *
 * Test Behaviors:
 * - Renders DatePicker with correct props
 * - Calls useBookingFilter hook with bookingInfo and displayMode
 * - Makes calendar read-only in dashboard modes (user/provider)
 * - Allows date selection in non-dashboard modes
 * - Handles undefined/null bookingInfo gracefully (defaults to empty array)
 * - Applies custom CSS classes
 * - Injects readonly styles when in dashboard mode
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalendarWithBookings from "../CalendarWithBookings";
import { useBookingFilter } from "@/hooks/booking/useBookings";
import { renderDayContents } from "@/utils/booking/labBookingCalendar";

// Mock external dependencies
jest.mock("@/hooks/booking/useBookings", () => ({
  useBookingFilter: jest.fn(),
}));

jest.mock("@/utils/booking/labBookingCalendar", () => ({
  renderDayContents: jest.fn(),
}));

jest.mock("react-datepicker", () => {
  return function MockDatePicker(props) {
    const sampleDay = new Date("2024-06-02");
    const dayClassName = props.dayClassName ? props.dayClassName(sampleDay) : "";
    return (
      <div data-testid="mock-datepicker">
        <div data-testid="calendar-class">{props.calendarClassName}</div>
        <div data-testid="inline">{props.inline ? "true" : "false"}</div>
        <div data-testid="day-class">{dayClassName}</div>
        {props.selected && (
          <div data-testid="selected-date">{props.selected.toISOString()}</div>
        )}
        {props.minDate && (
          <div data-testid="min-date">{props.minDate.toISOString()}</div>
        )}
        {props.maxDate && (
          <div data-testid="max-date">{props.maxDate.toISOString()}</div>
        )}
        <button
          data-testid="trigger-change"
          onClick={() => props.onChange(new Date("2024-06-15"))}
        >
          Change Date
        </button>
        <button
          data-testid="trigger-select"
          onClick={() => props.onSelect?.(new Date("2024-06-15"))}
        >
          Select Date
        </button>
      </div>
    );
  };
});

describe("CalendarWithBookings - unit tests", () => {
  const mockOnDateChange = jest.fn();
  const mockSelectedDate = new Date("2024-06-01");
  const mockBookings = [
    {
      id: "1",
      status: "confirmed",
      start: "2024-06-10T10:00:00Z",
      end: "2024-06-10T12:00:00Z",
    },
    {
      id: "2",
      status: "pending",
      start: "2024-06-15T14:00:00Z",
      end: "2024-06-15T16:00:00Z",
    },
  ];

  const mockFilteredBookings = [mockBookings[0]];
  const mockDayClassName = jest.fn(() => "custom-day-class");

  const defaultProps = {
    selectedDate: mockSelectedDate,
    onDateChange: mockOnDateChange,
    bookingInfo: mockBookings,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useBookingFilter.mockReturnValue({
      filteredBookings: mockFilteredBookings,
      dayClassName: mockDayClassName,
    });
    renderDayContents.mockReturnValue(<div>Day Content</div>);
  });

  describe("Rendering", () => {
    test("renders DatePicker component", () => {
      render(<CalendarWithBookings {...defaultProps} />);

      expect(screen.getByTestId("mock-datepicker")).toBeInTheDocument();
    });

    test("passes selected date to DatePicker", () => {
      render(<CalendarWithBookings {...defaultProps} />);

      expect(screen.getByTestId("selected-date")).toHaveTextContent(
        mockSelectedDate.toISOString()
      );
    });

    test("renders inline calendar by default", () => {
      render(<CalendarWithBookings {...defaultProps} />);

      expect(screen.getByTestId("inline")).toHaveTextContent("true");
    });

    test("applies custom calendar className", () => {
      render(
        <CalendarWithBookings
          {...defaultProps}
          calendarClassName="my-custom-calendar"
        />
      );

      expect(screen.getByTestId("calendar-class")).toHaveTextContent(
        "my-custom-calendar"
      );
    });
  });

  describe("Hook Integration", () => {
    test("calls useBookingFilter with correct arguments", () => {
      render(
        <CalendarWithBookings
          {...defaultProps}
          displayMode="lab-reservation"
          highlightClassName="custom-highlight"
        />
      );

      expect(useBookingFilter).toHaveBeenCalledWith(
        mockBookings,
        "lab-reservation",
        "custom-highlight"
      );
    });

    test("calls useBookingFilter with default highlightClassName", () => {
      render(<CalendarWithBookings {...defaultProps} />);

      expect(useBookingFilter).toHaveBeenCalledWith(
        mockBookings,
        "default",
        "bg-[#9fc6f5] text-white"
      );
    });
  });

  describe("Date Selection Behavior", () => {
    // Interactive mode: allows date selection
    test("allows date selection in default mode", async () => {
      const user = userEvent.setup();
      render(<CalendarWithBookings {...defaultProps} />);

      const changeButton = screen.getByTestId("trigger-change");
      await user.click(changeButton);

      expect(mockOnDateChange).toHaveBeenCalledWith(new Date("2024-06-15"));
    });

    test("allows date selection in lab-reservation mode", async () => {
      const user = userEvent.setup();
      render(
        <CalendarWithBookings {...defaultProps} displayMode="lab-reservation" />
      );

      const changeButton = screen.getByTestId("trigger-change");
      await user.click(changeButton);

      expect(mockOnDateChange).toHaveBeenCalledWith(new Date("2024-06-15"));
    });

    // Read-only mode: prevents date selection in dashboard views
    test("disables date selection in user-dashboard mode", async () => {
      const user = userEvent.setup();
      render(
        <CalendarWithBookings {...defaultProps} displayMode="user-dashboard" />
      );

      const changeButton = screen.getByTestId("trigger-change");
      await user.click(changeButton);

      expect(mockOnDateChange).not.toHaveBeenCalled();
    });

    test("disables date selection in provider-dashboard mode", async () => {
      const user = userEvent.setup();
      render(
        <CalendarWithBookings
          {...defaultProps}
          displayMode="provider-dashboard"
        />
      );

      const changeButton = screen.getByTestId("trigger-change");
      await user.click(changeButton);

      expect(mockOnDateChange).not.toHaveBeenCalled();
    });

    test("passes minDate and maxDate to DatePicker", () => {
      const minDate = new Date("2024-05-01");
      const maxDate = new Date("2024-07-01");

      render(
        <CalendarWithBookings
          {...defaultProps}
          minDate={minDate}
          maxDate={maxDate}
        />
      );

      expect(screen.getByTestId("min-date")).toHaveTextContent(
        minDate.toISOString()
      );
      expect(screen.getByTestId("max-date")).toHaveTextContent(
        maxDate.toISOString()
      );
    });

    test("disables onSelect in dashboard modes", async () => {
      const user = userEvent.setup();
      render(
        <CalendarWithBookings {...defaultProps} displayMode="user-dashboard" />
      );

      const selectButton = screen.getByTestId("trigger-select");
      await user.click(selectButton);

      expect(mockOnDateChange).not.toHaveBeenCalled();
    });
  });

  describe("Read-Only Styling", () => {
    test("injects readonly styles for user-dashboard mode", () => {
      const { container } = render(
        <CalendarWithBookings {...defaultProps} displayMode="user-dashboard" />
      );

      const styleTag = container.querySelector("style");
      expect(styleTag).toBeInTheDocument();
      expect(styleTag.innerHTML).toContain("readonly-calendar");
      expect(styleTag.innerHTML).toContain("cursor: default");
    });

    test("injects readonly styles for provider-dashboard mode", () => {
      const { container } = render(
        <CalendarWithBookings
          {...defaultProps}
          displayMode="provider-dashboard"
        />
      );

      const styleTag = container.querySelector("style");
      expect(styleTag).toBeInTheDocument();
    });

    test("does not inject readonly styles in interactive modes", () => {
      const { container } = render(<CalendarWithBookings {...defaultProps} />);

      const styleTag = container.querySelector("style");
      expect(styleTag).not.toBeInTheDocument();
    });

    test("adds readonly-calendar class in dashboard modes", () => {
      render(
        <CalendarWithBookings {...defaultProps} displayMode="user-dashboard" />
      );

      expect(screen.getByTestId("calendar-class")).toHaveTextContent(
        "readonly-calendar"
      );
    });
  });

  describe("Date Range Props", () => {
    test("passes minDate to DatePicker", () => {
      const minDate = new Date("2024-05-01");
      render(<CalendarWithBookings {...defaultProps} minDate={minDate} />);

      expect(screen.getByTestId("min-date")).toHaveTextContent(
        minDate.toISOString()
      );
    });

    test("passes maxDate to DatePicker", () => {
      const maxDate = new Date("2024-12-31");
      render(<CalendarWithBookings {...defaultProps} maxDate={maxDate} />);

      expect(screen.getByTestId("max-date")).toHaveTextContent(
        maxDate.toISOString()
      );
    });

    test("passes filterDate callback to DatePicker", () => {
      const mockFilterDate = jest.fn();
      render(
        <CalendarWithBookings {...defaultProps} filterDate={mockFilterDate} />
      );

      // filterDate is passed as prop, we verify the component renders without errors
      expect(screen.getByTestId("mock-datepicker")).toBeInTheDocument();
    });
  });

  describe("BookingInfo Handling", () => {
    // Safe array handling: prevents crashes when bookingInfo is invalid
    test("handles undefined bookingInfo gracefully", () => {
      render(
        <CalendarWithBookings {...defaultProps} bookingInfo={undefined} />
      );

      expect(useBookingFilter).toHaveBeenCalledWith(
        [],
        "default",
        "bg-[#9fc6f5] text-white"
      );
    });

    test("handles null bookingInfo gracefully", () => {
      render(<CalendarWithBookings {...defaultProps} bookingInfo={null} />);

      expect(useBookingFilter).toHaveBeenCalledWith(
        [],
        "default",
        "bg-[#9fc6f5] text-white"
      );
    });

    test("handles empty bookingInfo array", () => {
      render(<CalendarWithBookings {...defaultProps} bookingInfo={[]} />);

      expect(useBookingFilter).toHaveBeenCalledWith(
        [],
        "default",
        "bg-[#9fc6f5] text-white"
      );
    });

    test("passes valid bookingInfo array to hook", () => {
      render(<CalendarWithBookings {...defaultProps} />);

      expect(useBookingFilter).toHaveBeenCalledWith(
        mockBookings,
        "default",
        "bg-[#9fc6f5] text-white"
      );
    });
  });

  describe("Display Modes", () => {
    test("handles default display mode", () => {
      render(<CalendarWithBookings {...defaultProps} displayMode="default" />);

      expect(useBookingFilter).toHaveBeenCalledWith(
        mockBookings,
        "default",
        expect.any(String)
      );
    });

    test("handles lab-reservation display mode", () => {
      render(
        <CalendarWithBookings {...defaultProps} displayMode="lab-reservation" />
      );

      expect(useBookingFilter).toHaveBeenCalledWith(
        mockBookings,
        "lab-reservation",
        expect.any(String)
      );
    });

    test("handles user-dashboard display mode", () => {
      render(
        <CalendarWithBookings {...defaultProps} displayMode="user-dashboard" />
      );

      expect(useBookingFilter).toHaveBeenCalledWith(
        mockBookings,
        "user-dashboard",
        expect.any(String)
      );
    });

    test("handles provider-dashboard display mode", () => {
      render(
        <CalendarWithBookings
          {...defaultProps}
          displayMode="provider-dashboard"
        />
      );

      expect(useBookingFilter).toHaveBeenCalledWith(
        mockBookings,
        "provider-dashboard",
        expect.any(String)
      );
    });
  });

  describe("Edge Cases", () => {
    test("handles null selectedDate", () => {
      render(<CalendarWithBookings {...defaultProps} selectedDate={null} />);

      expect(screen.queryByTestId("selected-date")).not.toBeInTheDocument();
    });

    test("handles inline=false", () => {
      render(<CalendarWithBookings {...defaultProps} inline={false} />);

      expect(screen.getByTestId("inline")).toHaveTextContent("false");
    });

    test("combines custom className with readonly class", () => {
      render(
        <CalendarWithBookings
          {...defaultProps}
          displayMode="user-dashboard"
          calendarClassName="my-calendar"
        />
      );

      const calendarClass = screen.getByTestId("calendar-class");
      expect(calendarClass).toHaveTextContent("my-calendar");
      expect(calendarClass).toHaveTextContent("readonly-calendar");
    });

    test("passes dayClassName from hook to DatePicker", () => {
      render(<CalendarWithBookings {...defaultProps} />);

      // dayClassName is passed as a prop, we verify the component renders correctly
      expect(useBookingFilter).toHaveBeenCalled();
      expect(screen.getByTestId("mock-datepicker")).toBeInTheDocument();
    });

    test("appends extraDayClassName to base dayClassName", () => {
      render(
        <CalendarWithBookings
          {...defaultProps}
          extraDayClassName={() => "extra-day-class"}
        />
      );

      expect(screen.getByTestId("day-class")).toHaveTextContent(
        "custom-day-class extra-day-class"
      );
    });
  });
});
