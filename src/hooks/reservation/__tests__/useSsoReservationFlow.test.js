import { renderHook, act } from "@testing-library/react";
import { useSsoReservationFlow } from "../useSsoReservationFlow";

describe("useSsoReservationFlow", () => {
  test("starts idle by default", () => {
    const { result } = renderHook(() =>
      useSsoReservationFlow({ isSSO: true, userBookingsForLab: [], labBookings: [] })
    );
    expect(result.current.ssoBookingStage).toBe("idle");
    expect(result.current.isSSOFlowLocked).toBe(false);
    expect(result.current.activeSsoRequest).toBeNull();
  });

  test("transitions to processing stage via startSsoProcessing", () => {
    const { result } = renderHook(() =>
      useSsoReservationFlow({ isSSO: true, userBookingsForLab: [], labBookings: [] })
    );
    act(() => { result.current.startSsoProcessing(); });
    expect(result.current.ssoBookingStage).toBe("processing");
    expect(result.current.isSSOFlowLocked).toBe(true);
  });

  test("markSsoRequestSent stores activeSsoRequest and transitions to request_sent", () => {
    const { result } = renderHook(() =>
      useSsoReservationFlow({ isSSO: true, userBookingsForLab: [], labBookings: [] })
    );
    act(() => {
      result.current.markSsoRequestSent({ reservationKey: "res-x", labId: "1", start: "1700000000" });
    });
    expect(result.current.ssoBookingStage).toBe("request_sent");
    expect(result.current.activeSsoRequest).toMatchObject({ labId: "1", start: "1700000000" });
  });

  test("startSsoProcessing is a no-op when isSSO is false", () => {
    const { result } = renderHook(() =>
      useSsoReservationFlow({ isSSO: false, userBookingsForLab: [], labBookings: [] })
    );
    act(() => { result.current.startSsoProcessing(); });
    expect(result.current.ssoBookingStage).toBe("idle");
  });

  test("markSsoRequestSent is a no-op when isSSO is false", () => {
    const { result } = renderHook(() =>
      useSsoReservationFlow({ isSSO: false, userBookingsForLab: [], labBookings: [] })
    );
    act(() => {
      result.current.markSsoRequestSent({ reservationKey: "res-y", labId: "1", start: "1700000000" });
    });
    expect(result.current.ssoBookingStage).toBe("idle");
    expect(result.current.activeSsoRequest).toBeNull();
  });

  test("resets flow when isSSO switches to false", () => {
    const { result, rerender } = renderHook(
      ({ isSSO }) => useSsoReservationFlow({ isSSO, userBookingsForLab: [], labBookings: [] }),
      { initialProps: { isSSO: true } }
    );
    act(() => { result.current.startSsoProcessing(); });
    expect(result.current.ssoBookingStage).toBe("processing");
    rerender({ isSSO: false });
    expect(result.current.ssoBookingStage).toBe("idle");
    expect(result.current.isSSOFlowLocked).toBe(false);
  });

  test("resetSsoReservationFlow returns to idle from any stage", () => {
    const { result } = renderHook(() =>
      useSsoReservationFlow({ isSSO: true, userBookingsForLab: [], labBookings: [] })
    );
    act(() => { result.current.startSsoProcessing(); });
    act(() => { result.current.resetSsoReservationFlow(); });
    expect(result.current.ssoBookingStage).toBe("idle");
    expect(result.current.activeSsoRequest).toBeNull();
    expect(result.current.isSSOFlowLocked).toBe(false);
  });

  test("matches booking by timestamp within 60-second tolerance", () => {
    const { result, rerender } = renderHook(
      ({ userBookingsForLab }) =>
        useSsoReservationFlow({ isSSO: true, userBookingsForLab, labBookings: [] }),
      { initialProps: { userBookingsForLab: [] } }
    );
    act(() => {
      result.current.markSsoRequestSent({ reservationKey: null, labId: "1", start: "1700000000" });
    });
    // booking start differs by 30 seconds — within tolerance
    rerender({
      userBookingsForLab: [{ reservationKey: "res-drift", labId: "1", start: "1700000030", status: 0 }],
    });
    expect(result.current.ssoBookingStage).toBe("request_registered");
  });

  test("does not match booking when timestamp difference exceeds 60 seconds", () => {
    const { result, rerender } = renderHook(
      ({ userBookingsForLab }) =>
        useSsoReservationFlow({ isSSO: true, userBookingsForLab, labBookings: [] }),
      { initialProps: { userBookingsForLab: [] } }
    );
    act(() => {
      result.current.markSsoRequestSent({ reservationKey: null, labId: "1", start: "1700000000" });
    });
    rerender({
      userBookingsForLab: [{ reservationKey: "res-far", labId: "1", start: "1700000120", status: 0 }],
    });
    expect(result.current.ssoBookingStage).toBe("request_sent");
  });

  test("resets flow when booking reaches in_use status", () => {
    const { result, rerender } = renderHook(
      ({ userBookingsForLab }) =>
        useSsoReservationFlow({ isSSO: true, userBookingsForLab, labBookings: [] }),
      { initialProps: { userBookingsForLab: [] } }
    );
    act(() => {
      result.current.markSsoRequestSent({ reservationKey: "res-iu", labId: "1", start: "1700000000" });
    });
    rerender({ userBookingsForLab: [{ reservationKey: "res-iu", labId: "1", start: "1700000000", status: 2 }] });
    expect(result.current.ssoBookingStage).toBe("idle");
  });

  test("resets flow when booking reaches cancelled status", () => {
    const { result, rerender } = renderHook(
      ({ userBookingsForLab }) =>
        useSsoReservationFlow({ isSSO: true, userBookingsForLab, labBookings: [] }),
      { initialProps: { userBookingsForLab: [] } }
    );
    act(() => {
      result.current.markSsoRequestSent({ reservationKey: "res-can", labId: "1", start: "1700000000" });
    });
    rerender({ userBookingsForLab: [{ reservationKey: "res-can", labId: "1", start: "1700000000", status: 5 }] });
    expect(result.current.ssoBookingStage).toBe("idle");
  });

  test("stays in request_registered when already registered and booking still pending", () => {
    const { result, rerender } = renderHook(
      ({ userBookingsForLab }) =>
        useSsoReservationFlow({ isSSO: true, userBookingsForLab, labBookings: [] }),
      { initialProps: { userBookingsForLab: [] } }
    );
    act(() => {
      result.current.startSsoProcessing();
      result.current.markSsoRequestSent({ reservationKey: "res-stay", labId: "1", start: "1700000000" });
    });
    rerender({ userBookingsForLab: [{ reservationKey: "res-stay", labId: "1", start: "1700000000", status: 0 }] });
    expect(result.current.ssoBookingStage).toBe("request_registered");
    // Re-render again with same status — should not change
    rerender({ userBookingsForLab: [{ reservationKey: "res-stay", labId: "1", start: "1700000000", status: 0 }] });
    expect(result.current.ssoBookingStage).toBe("request_registered");
  });

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

