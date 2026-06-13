"use client";

import { useEffect, useState } from 'react';
import { Container } from '@/components/ui';

const INITIAL_FORM = {
  providerName: '',
  providerEmail: '',
  providerCountry: 'ES',
  providerOrganization: '',
  publicBaseUrl: '',
  agreementId: '',
};

export default function InviteTokenPage() {
  const [adminStatus, setAdminStatus] = useState({ loading: true, isPlatformAdmin: false });
  const [form, setForm] = useState(INITIAL_FORM);
  const [tokenResult, setTokenResult] = useState(null);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

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
    setTokenResult(null);
    setCopied(false);
    setIsGenerating(true);

    try {
      const response = await fetch('/api/admin/institutions/provisionProvider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          providerName: form.providerName.trim(),
          providerEmail: form.providerEmail.trim(),
          providerCountry: form.providerCountry.trim(),
          providerOrganization: form.providerOrganization.trim(),
          publicBaseUrl: form.publicBaseUrl.trim(),
          agreementId: form.agreementId.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || 'Failed to generate invite token');
        return;
      }
      setTokenResult(data);
    } catch (generationError) {
      setError(generationError?.message || 'Failed to generate invite token');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!tokenResult?.token || !navigator?.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(tokenResult.token);
    setCopied(true);
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
          <h1 className="text-2xl font-bold text-gray-900">Invite Token</h1>
          <p className="mt-4 text-sm text-red-700">Access denied.</p>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-10">
      <div className="mx-auto max-w-4xl bg-white rounded-md shadow-md p-6">
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Invite Token</h1>
          {tokenResult?.expiresAt && (
            <p className="text-xs text-gray-500">
              Expires: {new Date(tokenResult.expiresAt).toLocaleString()}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block text-sm font-semibold text-gray-700">
            Provider name
            <input
              className="mt-1 w-full border rounded p-2 text-sm"
              value={form.providerName}
              onChange={updateField('providerName')}
              required
            />
          </label>

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

          <label className="block text-sm font-semibold text-gray-700">
            Provider organization
            <input
              className="mt-1 w-full border rounded p-2 text-sm"
              value={form.providerOrganization}
              onChange={updateField('providerOrganization')}
              placeholder="partner.org"
              required
            />
          </label>

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

          <label className="block text-sm font-semibold text-gray-700 md:col-span-2">
            Public base URL
            <input
              className="mt-1 w-full border rounded p-2 text-sm"
              type="url"
              value={form.publicBaseUrl}
              onChange={updateField('publicBaseUrl')}
              placeholder="https://gateway.partner.org"
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
              {isGenerating ? 'Generating...' : 'Generate'}
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
      </div>
    </Container>
  );
}
