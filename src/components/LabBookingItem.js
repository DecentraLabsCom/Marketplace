import React from "react";
import Link from "next/link";
import ConfirmModal from "@/components/ConfirmModal";

const LabBookingItem = React.memo(function LabBookingItem({ 
    lab, 
    booking, 
    onCancel, 
    onRefund, 
    onConfirmRefund,
    isModalOpen,
    closeModal,
    reservationStatus = null // New prop for reservation status
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
        
        // Fall back to reservationStatus if no direct booking status
        if (!reservationStatus || !reservationStatus.exists) {
            return {
                text: "Pending Confirmation",
                className: "bg-yellow-100 text-yellow-800 border-yellow-200",
                icon: "⏳"
            };
        }
        
        if (reservationStatus.isPending) {
            return {
                text: "Pending",
                className: "bg-orange-100 text-orange-800 border-orange-200",
                icon: "⏳"
            };
        }
        
        if (reservationStatus.isCanceled) {
            return {
                text: "Cancelled",
                className: "bg-red-100 text-red-800 border-red-200",
                icon: "❌"
            };
        }
        
        if (reservationStatus.isUsed) {
            return {
                text: "Used",
                className: "bg-green-100 text-green-800 border-green-200",
                icon: "✅"
            };
        }
        
        if (reservationStatus.isCollected) {
            return {
                text: "Collected",
                className: "bg-purple-100 text-purple-800 border-purple-200",
                icon: "🎯"
            };
        }
        
        if (reservationStatus.isBooked) {
            return {
                text: "Confirmed",
                className: "bg-blue-100 text-blue-800 border-blue-200",
                icon: "✓"
            };
        }
        
        return {
            text: "Unknown Status",
            className: "bg-gray-100 text-gray-800 border-gray-200",
            icon: "❓"
        };
    };

    const statusDisplay = getStatusDisplay();

    return (
        <li className="flex flex-col items-center border rounded-lg p-4 mb-4 bg-white shadow">
            <div className="w-full flex flex-col md:flex-row items-center justify-between">
                <div className="flex-1">
                <Link
                    href={`/lab/${lab.id}`}
                    className="text-lg font-semibold text-[#715c8c] hover:underline"
                >
                    {lab.name}
                </Link>
                <div className="text-gray-600 text-sm mt-1">
                    {booking?.date} {booking?.time} ({booking?.minutes} min)
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
                {/* Show cancel button for booked reservations or cancel request for pending ones (both in contract and local) */}
                {typeof onCancel === "function" && (
                    (reservationStatus?.isBooked || reservationStatus?.isPending || (!reservationStatus || !reservationStatus.exists)) && 
                    !reservationStatus?.isCanceled && // Don't show cancel button if already canceled
                    booking.status !== "4" && booking.status !== 4 && // Also check direct booking status
                        <button
                            onClick={() => {
                                console.log('Cancel button clicked, executing cancellation:', { labId: lab.id, booking });
                                onCancel(booking);
                            }}
                            className="bg-[#a87583] text-white px-3 py-1 rounded hover:bg-[#8a5c66] text-sm"
                        >
                            {reservationStatus?.isBooked ? "Cancel Booking" : "Cancel Request"}
                        </button>
                )}
                {/* Only show refund button for reservations that existed in the contract and are not canceled */}
                {typeof onRefund === "function" && reservationStatus?.exists && 
                 !reservationStatus?.isCanceled && // Don't show refund button if canceled
                 booking.status !== "4" && booking.status !== 4 && ( // Also check direct booking status
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
                        console.log('Modal continue clicked for refund');
                        if (typeof onConfirmRefund === "function") {
                            console.log('Calling onConfirmRefund');
                            onConfirmRefund();
                        } else {
                            console.error('No refund confirm function available');
                        }
                        // Don't call closeModal here - let the parent handle it
                    }}
                />
            )}
        </li>
    );
});

export default LabBookingItem;