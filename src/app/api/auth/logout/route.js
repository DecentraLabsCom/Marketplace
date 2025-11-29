/**
 * API endpoint for user logout and session termination
 * Handles GET requests to clear user session cookies
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createDestroySessionCookie, SESSION_COOKIE_NAME } from '@/utils/auth/sessionCookie'

/**
 * Logs out the current user by clearing session cookies
 * @returns {Response} JSON response confirming logout
 */
export async function GET() {
    const cookieStore = await cookies();
    const destroyCookie = createDestroySessionCookie();
    
    // Clear the main user session cookie with the destroy configuration
    cookieStore.set(destroyCookie.name, destroyCookie.value, { 
        maxAge: destroyCookie.maxAge, 
        path: destroyCookie.path,
        httpOnly: destroyCookie.httpOnly,
        secure: destroyCookie.secure,
        sameSite: destroyCookie.sameSite
    });
    
    // Also try to clear with expires in the past
    cookieStore.set(SESSION_COOKIE_NAME, "", {
        expires: new Date(0),
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
    });
    
    // Clear any potential session variants
    cookieStore.delete(SESSION_COOKIE_NAME);
    
    // Add a small delay to ensure cookie clearing is processed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return NextResponse.json({ 
        success: true,
        message: "Session cleared successfully",
        timestamp: new Date().toISOString()
    });
}
