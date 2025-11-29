/**
 * API endpoint for wallet session destruction
 * Clears the session cookie when a wallet user disconnects
 * 
 * This endpoint is separate from SSO logout to handle the specific
 * case of wallet disconnection (manual or from MetaMask)
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createDestroySessionCookie, SESSION_COOKIE_NAME } from '@/utils/auth/sessionCookie'
import devLog from '@/utils/dev/logger'

/**
 * Destroys wallet user session
 * @returns {Response} JSON response confirming session destruction
 */
export async function POST() {
    try {
        const cookieStore = await cookies();
        const destroyCookie = createDestroySessionCookie();
        
        // Clear the session cookie
        cookieStore.set(destroyCookie.name, destroyCookie.value, { 
            maxAge: destroyCookie.maxAge, 
            path: destroyCookie.path,
            httpOnly: destroyCookie.httpOnly,
            secure: destroyCookie.secure,
            sameSite: destroyCookie.sameSite
        });
        
        // Also try to clear with expires in the past (belt and suspenders)
        cookieStore.set(SESSION_COOKIE_NAME, "", {
            expires: new Date(0),
            path: "/",
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict"
        });
        
        // Delete the cookie entirely
        cookieStore.delete(SESSION_COOKIE_NAME);

        devLog.log('✅ Wallet session destroyed');

        return NextResponse.json({
            success: true,
            message: 'Wallet session destroyed',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        devLog.error('❌ Error destroying wallet session:', error);
        return NextResponse.json(
            { error: 'Failed to destroy session' },
            { status: 500 }
        );
    }
}
