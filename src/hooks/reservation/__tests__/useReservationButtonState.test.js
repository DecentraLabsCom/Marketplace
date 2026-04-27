import { renderHook } from "@testing-library/react";
import { useReservationButtonState } from "../useReservationButtonState";

describe("useReservationButtonState", () => {
  test("disabled by missing selected time does not show spinner", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        selectedTime: "",
        isBooking: false,
      })
    );

    expect(result.current.isDisabled).toBe(true);
    expect(result.current.showSpinner).toBe(false);
    expect(result.current.ariaBusy).toBe(false);
    expect(result.current.label).toBe("Book Now");
  });

  test("busy state shows processing label and spinner", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        selectedTime: "10:00",
        isBooking: true,
      })
    );

    expect(result.current.isDisabled).toBe(true);
    expect(result.current.showSpinner).toBe(true);
    expect(result.current.ariaBusy).toBe(true);
    expect(result.current.label).toBe("Processing...");
  });

  test("request_sent stage keeps button disabled with spinner", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        selectedTime: "10:00",
        bookingStage: "request_sent",
        isFlowLocked: true,
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
        selectedTime: "14:00",
        isBooking: false,
      })
    );

    expect(result.current.isDisabled).toBe(false);
    expect(result.current.showSpinner).toBe(false);
    expect(result.current.label).toBe("Book Now");
    expect(result.current.hasSelectedTime).toBe(true);
  });

  test("request_registered shows Request Registered label with spinner", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        selectedTime: "10:00",
        bookingStage: "request_registered",
        isFlowLocked: true,
      })
    );

    expect(result.current.label).toBe("Request Registered");
    expect(result.current.isDisabled).toBe(true);
    expect(result.current.showSpinner).toBe(true);
    expect(result.current.ariaBusy).toBe(false);
  });

  test("processing stage via bookingStage shows Processing label", () => {
    const { result } = renderHook(() =>
      useReservationButtonState({
        selectedTime: "10:00",
        bookingStage: "processing",
        isFlowLocked: true,
      })
    );

    expect(result.current.label).toBe("Processing...");
    expect(result.current.isBusy).toBe(false);
    expect(result.current.showSpinner).toBe(true);
  });
});
