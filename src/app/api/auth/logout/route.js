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
    
    // Clear the main user session cookie with multiple approaches
    cookieStore.set("user_session", "", { 
        maxAge: 0, 
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
    });
    
    // Also try to clear with expires in the past
    cookieStore.set("user_session", "", {
        expires: new Date(0),
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
    });
    
    // Clear any potential session variants
    cookieStore.delete("user_session");
    
    // Add a small delay to ensure cookie clearing is processed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return NextResponse.json({ 
        success: true,
        message: "Session cleared successfully",
        timestamp: new Date().toISOString()
    });
}
