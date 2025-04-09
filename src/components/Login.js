import { useState, useEffect } from 'react';
import { Account } from '../utils/account';
import { WalletLogin } from './WalletLogin';
import { InstitutionalLogin } from './InstitutionalLogin';
import { FaSignInAlt } from 'react-icons/fa';

export default function Login({ isConnected, user }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const toggleModal = () => {
    setIsModalOpen(!isModalOpen);
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

  if (isConnected) return <Account isConnected = {isConnected} />;
  if (user) return <Account username = {user.name} />;;

  return (
    <div>
      {/* Login Button */}
      <button onClick={toggleModal} className="bg-[#715c8c] text-white font-bold rounded-lg px-4 py-2 flex
        items-center space-x-2 transition duration-300 ease-in-out hover:bg-[#333f63] hover:text-white">
        <FaSignInAlt className="h-5 w-5" />
        <span>Login</span>
      </button>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50"
        onClick={toggleModal}>
          <div className="bg-white rounded-lg shadow-lg p-6 w-96"
          onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Choose Login Method</h2>
            <div className="flex flex-col space-y-4">
              {/* Wallet Login */}
              <WalletLogin setIsModalOpen={setIsModalOpen} />
              {/* Institutional Login */}
              <InstitutionalLogin setIsModalOpen={setIsModalOpen} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}