"use client";

import { useEffect, useState } from 'react';
import { Container } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import ProvisioningTrustReviewModal from '@/components/institutions/ProvisioningTrustReviewModal';
import MetadataOriginExceptionsPanel from '@/components/admin/MetadataOriginExceptionsPanel';

const INITIAL_FORM = {
  registrationType: 'provider',
  providerName: '',
  providerEmail: '',
  providerCountry: 'ES',
  providerOrganization: '',
  publicBaseUrl: '',
  walletAddress: '',
  agreementId: '',
};

const formatTimestamp = (value) => {
  if (!value) return 'Not available';
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
};

const normalizeOriginForReview = (value) => {
  if (!value || typeof value !== 'string' || !value.trim()) return null;
  let candidate = value.trim();
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) return null;
    return parsed.origin;
  } catch {
    return null;
  }
};

function StatusBadge({ complete, pending = false, children }) {
  const className = complete
    ? 'bg-emerald-100 text-emerald-800'
    : pending
      ? 'bg-amber-100 text-amber-800'
      : 'bg-gray-100 text-gray-700';
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

function ProvisioningStatusCard({ record, onSuspend, onRestore }) {
  const tokenLabel = record.tokenConsumed
    ? 'Token consumed'
    : record.tokenExpired
      ? 'Token expired'
      : 'Token pending consumption';
  const providerLabel = record.registrationType === 'consumer'
    ? 'Provider enablement not required'
    : record.providerEnabled
      ? 'Provider enabled'
      : 'Provider pending';

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3 className="text-base font-bold text-gray-900">{record.institutionId}</h3>
          <p className="mt-1 text-sm text-gray-600">{record.providerName || record.registrationType}</p>
        </div>
        <StatusBadge complete={record.status === 'ACTIVE'} pending={record.status === 'IN_PROGRESS' || record.status === 'PENDING'}>
          {record.suspended ? 'Suspended' : record.status}
        </StatusBadge>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-gray-700">Institutional wallet</dt>
          <dd className="break-all font-mono text-xs text-gray-600">{record.walletAddress || 'Not registered'}</dd>
        </div>
        <div>
          <dt className="font-semibold text-gray-700">Backend origin</dt>
          <dd className="break-all text-gray-600">{record.canonicalBackendOrigin || 'Not registered'}</dd>
        </div>
        <div>
          <dt className="font-semibold text-gray-700">Issued</dt>
          <dd className="text-gray-600">{formatTimestamp(record.issuedAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-gray-700">Last confirmed stage</dt>
          <dd className="text-gray-600">{record.lastConfirmedStage || 'Not started'}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2" aria-label={`Provisioning progress for ${record.institutionId}`}>
        <StatusBadge complete={record.tokenConsumed} pending={!record.tokenConsumed && !record.tokenExpired}>{tokenLabel}</StatusBadge>
        <StatusBadge complete={record.walletVerified} pending={record.tokenConsumed && !record.walletVerified}>Wallet registered</StatusBadge>
        <StatusBadge complete={record.backendRegistered} pending={record.walletVerified && !record.backendRegistered}>Backend registered</StatusBadge>
        <StatusBadge complete={record.providerEnabled} pending={record.registrationType === 'provider' && record.backendRegistered && !record.providerEnabled}>{providerLabel}</StatusBadge>
      </div>

      {record.errorCode && (
        <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-800">
          Registration failed: {record.errorCode}
        </p>
      )}
      {record.canRetry && (
        <p className="mt-3 text-sm text-amber-800">
          Retry: the institutional backend can resume the same signed token before it expires.
        </p>
      )}
      {!record.tokenConsumed && (
        <p className="mt-3 text-sm text-gray-600">
          Rotation: issue a replacement token from the form if this token expires or needs to be replaced.
        </p>
      )}

      {record.txHashes?.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-gray-700">Transactions</p>
          <ul className="mt-1 space-y-1 font-mono text-xs text-gray-600">
            {record.txHashes.map((hash) => <li key={hash} className="break-all">{hash}</li>)}
          </ul>
        </div>
      )}

      {(record.backendRegistered || record.suspended) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {record.suspended ? (
            <button
              type="button"
              onClick={() => onRestore(record)}
              className="rounded border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              Restore backend
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSuspend(record)}
              className="rounded border border-red-700 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50"
            >
              Suspend backend
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export default function InviteTokenPage() {
  const [adminStatus, setAdminStatus] = useState({ loading: true, isPlatformAdmin: false });
  const [form, setForm] = useState(INITIAL_FORM);
  const [tokenResult, setTokenResult] = useState(null);
  const [provisioning, setProvisioning] = useState({ loading: true, records: [], error: '' });
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [suspensionTarget, setSuspensionTarget] = useState(null);
  const [isUpdatingSuspension, setIsUpdatingSuspension] = useState(false);
  const [trustReview, setTrustReview] = useState(null);

  const loadProvisioningStatus = async () => {
    setProvisioning((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await fetch('/api/admin/institutions/provisioning-status', {
        method: 'GET',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Provisioning status is unavailable');
      }
      setProvisioning({ loading: false, records: Array.isArray(data?.records) ? data.records : [], error: '' });
    } catch (statusError) {
      setProvisioning({ loading: false, records: [], error: statusError?.message || 'Provisioning status is unavailable' });
    }
  };

  useEffect(() => {
    let isActive = true;

    async function loadAdminStatus() {
      try {
        const response = await fetch('/api/admin/platform/me', {
          method: 'GET',
          credentials: 'include',
        });
        const data = response.ok ? await response.json() : { isPlatformAdmin: false };
        if (isActive) {
          setAdminStatus({ loading: false, isPlatformAdmin: Boolean(data?.isPlatformAdmin) });
          if (data?.isPlatformAdmin) {
            await loadProvisioningStatus();
          } else {
            setProvisioning({ loading: false, records: [], error: '' });
          }
        }
      } catch {
        if (isActive) {
          setAdminStatus({ loading: false, isPlatformAdmin: false });
        }
      }
    }

    loadAdminStatus();

    return () => {
      isActive = false;
    };
  }, []);

  const updateField = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
    setCopied(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const backendOrigin = normalizeOriginForReview(form.publicBaseUrl);
    if (!backendOrigin) {
      setError('Enter an exact HTTPS backend origin without a path, query, or fragment.');
      return;
    }
    setTrustReview({ backendOrigin });
  };

  const issueProvisioningToken = async () => {
    setError('');
    setTokenResult(null);
    setCopied(false);
    setIsGenerating(true);

    try {
      const response = await fetch('/api/admin/institutions/provisionProvider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          registrationType: form.registrationType,
          ...(form.registrationType === 'consumer'
            ? { consumerName: form.providerName.trim() }
            : {
              providerName: form.providerName.trim(),
              providerEmail: form.providerEmail.trim(),
              providerCountry: form.providerCountry.trim(),
            }),
          providerOrganization: form.providerOrganization.trim(),
          publicBaseUrl: form.publicBaseUrl.trim(),
          walletAddress: form.walletAddress.trim(),
          agreementId: form.agreementId.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || 'Failed to generate invite token');
        return false;
      }
      setTokenResult(data);
      await loadProvisioningStatus();
      return true;
    } catch (generationError) {
      setError(generationError?.message || 'Failed to generate invite token');
      return false;
    } finally {
      setIsGenerating(false);
    }
  };

  const confirmTrustReview = async () => {
    const issued = await issueProvisioningToken();
    if (issued) setTrustReview(null);
  };

  const handleCopy = async () => {
    if (!tokenResult?.token || !navigator?.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(tokenResult.token);
    setCopied(true);
  };

  const updateBackendSuspension = async (record, method) => {
    setIsUpdatingSuspension(true);
    setError('');
    try {
      const response = await fetch('/api/admin/institutions/backend-revocation', {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(method === 'POST'
          ? { institutionId: record.institutionId, ttlSeconds: 3600 }
          : { institutionId: record.institutionId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Backend status could not be updated');
      setSuspensionTarget(null);
      await loadProvisioningStatus();
    } catch (suspensionError) {
      setError(suspensionError?.message || 'Backend status could not be updated');
    } finally {
      setIsUpdatingSuspension(false);
    }
  };

  if (adminStatus.loading) {
    return (
      <Container className="py-10">
        <div className="mx-auto max-w-4xl bg-white rounded-md shadow-md p-6">
          <div className="h-7 w-40 bg-gray-200 rounded animate-pulse" />
          <div className="mt-6 h-56 bg-gray-100 rounded animate-pulse" />
        </div>
      </Container>
    );
  }

  if (!adminStatus.isPlatformAdmin) {
    return (
      <Container className="py-10">
        <div className="mx-auto max-w-3xl bg-white rounded-md shadow-md p-6">
          <h1 className="text-2xl font-bold text-gray-900">Provision Institution</h1>
          <p className="mt-4 text-sm text-red-700">Access denied.</p>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-10">
      <div className="mx-auto max-w-4xl bg-white rounded-md shadow-md p-6">
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Provision Institution</h1>
            <p className="mt-1 text-sm text-gray-600">Issue a signed institutional provisioning token and monitor its durable registration progress.</p>
          </div>
          {tokenResult?.expiresAt && (
            <p className="text-xs text-gray-500">
              Expires: {new Date(tokenResult.expiresAt).toLocaleString()}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block text-sm font-semibold text-gray-700 md:col-span-2">
            Registration type
            <select
              className="mt-1 w-full border rounded p-2 text-sm"
              value={form.registrationType}
              onChange={updateField('registrationType')}
            >
              <option value="provider">Provider</option>
              <option value="consumer">Consumer</option>
            </select>
          </label>

          <label className="block text-sm font-semibold text-gray-700">
            {form.registrationType === 'consumer' ? 'Consumer name' : 'Provider name'}
            <input
              className="mt-1 w-full border rounded p-2 text-sm"
              value={form.providerName}
              onChange={updateField('providerName')}
              required
            />
          </label>

          {form.registrationType === 'provider' && (
            <label className="block text-sm font-semibold text-gray-700">
              Provider email
              <input
                className="mt-1 w-full border rounded p-2 text-sm"
                type="email"
                value={form.providerEmail}
                onChange={updateField('providerEmail')}
                required
              />
            </label>
          )}

          <label className="block text-sm font-semibold text-gray-700">
            {form.registrationType === 'consumer' ? 'Consumer organization' : 'Provider organization'}
            <input
              className="mt-1 w-full border rounded p-2 text-sm"
              value={form.providerOrganization}
              onChange={updateField('providerOrganization')}
              placeholder="partner.org"
              required
            />
          </label>

          {form.registrationType === 'provider' && (
            <label className="block text-sm font-semibold text-gray-700">
              Provider country
              <input
                className="mt-1 w-full border rounded p-2 text-sm uppercase"
                value={form.providerCountry}
                onChange={updateField('providerCountry')}
                maxLength={2}
                required
              />
            </label>
          )}

          <label className="block text-sm font-semibold text-gray-700 md:col-span-2">
            Institutional backend origin (public base URL)
            <input
              className="mt-1 w-full border rounded p-2 text-sm"
              type="text"
              inputMode="url"
              value={form.publicBaseUrl}
              onChange={updateField('publicBaseUrl')}
              placeholder="gateway.partner.org"
              required
            />
          </label>

          <label className="block text-sm font-semibold text-gray-700 md:col-span-2">
            Institutional wallet address
            <input
              className="mt-1 w-full border rounded p-2 text-sm font-mono"
              value={form.walletAddress}
              onChange={updateField('walletAddress')}
              placeholder="0x..."
              required
            />
          </label>

          <label className="block text-sm font-semibold text-gray-700 md:col-span-2">
            Agreement ID
            <input
              className="mt-1 w-full border rounded p-2 text-sm"
              value={form.agreementId}
              onChange={updateField('agreementId')}
            />
          </label>

          <div className="md:col-span-2 flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isGenerating}
              className="px-4 py-2 bg-brand text-white text-sm font-semibold rounded-md hover:bg-hover-dark disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isGenerating ? 'Generating...' : 'Generate provisioning token'}
            </button>
            {error && <p className="text-sm text-red-700">{error}</p>}
          </div>
        </form>

        {tokenResult?.token && (
          <div className="mt-6 border-t border-gray-200 pt-5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-sm font-semibold text-gray-700">Provisioning token</p>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 bg-gray-800 text-white text-xs font-semibold rounded-md hover:bg-gray-900"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <textarea
              className="w-full min-h-28 text-xs font-mono border rounded p-3 bg-gray-50 text-gray-800"
              value={tokenResult.token}
              readOnly
            />
          </div>
        )}

        <section className="mt-8 border-t border-gray-200 pt-5" aria-labelledby="provisioning-status-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="provisioning-status-heading" className="text-xl font-bold text-gray-900">Provisioning status</h2>
              <p className="mt-1 text-sm text-gray-600">The status is derived from the durable provisioning saga; tokens and nonces are never shown here.</p>
            </div>
            <button
              type="button"
              onClick={loadProvisioningStatus}
              disabled={provisioning.loading}
              className="rounded border border-gray-400 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {provisioning.loading ? 'Refreshing...' : 'Refresh status'}
            </button>
          </div>

          {provisioning.error && <p className="mt-4 text-sm text-red-700">{provisioning.error}</p>}
          {!provisioning.loading && !provisioning.error && provisioning.records.length === 0 && (
            <p className="mt-4 text-sm text-gray-600">No administrator-issued provisioning tokens are being tracked yet.</p>
          )}
          {provisioning.records.length > 0 && (
            <div className="mt-4 grid gap-4">
              {provisioning.records.map((record) => (
                <ProvisioningStatusCard
                  key={record.id}
                  record={record}
                  onSuspend={setSuspensionTarget}
                  onRestore={(target) => updateBackendSuspension(target, 'DELETE')}
                />
              ))}
            </div>
          )}
        </section>
        <MetadataOriginExceptionsPanel onError={setError} />
      </div>
      <Modal
        isOpen={Boolean(suspensionTarget)}
        onClose={() => !isUpdatingSuspension && setSuspensionTarget(null)}
        title="Suspend institutional backend?"
        size="md"
      >
        <div className="space-y-4 text-gray-700">
          <p>
            This immediately blocks Marketplace discovery of the backend for <strong>{suspensionTarget?.institutionId}</strong> for one hour.
          </p>
          <p className="text-sm">New institutional operations will not be routed to this backend until it is restored or the suspension expires.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={isUpdatingSuspension}
              onClick={() => setSuspensionTarget(null)}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              Keep active
            </button>
            <button
              type="button"
              disabled={isUpdatingSuspension}
              onClick={() => updateBackendSuspension(suspensionTarget, 'POST')}
              className="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUpdatingSuspension ? 'Suspending...' : 'Suspend backend'}
            </button>
          </div>
        </div>
      </Modal>
      <ProvisioningTrustReviewModal
        isOpen={Boolean(trustReview)}
        institutionId={form.providerOrganization.trim()}
        walletAddress={form.walletAddress.trim()}
        backendOrigin={trustReview?.backendOrigin || ''}
        registrationType={form.registrationType}
        onConfirm={confirmTrustReview}
        onClose={() => !isGenerating && setTrustReview(null)}
        isSubmitting={isGenerating}
      />
    </Container>
  );
}
