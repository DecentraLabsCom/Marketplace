/**
 * API endpoint for wallet-based session creation
 * Creates a JWT-signed session cookie when a user authenticates via wallet
 * 
 * Security: The wallet address is trusted because it comes from the connected
 * wallet via Wagmi, which verifies the user controls the private key.
 * Additional verification could include signature validation if needed.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSessionCookie } from '@/utils/auth/sessionCookie'
import { isValidAddress } from '@/utils/auth/guards'
import devLog from '@/utils/dev/logger'

/**
 * Creates a session for a wallet user
 * @param {Request} request - Request with wallet address in body
 * @returns {Response} JSON response confirming session creation
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const { walletAddress } = body;

        // Validate wallet address format
        if (!walletAddress || !isValidAddress(walletAddress)) {
            return NextResponse.json(
                { error: 'Invalid wallet address' },
                { status: 400 }
            );
        }

        // Normalize address to checksum format
        const normalizedAddress = walletAddress;

        // Create session data for wallet user
        const sessionData = {
            id: `wallet:${normalizedAddress.toLowerCase()}`,
            wallet: normalizedAddress,
            authType: 'wallet', // Distinguish from SSO sessions
        };

        // Create the signed JWT session cookie
        const cookieConfig = createSessionCookie(sessionData);
        
        const cookieStore = await cookies();
        cookieStore.set(cookieConfig.name, cookieConfig.value, {
            httpOnly: cookieConfig.httpOnly,
            secure: cookieConfig.secure,
            sameSite: cookieConfig.sameSite,
            path: cookieConfig.path,
            maxAge: cookieConfig.maxAge,
        });

        devLog.log('✅ Wallet session created for:', normalizedAddress);

        return NextResponse.json({
            success: true,
            message: 'Wallet session created',
            wallet: normalizedAddress,
        });
    } catch (error) {
        devLog.error('❌ Error creating wallet session:', error);
        return NextResponse.json(
            { error: 'Failed to create session' },
            { status: 500 }
        );
    }
}
