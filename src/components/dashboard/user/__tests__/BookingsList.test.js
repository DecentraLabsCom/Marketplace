/**
 * Unit tests for BookingsList component
 *
 * Tested behaviors:
 * - Rendering: displays correct title and empty states for upcoming/past
 * - Loading state: shows skeleton while loading bookings
 * - Booking filtering: separates upcoming from past bookings based on time
 * - Cancelled bookings: excludes cancelled bookings from all lists
 * - Callbacks: triggers onCancel for upcoming, onRefund for past
 * - Edge cases: handles missing dates, missing lab details
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';


// Test Data


const now = new Date('2024-01-15T12:00:00Z');
const future = Math.floor(new Date('2024-01-20T14:00:00Z').getTime() / 1000);
const past = Math.floor(new Date('2024-01-10T10:00:00Z').getTime() / 1000);

const bookings = [
    {
        id: '1',
        labId: '101',
        reservationKey: 'k1',
        start: future,
        end: future + 3600,
        status: '1',
        labDetails: { id: '101', name: 'Future Lab' }
    },
    {
        id: '2',
        labId: '102',
        reservationKey: 'k2',
        start: past,
        end: past + 3600,
        status: '1',
        labDetails: { id: '102', name: 'Past Lab' }
    },
    {
        id: '3',
        labId: '103',
        reservationKey: 'k3',
        start: future,
        end: future + 3600,
        status: '5',
        labDetails: { id: '103', name: 'Cancelled' }
    }
];


// Mocks


const mockCancel = jest.fn();
const mockRefund = jest.fn();
const mockClose = jest.fn();

jest.mock('@/utils/booking/bookingStatus', () => ({
    isCancelledBooking: (b) => b.status === '5' || b.status === 5,
    isPendingBooking: (b) => b.status === '0' || b.status === 0
}));

jest.mock('@/components/skeletons', () => ({
    DashboardSectionSkeleton: () => <div data-testid="skeleton">Loading...</div>
}));

jest.mock('@/components/dashboard/user/LabBookingItem', () => ({
    __esModule: true,
    default: ({ lab, booking, onCancel, onRefund }) => (
        <li data-testid="item">
            <span>{lab.name}</span>
            {onCancel && <button onClick={() => onCancel(booking)}>Cancel</button>}
            {onRefund && <button onClick={() => onRefund(lab.id, booking)}>Refund</button>}
        </li>
    )
}));

import BookingsList from '@/components/dashboard/user/BookingsList';

// Test Helper

const renderList = (props = {}) =>
    render(
        <BookingsList
            bookings={bookings}
            currentTime={now}
            isLoading={false}
            type="upcoming"
            closeModal={mockClose}
            {...props}
        />
    );

describe('BookingsList - Unit Tests', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('Rendering', () => {
        test('displays upcoming title and empty message', () => {
            renderList({ bookings: [], type: 'upcoming' });

            expect(screen.getByText('Upcoming Bookings')).toBeInTheDocument();
            expect(screen.getByText('No upcoming bookings found.')).toBeInTheDocument();
        });

        test('displays past title and empty message', () => {
            renderList({ bookings: [], type: 'past' });

            expect(screen.getByText('Past bookings')).toBeInTheDocument();
            expect(screen.getByText('No past bookings found.')).toBeInTheDocument();
        });
    });

    describe('Loading State', () => {
        test('displays skeleton while loading', () => {
            renderList({ isLoading: true });

            expect(screen.getByTestId('skeleton')).toBeInTheDocument();
        });

        test('shows loading when currentTime not ready', () => {
            renderList({ currentTime: null });

            expect(screen.getByText('Loading...')).toBeInTheDocument();
        });
    });

    describe('Booking Filtering', () => {
        test('shows only upcoming bookings', () => {
            renderList({ type: 'upcoming' });

            expect(screen.getByText('Future Lab')).toBeInTheDocument();
            expect(screen.queryByText('Past Lab')).not.toBeInTheDocument();
        });

        test('shows only past bookings', () => {
            renderList({ type: 'past' });

            expect(screen.getByText('Past Lab')).toBeInTheDocument();
            expect(screen.queryByText('Future Lab')).not.toBeInTheDocument();
        });

        test('excludes cancelled bookings', () => {
            renderList({ type: 'upcoming' });

            expect(screen.queryByText('Cancelled')).not.toBeInTheDocument();
        });

        test('excludes pending from past list', () => {
            const pending = {
                id: '4',
                labId: '104',
                reservationKey: 'k4',
                start: past,
                end: past + 3600,
                status: '0',
                labDetails: { id: '104', name: 'Pending' }
            };

            renderList({ bookings: [...bookings, pending], type: 'past' });

            expect(screen.queryByText('Pending')).not.toBeInTheDocument();
        });
    });

    describe('Booking Display', () => {
        test('renders booking items', () => {
            renderList({ bookings: [bookings[0]] });

            expect(screen.getByText('Future Lab')).toBeInTheDocument();
            expect(screen.getByTestId('item')).toBeInTheDocument();
        });

        test('shows cancel button for upcoming', () => {
            renderList({ type: 'upcoming', onCancel: mockCancel });

            expect(screen.getByText('Cancel')).toBeInTheDocument();
        });

        test('shows refund button for past', () => {
            renderList({ bookings: [bookings[1]], type: 'past', onRefund: mockRefund });

            expect(screen.getByText('Refund')).toBeInTheDocument();
        });
    });

    describe('Callbacks', () => {
        test('calls onCancel when cancel clicked', async () => {
            renderList({ bookings: [bookings[0]], onCancel: mockCancel });

            await userEvent.click(screen.getByText('Cancel'));

            expect(mockCancel).toHaveBeenCalledWith(
                expect.objectContaining({ reservationKey: 'k1' })
            );
        });

        test('calls onRefund when refund clicked', async () => {
            renderList({ bookings: [bookings[1]], type: 'past', onRefund: mockRefund });

            await userEvent.click(screen.getByText('Refund'));

            expect(mockRefund).toHaveBeenCalledWith(
                '102',
                expect.objectContaining({ reservationKey: 'k2' })
            );
        });
    });

    describe('Edge Cases', () => {
        test('handles missing start time', () => {
            const invalid = {
                id: '5',
                labId: '105',
                reservationKey: 'k5',
                end: future,
                status: '1',
                labDetails: { id: '105', name: 'Invalid' }
            };

            renderList({ bookings: [invalid] });

            expect(screen.queryByText('Invalid')).not.toBeInTheDocument();
            expect(screen.getByText('No upcoming bookings found.')).toBeInTheDocument();
        });

        test('handles missing lab details', () => {
            const noLab = {
                id: '6',
                labId: '106',
                reservationKey: 'k6',
                start: future,
                end: future + 3600,
                status: '1',
                labDetails: null
            };

            renderList({ bookings: [noLab] });

            expect(screen.getByText('Lab 106')).toBeInTheDocument();
        });

        test('handles empty bookings array', () => {
            renderList({ bookings: [] });

            expect(screen.getByText('No upcoming bookings found.')).toBeInTheDocument();
        });

        test('handles null currentTime', () => {
            renderList({ currentTime: null });

            expect(screen.getByText('Loading...')).toBeInTheDocument();
        });
    });
});
