/**
* Mock for useBookingCacheUpdates.
* Mocks the hook by returning a set of spy functions.
 */
module.exports = {
  useBookingCacheUpdates: jest.fn(() => ({
    addOptimisticBooking: jest.fn((booking) => {
      const id = `opt-${Math.random().toString(36).slice(2, 9)}`;
      return { ...booking, id };
    }),

    replaceOptimisticBooking: jest.fn((optimisticId, booking) => booking),

    removeOptimisticBooking: jest.fn((optimisticId) => optimisticId),

    addBooking: jest.fn((booking) => booking),

    updateBooking: jest.fn((reservationKey, patch) => ({
      reservationKey,
      ...patch,
    })),

    removeBooking: jest.fn((reservationKey) => reservationKey),

    invalidateAllBookings: jest.fn(),
  })),
};
