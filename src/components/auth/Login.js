"use client";
import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { FaSignInAlt } from 'react-icons/fa'
import { useUser } from '@/context/UserContext'
import Account from '@/utils/auth/account'
import { Button, Card, CardHeader, CardContent } from '@/components/ui'

const InstitutionalLogin = dynamic(() => import('@/components/auth/InstitutionalLogin'), {
  ssr: false,
  loading: () => <div className="text-sm text-neutral-500">Loading institutional login...</div>
});

/**
 * Main login component for institutional authentication.
 * @returns {JSX.Element} Login button and modal interface
 */
export default function Login() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)
  const toggleModal = () => setIsModalOpen((open) => !open);

  const { isLoggedIn } = useUser();

  // Keep keyboard focus inside the dialog and return it to the trigger on close.
  useEffect(() => {
    if (!isModalOpen) return undefined

    previousFocusRef.current = document.activeElement
    const dialog = dialogRef.current
    const focusableSelector = [
      'a[href]',
      'area[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')

    dialog?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsModalOpen(false)
        return
      }

      if (event.key !== 'Tab' || !dialog) return

      const focusable = Array.from(dialog.querySelectorAll(focusableSelector))
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus()
      }
    }
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
          ref={dialogRef}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 animate-fadeIn transition starting:opacity-0 opacity-100 sm:items-center sm:p-4"
          onClick={() => setIsModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Institutional Login"
          tabIndex={-1}
        >
          <Card 
            variant="modal"
            className="my-auto w-[min(24rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] overflow-y-auto transition duration-300 starting:opacity-0 opacity-100 sm:max-h-[calc(100dvh-2rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader title="Institutional Login" />
            <CardContent>
              <InstitutionalLogin setIsModalOpen={setIsModalOpen} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Login component doesn't accept any props
Login.propTypes = {}
