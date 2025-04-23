let bookings = [
  { labId: 1, activeBooking: false },
  { labId: 2, activeBooking: true, date: "2025-04-24", time: "15:00", minutes: "60" },
  { labId: 3, activeBooking: true, date: "2025-06-24", time: "12:00", minutes: "60" },
  { labId: 4, activeBooking: false },
  { labId: 5, activeBooking: false },
];

export const simBookings = () => {
  return bookings;
};