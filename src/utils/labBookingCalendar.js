import { format, isToday } from "date-fns";

// Returns the available time slots for a specific day
export function generateTimeOptions({ date, interval, bookingInfo }) {
    const options = [];
    const now = new Date();

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
            const bookingStart = new Date(`${booking.date}T${booking.time}`);
            const bookingEnd = new Date(bookingStart.getTime() + parseInt(booking.minutes) * 60000);
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
    let hasPendingBookings = false;

    if (bookingsOnDay.length > 0) {
        // Check if any booking is pending
        hasPendingBookings = bookingsOnDay.some(booking => 
            booking.status === "0" || booking.status === 0
        );

        title = bookingsOnDay.map((booking) => {
            if (booking?.time && booking?.minutes) {
                // Build startDate correctly depending on the type of date
                let startDate;
                if (booking.dateString) {
                    startDate = new Date(`${booking.dateString}T${booking.time}`);
                } else if (typeof booking.date === "string") {
                    startDate = new Date(`${booking.date}T${booking.time}`);
                } else if (booking.date instanceof Date) {
                    // If it's a Date, clone it and set the hours/minutes
                    startDate = new Date(booking.date);
                    const [h, m] = booking.time.split(":").map(Number);
                    startDate.setHours(h, m, 0, 0);
                } else {
                    return 'Booked';
                }
                if (isNaN(startDate)) return 'Booked';
                const endTimeDate = new Date(startDate.getTime() + parseInt(booking.minutes) * 60 * 1000);
                const endTime = `${String(endTimeDate.getHours()).padStart(2, '0')}:` + 
                                `${String(endTimeDate.getMinutes()).padStart(2, '0')}`;
                
                // Add status indicator to the booking text
                const statusText = (booking.status === "0" || booking.status === 0) ? " (Pending)" : "";
                return `${booking.labName ? booking.labName + ': ' : ''}${booking.time} - ${endTime}${statusText}`;
            }
            const statusText = (booking.status === "0" || booking.status === 0) ? " (Pending)" : "";
            return booking.labName ? `Booked: ${booking.labName}${statusText}` : `Booked${statusText}`;
        }).join('\n');
    }

    return <div title={title}>{day}</div>;
}