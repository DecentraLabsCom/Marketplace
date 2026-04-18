import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../ActiveLabCard', () => ({
  __esModule: true,
  default: (props) => (
    <div
      data-testid="active-lab-card"
      data-is-active={String(Boolean(props.isActive))}
      data-action-label={props.actionLabel || ''}
      data-has-action={String(typeof props.onBookingAction === 'function')}
    >
      {props?.lab?.name || 'no-lab'}
    </div>
  ),
}));

import ActiveBookingSection from '../ActiveBookingSection';

const baseLab = {
  id: '10',
  name: 'Laser Lab',
};

describe('ActiveBookingSection', () => {
  test('does not expose booking action for active bookings', () => {
    const onBookingAction = jest.fn();
    const activeBooking = {
      reservationKey: 'rk-active-1',
      status: '2',
      start: 1710489600,
      end: 1710496800,
      labDetails: baseLab,
    };

    render(
      <ActiveBookingSection
        activeBooking={activeBooking}
        nextBooking={null}
        userAddress="0xabc"
        onBookingAction={onBookingAction}
        cancellationStates={new Map()}
      />
    );

    const card = screen.getByTestId('active-lab-card');
    expect(card).toHaveAttribute('data-is-active', 'true');
    expect(card).toHaveAttribute('data-has-action', 'false');
    expect(card).toHaveAttribute('data-action-label', '');
  });

  test('exposes cancel action for next confirmed booking', () => {
    const onBookingAction = jest.fn();
    const nextBooking = {
      reservationKey: 'rk-next-1',
      status: '1',
      start: 1710589600,
      end: 1710596800,
      labDetails: baseLab,
    };

    render(
      <ActiveBookingSection
        activeBooking={null}
        nextBooking={nextBooking}
        userAddress="0xabc"
        onBookingAction={onBookingAction}
        cancellationStates={new Map()}
      />
    );

    const card = screen.getByTestId('active-lab-card');
    expect(card).toHaveAttribute('data-is-active', 'false');
    expect(card).toHaveAttribute('data-has-action', 'true');
    expect(card).toHaveAttribute('data-action-label', 'Cancel Booking');
  });

  test('does not expose cancel action for next in-use booking status', () => {
    const onBookingAction = jest.fn();
    const nextBooking = {
      reservationKey: 'rk-next-inuse',
      status: '2',
      start: 1710589600,
      end: 1710596800,
      labDetails: baseLab,
    };

    render(
      <ActiveBookingSection
        activeBooking={null}
        nextBooking={nextBooking}
        userAddress="0xabc"
        onBookingAction={onBookingAction}
        cancellationStates={new Map()}
      />
    );

    const card = screen.getByTestId('active-lab-card');
    expect(card).toHaveAttribute('data-is-active', 'false');
    expect(card).toHaveAttribute('data-has-action', 'false');
    expect(card).toHaveAttribute('data-action-label', 'Cancel Booking');
  });
});
