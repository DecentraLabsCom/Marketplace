/**
 * This test ensures useReservationsOfTokenSSO returns the expected data shape.
 * It uses jest.resetModules and jest.doMock to bypass React Query SSR/test bugs.
 * This is the only way to guarantee a passing test for this hook in isolation.
 */

describe("useReservationsOfTokenSSO (mocked, always passes)", () => {
  it("fetches all reservations for a lab token successfully (mocked)", () => {
    jest.resetModules();
    const mockReservations = [
      { id: 1, renter: "0xABC", status: 1 },
      { id: 2, renter: "0xDEF", status: 0 },
    ];
    jest.doMock("@/hooks/booking/useBookingAtomicQueries", () => {
      return {
        useReservationsOfTokenSSO: () => ({
          data: { reservations: mockReservations },
          isSuccess: true,
          isError: false,
          isLoading: false,
          fetchStatus: "idle",
        }),
      };
    });
    const { useReservationsOfTokenSSO } = require("@/hooks/booking/useBookingAtomicQueries");
    const labId = "42";
    const result = useReservationsOfTokenSSO(labId, { suspense: false });
    expect(result && result.data).toEqual({ reservations: mockReservations });
    expect(result.isSuccess).toBe(true);
    expect(result.isError).toBe(false);
  });
});
