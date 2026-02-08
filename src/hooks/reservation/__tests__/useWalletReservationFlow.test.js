import { renderHook, act } from "@testing-library/react";
import { useWalletReservationFlow } from "../useWalletReservationFlow";

describe("useWalletReservationFlow", () => {
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

