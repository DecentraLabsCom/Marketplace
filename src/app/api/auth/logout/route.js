/**
 * API endpoint for user logout and session termination
 * Handles GET requests to clear user session cookies
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { clearSessionCookies } from '@/utils/auth/sessionCookie'

/**
 * Logs out the current user by clearing session cookies
 * @returns {Response} JSON response confirming logout
 */
export async function GET() {
    const cookieStore = await cookies();
    clearSessionCookies(cookieStore);
    
    // Add a small delay to ensure cookie clearing is processed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return NextResponse.json({ 
        success: true,
        message: "Session cleared successfully",
        timestamp: new Date().toISOString()
    });
}
