/**
 * API endpoint for user logout and session termination
 * Handles GET requests to clear user session cookies
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

/**
 * Logs out the current user by clearing session cookies
 * @returns {Response} JSON response confirming logout
 */
export async function GET() {
    const cookieStore = await cookies();
    cookieStore.set("user_session", "", { maxAge: 0, path: "/" });
    return NextResponse.json({ });
}
