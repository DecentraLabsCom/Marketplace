import React from "react";
import Link from "next/link";
import ConfirmModal from "@/components/ConfirmModal";
import devLog from '@/utils/logger';

const LabBookingItem = React.memo(function LabBookingItem({ 
    lab, 
    booking, 
    startTime,
    endTime,
    onCancel, 
    onRefund, 
    onConfirmRefund,
    isModalOpen,
    closeModal,
    onClearError
}) {
    // Determine status display
    const getStatusDisplay = () => {
        // Check direct booking status first (if available)
        if (booking.status === "4" || booking.status === 4) {
            return {
                text: "Cancelled",
                className: "bg-red-100 text-red-800 border-red-200",
                icon: "❌"
            };
        }
        
        if (booking.status === "3" || booking.status === 3) {
            return {
                text: "Collected",
                className: "bg-purple-100 text-purple-800 border-purple-200",
                icon: "🎯"
            };
        }
        
        if (booking.status === "2" || booking.status === 2) {
            return {
                text: "Used",
                className: "bg-green-100 text-green-800 border-green-200",
                icon: "✅"
            };
        }
        
        if (booking.status === "1" || booking.status === 1) {
            return {
                text: "Confirmed",
                className: "bg-blue-100 text-blue-800 border-blue-200",
                icon: "✓"
            };
        }
        
        if (booking.status === "0" || booking.status === 0) {
            return {
                text: "Pending",
                className: "bg-orange-100 text-orange-800 border-orange-200",
                icon: "⏳"
            };
        }
        
        // Default fallback if no status is available
        return {
            text: "Pending Confirmation",
            className: "bg-yellow-100 text-yellow-800 border-yellow-200",
            icon: "⏳"
        };
    };

    const statusDisplay = getStatusDisplay();

    return (
        <li className={`flex flex-col items-center border rounded-lg p-4 mb-4 bg-white shadow ${booking.hasCancellationError ? 'border-red-500 bg-red-50' : ''}`}>
            {booking.hasCancellationError && (
                <div className="w-full mb-2 p-2 bg-red-100 border border-red-300 rounded text-red-700 text-sm flex justify-between items-center">
                    <span>⚠️ Cancellation failed. Please try again.</span>
                    {onClearError && (
                        <button 
                            onClick={() => onClearError(booking.reservationKey)}
                            className="text-red-500 hover:text-red-700 font-bold text-lg leading-none"
                            title="Clear error"
                        >
                            ×
                        </button>
                    )}
                </div>
            )}
            <div className="w-full flex flex-col md:flex-row items-center justify-between">
                <div className="flex-1">
                <Link
                    href={`/lab/${lab.id}`}
                    className="text-lg font-semibold text-[#715c8c] hover:underline"
                >
                    {lab.name}
                </Link>
                <div className="text-gray-600 text-sm mt-1">
                    {booking?.date} {startTime && endTime ? `${startTime} - ${endTime}` : 'Time not available'}
                </div>
                <div className="text-gray-500 text-xs">
                    Provider: {lab.provider}
                </div>
                </div>
                <div className="flex flex-col md:flex-row gap-2 mt-2 md:mt-0 items-center">
                {/* Reservation Status */}
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${statusDisplay.className}`}>
                    <span className="mr-1">{statusDisplay.icon}</span>
                    {statusDisplay.text}
                </span>
                {/* Show cancel button for booked or pending reservations (not canceled) */}
                {typeof onCancel === "function" && 
                 booking.status !== "4" && booking.status !== 4 && // Not canceled
                 (booking.status === "0" || booking.status === 0 || booking.status === "1" || booking.status === 1) && ( // PENDING or BOOKED
                    <button
                        onClick={() => {
                            // Log critical action for debugging
                            devLog.log('Cancel booking action:', { labId: lab.id, bookingStatus: booking.status });
                            onCancel(booking);
                        }}
                        className="bg-[#a87583] text-white px-3 py-1 rounded hover:bg-[#8a5c66] text-sm"
                    >
                        {(booking.status === "1" || booking.status === 1) ? "Cancel Booking" : "Cancel Request"}
                    </button>
                )}
                {/* Only show refund button for reservations that have a key and are not canceled */}
                {typeof onRefund === "function" && booking.reservationKey && 
                 booking.status !== "4" && booking.status !== 4 && ( // Not canceled
                    <button
                        onClick={() => onRefund(lab.id, booking)}
                        className="bg-[#bcc4fc] text-white px-3 py-1 rounded hover:bg-[#aab8e6] text-sm"
                    >
                        Apply for Refund
                    </button>
                )}
                </div>
            </div>
            {isModalOpen && (
                <ConfirmModal
                    isOpen={isModalOpen}
                    onClose={closeModal}
                    onContinue={() => {
                        if (typeof onConfirmRefund === "function") {
                            devLog.log('Confirming refund request');
                            onConfirmRefund();
                        } else {
                            devLog.error('No refund confirm function available');
                        }
                        // Don't call closeModal here - let the parent handle it
                    }}
                />
            )}
        </li>
    );
});

export default LabBookingItem;
