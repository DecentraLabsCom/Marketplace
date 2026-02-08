/**
 * Unit tests for UserDashboard component
 *
 * Tested behaviors:
 * - Loading states: skeleton UI while fetching bookings data
 * - Error handling: error screen and retry when bookings query fails
 * - Successful render: all dashboard sections visible with bookings data
 * - Booking cancellation: handles confirmed and pending bookings
 * - Edge cases: empty bookings, missing data, wallet validation
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Test Data 
const mockBookings = [
    {
        reservationKey: '1',
        labId: '101',
        status: '1',
        start: '1640000000',
        end: '1640003600',
        labDetails: { name: 'Biology Lab' }
    },
    {
        reservationKey: '2',
        labId: '102',
        status: '0',
        start: '1640010000',
        end: '1640013600',
        labDetails: { name: 'Chemistry Lab' }
    }
];

const mockUser = {
    address: '0x123',
    user: {
        name: 'Test User',
        email: 'test@example.com',
        userid: '0x123',
        affiliation: 'Test University'
    },
    isLoggedIn: true,
    isSSO: false,
    isConnected: true
};

// Mock state
let mockUserData = mockUser;
let mockBookingsData = {
    data: { bookings: mockBookings },
    isLoading: false,
    isError: false,
    error: null
};

// Mock functions
const mockCancelBooking = jest.fn();
const mockCancelReservation = jest.fn();
const mockAddTemporaryNotification = jest.fn();
const mockRegisterPendingCancellation = jest.fn();

// Context mocks
jest.mock('@/context/UserContext', () => ({
    useUser: () => mockUserData
}));

jest.mock('@/context/NotificationContext', () => ({
    useNotifications: () => ({
        addTemporaryNotification: mockAddTemporaryNotification
    })
}));

jest.mock('@/context/BookingEventContext', () => ({
    useOptionalBookingEventContext: () => ({
        registerPendingCancellation: mockRegisterPendingCancellation
    })
}));

// Data Hooks Mocks - Bookings data and mutations
jest.mock('@/hooks/booking/useBookings', () => ({
    useUserBookingsDashboard: () => mockBookingsData,
    useCancelBooking: () => ({ mutateAsync: mockCancelBooking }),
    useCancelReservationRequest: () => ({ mutateAsync: mockCancelReservation })
}));

// UI component mocks
jest.mock('@/components/ui', () => ({
    Container: ({ children }) => <div>{children}</div>,
    Stack: ({ children }) => <div>{children}</div>
}));

jest.mock('@/components/auth/AccessControl', () => ({
    __esModule: true,
    default: ({ children }) => <div>{children}</div>
}));

jest.mock('@/components/skeletons', () => ({
    DashboardSectionSkeleton: () => <div data-testid="skeleton">Loading...</div>
}));

jest.mock('@/components/dashboard/user/DashboardHeader', () => ({
    __esModule: true,
    default: ({ title }) => <h1>{title}</h1>
}));

jest.mock('@/components/dashboard/user/ActiveBookingSection', () => ({
    __esModule: true,
    default: () => <div data-testid="active-booking-section">Active</div>
}));

jest.mock('@/components/dashboard/user/BookingSummarySection', () => ({
    __esModule: true,
    default: () => <div data-testid="booking-summary-section">Summary</div>
}));

jest.mock('@/components/booking/CalendarWithBookings', () => ({
    __esModule: true,
    default: () => <div data-testid="calendar">Calendar</div>
}));

jest.mock('@/components/dashboard/user/BookingsList', () => ({
    __esModule: true,
    default: ({ type, bookings, onCancel }) => {
        const filtered = bookings?.filter((_, i) =>
            type === 'upcoming' ? i % 2 === 0 : i % 2 !== 0
        ) || [];

        return (
            <div data-testid={`bookings-list-${type}`}>
                {filtered.map((booking) => (
                    <div key={`${type}-${booking.reservationKey}`}>
                        <span>{booking.labDetails?.name || `Lab ${booking.labId}`}</span>
                        {type === 'upcoming' && onCancel && (
                            <button onClick={() => onCancel(booking)}>Cancel</button>
                        )}
                    </div>
                ))}
            </div>
        );
    }
}));

// BookingsList mock - Filters bookings by type to prevent duplicates
jest.mock('@/utils/dev/logger', () => ({
    __esModule: true,
    default: {
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }
}));

import UserDashboard from '@/components/dashboard/user/UserDashboardPage';

describe('UserDashboard - Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUserData = mockUser;
        mockBookingsData = {
            data: { bookings: mockBookings },
            isLoading: false,
            isError: false,
            error: null
        };
    });

    describe('Loading States', () => {
        test('displays skeleton while loading', () => {
            mockBookingsData.isLoading = true;
            render(<UserDashboard />);

            expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
        });
    });

    describe('Error Handling', () => {
        test('displays error screen when query fails', async () => {
            mockBookingsData = {
                data: null,
                isLoading: false,
                isError: true,
                error: { message: 'Network error' }
            };
            render(<UserDashboard />);

            expect(await screen.findByText('Error Loading Dashboard')).toBeInTheDocument();
            expect(screen.getByText(/Network error/i)).toBeInTheDocument();
        });

        test('shows retry button', async () => {
            mockBookingsData.isError = true;
            mockBookingsData.error = { message: 'Failed' };
            render(<UserDashboard />);

            expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
        });
    });

    describe('Dashboard Render', () => {
        test('renders all main sections', async () => {
            render(<UserDashboard />);

            expect(await screen.findByText('User Dashboard')).toBeInTheDocument();
            expect(screen.getByTestId('active-booking-section')).toBeInTheDocument();
            expect(screen.getByTestId('calendar')).toBeInTheDocument();
            expect(screen.getByTestId('booking-summary-section')).toBeInTheDocument();
            expect(screen.getByTestId('bookings-list-upcoming')).toBeInTheDocument();
            expect(screen.getByTestId('bookings-list-past')).toBeInTheDocument();
        });

        test('displays booking data', async () => {
            render(<UserDashboard />);

            expect(await screen.findByText('Biology Lab')).toBeInTheDocument();
            expect(screen.getByText('Chemistry Lab')).toBeInTheDocument();
        });
    });

    describe('Booking Cancellation', () => {
        test('cancels confirmed booking', async () => {
            mockCancelBooking.mockResolvedValue({});
            mockBookingsData.data = { bookings: [mockBookings[0]] };
            render(<UserDashboard />);

            await userEvent.click(await screen.findByText('Cancel'));

            expect(mockCancelBooking).toHaveBeenCalledWith(
                expect.objectContaining({ reservationKey: '1' })
            );
            expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
                'pending',
                'Cancelling booking...',
                null,
                expect.objectContaining({
                    dedupeKey: 'user-dashboard-cancellation-processing:1',
                    dedupeWindowMs: 20000,
                })
            );
            expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
                'pending',
                'Booking cancellation sent. Waiting for on-chain confirmation...',
                null,
                expect.objectContaining({
                    dedupeKey: 'user-dashboard-cancellation-submitted:1',
                    dedupeWindowMs: 20000,
                })
            );
            expect(mockRegisterPendingCancellation).toHaveBeenCalledWith('1', '101', '0x123');
        });

        test('cancels pending reservation', async () => {
            mockCancelReservation.mockResolvedValue({});
            mockBookingsData.data = { bookings: [mockBookings[1]] };
            render(<UserDashboard />);

            await userEvent.click(await screen.findByText('Cancel'));

            expect(mockCancelReservation).toHaveBeenCalledWith(
                expect.objectContaining({ reservationKey: '2' })
            );
            expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
                'pending',
                'Cancellation request sent. Waiting for on-chain confirmation...',
                null,
                expect.objectContaining({
                    dedupeKey: 'user-dashboard-cancellation-submitted:2',
                    dedupeWindowMs: 20000,
                })
            );
        });

        test('shows error on cancellation failure', async () => {
            mockCancelBooking.mockRejectedValue(new Error('Failed'));
            mockBookingsData.data = { bookings: [mockBookings[0]] };
            render(<UserDashboard />);

            await userEvent.click(await screen.findByText('Cancel'));

            expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
                'error',
                'Cancellation failed. Please try again.',
                null,
                expect.objectContaining({
                    dedupeKey: 'user-dashboard-cancellation-failed:1',
                    dedupeWindowMs: 20000,
                })
            );
        });

        test('handles user rejection', async () => {
            const error = new Error('Rejected');
            error.code = 4001;
            mockCancelBooking.mockRejectedValue(error);
            mockBookingsData.data = { bookings: [mockBookings[0]] };
            render(<UserDashboard />);

            await userEvent.click(await screen.findByText('Cancel'));

            expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
                'warning',
                expect.stringContaining('rejected'),
                null,
                expect.objectContaining({
                    dedupeKey: 'user-dashboard-cancellation-rejected',
                    dedupeWindowMs: 20000,
                })
            );
        });
    });

    describe('Edge Cases', () => {
        test('handles empty bookings', async () => {
            mockBookingsData.data = { bookings: [] };
            render(<UserDashboard />);

            expect(await screen.findByText('User Dashboard')).toBeInTheDocument();
            expect(screen.getByTestId('bookings-list-upcoming')).toBeInTheDocument();
        });

        test('handles missing lab details', async () => {
            mockBookingsData.data = {
                bookings: [{
                    reservationKey: '3',
                    labId: '103',
                    status: '1',
                    start: '1640000000',
                    end: '1640003600',
                    labDetails: null
                }]
            };
            render(<UserDashboard />);

            expect(await screen.findByText('Lab 103')).toBeInTheDocument();
        });

        test('prevents cancellation without wallet', async () => {
            mockUserData = { ...mockUser, isConnected: false, isSSO: false };
            mockBookingsData.data = { bookings: [mockBookings[0]] };
            render(<UserDashboard />);

            await userEvent.click(await screen.findByText('Cancel'));

            expect(mockAddTemporaryNotification).toHaveBeenCalledWith(
                'error',
                'Please connect your wallet first.',
                null,
                expect.objectContaining({
                    dedupeKey: 'user-dashboard-wallet-required',
                    dedupeWindowMs: 20000,
                })
            );
            expect(mockCancelBooking).not.toHaveBeenCalled();
        });
    });
});
