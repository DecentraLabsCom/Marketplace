let bookings = [
  { labId: 1, activeBooking: false, date: "2025-02-24", time: "10:00", minutes: "60" },
  { labId: 2, activeBooking: true, date: "2025-04-23", time: "15:40", minutes: "60" },
  { labId: 3, activeBooking: false, date: "2025-06-24", time: "12:00", minutes: "20" },
  { labId: 4, activeBooking: false, date: "2025-03-24", time: "10:00", minutes: "60" },
  { labId: 5, activeBooking: true, date: "2025-05-24", time: "12:00", minutes: "20" },
];

export const simBookings = () => {
  return bookings;
};