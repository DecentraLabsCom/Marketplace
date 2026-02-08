import { renderHook } from "@testing-library/react";
import { useReservationButtonState } from "../useReservationButtonState";

describe("useReservationButtonState", () => {
  test("disabled by missing selected time does not show spinner", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        isSSO: false,
        selectedTime: "",
        isBooking: false,
      })
    );

    expect(result.current.isDisabled).toBe(true);
    expect(result.current.showSpinner).toBe(false);
    expect(result.current.ariaBusy).toBe(false);
    expect(result.current.label).toBe("Book Now");
  });

  test("wallet busy state shows processing label and spinner", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        isSSO: false,
        selectedTime: "10:00",
        isBooking: true,
      })
    );

    expect(result.current.isDisabled).toBe(true);
    expect(result.current.showSpinner).toBe(true);
    expect(result.current.ariaBusy).toBe(true);
    expect(result.current.label).toBe("Processing...");
  });

  test("wallet request_sent stage keeps button disabled with spinner", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        isSSO: false,
        selectedTime: "10:00",
        isBooking: false,
        walletBookingStage: "request_sent",
        isWalletFlowLocked: true,
      })
    );

    expect(result.current.isDisabled).toBe(true);
    expect(result.current.showSpinner).toBe(true);
    expect(result.current.ariaBusy).toBe(false);
    expect(result.current.label).toBe("Request Sent");
  });

  test("sso locked state shows Request Sent while remaining non-busy", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        isSSO: true,
        selectedTime: "10:00",
        isBooking: false,
        ssoBookingStage: "request_sent",
        isSSOFlowLocked: true,
      })
    );

    expect(result.current.isDisabled).toBe(true);
    expect(result.current.showSpinner).toBe(true);
    expect(result.current.ariaBusy).toBe(false);
    expect(result.current.label).toBe("Request Sent");
  });
});
