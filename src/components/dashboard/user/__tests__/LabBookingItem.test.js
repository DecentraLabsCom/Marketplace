/**
 * Unit tests for LabBookingItem component.
 *
 * Core functionality covered:
 *  - Render: lab link, provider, date/time (and fallback "Time not available").
 *  - Status badge rendering via getBookingStatusDisplay (icon + text).
 *  - Cancel flows: shows correct label for statuses (pending/confirmed), numeric/string status handling,
 *    and calls onCancel with the booking object.
 *  - Refund flows: shows/hides Apply for Refund and calls onRefund(labId, booking).
 *  - Error banner: displays when hasCancellationError, clear button calls onClearError(reservationKey).
 *  - Modal behavior: ConfirmModal open/close, onConfirmRefund handling and graceful null handling.
 *  - Edge cases: empty lab, missing date, missing handlers.
 *
 */


import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import LabBookingItem from '../LabBookingItem';

// ============================================================================
// MOCKS - Isolate component dependencies
// ============================================================================

jest.mock('next/link', () => ({ children, href }) => <a href={href}>{children}</a>);

jest.mock('@/components/ui/ConfirmModal', () => ({ isOpen, onClose, onContinue }) =>
  isOpen ? (
    <div data-testid="confirm-modal">
      <button onClick={onClose}>Close</button>
      <button onClick={onContinue}>Continue</button>
    </div>
  ) : null
);

jest.mock('@/utils/booking/bookingStatus', () => ({
  getBookingStatusDisplay: jest.fn((booking) => {
    const statusMap = {
      '0': { text: 'Pending', icon: '⏳', className: 'bg-yellow-200' },
      '1': { text: 'Confirmed', icon: '✓', className: 'bg-green-200' },
      '4': { text: 'Canceled', icon: '✗', className: 'bg-red-200' }
    };
    return statusMap[booking.status] || { text: 'Unknown', icon: '?', className: 'bg-gray-200' };
  })
}));

jest.mock('@/utils/dev/logger', () => ({
  log: jest.fn(),
  error: jest.fn()
}));

// ============================================================================
// TEST DATA - Reusable fixtures
// ============================================================================

const mockLab = {
  id: 1,
  name: 'Biology Lab 101',
  provider: 'University Science Center'
};

const createBooking = (overrides = {}) => ({
  id: 100,
  status: '1',
  date: '2025-01-15',
  reservationKey: 'RES-12345',
  hasEnded: false,
  hasCancellationError: false,
  ...overrides
});

// ============================================================================
// TEST SUITE
// ============================================================================

describe('LabBookingItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Rendering tests
  // --------------------------------------------------------------------------

  test('renders lab information with link and provider', () => {
    render(
      <LabBookingItem
        lab={mockLab}
        booking={createBooking()}
        startTime="09:00"
        endTime="11:00"
      />
    );

    const link = screen.getByRole('link', { name: mockLab.name });
    expect(link).toHaveAttribute('href', `/lab/${mockLab.id}`);
    expect(screen.getByText(/Provider: University Science Center/i)).toBeInTheDocument();
    expect(screen.getByText(/2025-01-15/)).toBeInTheDocument();
    expect(screen.getByText(/09:00 - 11:00/)).toBeInTheDocument();
  });

  test('renders "Time not available" when time props are missing', () => {
    render(<LabBookingItem lab={mockLab} booking={createBooking()} />);

    expect(screen.getByText(/Time not available/i)).toBeInTheDocument();
  });

  test('renders status badge correctly', () => {
    render(<LabBookingItem lab={mockLab} booking={createBooking()} />);

    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  test('renders with empty lab or missing date gracefully', () => {
    render(
      <LabBookingItem
        lab={{}}
        booking={createBooking({ date: undefined })}
      />
    );

    // Should not crash and still render status
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // Cancel button behavior
  // --------------------------------------------------------------------------

  test('shows "Cancel Booking" button for confirmed booking and calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    const booking = createBooking({ status: '1' });

    render(<LabBookingItem lab={mockLab} booking={booking} onCancel={onCancel} />);

    const cancelButton = screen.getByRole('button', { name: /Cancel Booking/i });
    await user.click(cancelButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith(booking);
  });

  test('shows "Cancel Request" button for pending booking', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    const booking = createBooking({ status: '0' });

    render(<LabBookingItem lab={mockLab} booking={booking} onCancel={onCancel} />);

    const cancelButton = screen.getByRole('button', { name: /Cancel Request/i });
    await user.click(cancelButton);

    expect(onCancel).toHaveBeenCalledWith(booking);
  });

  test('hides cancel button for canceled booking (status 4)', () => {
    render(
      <LabBookingItem
        lab={mockLab}
        booking={createBooking({ status: '4' })}
        onCancel={jest.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Cancel/i })).not.toBeInTheDocument();
  });

  test('hides cancel button when onCancel prop is not provided', () => {
    render(<LabBookingItem lab={mockLab} booking={createBooking()} />);

    expect(screen.queryByRole('button', { name: /Cancel/i })).not.toBeInTheDocument();
  });

  test('handles numeric status values correctly', () => {
    render(
      <LabBookingItem
        lab={mockLab}
        booking={createBooking({ status: 1 })}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Cancel Booking/i })).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // Refund button behavior
  // --------------------------------------------------------------------------

  test('shows refund button and calls onRefund with correct params', async () => {
    const user = userEvent.setup();
    const onRefund = jest.fn();
    const booking = createBooking();

    render(<LabBookingItem lab={mockLab} booking={booking} onRefund={onRefund} />);

    const refundButton = screen.getByRole('button', { name: /Apply for Refund/i });
    await user.click(refundButton);

    expect(onRefund).toHaveBeenCalledTimes(1);
    expect(onRefund).toHaveBeenCalledWith(mockLab.id, booking);
  });

  test('hides refund button for canceled booking', () => {
    render(
      <LabBookingItem
        lab={mockLab}
        booking={createBooking({ status: '4' })}
        onRefund={jest.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Apply for Refund/i })).not.toBeInTheDocument();
  });

  test('hides refund button when reservationKey is missing', () => {
    render(
      <LabBookingItem
        lab={mockLab}
        booking={createBooking({ reservationKey: null })}
        onRefund={jest.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Apply for Refund/i })).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  test('displays error banner and applies error styling when hasCancellationError is true', () => {
    const { container } = render(
      <LabBookingItem
        lab={mockLab}
        booking={createBooking({ hasCancellationError: true })}
      />
    );

    expect(screen.getByText(/⚠️ Cancellation failed/i)).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('border-red-500', 'bg-red-50');
  });

  test('clear error button calls onClearError with reservationKey', async () => {
    const user = userEvent.setup();
    const onClearError = jest.fn();
    const booking = createBooking({ hasCancellationError: true });

    render(
      <LabBookingItem
        lab={mockLab}
        booking={booking}
        onClearError={onClearError}
      />
    );

    const clearButton = screen.getByTitle('Clear error');
    await user.click(clearButton);

    expect(onClearError).toHaveBeenCalledTimes(1);
    expect(onClearError).toHaveBeenCalledWith(booking.reservationKey);
  });

  test('hides clear error button when onClearError is not provided', () => {
    render(
      <LabBookingItem
        lab={mockLab}
        booking={createBooking({ hasCancellationError: true })}
      />
    );

    expect(screen.queryByTitle('Clear error')).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // Modal behavior
  // --------------------------------------------------------------------------

  test('renders modal when isModalOpen is true and handles user actions', async () => {
    const user = userEvent.setup();
    const onConfirmRefund = jest.fn();
    const closeModal = jest.fn();

    render(
      <LabBookingItem
        lab={mockLab}
        booking={createBooking()}
        isModalOpen={true}
        closeModal={closeModal}
        onConfirmRefund={onConfirmRefund}
      />
    );

    const modal = screen.getByTestId('confirm-modal');
    expect(modal).toBeInTheDocument();

    // Test Continue button
    await user.click(screen.getByRole('button', { name: /Continue/i }));
    expect(onConfirmRefund).toHaveBeenCalledTimes(1);

    // Test Close button
    await user.click(screen.getByRole('button', { name: /Close/i }));
    expect(closeModal).toHaveBeenCalledTimes(1);
  });

  test('does not render modal when isModalOpen is false', () => {
    render(
      <LabBookingItem
        lab={mockLab}
        booking={createBooking()}
        isModalOpen={false}
      />
    );

    expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();
  });

  test('handles missing onConfirmRefund gracefully without crashing', async () => {
    const user = userEvent.setup();

    render(
      <LabBookingItem
        lab={mockLab}
        booking={createBooking()}
        isModalOpen={true}
        closeModal={jest.fn()}
        onConfirmRefund={null}
      />
    );

    // Should not throw error when Continue is clicked
    await expect(async () => {
      await user.click(screen.getByRole('button', { name: /Continue/i }));
    }).not.toThrow();
  });
});