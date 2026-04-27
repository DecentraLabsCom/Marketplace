"use client";
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { FaSignInAlt } from 'react-icons/fa'
import { useUser } from '@/context/UserContext'
import Account from '@/utils/auth/account'
import { Button, Card, CardHeader, CardContent } from '@/components/ui'

const InstitutionalLogin = dynamic(() => import('@/components/auth/InstitutionalLogin'), {
  ssr: false,
  loading: () => <div className="text-sm text-neutral-500">Loading institutional login...</div>
});
const EntraLoginButton = dynamic(() => import('@/components/auth/EntraLoginButton'), {
  ssr: false,
  loading: () => null,
});

/**
 * Main login component for institutional authentication.
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

  if (isLoggedIn) {
    return <Account />;
  }

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
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 animate-fadeIn transition starting:opacity-0 opacity-100 sm:items-center sm:p-4"
          onClick={toggleModal}
        >
          <Card 
            variant="modal"
            className="my-auto w-[min(24rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] overflow-y-auto transition duration-300 starting:opacity-0 opacity-100 sm:max-h-[calc(100dvh-2rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader title="Institutional Login" />
            <CardContent>
              <div className="flex flex-col space-y-3">
                <InstitutionalLogin setIsModalOpen={setIsModalOpen} />
                {/* Microsoft Entra ID — shown when NEXT_PUBLIC_ENTRA_ENABLED=true */}
                {process.env.NEXT_PUBLIC_ENTRA_ENABLED === 'true' && (
                  <EntraLoginButton setIsModalOpen={setIsModalOpen} />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Login component doesn't accept any props
Login.propTypes = {}
