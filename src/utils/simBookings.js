// Simulated bookings for RPC fallback scenarios
// Enhanced with realistic data that matches the expected format
import devLog from '@/utils/logger';

let bookings = [
  {
    reservationKey: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef01",
    labId: "23",
    renter: "0x742d35Cc6632C027532e3ec4b427F3C0C02F8eF7",
    date: "2025-07-25",
    time: "09:00",
    minutes: 60,
    start: Math.floor(new Date("2025-07-25T09:00:00Z").getTime() / 1000).toString(),
    end: Math.floor(new Date("2025-07-25T10:00:00Z").getTime() / 1000).toString(),
    status: "1",
    activeBooking: false
  },
  {
    reservationKey: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef02",
    labId: "24",
    renter: "0x742d35Cc6632C027532e3ec4b427F3C0C02F8eF7",
    date: "2025-07-26",
    time: "15:30",
    minutes: 60,
    start: Math.floor(new Date("2025-07-26T15:30:00Z").getTime() / 1000).toString(),
    end: Math.floor(new Date("2025-07-26T16:30:00Z").getTime() / 1000).toString(),
    status: "1",
    activeBooking: false
  },
  {
    reservationKey: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef03",
    labId: "55",
    renter: "0x742d35Cc6632C027532e3ec4b427F3C0C02F8eF7",
    date: "2025-07-27",
    time: "12:30",
    minutes: 30,
    start: Math.floor(new Date("2025-07-27T12:30:00Z").getTime() / 1000).toString(),
    end: Math.floor(new Date("2025-07-27T13:00:00Z").getTime() / 1000).toString(),
    status: "1",
    activeBooking: false
  },
  {
    reservationKey: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef04",
    labId: "53",
    renter: "0x742d35Cc6632C027532e3ec4b427F3C0C02F8eF7",
    date: "2025-07-28",
    time: "10:00",
    minutes: 120,
    start: Math.floor(new Date("2025-07-28T10:00:00Z").getTime() / 1000).toString(),
    end: Math.floor(new Date("2025-07-28T12:00:00Z").getTime() / 1000).toString(),
    status: "1",
    activeBooking: false
  },
  {
    reservationKey: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef05",
    labId: "54",
    renter: "0x742d35Cc6632C027532e3ec4b427F3C0C02F8eF7",
    date: "2025-07-29",
    time: "14:00",
    minutes: 90,
    start: Math.floor(new Date("2025-07-29T14:00:00Z").getTime() / 1000).toString(),
    end: Math.floor(new Date("2025-07-29T15:30:00Z").getTime() / 1000).toString(),
    status: "1",
    activeBooking: false
  }
];

export const simBookings = () => {
  devLog.log('📋 Returning simulated bookings (RPC fallback mode)');
  return bookings;
};
