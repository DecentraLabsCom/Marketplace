import { renderHook, act } from "@testing-library/react";
import { useWalletReservationFlow } from "../useWalletReservationFlow";

describe("useWalletReservationFlow", () => {
  test("starts idle by default", () => {
    const { result } = renderHook(() =>
      useWalletReservationFlow({ isWallet: true, userBookingsForLab: [], labBookings: [] })
    );
    expect(result.current.walletBookingStage).toBe("idle");
    expect(result.current.isWalletFlowLocked).toBe(false);
    expect(result.current.activeWalletRequest).toBeNull();
  });

  test("transitions to processing stage via startWalletProcessing", () => {
    const { result } = renderHook(() =>
      useWalletReservationFlow({ isWallet: true, userBookingsForLab: [], labBookings: [] })
    );
    act(() => { result.current.startWalletProcessing(); });
    expect(result.current.walletBookingStage).toBe("processing");
    expect(result.current.isWalletFlowLocked).toBe(true);
  });

  test("markWalletRequestSent stores activeWalletRequest and transitions to request_sent", () => {
    const { result } = renderHook(() =>
      useWalletReservationFlow({ isWallet: true, userBookingsForLab: [], labBookings: [] })
    );
    act(() => {
      result.current.markWalletRequestSent({ reservationKey: "wallet-x", labId: "2", start: "1700001000" });
    });
    expect(result.current.walletBookingStage).toBe("request_sent");
    expect(result.current.activeWalletRequest).toMatchObject({ labId: "2", start: "1700001000" });
  });

  test("startWalletProcessing is a no-op when isWallet is false", () => {
    const { result } = renderHook(() =>
      useWalletReservationFlow({ isWallet: false, userBookingsForLab: [], labBookings: [] })
    );
    act(() => { result.current.startWalletProcessing(); });
    expect(result.current.walletBookingStage).toBe("idle");
  });

  test("markWalletRequestSent is a no-op when isWallet is false", () => {
    const { result } = renderHook(() =>
      useWalletReservationFlow({ isWallet: false, userBookingsForLab: [], labBookings: [] })
    );
    act(() => {
      result.current.markWalletRequestSent({ reservationKey: "wallet-y", labId: "2", start: "1700001000" });
    });
    expect(result.current.walletBookingStage).toBe("idle");
    expect(result.current.activeWalletRequest).toBeNull();
  });

  test("resets flow when isWallet switches to false", () => {
    const { result, rerender } = renderHook(
      ({ isWallet }) => useWalletReservationFlow({ isWallet, userBookingsForLab: [], labBookings: [] }),
      { initialProps: { isWallet: true } }
    );
    act(() => { result.current.startWalletProcessing(); });
    expect(result.current.walletBookingStage).toBe("processing");
    rerender({ isWallet: false });
    expect(result.current.walletBookingStage).toBe("idle");
    expect(result.current.isWalletFlowLocked).toBe(false);
  });

  test("resetWalletReservationFlow returns to idle from any stage", () => {
    const { result } = renderHook(() =>
      useWalletReservationFlow({ isWallet: true, userBookingsForLab: [], labBookings: [] })
    );
    act(() => { result.current.startWalletProcessing(); });
    act(() => { result.current.resetWalletReservationFlow(); });
    expect(result.current.walletBookingStage).toBe("idle");
    expect(result.current.activeWalletRequest).toBeNull();
    expect(result.current.isWalletFlowLocked).toBe(false);
  });

  test("matches booking by timestamp within 60-second tolerance", () => {
    const { result, rerender } = renderHook(
      ({ userBookingsForLab }) =>
        useWalletReservationFlow({ isWallet: true, userBookingsForLab, labBookings: [] }),
      { initialProps: { userBookingsForLab: [] } }
    );
    act(() => {
      result.current.markWalletRequestSent({ reservationKey: null, labId: "2", start: "1700001000" });
    });
    rerender({
      userBookingsForLab: [{ reservationKey: "wallet-drift", labId: "2", start: "1700001030", status: 0 }],
    });
    expect(result.current.walletBookingStage).toBe("request_registered");
  });

  test("does not match booking when timestamp difference exceeds 60 seconds", () => {
    const { result, rerender } = renderHook(
      ({ userBookingsForLab }) =>
        useWalletReservationFlow({ isWallet: true, userBookingsForLab, labBookings: [] }),
      { initialProps: { userBookingsForLab: [] } }
    );
    act(() => {
      result.current.markWalletRequestSent({ reservationKey: null, labId: "2", start: "1700001000" });
    });
    rerender({
      userBookingsForLab: [{ reservationKey: "wallet-far", labId: "2", start: "1700001200", status: 0 }],
    });
    expect(result.current.walletBookingStage).toBe("request_sent");
  });

  test("resets flow when booking reaches in_use status", () => {
    const { result, rerender } = renderHook(
      ({ userBookingsForLab }) =>
        useWalletReservationFlow({ isWallet: true, userBookingsForLab, labBookings: [] }),
      { initialProps: { userBookingsForLab: [] } }
    );
    act(() => {
      result.current.markWalletRequestSent({ reservationKey: "wallet-iu", labId: "2", start: "1700001000" });
    });
    rerender({ userBookingsForLab: [{ reservationKey: "wallet-iu", labId: "2", start: "1700001000", status: 2 }] });
    expect(result.current.walletBookingStage).toBe("idle");
  });

  test("resets flow when booking reaches cancelled status", () => {
    const { result, rerender } = renderHook(
      ({ userBookingsForLab }) =>
        useWalletReservationFlow({ isWallet: true, userBookingsForLab, labBookings: [] }),
      { initialProps: { userBookingsForLab: [] } }
    );
    act(() => {
      result.current.markWalletRequestSent({ reservationKey: "wallet-can", labId: "2", start: "1700001000" });
    });
    rerender({ userBookingsForLab: [{ reservationKey: "wallet-can", labId: "2", start: "1700001000", status: 5 }] });
    expect(result.current.walletBookingStage).toBe("idle");
  });

  test("transitions to request_registered when pending booking appears in cache", () => {
    const { result, rerender } = renderHook(
      ({ userBookingsForLab, labBookings }) =>
        useWalletReservationFlow({
          isWallet: true,
          userBookingsForLab,
          labBookings,
        }),
      {
        initialProps: { userBookingsForLab: [], labBookings: [] },
      }
    );

    act(() => {
      result.current.startWalletProcessing();
      result.current.markWalletRequestSent({
        reservationKey: "wallet-res-1",
        labId: "1",
        start: "1700000000",
      });
    });

    rerender({
      userBookingsForLab: [
        {
          reservationKey: "wallet-res-1",
          labId: "1",
          start: "1700000000",
          status: 0,
        },
      ],
      labBookings: [],
    });

    expect(result.current.walletBookingStage).toBe("request_registered");
    expect(result.current.isWalletFlowLocked).toBe(true);
  });

  test("resets to idle when booking reaches confirmed status", () => {
    const { result, rerender } = renderHook(
      ({ userBookingsForLab }) =>
        useWalletReservationFlow({
          isWallet: true,
          userBookingsForLab,
          labBookings: [],
        }),
      {
        initialProps: { userBookingsForLab: [] },
      }
    );

    act(() => {
      result.current.markWalletRequestSent({
        reservationKey: "wallet-res-2",
        labId: "1",
        start: "1700001000",
      });
    });

    rerender({
      userBookingsForLab: [
        {
          reservationKey: "wallet-res-2",
          labId: "1",
          start: "1700001000",
          status: 1,
        },
      ],
    });

    expect(result.current.walletBookingStage).toBe("idle");
    expect(result.current.isWalletFlowLocked).toBe(false);
  });

  test("resets flow when denial event is emitted", () => {
    const { result } = renderHook(() =>
      useWalletReservationFlow({
        isWallet: true,
        userBookingsForLab: [],
        labBookings: [],
      })
    );

    act(() => {
      result.current.markWalletRequestSent({
        reservationKey: "wallet-res-3",
        labId: "1",
        start: "1700002000",
      });
    });

    expect(result.current.walletBookingStage).toBe("request_sent");

    act(() => {
      window.dispatchEvent(new CustomEvent("reservation-request-denied"));
    });

    expect(result.current.walletBookingStage).toBe("idle");
    expect(result.current.isWalletFlowLocked).toBe(false);
  });
});

