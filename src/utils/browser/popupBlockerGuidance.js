export const POPUP_BLOCKED_EVENT = 'marketplace:popup-blocked';
export const INTENT_POPUP_BLOCKED_CODE = 'INTENT_AUTH_POPUP_BLOCKED';

const isMobileUserAgent = (userAgent = '') => /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);

export const getPopupGuidance = (userAgent = '') => {
  const ua = String(userAgent || '');
  const lower = ua.toLowerCase();
  const isMobile = isMobileUserAgent(ua);

  if (isMobile) {
    return {
      browser: 'Mobile browser',
      iconSide: 'right',
      locationLabel: 'Browser menu / address bar',
      title: 'Allow pop-up windows',
      description:
        'Your browser blocked the approval window. Allow pop-ups for this site, then retry the action.',
      steps: [
        'Open the browser menu in the address bar.',
        'Allow pop-ups and redirects for this site.',
        'Retry the action from the app.',
      ],
    };
  }

  if (lower.includes('firefox')) {
    return {
      browser: 'Firefox',
      iconSide: 'left',
      locationLabel: 'Left side of the address bar',
      title: 'Allow pop-up windows',
      description:
        'Firefox blocked the approval window. Use the pop-up permission indicator next to the URL.',
      steps: [
        'Click the pop-up permission indicator on the address bar.',
        'Choose to allow pop-ups for this site.',
        'Retry the action from the app.',
      ],
    };
  }

  if (lower.includes('safari') && !lower.includes('chrome') && !lower.includes('chromium')) {
    return {
      browser: 'Safari',
      iconSide: 'right',
      locationLabel: 'Top-right browser toolbar',
      title: 'Allow pop-up windows',
      description:
        'Safari blocked the approval window. Allow pop-ups for this site in the toolbar or website settings.',
      steps: [
        'Use the blocked pop-up control in the Safari toolbar.',
        'Allow pop-up windows for this site.',
        'Retry the action from the app.',
      ],
    };
  }

  if (lower.includes('edg/')) {
    return {
      browser: 'Microsoft Edge',
      iconSide: 'right',
      locationLabel: 'Right side of the address bar',
      title: 'Allow pop-up windows',
      description:
        'Edge blocked the approval window. Use the blocked pop-up icon next to the URL.',
      steps: [
        'Click the blocked pop-up icon on the address bar.',
        'Allow pop-ups and redirects for this site.',
        'Retry the action from the app.',
      ],
    };
  }

  if (lower.includes('opr/') || lower.includes('opera')) {
    return {
      browser: 'Opera',
      iconSide: 'right',
      locationLabel: 'Right side of the address bar',
      title: 'Allow pop-up windows',
      description:
        'Opera blocked the approval window. Use the blocked pop-up icon near the URL.',
      steps: [
        'Click the blocked pop-up icon in the address bar.',
        'Allow pop-ups for this site.',
        'Retry the action from the app.',
      ],
    };
  }

  return {
    browser: 'Chrome-based browser',
    iconSide: 'right',
    locationLabel: 'Right side of the address bar',
    title: 'Allow pop-up windows',
    description:
      'Your browser blocked the approval window. Use the blocked pop-up icon next to the URL.',
    steps: [
      'Click the blocked pop-up icon on the the address bar.',
      'Allow pop-ups and redirects for this site.',
      'Retry the action from the app.',
    ],
  };
};

export const emitPopupBlockedEvent = ({ authorizationUrl = null, source = 'unknown' } = {}) => {
  if (typeof window === 'undefined') return;
  if (typeof window.dispatchEvent !== 'function') return;
  if (typeof window.CustomEvent !== 'function') return;

  try {
    window.dispatchEvent(new CustomEvent(POPUP_BLOCKED_EVENT, {
      detail: {
        authorizationUrl: authorizationUrl || null,
        source,
        happenedAt: new Date().toISOString(),
      },
    }));
  } catch {
    // Non-critical UI signal; ignore dispatch issues.
  }
};

export const createPopupBlockedError = (message = 'Authorization window was blocked') => {
  const error = new Error(message);
  error.code = INTENT_POPUP_BLOCKED_CODE;
  return error;
};
