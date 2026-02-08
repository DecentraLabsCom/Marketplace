import { renderHook, act } from "@testing-library/react";
import { useSsoReservationFlow } from "../useSsoReservationFlow";

describe("useSsoReservationFlow", () => {
  test("transitions to request_registered when pending booking appears in cache", () => {
    const { result, rerender } = renderHook(
      ({ userBookingsForLab, labBookings }) =>
        useSsoReservationFlow({
          isSSO: true,
          userBookingsForLab,
          labBookings,
        }),
      {
        initialProps: { userBookingsForLab: [], labBookings: [] },
      }
    );

    act(() => {
      result.current.startSsoProcessing();
      result.current.markSsoRequestSent({
        reservationKey: "res-1",
        labId: "1",
        start: "1700000000",
      });
    });

    rerender({
      userBookingsForLab: [
        {
          reservationKey: "res-1",
          labId: "1",
          start: "1700000000",
          status: 0,
        },
      ],
      labBookings: [],
    });

    expect(result.current.ssoBookingStage).toBe("request_registered");
    expect(result.current.isSSOFlowLocked).toBe(true);
  });

  test("resets to idle when booking reaches confirmed status", () => {
    const { result, rerender } = renderHook(
      ({ userBookingsForLab }) =>
        useSsoReservationFlow({
          isSSO: true,
          userBookingsForLab,
          labBookings: [],
        }),
      {
        initialProps: { userBookingsForLab: [] },
      }
    );

    act(() => {
      result.current.markSsoRequestSent({
        reservationKey: "res-2",
        labId: "1",
        start: "1700001000",
      });
    });

    rerender({
      userBookingsForLab: [
        {
          reservationKey: "res-2",
          labId: "1",
          start: "1700001000",
          status: 1,
        },
      ],
    });

    expect(result.current.ssoBookingStage).toBe("idle");
    expect(result.current.isSSOFlowLocked).toBe(false);
  });

  test("resets flow when denial event is emitted", () => {
    const { result } = renderHook(() =>
      useSsoReservationFlow({
        isSSO: true,
        userBookingsForLab: [],
        labBookings: [],
      })
    );

    act(() => {
      result.current.markSsoRequestSent({
        reservationKey: "res-3",
        labId: "1",
        start: "1700002000",
      });
    });

    expect(result.current.ssoBookingStage).toBe("request_sent");

    act(() => {
      window.dispatchEvent(new CustomEvent("reservation-request-denied"));
    });

    expect(result.current.ssoBookingStage).toBe("idle");
    expect(result.current.isSSOFlowLocked).toBe(false);
  });
});

