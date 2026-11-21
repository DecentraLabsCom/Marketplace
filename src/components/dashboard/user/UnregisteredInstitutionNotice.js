'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Modal from '@/components/ui/Modal'
import { useUser } from '@/context/UserContext'

export default function UnregisteredInstitutionNotice() {
  const { isSSO, institutionRegistrationStatus } = useUser()
  const [isOpen, setIsOpen] = useState(false)
  const shouldShow = isSSO && institutionRegistrationStatus === 'unregistered'

  useEffect(() => {
    setIsOpen(shouldShow)
  }, [shouldShow])

  const closeNotice = () => setIsOpen(false)

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeNotice}
      title="Your institution is not registered yet"
      size="lg"
      portal
      zIndex={100}
    >
      <div className="space-y-4 text-gray-700">
        <p>
          Your university authenticated you with SSO, but it does not yet have
          an institutional wallet registered with DecentraLabs as a consumer or
          provider.
        </p>
        <p>
          You can browse the Marketplace catalogue. Your institution must
          complete registration before you can make reservations or manage
          provider laboratories.
        </p>
        <p>
          Contact an authorized representative at your university about
          registering its institutional account. Or send a request to{' '}
          <a
            href="mailto:contact@nebsyst.com"
            className="font-medium text-brand underline"
          >
            contact@nebsyst.com
          </a>{' '}
          for us to take care of it for you.
        </p>
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={closeNotice}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
          <Link
            href="/"
            onClick={closeNotice}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-hover-dark"
          >
            Browse Marketplace
          </Link>
        </div>
      </div>
    </Modal>
  )
}
