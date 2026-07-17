/**
 * API endpoint for user logout and session termination
 * Handles GET requests to clear user session cookies
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { clearSessionCookies } from '@/utils/auth/sessionCookie'
import { clearFmuContextCookie } from '@/utils/auth/fmuSessionStore'
import { revokeFmuContexts } from '@/utils/auth/revokeFmuContexts'

/**
 * Logs out the current user by clearing session cookies
 * @returns {Response} JSON response confirming logout
 */
export async function GET() {
    const cookieStore = await cookies();
    await revokeFmuContexts(cookieStore);
    await clearSessionCookies(cookieStore);
    clearFmuContextCookie(cookieStore);
    
    return NextResponse.json({ 
        success: true,
        message: "Session cleared successfully",
        timestamp: new Date().toISOString()
    });
}
