"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  POPUP_BLOCKED_EVENT,
  getPopupGuidance,
} from '@/utils/browser/popupBlockerGuidance';

const resolveActionLabel = (source) => {
  if (!source) return 'this action';
  const value = String(source).toLowerCase();
  if (value.includes('onboarding')) return 'account setup';
  if (value.includes('lab')) return 'lab registration or signature';
  if (value.includes('booking')) return 'booking authorization';
  return 'this action';
};

export default function PopupBlockerModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [eventDetail, setEventDetail] = useState(null);
  const [userAgent, setUserAgent] = useState('');
  const bubbleRef = useRef(null);

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

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleOutsideClick = (event) => {
      const target = event?.target;
      if (!bubbleRef.current || bubbleRef.current.contains(target)) return;
      setIsOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    window.addEventListener('pointerdown', handleOutsideClick);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [isOpen]);

  const guidance = useMemo(
    () => getPopupGuidance(userAgent),
    [userAgent]
  );
  const isMobileGuidance = guidance.browser === 'Mobile browser';
  const actionLabel = resolveActionLabel(eventDetail?.source);
  const locationLabel = guidance.locationLabel.toLowerCase();
  const compactMessage = isMobileGuidance
    ? `Pop-up blocked: your browser may open this flow in a new tab. Allow pop-ups/redirects in browser settings, then retry ${actionLabel}.`
    : `Pop-up blocked: click the icon on the ${locationLabel}, allow this site, and retry ${actionLabel}.`;

  if (!isOpen) return null;

  const isLeft = guidance.iconSide === 'left';
  const containerSideClass = isLeft ? 'left-2 sm:left-4' : 'right-2 sm:right-4';
  const pointerSideClass = isLeft ? 'left-8 sm:left-10' : 'right-8 sm:right-10';
  const containerClass = isMobileGuidance
    ? 'fixed inset-x-2 bottom-2 z-[70] sm:bottom-3'
    : `fixed ${containerSideClass} top-2 z-[70] w-[min(26rem,calc(100vw-1rem))] sm:top-3`;
  const containerStyle = isMobileGuidance
    ? { paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }
    : undefined;

  return (
    <div
      className={containerClass}
      style={containerStyle}
      role="alert"
      aria-live="assertive"
    >
      <div
        ref={bubbleRef}
        className="relative rounded-lg bg-warning px-4 py-3 pr-10 text-sm text-white shadow-lg animate-slide-in"
      >
        {!isMobileGuidance && (
          <>
            <span
              aria-hidden="true"
              className={`absolute ${pointerSideClass} -top-2 size-4 rotate-45 bg-warning`}
            />
            <span
              aria-hidden="true"
              className={`absolute ${pointerSideClass} -top-5 size-2 rounded-full bg-warning ring-4 ring-warning/30`}
            />
          </>
        )}
        <p className="font-medium leading-snug">
          {compactMessage}
        </p>
        <div className="absolute right-2 top-2">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-full p-1 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            aria-label="Dismiss pop-up guidance"
          >
            <span aria-hidden="true">x</span>
          </button>
        </div>
      </div>
    </div>
  );
}
