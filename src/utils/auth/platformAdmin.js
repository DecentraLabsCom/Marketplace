import { ForbiddenError } from '@/utils/auth/guards';

export function parsePlatformAdminEmails(value) {
  if (!value || typeof value !== 'string') {
    return new Set();
  }

  return new Set(
    value
      .split(/[,\s;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function resolveSessionEmail(session) {
  return String(session?.email || session?.mail || '').trim().toLowerCase();
}

export function isPlatformAdminSession(session) {
  if (!session?.samlAssertion) {
    return false;
  }

  const allowedEmails = parsePlatformAdminEmails(process.env.MARKETPLACE_PLATFORM_ADMIN_EMAILS);
  const sessionEmail = resolveSessionEmail(session);

  return Boolean(sessionEmail && allowedEmails.has(sessionEmail));
}

export function requirePlatformAdminSession(session) {
  if (!session?.samlAssertion) {
    throw new ForbiddenError('Platform provider token requires SSO session');
  }

  if (!isPlatformAdminSession(session)) {
    throw new ForbiddenError('Platform provider token allowed only for platform admins');
  }

  return resolveSessionEmail(session);
}
