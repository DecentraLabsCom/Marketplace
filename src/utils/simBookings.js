let bookings = [
  { labId: 1, activeBooking: false },
  { labId: 2, activeBooking: true, date: "2025-04-24", time: "15:00", minuts: "30" },
  { labId: 3, activeBooking: false },
  { labId: 4, activeBooking: false },
  { labId: 5, activeBooking: false },
];

export const simBookings = () => {
  return bookings;
};