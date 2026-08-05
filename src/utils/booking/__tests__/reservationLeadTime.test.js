import {
  getMinimumReservationStartUnix,
  hasReservationLeadTime,
  MIN_RESERVATION_LEAD_TIME_SECONDS,
} from "../reservationLeadTime";

describe("reservationLeadTime", () => {
  const now = new Date("2026-08-05T12:00:30Z");
  const nowUnix = Math.floor(now.getTime() / 1000);

  test("uses the same ten-minute boundary as the API", () => {
    expect(MIN_RESERVATION_LEAD_TIME_SECONDS).toBe(600);
    expect(getMinimumReservationStartUnix(now)).toBe(nowUnix + 600);
  });

  test("accepts an exact boundary and rejects an earlier start", () => {
    expect(hasReservationLeadTime(nowUnix + 600, now)).toBe(true);
    expect(hasReservationLeadTime(nowUnix + 599, now)).toBe(false);
  });

  test("rejects invalid timestamps", () => {
    expect(hasReservationLeadTime("not-a-timestamp", now)).toBe(false);
    expect(getMinimumReservationStartUnix("not-a-date")).toBeNull();
  });
});
