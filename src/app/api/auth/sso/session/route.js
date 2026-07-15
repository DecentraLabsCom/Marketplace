/**
 * API endpoint for SSO session management
 * Handles GET requests to retrieve current user session information
 * Validates the opaque server-side session cookie
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionFromCookies } from '@/utils/auth/sessionCookie'
import { sanitizeSessionUserForClient } from '@/utils/auth/publicSessionUser'

/**
 * Retrieves current user session from cookies
 * Resolves the server-side session before returning sanitized user data
 * @returns {Response} JSON response with user session data or null if no session
 */
export async function GET() {
  const cookieStore = await cookies();
  const sessionUser = await getSessionFromCookies(cookieStore);

  if (!sessionUser) {
    return NextResponse.json({ user: null });
  }

  const user = sanitizeSessionUserForClient(sessionUser);
  return NextResponse.json({ user });
}
