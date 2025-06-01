import React from "react";
import Link from "next/link";
import ConfirmModal from "./ConfirmModal";

const LabBookingItem = React.memo(function LabBookingItem({ lab, booking, onCancel, onRefund, isModalOpen,
    closeModal }) {
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
                <div className="flex flex-col md:flex-row gap-2 mt-2 md:mt-0">
                <button
                    onClick={() => onCancel(lab.id)}
                    className="bg-[#a87583] text-white px-3 py-1 rounded hover:bg-[#8a5c66] text-sm"
                >
                    Cancel Booking
                </button>
                <button
                    onClick={() => onRefund(lab.id)}
                    className="bg-[#bcc4fc] text-white px-3 py-1 rounded hover:bg-[#aab8e6] text-sm"
                >
                    Apply for Refund
                </button>
                </div>
            </div>
            {isModalOpen === "cancel" && (
                <ConfirmModal
                isOpen={isModalOpen}
                onClose={closeModal}
                onContinue={() => {
                    onCancel(lab.id);
                    closeModal();
                }}
                />
            )}
            {isModalOpen === "refund" && (
                <ConfirmModal
                isOpen={isModalOpen}
                onClose={closeModal}
                onContinue={() => {
                    onRefund(lab.id);
                    closeModal();
                }}
                />
            )}
        </li>
    );
});

export default LabBookingItem;