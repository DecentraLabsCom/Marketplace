/**
 * Unit tests for LabBookingItem component.
 *
 * Core functionality covered:
 *  - Render: lab link, provider, date/time (and fallback "Time not available").
 *  - Status badge rendering via getBookingStatusDisplay (icon + text).
 *  - Cancel flows: shows correct label for statuses (pending/confirmed), numeric/string status handling,
 *    and requires explicit confirmation before calling onCancel.
 *  - Credit policy: cancellation is the only user action; no cash-refund action is exposed.
 *  - Error banner: displays when hasCancellationError, clear button calls onClearError(reservationKey).
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
      '0': { text: 'Pending', icon: '', className: 'bg-yellow-200' },
      '1': { text: 'Confirmed', icon: '✓', className: 'bg-green-200' },
      '5': { text: 'Canceled', icon: '✗', className: 'bg-red-200' }
    };
    return statusMap[booking.status] || { text: 'Unknown', icon: '', className: 'bg-gray-200' };
  }),
  isCancelledBooking: (booking) => booking.status === '4' || booking.status === 4,
  isPendingBooking: (booking) => booking.status === '0' || booking.status === 0,
  isConfirmedBooking: (booking) => booking.status === '1' || booking.status === 1
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

  test('requires confirmation before cancelling a confirmed booking', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    const booking = createBooking({
      status: '1',
      price: '10000000',
      start: 1893456000,
      cancellationPreview: {
        status: '1',
        cancellable: true,
        price: '10000000',
        totalFee: '1000000',
        providerFee: '600000',
        refundAmount: '9000000',
        cancellationCutoff: '1893456000',
        spendingPeriodStart: '1890000000',
        spendingPeriodEnd: '1900000000',
        sourceCreditExpiry: '1905000000',
        refundDestination: '0x3333333333333333333333333333333333333333',
        allocationCount: '1',
        policyVersion: '2',
        allocations: [],
      },
    });

    render(<LabBookingItem lab={mockLab} booking={booking} onCancel={onCancel} />);

    const cancelButton = screen.getByRole('button', { name: /Cancel Booking/i });
    await user.click(cancelButton);

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /cancel reservation/i })).toBeInTheDocument();
    expect(screen.getByText(/Reservation ID:/i)).toBeInTheDocument();
    expect(screen.getByText(/Credits to return:/i).parentElement).toHaveTextContent('0.9 credits');
    expect(screen.getByText(/Cancellation fee:/i).parentElement).toHaveTextContent('0.1 credits');
    expect(screen.getByText(/Cancellation cutoff:/i)).toBeInTheDocument();
    expect(screen.getByText(/Refund source expiry:/i)).toBeInTheDocument();
    expect(screen.getByText(/Allocation count:/i).parentElement).toHaveTextContent('1');
    expect(screen.getByText(/Policy:/i).parentElement).toHaveTextContent(/on-chain policy v2/i);
    expect(screen.getByText(/Preview source:/i).parentElement).toHaveTextContent(/on-chain policy v2/i);
    expect(screen.getByText(/Destination:/i).parentElement).toHaveTextContent(/0x3333/i);
    expect(screen.getByText(/Access will no longer be available/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancel reservation$/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith(booking);
  });

  test('keeps a confirmed cancellation fail-closed when the on-chain preview is missing', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    const booking = createBooking({
      status: '1',
      price: '10000000',
      start: 1893456000,
    });

    render(<LabBookingItem lab={mockLab} booking={booking} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: /Cancel Booking/i }));

    expect(screen.getByText(/legacy local diagnostic estimate/i)).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: /^cancel reservation$/i });
    expect(confirmButton).toBeDisabled();

    await user.click(confirmButton);
    expect(onCancel).not.toHaveBeenCalled();
  });

  test('keeps a confirmed cancellation fail-closed when reservation pricing is unavailable', async () => {
    const user = userEvent.setup();
    const booking = createBooking({ status: '1', price: null });

    render(<LabBookingItem lab={mockLab} booking={booking} onCancel={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: /Cancel Booking/i }));

    expect(screen.getByText(/on-chain cancellation preview is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cancel reservation$/i })).toBeDisabled();
  });

  test('keeps confirmation disabled when the contract says cancellation is not allowed', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    const booking = createBooking({
      status: '1',
      price: '10000000',
      cancellationPreview: {
        status: '1',
        cancellable: false,
        refundDestination: '0x3333333333333333333333333333333333333333',
        price: '10000000',
        totalFee: '1000000',
        providerFee: '600000',
        refundAmount: '9000000',
        cancellationCutoff: '1893456000',
        spendingPeriodStart: '1890000000',
        spendingPeriodEnd: '1900000000',
        sourceCreditExpiry: '1905000000',
        allocationCount: '1',
        policyVersion: '2',
      },
    });

    render(<LabBookingItem lab={mockLab} booking={booking} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: /Cancel Booking/i }));

    expect(screen.getAllByText(/on-chain policy v2/i)).toHaveLength(2);
    expect(screen.getByText(/on-chain policy does not allow this cancellation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cancel reservation$/i })).toBeDisabled();
  });

  test('keeps confirmation disabled and warns when the refund source has expired', async () => {
    const user = userEvent.setup();
    const booking = createBooking({
      status: '1',
      price: '10000000',
      cancellationPreview: {
        status: '1',
        cancellable: true,
        refundDestination: '0x3333333333333333333333333333333333333333',
        price: '10000000',
        totalFee: '1000000',
        providerFee: '600000',
        refundAmount: '9000000',
        cancellationCutoff: '4102444800',
        spendingPeriodStart: '1890000000',
        spendingPeriodEnd: '1900000000',
        sourceCreditExpiry: '1',
        allocationCount: '1',
        policyVersion: '2',
      },
    });

    render(<LabBookingItem lab={mockLab} booking={booking} onCancel={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: /Cancel Booking/i }));

    expect(screen.getByText(/source credits may be partially or fully expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cancel reservation$/i })).toBeDisabled();
  });

  test('shows "Cancel Request" button for pending booking', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    const booking = createBooking({ status: '0' });

    render(<LabBookingItem lab={mockLab} booking={booking} onCancel={onCancel} />);

    const cancelButton = screen.getByRole('button', { name: /Cancel Request/i });
    await user.click(cancelButton);

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByText(/Credits to return:/i).parentElement).toHaveTextContent('0 credits');
    await user.click(screen.getByRole('button', { name: /^cancel reservation$/i }));
    expect(onCancel).toHaveBeenCalledWith(booking);
  });

  test('keeps cancellation semantics explicit for a currently active confirmed booking', () => {
    const now = Math.floor(Date.now() / 1000);
    const booking = createBooking({
      status: '1',
      start: now - 120,
      end: now + 1800
    });

    render(
      <LabBookingItem
        lab={mockLab}
        booking={booking}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Cancel Booking/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Refund/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Eligible service credits return/i)).toBeInTheDocument();
    expect(screen.getByText('Access Window Open')).toBeInTheDocument();
  });

  test('does not expose the consumer cancel intent for an access-authorized booking', () => {
    const now = Math.floor(Date.now() / 1000);
    const booking = createBooking({
      status: 2,
      start: now - 120,
      end: now + 1800,
    });

    render(
      <LabBookingItem
        lab={mockLab}
        booking={booking}
        onCancel={jest.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Cancel/i })).not.toBeInTheDocument();
  });

  test('disables cancel button and shows spinner while cancellation is in progress', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    const booking = createBooking({ status: '1' });

    render(
      <LabBookingItem
        lab={mockLab}
        booking={booking}
        onCancel={onCancel}
        cancelState={{ isBusy: true, label: 'Processing...' }}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /Processing.../i });
    expect(cancelButton).toBeDisabled();
    expect(cancelButton.querySelector('.spinner')).toBeInTheDocument();

    await user.click(cancelButton);
    expect(onCancel).not.toHaveBeenCalled();
  });

  test('hides cancel button for canceled booking (status 5)', () => {
    render(
      <LabBookingItem
        lab={mockLab}
        booking={createBooking({ status: '5' })}
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

  test('does not expose a cash-refund action', () => {
    render(<LabBookingItem lab={mockLab} booking={createBooking()} onCancel={jest.fn()} onRefund={jest.fn()} />);

    expect(screen.queryByRole('button', { name: /refund/i })).not.toBeInTheDocument();
    expect(screen.getByText('Eligible service credits return to the institutional account.')).toBeInTheDocument();
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

});
