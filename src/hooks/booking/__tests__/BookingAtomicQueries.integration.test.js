import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useReservationsOfTokenSSO, useReservationOfTokenByIndexSSO } from "@/hooks/booking/useBookingAtomicQueries";

// Integration test component
function ReservationsTestComponent({ labId, index }) {
  const reservations = useReservationsOfTokenSSO(labId);
  const reservationByIndex = useReservationOfTokenByIndexSSO(labId, index);
  return (
    <div>
      <div data-testid="reservations">
        {reservations.isSuccess && JSON.stringify(reservations.data)}
      </div>
      <div data-testid="reservation-by-index">
        {reservationByIndex.isSuccess && JSON.stringify(reservationByIndex.data)}
      </div>
    </div>
  );
}

describe("Booking atomic queries integration", () => {
  const queryClient = new QueryClient();
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
    queryClient.clear();
  });

  it("fetches reservations and reservation by index", async () => {
    const mockReservations = [
      { id: 1, renter: "0xABC", status: 1 },
      { id: 2, renter: "0xDEF", status: 0 },
    ];
    const mockReservation = {
      labId: "42",
      index: 3,
      renter: "0x123",
      status: 1,
      reservationState: "Confirmed",
    };
    global.fetch = jest.fn()
      .mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ reservations: mockReservations }),
      }))
      .mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ reservation: mockReservation }),
      }));

    render(
      <ReservationsTestComponent labId="42" index={3} />, { wrapper }
    );

    await waitFor(() => {
      expect(screen.getByTestId("reservations").textContent).toContain("0xABC");
      expect(screen.getByTestId("reservation-by-index").textContent).toContain("0x123");
    });
  });
});
