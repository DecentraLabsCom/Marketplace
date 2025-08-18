/**
 * API endpoint for SSO session management
 * Handles GET requests to retrieve current user session information
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

/**
 * Retrieves current user session from cookies
 * @returns {Response} JSON response with user session data or null if no session
 */
export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("user_session")?.value;

  if (!sessionCookie) {
    return NextResponse.json({ user: null });
  }

  const user = JSON.parse(sessionCookie);
  return NextResponse.json({ user });
}
