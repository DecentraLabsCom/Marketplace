"use client";
import { useEffect, useState } from 'react'

export default function Cancellation() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    
      const openModal = () => {
        setIsModalOpen(true);
      };
    
      const closeModal = () => {
        setIsModalOpen(false);
      };
    
      // Close modal on Escape key press
      useEffect(() => {
        const handleKeyDown = (event) => {
          if (event.key === 'Escape') {
            setIsModalOpen(false);
          }
        };
    
        if (isModalOpen) {
          window.addEventListener('keydown', handleKeyDown);
        }
    
        return () => {
          window.removeEventListener('keydown', handleKeyDown);
        };
      }, [isModalOpen]);

    return (
        <button onClick={openModal} className='p-3 rounded text-sm bg-[#a87583] hover:bg-[#8a5c66]
        text-white'>
        {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                <div className="bg-white rounded-lg shadow-lg p-6 w-96"
                onClick={(e) => e.stopPropagation()}>
                    <h2 className="text-lg text-gray-800 font-bold mb-4">
                    Are you sure you want to proceed?</h2>
                    <div className="flex flex-row pt-4 justify-between px-10">
                    {/* No onClick: Implement missing cancellation procedure logic here */}
                    <button className='px-3 mr-3 py-1 text-lg bg-green-500 hover:bg-green-300
                    text-white'>Continue</button>
                    <button onClick={closeModal} className='px-5 mr-3 py-1 text-lg bg-red-500 hover:bg-red-300
                    text-white'>Cancel</button>
                    </div>
                </div>
                </div>
            )}
        Cancel Booking
        </button>
    );
}