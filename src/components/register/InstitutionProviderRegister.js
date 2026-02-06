import React, { useState } from 'react'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import { Button } from '@/components/ui'
import devLog from '@/utils/dev/logger'
import {
  notifyInstitutionProviderInviteGenerated,
  notifyInstitutionProviderInviteGenerationFailed,
  notifyInstitutionProviderRegisterMissingUser,
  notifyInstitutionProviderRegisterWalletRequired,
  notifyInstitutionProviderRegistrationFailed,
} from '@/utils/notifications/institutionToasts'

/**
 * Institutional provider registration flow for SSO users
 * NOTE: On-chain provider registration via marketplace is deprecated; handled in institutional backend.
 */
export default function InstitutionProviderRegister() {
  const { user, address, isConnected } = useUser()
  const { addTemporaryNotification } = useNotifications()

  const [isRegistering, setIsRegistering] = useState(false)
  const [txHash, setTxHash] = useState(null)
  const [providerWallet, setProviderWallet] = useState(null)
  const [inviteData, setInviteData] = useState(null)

  const handleRegisterInstitutionProvider = async () => {
    if (!user) {
      notifyInstitutionProviderRegisterMissingUser(addTemporaryNotification)
      return
    }

    if (!address || !isConnected) {
      notifyInstitutionProviderRegisterWalletRequired(addTemporaryNotification)
      return
    }

    setIsRegistering(true)
    setTxHash(null)
    setProviderWallet(null)
    setInviteData(null)

    try {
      // Institutional provider registration is handled in the institutional backend.
      const walletAddress = address
      setProviderWallet(walletAddress || null)

      // Step 1: generate institutional invite token bound to provider wallet
      const inviteResponse = await fetch('/api/institutions/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(walletAddress ? { expectedWallet: walletAddress } : {}),
      })

      if (!inviteResponse.ok) {
        const errorData = await inviteResponse.json().catch(() => ({}))
        const message = errorData?.error || 'Institution registered, but failed to generate invite token'
        notifyInstitutionProviderInviteGenerationFailed(addTemporaryNotification, message)
        setIsRegistering(false)
        return
      }

      const invite = await inviteResponse.json()
      setInviteData(invite)
      notifyInstitutionProviderInviteGenerated(addTemporaryNotification)
      devLog.log('InstitutionProviderRegister: Invite token generated', invite)
    } catch (error) {
      devLog.error('InstitutionProviderRegister: Error during institutional provider registration', error)
      notifyInstitutionProviderRegistrationFailed(
        addTemporaryNotification,
        error?.message || 'Institutional provider registration failed'
      )
    } finally {
      setIsRegistering(false)
    }
  }

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6 mt-6 mb-6">
      <h1 className="text-2xl font-bold text-center mb-4 text-gray-800">
        Register Institution (Provider)
      </h1>
      <p className="text-sm text-gray-600 mb-4">
        Register your institution as a lab provider on-chain. This will grant{' '}
        <code>PROVIDER_ROLE</code> and <code>INSTITUTION_ROLE</code> to the institutional
        provider wallet and initialize its stake (800 $LAB) and treasury (200 $LAB). 
      </p>
      <p className="text-sm text-gray-600 mb-4">
        After registration,
        you will also receive an invite token to configure your{' '}
        <a href="https://github.com/DecentraLabsCom/Blockchain-Services" className="text-brand hover:text-hover-dark underline">institutional wallet and treasury</a>.
      </p>
      <p className="text-sm text-gray-600 mb-4 italic">
        Disclaimer: This should only be used by staff responsible for managing institutional wallets.
      </p>

      {!isConnected && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          To register your institution as a provider you must first connect the
          institutional wallet (e.g. MetaMask).
        </div>
      )}

      <div className="flex justify-center mb-4">
        <Button
          onClick={handleRegisterInstitutionProvider}
          variant="primary"
          size="md"
          width="fit"
          loading={isRegistering}
          disabled={!isConnected}
        >
          {isRegistering ? 'Registering...' : 'Register Institution as Provider'}
        </Button>
      </div>

      {providerWallet && (
        <div className="mt-4 text-xs text-gray-700 space-y-1">
          <p className="font-semibold">Provider Wallet</p>
          <p className="break-all">{providerWallet}</p>
          {txHash && (
            <>
              <p className="font-semibold mt-2">Transaction Hash</p>
              <p className="break-all">{txHash}</p>
            </>
          )}
        </div>
      )}

      {inviteData && (
        <div className="mt-6 border-t border-gray-200 pt-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Institutional Invite Token
          </h2>
          <p className="text-xs text-gray-600 mb-3">
            Use this token in your institutional <code>wallet dashboard</code>
            to link the treasury backend to the on-chain institutional wallet.
          </p>

          <p className="text-xs font-semibold text-gray-700 mb-1">
            Domains in this invite
          </p>
          <ul className="list-disc list-inside text-xs text-gray-700 mb-3">
            {inviteData.organizationDomains?.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>

          {inviteData.expiresAt && (
            <p className="text-xs text-gray-500 mb-3">
              Expires at: {new Date(inviteData.expiresAt).toLocaleString()}
            </p>
          )}

          <p className="text-xs font-semibold text-gray-700 mb-1">
            Invite Token
          </p>
          <textarea
            className="w-full text-xs font-mono border rounded p-2 bg-gray-50 mb-3"
            value={inviteData.token || ''}
            readOnly
            rows={3}
          />
        </div>
      )}
    </div>
  )
}
