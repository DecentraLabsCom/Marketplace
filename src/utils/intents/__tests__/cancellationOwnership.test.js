import {
  cancellationStateError,
  hasCancellationOwnership,
} from '../cancellationOwnership';

describe('cancellation ownership validation', () => {
  test('accepts only the institution that is the reservation renter', () => {
    const reservation = { renter: '0xAa00000000000000000000000000000000000001' };

    expect(hasCancellationOwnership(
      reservation,
      '0xaa00000000000000000000000000000000000001',
    )).toBe(true);
    expect(hasCancellationOwnership(
      reservation,
      '0xbb00000000000000000000000000000000000002',
    )).toBe(false);
  });

  test('rejects missing or invalid reservation ownership data', () => {
    expect(hasCancellationOwnership(null, '0xaa00000000000000000000000000000000000001')).toBe(false);
    expect(hasCancellationOwnership(
      { renter: '0x0000000000000000000000000000000000000000' },
      '0xaa00000000000000000000000000000000000001',
    )).toBe(false);
  });

  test('rejects already cancelled and wrong lifecycle states before preparing an intent', () => {
    expect(cancellationStateError(10, { status: 4 })).toMatchObject({ status: 409 });
    expect(cancellationStateError(10, { status: 0 })).toMatchObject({ status: 409 });
    expect(cancellationStateError(9, { status: 1 })).toMatchObject({ status: 409 });
    expect(cancellationStateError(9, { status: 4 })).toMatchObject({ status: 409 });
    expect(cancellationStateError(10, { status: 1 })).toBeNull();
    expect(cancellationStateError(9, { status: 0 })).toBeNull();
  });
});
