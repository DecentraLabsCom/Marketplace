"use client";

import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import {
  POPUP_BLOCKED_EVENT,
  getPopupGuidance,
} from '@/utils/browser/popupBlockerGuidance';

const resolveActionLabel = (source) => {
  if (!source) return 'this action';
  const value = String(source).toLowerCase();
  if (value.includes('lab')) return 'lab registration or signature';
  if (value.includes('booking')) return 'booking authorization';
  return 'this action';
};

export default function PopupBlockerModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [eventDetail, setEventDetail] = useState(null);
  const [userAgent, setUserAgent] = useState('');

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setUserAgent(navigator.userAgent || '');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePopupBlocked = (event) => {
      setEventDetail(event?.detail || null);
      setIsOpen(true);
    };

    window.addEventListener(POPUP_BLOCKED_EVENT, handlePopupBlocked);
    return () => {
      window.removeEventListener(POPUP_BLOCKED_EVENT, handlePopupBlocked);
    };
  }, []);

  const guidance = useMemo(
    () => getPopupGuidance(userAgent),
    [userAgent]
  );
  const actionLabel = resolveActionLabel(eventDetail?.source);
  const markerSideClass = guidance.iconSide === 'left' ? 'left-2' : 'right-2';

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title={guidance.title}
      size="lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          {guidance.description}
        </p>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {guidance.browser}
          </p>
          <div className="relative h-14 rounded-md border border-gray-300 bg-white">
            <div className="absolute left-3 right-3 top-4 h-6 rounded bg-gray-100" />
            <div
              className={`absolute ${markerSideClass} top-2 h-8 w-8 rounded-full border-2 border-red-500 bg-red-100 shadow-sm`}
              aria-hidden="true"
            />
          </div>
          <p className="mt-2 text-xs text-gray-700">
            Look here: <span className="font-semibold">{guidance.locationLabel}</span>
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-gray-900">
            Steps
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
            {guidance.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <p className="text-xs text-gray-500">
          After allowing pop-ups, retry {actionLabel}.
        </p>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-hover-dark"
          >
            I understand
          </button>
        </div>
      </div>
    </Modal>
  );
}
