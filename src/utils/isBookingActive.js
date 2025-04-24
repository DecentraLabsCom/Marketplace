export function isBookingActive(bookingInfo) {
    if (!Array.isArray(bookingInfo)) return false;
    const now = new Date();
  
    return bookingInfo.some(b => {
      if (!b.date || !b.time || !b.minutes) return false;
      const start = new Date(`${b.date}T${b.time}`);
      const end = new Date(start.getTime() + 
                    parseInt(b.minutes, 10) * 60000);
      if (b.labId == 2) return true; // TODO: Remove when testing things for real
      else return now >= start && now < end;
    });
}