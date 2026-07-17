"use client";
import { useState, useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useUser } from '@/context/UserContext';
import { useNotifications } from '@/context/NotificationContext';
import ProvisioningTrustReviewModal from '@/components/institutions/ProvisioningTrustReviewModal';
import devLog from '@/utils/dev/logger';
import { hasInstitutionRegistrationPrivilege } from '@/utils/auth/roleValidation';
import { inferCountryFromDomain } from '@/utils/country/inferCountryFromDomain';
import {
  notifyInstitutionClipboardUnavailable,
  notifyInstitutionProvisioningAccessDenied,
  notifyInstitutionProvisioningGenerated,
  notifyInstitutionProvisioningGenerationFailed,
  notifyInstitutionPublicBaseUrlRequired,
  notifyInstitutionTokenCopied,
  notifyInstitutionTokenCopyFailed,
} from '@/utils/notifications/institutionToasts';

function normalizeInstitutionLabel(name, organizationDomain) {
  if (!name || typeof name !== 'string') {
    return '';
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return '';
  }
  const normalizedOrg = (organizationDomain || '').trim().toLowerCase();
  if (normalizedOrg && trimmed.toLowerCase() === normalizedOrg) {
    const firstSegment = normalizedOrg.split('.')[0];
    return firstSegment ? firstSegment.toUpperCase() : trimmed;
  }
  return trimmed;
}

function normalizeOriginForReview(value) {
  if (!value || typeof value !== 'string' || !value.trim()) return null
  let candidate = value.trim()
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`
  try {
    const parsed = new URL(candidate)
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) return null
    return parsed.origin
  } catch {
    return null
  }
}

/**
 * Dashboard card to generate and display provisioning token
 * for SSO institutional staff. Token is consumed by the
 * blockchain-services wallet dashboard to auto-fill and lock
 * provider configuration fields.
 */
export default function InstitutionInviteCard({
  className = '',
  defaultTokenType = 'provider',
  lockTokenType = false,
  autoGenerate = false,
}) {
  const { isSSO, user } = useUser();
  const { addTemporaryNotification } = useNotifications();

  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [payload, setPayload] = useState(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [providerCountry, setProviderCountry] = useState('');
  const [trustReview, setTrustReview] = useState(null);
  // Guard: inferred-country pre-fill runs only once per session so the user
  // can clear/override the suggested value without it being re-applied.
  const inferredPrefillDoneRef = useRef(false);
  const detectedCountry =
    user?.country ||
    user?.organizationCountry ||
    user?.countryCode ||
    user?.organizationCountryCode ||
    '';
  // Fallback: infer from schacHomeOrganization / affiliation ccTLD if SAML
  // did not provide a country attribute.
  const inferredCountry = detectedCountry
    ? ''
    : inferCountryFromDomain(
        user?.affiliation || user?.schacHomeOrganization || ''
      ) || '';

  const canRegisterInstitution = isSSO && user && hasInstitutionRegistrationPrivilege(user);

  const issueProviderToken = useCallback(async () => {
    if (!isSSO || !canRegisterInstitution) {
      notifyInstitutionProvisioningAccessDenied(addTemporaryNotification, 'provider');
      return;
    }

    if (!publicBaseUrl || !publicBaseUrl.trim()) {
      notifyInstitutionPublicBaseUrlRequired(addTemporaryNotification);
      return;
    }
    if (!walletAddress || !walletAddress.trim()) {
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
          walletAddress: walletAddress.trim(),
          providerCountry: providerCountry.trim() || detectedCountry || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = data?.error || 'Failed to generate provisioning token';
        notifyInstitutionProvisioningGenerationFailed(addTemporaryNotification, 'provider', message);
        setToken(null);
        setExpiresAt(null);
        setPayload(null);
        return;
      }

      const data = await response.json();
      setToken(data.token);
      setExpiresAt(data.expiresAt);
      setPayload(data.payload || null);

      notifyInstitutionProvisioningGenerated(addTemporaryNotification, 'provider');
    } catch (error) {
      devLog.error('InstitutionInviteCard: Failed to generate provisioning token', error);
      notifyInstitutionProvisioningGenerationFailed(
        addTemporaryNotification,
        'provider',
        error?.message || 'Failed to generate provisioning token'
      );
      setToken(null);
      setExpiresAt(null);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [
    isSSO,
    canRegisterInstitution,
    addTemporaryNotification,
    publicBaseUrl,
    walletAddress,
    providerCountry,
    detectedCountry,
  ]);

  const handleCopy = useCallback(async () => {
    if (!token) return false;
    if (!navigator?.clipboard?.writeText) {
      notifyInstitutionClipboardUnavailable(addTemporaryNotification);
      return false;
    }
    try {
      await navigator.clipboard.writeText(token);
      notifyInstitutionTokenCopied(addTemporaryNotification);
      return true;
    } catch (error) {
      devLog.error('InstitutionInviteCard: Failed to copy provisioning token', error);
      notifyInstitutionTokenCopyFailed(addTemporaryNotification);
      return false;
    }
  }, [token, addTemporaryNotification]);

  const [tokenType, setTokenType] = useState(defaultTokenType); // 'provider' or 'consumer'
  const [consumerName, setConsumerName] = useState('');
  const autoGeneratedRef = useRef(false);
  const lastCopiedTokenRef = useRef(null);
  const payloadInstitution = payload?.institutionId || '';
  const rawInstitutionName = payload
    ? (payload.registrationType === 'consumer' ? payload.consumerName : payload.providerName)
    : '';
  const displayInstitutionName = normalizeInstitutionLabel(
    rawInstitutionName || payloadInstitution,
    payloadInstitution
  );
  const hasInstitutionName = Boolean(rawInstitutionName || payloadInstitution);
  const responsiblePerson =
    payload?.responsiblePerson ||
    user?.name ||
    user?.email ||
    payload?.providerEmail ||
    '';
  const countryLabel = payload?.providerCountry || payload?.consumerCountry || '';

  useEffect(() => {
    if (!token || lastCopiedTokenRef.current === token) {
      return;
    }

    let isActive = true;

    const copyToken = async () => {
      const copied = await handleCopy();
      if (isActive && copied) {
        lastCopiedTokenRef.current = token;
      }
    };

    copyToken();

    return () => {
      isActive = false;
    };
  }, [token, handleCopy]);


  useEffect(() => {
    setTokenType(defaultTokenType);
  }, [defaultTokenType]);

  useEffect(() => {
    if (!user) return;

    const defaultInstitutionName =
      user.organizationName ||
      user.institutionName ||
      user.name ||
      user.affiliation ||
      user.schacHomeOrganization ||
      '';

    const defaultPublicBaseUrl =
      user.publicBaseUrl ||
      user.institutionPublicBaseUrl ||
      user.providerPublicBaseUrl ||
      '';

    if (!consumerName && defaultInstitutionName) {
      setConsumerName(defaultInstitutionName);
    }

    if (!providerCountry && detectedCountry) {
      // SAML-sourced country: always re-apply (field is hidden so user can't clear it).
      setProviderCountry(detectedCountry);
    } else if (!inferredPrefillDoneRef.current && !providerCountry && inferredCountry) {
      // Domain-inferred country: apply once so the user can freely edit/clear it.
      setProviderCountry(inferredCountry);
      inferredPrefillDoneRef.current = true;
    }

    if (!publicBaseUrl && defaultPublicBaseUrl) {
      setPublicBaseUrl(defaultPublicBaseUrl);
    }
    if (!walletAddress && user.wallet) {
      setWalletAddress(user.wallet);
    }
  }, [user, consumerName, providerCountry, publicBaseUrl, walletAddress, detectedCountry, inferredCountry]);

  const issueConsumerToken = useCallback(async () => {
    if (!isSSO || !canRegisterInstitution) {
      notifyInstitutionProvisioningAccessDenied(addTemporaryNotification, 'consumer');
      return;
    }

    if (!publicBaseUrl || !publicBaseUrl.trim()) {
      notifyInstitutionPublicBaseUrlRequired(addTemporaryNotification);
      return;
    }
    if (!walletAddress || !walletAddress.trim()) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/institutions/provisionConsumer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          consumerName: consumerName.trim() || undefined,
          publicBaseUrl: publicBaseUrl.trim(),
          walletAddress: walletAddress.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = data?.error || 'Failed to generate consumer provisioning token';
        notifyInstitutionProvisioningGenerationFailed(addTemporaryNotification, 'consumer', message);
        setToken(null);
        setExpiresAt(null);
        setPayload(null);
        return;
      }

      const data = await response.json();
      setToken(data.token);
      setExpiresAt(data.expiresAt);
      setPayload(data.payload || null);

      notifyInstitutionProvisioningGenerated(addTemporaryNotification, 'consumer');
    } catch (error) {
      devLog.error('InstitutionInviteCard: Failed to generate consumer provisioning token', error);
      notifyInstitutionProvisioningGenerationFailed(
        addTemporaryNotification,
        'consumer',
        error?.message || 'Failed to generate consumer provisioning token'
      );
      setToken(null);
      setExpiresAt(null);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [
    isSSO,
    canRegisterInstitution,
    addTemporaryNotification,
    consumerName,
    publicBaseUrl,
    walletAddress,
  ]);

  const openTrustReview = useCallback((registrationType) => {
    if (!isSSO || !canRegisterInstitution) {
      notifyInstitutionProvisioningAccessDenied(addTemporaryNotification, registrationType);
      return;
    }
    const backendOrigin = normalizeOriginForReview(publicBaseUrl)
    if (!backendOrigin) {
      notifyInstitutionProvisioningGenerationFailed(
        addTemporaryNotification,
        registrationType,
        'Enter an exact HTTPS backend origin without a path, query, or fragment.'
      )
      return
    }
    if (!walletAddress || !walletAddress.trim()) return
    setTrustReview({ registrationType, backendOrigin })
  }, [isSSO, canRegisterInstitution, addTemporaryNotification, publicBaseUrl, walletAddress]);

  const confirmTrustReview = useCallback(async () => {
    if (!trustReview) return
    if (trustReview.registrationType === 'consumer') {
      await issueConsumerToken()
    } else {
      await issueProviderToken()
    }
    setTrustReview(null)
  }, [trustReview, issueConsumerToken, issueProviderToken]);

  useEffect(() => {
    if (!autoGenerate || autoGeneratedRef.current || loading || token || !walletAddress.trim()) {
      return;
    }
    if (!canRegisterInstitution || tokenType !== 'consumer') {
      return;
    }

    autoGeneratedRef.current = true;
    openTrustReview('consumer');
  }, [autoGenerate, loading, token, walletAddress, canRegisterInstitution, tokenType, openTrustReview]);

  // Only show the card for SSO users permitted to register an institution.
  if (!canRegisterInstitution) {
    return null;
  }

  return (
    <div className={`bg-white shadow-md rounded-lg p-6 mt-6 mb-6 transition-transform duration-300 starting:opacity-0 starting:translate-y-2 opacity-100 translate-y-0 ${className}`}>
      <h1 className="text-2xl font-bold text-center mb-4 text-gray-800">
        Institutional Provisioning Token
      </h1>

      {token && (
        <div className="mt-2 mb-6 space-y-3">
          {expiresAt && (
            <p className="text-xs text-gray-500">
              Expires at: {new Date(expiresAt).toLocaleString()}
            </p>
          )}

          {payload && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-700">
              <div className="border rounded p-2 bg-gray-50">
                <p className="font-semibold">Type</p>
                <p className="capitalize">{payload.registrationType || 'provider'}</p>
              </div>
              <div className="border rounded p-2 bg-gray-50">
                <p className="font-semibold">Marketplace</p>
                <p>{payload.marketplaceBaseUrl}</p>
              </div>
              {payload.canonicalBackendOrigin && (
                <div className="border rounded p-2 bg-gray-50">
                  <p className="font-semibold">Canonical backend origin</p>
                  <p>{payload.canonicalBackendOrigin}</p>
                </div>
              )}
              {hasInstitutionName && (
                <div className="border rounded p-2 bg-gray-50">
                  <p className="font-semibold">{payload.registrationType === 'consumer' ? 'Consumer' : 'Provider'}</p>
                  <p>{displayInstitutionName || rawInstitutionName}</p>
                </div>
              )}
              <div className="border rounded p-2 bg-gray-50">
                <p className="font-semibold">Responsible person</p>
                <p>{responsiblePerson || '-'}</p>
              </div>
              <div className="border rounded p-2 bg-gray-50">
                <p className="font-semibold">Country</p>
                <p>{countryLabel || '-'}</p>
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1">
              Provisioning Token
            </p>
            <div className="flex items-center gap-2">
              <textarea
                className="flex-1 text-xs font-mono border rounded p-2 bg-gray-50 text-gray-800"
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
            Paste this token into the <strong>Apply Provisioning Token</strong> modal of your wallet dashboard to lock fields and auto-register.
          </p>
        </div>
      )}

      <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded">
        <label className="block text-xs font-semibold text-gray-700">
          Institutional wallet address
          <input
            className="mt-1 w-full border rounded p-2 text-sm font-mono"
            type="text"
            value={walletAddress}
            onChange={(event) => setWalletAddress(event.target.value)}
            placeholder="0x..."
            autoComplete="off"
          />
        </label>
        <p className="mt-1 text-xs text-gray-500">
          The backend that applies this token must prove control of this exact wallet.
        </p>
      </div>

      {/* Token Type Selector */}
      {!lockTokenType && (
        <div className="mb-4 border-b pb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Institution Type
          </label>
          <div className="flex gap-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="tokenType"
                value="provider"
                checked={tokenType === 'provider'}
                onChange={(e) => setTokenType(e.target.value)}
                className="mr-2"
              />
              <span className="text-sm">
                <strong>Provider</strong> (publishes labs)
              </span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="tokenType"
                value="consumer"
                checked={tokenType === 'consumer'}
                onChange={(e) => setTokenType(e.target.value)}
                className="mr-2"
              />
              <span className="text-sm">
                <strong>Consumer</strong> (only reserves labs)
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Provider-specific fields */}
      {tokenType === 'provider' && (
        <div className="space-y-3 mb-4 p-4 bg-blue-50 border border-blue-200 rounded">
          <label className="block text-xs font-semibold text-gray-700">
            Public base URL (https://)
            <input
              className="mt-1 w-full border rounded p-2 text-sm"
              type="text"
              inputMode="url"
              value={publicBaseUrl}
              onChange={(e) => setPublicBaseUrl(e.target.value)}
              placeholder="institution.example.edu"
            />
          </label>

          {!detectedCountry && (
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
          )}
        </div>
      )}

      {/* Consumer-specific fields */}
      {tokenType === 'consumer' && (
        <div className="space-y-3 mb-4 p-4 bg-blue-50 border border-blue-200 rounded">
          <label className="block text-xs font-semibold text-gray-700">
            Public base URL (https://)
            <input
              className="mt-1 w-full border rounded p-2 text-sm"
              type="text"
              inputMode="url"
              value={publicBaseUrl}
              onChange={(e) => setPublicBaseUrl(e.target.value)}
              placeholder="institution.example.edu"
            />
          </label>
        </div>
      )}

      <div className="flex justify-center mb-4">
        <button
          type="button"
          onClick={() => openTrustReview(tokenType)}
          disabled={loading || !walletAddress.trim()}
          className="inline-flex items-center px-4 py-2 bg-brand text-white text-sm font-medium rounded-md hover:bg-hover-dark disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Generating...' : 'Generate Provisioning Token'}
        </button>
      </div>

      <ProvisioningTrustReviewModal
        isOpen={Boolean(trustReview)}
        institutionId={user?.schacHomeOrganization || user?.affiliation || ''}
        walletAddress={walletAddress}
        backendOrigin={trustReview?.backendOrigin || ''}
        registrationType={trustReview?.registrationType || tokenType}
        onConfirm={confirmTrustReview}
        onClose={() => setTrustReview(null)}
        isSubmitting={loading}
      />

    </div>
  );
}

InstitutionInviteCard.propTypes = {
  className: PropTypes.string,
  defaultTokenType: PropTypes.oneOf(['provider', 'consumer']),
  lockTokenType: PropTypes.bool,
  autoGenerate: PropTypes.bool,
};
