"use client";
import { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useUser } from '@/context/UserContext';
import { useNotifications } from '@/context/NotificationContext';
import devLog from '@/utils/dev/logger';
import { hasAdminRole } from '@/utils/auth/roleValidation';

/**
 * Dashboard card to generate and display provisioning token
 * for SSO institutional staff. Token is consumed by the
 * blockchain-services wallet dashboard to auto-fill and lock
 * provider configuration fields.
 */
export default function InstitutionInviteCard({ className = '' }) {
  const { isSSO, user } = useUser();
  const { addErrorNotification, addSuccessNotification } = useNotifications();

  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [payload, setPayload] = useState(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState('');
  const [providerCountry, setProviderCountry] = useState('');

  const isInstitutionAdmin = isSSO && user && hasAdminRole(user.role, user.scopedRole);

  const handleGenerateInvite = useCallback(async () => {
    if (!isSSO || !isInstitutionAdmin) {
      addErrorNotification('Provisioning token is only available for authorized institutional staff (SSO)', '');
      return;
    }

    if (!publicBaseUrl || !publicBaseUrl.trim().startsWith('https://')) {
      addErrorNotification('Public base URL (https://) is required', '');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/institutions/provisionToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          publicBaseUrl: publicBaseUrl.trim(),
          providerCountry: providerCountry.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = data?.error || 'Failed to generate provisioning token';
        addErrorNotification(message, '');
        setToken(null);
        setExpiresAt(null);
        setPayload(null);
        return;
      }

      const data = await response.json();
      setToken(data.token);
      setExpiresAt(data.expiresAt);
      setPayload(data.payload || null);

      devLog.log('InstitutionInviteCard: Provisioning token generated', data);
      addSuccessNotification('Provisioning token generated successfully', '');
    } catch (error) {
      devLog.error('InstitutionInviteCard: Failed to generate provisioning token', error);
      addErrorNotification(error, 'Failed to generate provisioning token');
      setToken(null);
      setExpiresAt(null);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [isSSO, isInstitutionAdmin, addErrorNotification, addSuccessNotification, publicBaseUrl, providerCountry]);

  const handleCopy = useCallback(() => {
    if (!token) return;
    try {
      navigator.clipboard.writeText(token);
      addSuccessNotification('Provisioning token copied to clipboard', '');
    } catch (error) {
      devLog.error('InstitutionInviteCard: Failed to copy provisioning token', error);
      addErrorNotification('Failed to copy provisioning token to clipboard', '');
    }
  }, [token, addSuccessNotification, addErrorNotification]);

  // Only show the card for SSO users with institutional admin roles
  if (!isInstitutionAdmin) {
    return null;
  }

  return (
    <div className={`bg-white shadow-md rounded-lg p-6 mt-6 mb-6 ${className}`}>
      <h1 className="text-2xl font-bold text-center mb-4 text-gray-800">
        Provisioning Token (Provider)
      </h1>
      <p className="text-sm text-gray-600 mb-4">
        Generate a short-lived provisioning token to auto-fill the{' '}
        <a href="https://github.com/DecentraLabsCom/Blockchain-Services" className="text-brand hover:text-hover-dark underline">blockchain-services wallet dashboard</a> with your institution metadata.
      </p>
      <p className="text-sm text-gray-600 mb-4 italic">
        Disclaimer: This should only be used by staff responsible for managing institutional wallets.
      </p>

      <div className="space-y-3 mb-4">
        <label className="block text-xs font-semibold text-gray-700">
          Public base URL (https://)
          <input
            className="mt-1 w-full border rounded p-2 text-sm"
            type="url"
            value={publicBaseUrl}
            onChange={(e) => setPublicBaseUrl(e.target.value)}
            placeholder="https://institution.example.edu/auth"
          />
        </label>

        <label className="block text-xs font-semibold text-gray-700">
          Provider country (ISO, optional)
          <input
            className="mt-1 w-full border rounded p-2 text-sm"
            type="text"
            value={providerCountry}
            onChange={(e) => setProviderCountry(e.target.value)}
            placeholder="ES"
          />
        </label>
      </div>

      <div className="flex justify-center mb-4">
        <button
          type="button"
          onClick={handleGenerateInvite}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 bg-brand text-white text-sm font-medium rounded-md hover:bg-hover-dark disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Generating...' : 'Generate Provisioning Token'}
        </button>
      </div>

      {token && (
        <div className="mt-4 space-y-3">
          {expiresAt && (
            <p className="text-xs text-gray-500">
              Expires at: {new Date(expiresAt).toLocaleString()}
            </p>
          )}

          {payload && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-700">
              <div className="border rounded p-2 bg-gray-50">
                <p className="font-semibold">Marketplace</p>
                <p>{payload.marketplaceBaseUrl}</p>
              </div>
              <div className="border rounded p-2 bg-gray-50">
                <p className="font-semibold">Public base URL</p>
                <p>{payload.publicBaseUrl}</p>
              </div>
              <div className="border rounded p-2 bg-gray-50">
                <p className="font-semibold">Provider</p>
                <p>{payload.providerName}</p>
                <p>{payload.providerEmail}</p>
              </div>
              <div className="border rounded p-2 bg-gray-50">
                <p className="font-semibold">Organization / Country</p>
                <p>{payload.providerOrganization}</p>
                <p>{payload.providerCountry}</p>
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1">
              Provisioning Token
            </p>
            <div className="flex items-center gap-2">
              <textarea
                className="flex-1 text-xs font-mono border rounded p-2 bg-gray-50"
                value={token}
                readOnly
                rows={3}
              />
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-2 text-xs bg-gray-800 text-white rounded-md hover:bg-gray-900"
              >
                Copy
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Paste this token into the <strong>Provisioning Token</strong> section of the blockchain-services wallet dashboard modal to lock fields and auto-register.
          </p>
        </div>
      )}
    </div>
  );
}

InstitutionInviteCard.propTypes = {
  className: PropTypes.string,
};
