import React from 'react';

export default function FeedbackModal({ isOpen, message, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-semibold mb-4 text-center text-green-700">Success</h2>
        <p className="text-center text-gray-800 mb-6">{message}</p>
        <div className="flex justify-center">
          <button onClick={onClose}
            className="bg-[#715c8c] text-white rounded-md px-6 py-2 hover:bg-[#ad8ed4]">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}