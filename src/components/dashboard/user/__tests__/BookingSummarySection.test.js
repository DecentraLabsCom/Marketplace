import { render, screen } from '@testing-library/react';
import BookingSummarySection from '../BookingSummarySection';

jest.mock('@/hooks/booking/useBookings', () => ({
  useUserBookingsDashboard: jest.fn()
}));
const { useUserBookingsDashboard } = require('@/hooks/booking/useBookings');

describe('BookingSummarySection', () => {
  it('muestra loading mientras carga', () => {
    useUserBookingsDashboard.mockReturnValue({ isLoading: true });
    render(<BookingSummarySection userAddress="0x123" />);
    expect(screen.getByText(/loading summary/i)).toBeInTheDocument();
  });

  it('muestra error si hay error', () => {
    useUserBookingsDashboard.mockReturnValue({ isLoading: false, isError: true });
    render(<BookingSummarySection userAddress="0x123" />);
    expect(screen.getByText(/failed to load booking summary/i)).toBeInTheDocument();
  });

  it('muestra los datos de resumen correctamente', () => {
    useUserBookingsDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        totalBookings: 10,
        activeBookings: 2,
        upcomingBookings: 3,
        completedBookings: 4,
        pendingBookings: 1
      }
    });
    render(<BookingSummarySection userAddress="0x123" />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Active:')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Upcoming:')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Completed:')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Pending:')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('muestra 0 si no hay datos', () => {
    useUserBookingsDashboard.mockReturnValue({ isLoading: false, isError: false, data: undefined });
    render(<BookingSummarySection userAddress="0x123" />);
    // Debe haber 5 ceros: total, active, upcoming, pending, completed
    const ceros = screen.getAllByText('0');
    expect(ceros.length).toBe(5);
  });
});
