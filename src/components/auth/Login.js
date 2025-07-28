"use client";
import { useState, useEffect } from 'react'
import { FaSignInAlt } from 'react-icons/fa'
import { useUser } from '@/context/UserContext'
import WalletLogin from '@/components/auth/WalletLogin'
import InstitutionalLogin from '@/components/auth/InstitutionalLogin'
import Account from '@/utils/auth/account'
import { Button, Card, CardHeader, CardContent, Stack } from '@/components/ui'

/**
 * Main login component that provides multiple authentication methods
 * Renders a login button that opens a modal with wallet and institutional login options
 * @returns {JSX.Element} Login button and modal interface
 */
export default function Login() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const toggleModal = () => setIsModalOpen(!isModalOpen);

  const { isLoggedIn } = useUser();

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsModalOpen(false);
    };

    if (isModalOpen) window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  if (isLoggedIn) return <Account />;

  return (
    <div>
      {/* Login Button */}
      <Button 
        variant="primary" 
        onClick={toggleModal}
        className="flex items-center space-x-2"
      >
        <FaSignInAlt className="size-5" />
        <span>Login</span>
      </Button>

      {/* Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex justify-center items-center z-50"
          onClick={toggleModal}
        >
          <Card 
            variant="modal"
            className="w-96"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader title="Choose Login Method" />
            <CardContent>
              <Stack spacing="md">
                <WalletLogin setIsModalOpen={setIsModalOpen} />
                <InstitutionalLogin setIsModalOpen={setIsModalOpen} />
              </Stack>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Login component doesn't accept any props
Login.propTypes = {}
