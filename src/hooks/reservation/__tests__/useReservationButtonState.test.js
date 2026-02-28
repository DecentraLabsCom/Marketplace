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

  test("enabled base state with time selected shows Book Now", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        isSSO: false,
        selectedTime: "14:00",
        isBooking: false,
      })
    );

    expect(result.current.isDisabled).toBe(false);
    expect(result.current.showSpinner).toBe(false);
    expect(result.current.label).toBe("Book Now");
    expect(result.current.hasSelectedTime).toBe(true);
  });

  test("wallet request_registered shows Request Registered label with spinner", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        isSSO: false,
        selectedTime: "10:00",
        isBooking: false,
        walletBookingStage: "request_registered",
        isWalletFlowLocked: true,
      })
    );

    expect(result.current.label).toBe("Request Registered");
    expect(result.current.isDisabled).toBe(true);
    expect(result.current.showSpinner).toBe(true);
    expect(result.current.ariaBusy).toBe(false);
  });

  test("SSO request_registered shows Request Registered label", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        isSSO: true,
        selectedTime: "10:00",
        isBooking: false,
        ssoBookingStage: "request_registered",
        isSSOFlowLocked: true,
      })
    );

    expect(result.current.label).toBe("Request Registered");
    expect(result.current.isDisabled).toBe(true);
    expect(result.current.showSpinner).toBe(true);
  });

  test("SSO processing stage via isBooking shows Processing label", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        isSSO: true,
        selectedTime: "10:00",
        isBooking: true,
        ssoBookingStage: "idle",
      })
    );

    expect(result.current.label).toBe("Processing...");
    expect(result.current.isBusy).toBe(true);
    expect(result.current.ariaBusy).toBe(true);
  });

  test("SSO processing stage via ssoBookingStage shows Processing label", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        isSSO: true,
        selectedTime: "10:00",
        isBooking: false,
        ssoBookingStage: "processing",
        isSSOFlowLocked: true,
      })
    );

    expect(result.current.label).toBe("Processing...");
    expect(result.current.isBusy).toBe(false);
    expect(result.current.showSpinner).toBe(true);
  });

  test("wallet awaiting receipt shows Awaiting confirmation label", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        isSSO: false,
        selectedTime: "10:00",
        isBooking: false,
        isWaitingForReceipt: true,
        isReceiptError: false,
        walletBookingStage: "idle",
        isWalletFlowLocked: false,
      })
    );

    expect(result.current.label).toBe("Awaiting confirmation...");
    expect(result.current.isBusy).toBe(true);
    expect(result.current.isDisabled).toBe(true);
    expect(result.current.showSpinner).toBe(true);
  });

  test("receipt error shows Try Again label and is not busy", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        isSSO: false,
        selectedTime: "10:00",
        isBooking: false,
        isWaitingForReceipt: true,
        isReceiptError: true,
        walletBookingStage: "idle",
        isWalletFlowLocked: false,
      })
    );

    expect(result.current.label).toBe("Try Again");
    expect(result.current.isBusy).toBe(false);
    expect(result.current.isDisabled).toBe(false);
  });

  test("SSO flag suppresses Awaiting confirmation even with isWaitingForReceipt", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        isSSO: true,
        selectedTime: "10:00",
        isBooking: false,
        isWaitingForReceipt: true,
        isReceiptError: false,
        ssoBookingStage: "idle",
        isSSOFlowLocked: false,
      })
    );

    // SSO does not watch receipt — isBusy should be false and label Book Now
    expect(result.current.isBusy).toBe(false);
    expect(result.current.label).toBe("Book Now");
  });
});
