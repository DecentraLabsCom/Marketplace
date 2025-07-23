import { format, isToday } from "date-fns";
import devLog from '@/utils/logger';

// Returns the available time slots for a specific day
export function generateTimeOptions({ date, interval, bookingInfo }) {
    const options = [];
    const now = new Date();

    devLog.log(bookingInfo)
    const dayBookings = (bookingInfo || []).filter(
        (b) => new Date(b.date).toDateString() === date.toDateString()
    );

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    let slot = new Date(dayStart);
    while (slot <= dayEnd) {
        const slotStart = new Date(slot);
        const slotEnd = new Date(slotStart.getTime() + interval * 60 * 1000);
        const timeFormatted = format(slotStart, "HH:mm");

        let isBlocked = false;
        if (isToday(date) && slotStart <= now) {
        isBlocked = true;
        } else {
        isBlocked = dayBookings.some((booking) => {
            if (!booking.start || !booking.end) return false;
            
            // Convert Unix timestamps to Date objects
            const bookingStart = new Date(parseInt(booking.start) * 1000);
            const bookingEnd = new Date(parseInt(booking.end) * 1000);
            
            return slotStart < bookingEnd && slotEnd > bookingStart;
        });
        }

        options.push({
        value: timeFormatted,
        label: timeFormatted,
        disabled: isBlocked,
        isReserved: isBlocked,
        });

        slot = slotEnd;
    }

    return options;
}

// Returns the content of the day for the calendar (tooltip with reserved hours)
export function renderDayContents({ day, currentDateRender, bookingInfo }) {
    const bookingsOnDay = (bookingInfo || [])
        .filter(b => {
            const dateStr = b.dateString || b.date;
            const bookingDate = new Date(dateStr);
            return !isNaN(bookingDate) && bookingDate.toDateString() === currentDateRender.toDateString();
        });

    let title = undefined;

    if (bookingsOnDay.length > 0) {
        title = bookingsOnDay.map((booking) => {
            if (booking?.start && booking?.end) {
                // Convert Unix timestamps to Date objects
                const startDate = new Date(parseInt(booking.start) * 1000);
                const endDate = new Date(parseInt(booking.end) * 1000);
                
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 'Booked';
                
                // Format time strings
                const startTime = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
                const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
                
                // Add status indicator to the booking text
                const statusText = (booking.status === "0" || booking.status === 0) ? " (Pending)" : "";
                return `${booking.labName ? booking.labName + ': ' : ''}${startTime} - ${endTime}${statusText}`;
            }
            const statusText = (booking.status === "0" || booking.status === 0) ? " (Pending)" : "";
            return booking.labName ? `Booked: ${booking.labName}${statusText}` : `Booked${statusText}`;
        }).join('\n');
    }

    return <div title={title}>{day}</div>;
}