/**
 * Utility to trigger a mailto link (for testability)
 * @param {string} url - The mailto URL
 */
export function sendMailto(url) {
  window.location.assign(url);
}
