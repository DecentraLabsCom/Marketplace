import { render, screen, fireEvent } from '@testing-library/react';
import ActiveBookingSection from '../ActiveBookingSection';

// Mock ActiveLabCard to isolate tests
jest.mock('../ActiveLabCard', () => ({
  __esModule: true,
  default: ({ lab, booking, isActive, actionLabel, onBookingAction, actionState, bookingTimes }) => (
    <div data-testid="active-lab-card-mock">
      <span>{lab ? lab.name : 'no-lab'}</span>
      <span>{isActive ? 'active' : 'upcoming'}</span>
      <span>{actionLabel}</span>
      <span>{bookingTimes?.start ?? 'no-start'}-{bookingTimes?.end ?? 'no-end'}</span>
      <button onClick={() => onBookingAction && onBookingAction(booking)} disabled={actionState?.isBusy}>
        {actionLabel}
      </button>
    </div>
  )
}));

describe('ActiveBookingSection', () => {
  const userAddress = '0x123';
  const labDetails = { id: '1', name: 'Physics Lab' };
  const activeBooking = {
    reservationKey: 'abc',
    status: 1,
    start: 1710489600, // 08:00
    end: 1710496800,   // 10:00
    labDetails
  };
  const nextBooking = {
    reservationKey: 'def',
    status: 0,
    start: 1710500400, // 11:00
    end: 1710507600,   // 13:00
    labDetails
  };

  it('muestra mensaje si no hay bookings', () => {
    render(<ActiveBookingSection userAddress={userAddress} />);
    expect(screen.getByText(/no upcoming or active lab/i)).toBeInTheDocument();
  });

  it('renderiza activeBooking correctamente', () => {
    render(<ActiveBookingSection userAddress={userAddress} activeBooking={activeBooking} />);
    expect(screen.getByText(/active now/i)).toBeInTheDocument();
    expect(screen.getByText('Physics Lab')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    // Verifica que el botón con el texto esté presente
    expect(screen.getByRole('button', { name: /Request for Refund/i })).toBeInTheDocument();
    // Acepta cualquier texto con formato HH:MM-HH:MM
    expect(screen.getByText((content) => /\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/.test(content))).toBeInTheDocument();
  });

  it('renderiza nextBooking si no hay activeBooking', () => {
    render(<ActiveBookingSection userAddress={userAddress} nextBooking={nextBooking} />);
    expect(screen.getByText(/next:/i)).toBeInTheDocument();
    expect(screen.getByText('Physics Lab')).toBeInTheDocument();
    expect(screen.getByText('upcoming')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel Booking/i })).toBeInTheDocument();
    expect(screen.getByText((content) => /\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/.test(content))).toBeInTheDocument();
  });

  it('llama onBookingAction solo si permitido', () => {
    const onBookingAction = jest.fn();
    render(<ActiveBookingSection userAddress={userAddress} activeBooking={activeBooking} onBookingAction={onBookingAction} />);
    fireEvent.click(screen.getByRole('button', { name: /Request for Refund/i }));
    expect(onBookingAction).toHaveBeenCalledWith(activeBooking);
  });

  it('deshabilita el botón si isBusy', () => {
    const cancellationStates = new Map([[activeBooking.reservationKey, { isBusy: true }]]);
    render(<ActiveBookingSection userAddress={userAddress} activeBooking={activeBooking} cancellationStates={cancellationStates} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('retorna null en tiempos si el timestamp es invalido o faltante', () => {
    const invalidBooking = { ...activeBooking, start: 'invalid', end: 0 };
    render(<ActiveBookingSection userAddress={userAddress} activeBooking={invalidBooking} />);
    expect(screen.getByText('no-start-no-end')).toBeInTheDocument();
  });

  it('no pasa onBookingAction si el estado de la reserva no es 0, 1 o 2', () => {
    const onBookingAction = jest.fn();
    // Estado 3 no permite acciones
    const invalidStatusBooking = { ...activeBooking, status: 3 };
    
    // Al no pasarle onBookingAction a ActiveLabCard (porque la validación falla),
    // el mock no hace nada en el onClick o desactiva el boton en base a las props
    // We expect the click to not fire our mock
    render(
      <ActiveBookingSection 
        userAddress={userAddress} 
        activeBooking={invalidStatusBooking} 
        onBookingAction={onBookingAction} 
      />
    );
    
    // We check if the the mock was triggered upon clicking
    fireEvent.click(screen.getByRole('button', { name: /Request for Refund/i }));
    // No debería haber sido llamado, ya que disabled={!onBookingAction} en el mock
    // Wait, let's verify if the button has disabled logic in the mock
    // if onBookingAction is null in the mock, it won't do anything
    expect(onBookingAction).not.toHaveBeenCalled();
  });
});
