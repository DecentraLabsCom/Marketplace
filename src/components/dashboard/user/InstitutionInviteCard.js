"use client";
import { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useUser } from '@/context/UserContext';
import { useNotifications } from '@/context/NotificationContext';
import devLog from '@/utils/dev/logger';
import { hasAdminRole } from '@/utils/auth/roleValidation';

/**
 * Dashboard card to generate and display institutional invite token
 * for SSO users with appropriate institutional roles.
 */
export default function InstitutionInviteCard({ className = '' }) {
  const { isSSO, user } = useUser();
  const { addErrorNotification, addSuccessNotification } = useNotifications();

  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [domains, setDomains] = useState([]);

  const isInstitutionAdmin = isSSO && user && hasAdminRole(user.role, user.scopedRole);

  const handleGenerateInvite = useCallback(async () => {
    if (!isSSO || !isInstitutionAdmin) {
      addErrorNotification('Institutional invite is only available for authorized institutional staff (SSO)', '');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/institutions/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = data?.error || 'Failed to generate institution invite token';
        addErrorNotification(message, '');
        setToken(null);
        setExpiresAt(null);
        setDomains([]);
        return;
      }

      const data = await response.json();
      setToken(data.token);
      setExpiresAt(data.expiresAt);
      setDomains(data.organizationDomains || []);

      devLog.log('InstitutionInviteCard: Invite token generated', data);
      addSuccessNotification('Institution invite token generated successfully', '');
    } catch (error) {
      devLog.error('InstitutionInviteCard: Failed to generate invite token', error);
      addErrorNotification(error, 'Failed to generate institution invite token');
      setToken(null);
      setExpiresAt(null);
      setDomains([]);
    } finally {
      setLoading(false);
    }
  }, [isSSO, isInstitutionAdmin, addErrorNotification, addSuccessNotification]);

  const handleCopy = useCallback(() => {
    if (!token) return;
    try {
      navigator.clipboard.writeText(token);
      addSuccessNotification('Invite token copied to clipboard', '');
    } catch (error) {
      devLog.error('InstitutionInviteCard: Failed to copy token', error);
      addErrorNotification('Failed to copy token to clipboard', '');
    }
  }, [token, addSuccessNotification, addErrorNotification]);

  // Only show the card for SSO users with institutional admin roles
  if (!isInstitutionAdmin) {
    return null;
  }

  return (
    <div className={`bg-white shadow-md rounded-lg p-6 mt-6 mb-6 ${className}`}>
      <h1 className="text-2xl font-bold text-center mb-4 text-gray-800">
        Register Institution (Consumer)
      </h1>
      <p className="text-sm text-gray-600 mb-4">
        Generate a short-lived invite token so your institution can configure the{' '}
        <a href="https://github.com/DecentraLabsCom/Blockchain-Services" className="text-brand hover:text-hover-dark underline">institutional wallet and treasury</a> backend and obtain{' '}
        <code>INSTITUTION_ROLE</code> on-chain as a consumer. 
      </p>
      <p className="text-sm text-gray-600 mb-4 italic">
        Disclaimer: This should only be used by staff responsible for managing institutional wallets.
      </p>

      <div className="flex justify-center mb-4">
        <button
          type="button"
          onClick={handleGenerateInvite}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 bg-brand text-white text-sm font-medium rounded-md hover:bg-hover-dark disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Generating...' : 'Generate Invite Token'}
        </button>
      </div>

      {token && (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1">
              Domains in this invite
            </p>
            <ul className="list-disc list-inside text-xs text-gray-700">
              {domains.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>

          {expiresAt && (
            <p className="text-xs text-gray-500">
              Expires at: {new Date(expiresAt).toLocaleString()}
            </p>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1">
              Invite Token
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
            Paste this token into the <strong>Institution Invite</strong> card inside
            your institutional <code>wallet dashboard</code> to complete onboarding.
          </p>
        </div>
      )}
    </div>
  );
}

InstitutionInviteCard.propTypes = {
  className: PropTypes.string,
};
