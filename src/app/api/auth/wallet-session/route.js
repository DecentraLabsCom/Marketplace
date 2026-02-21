/**
 * API endpoint for wallet-based session creation
 *
 * Security:
 * - Supports challenge+signature verification for wallet ownership proof.
 * - Backward compatible with legacy wallet-only payload unless
 *   `WALLET_SESSION_REQUIRE_SIGNATURE=true`.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyMessage } from 'ethers'
import { createSessionCookie, getSessionFromCookies } from '@/utils/auth/sessionCookie'
import { isValidAddress } from '@/utils/auth/guards'
import devLog from '@/utils/dev/logger'
import {
  canIssueWalletSessionChallenge,
  isWalletSessionSignatureRequired,
  issueWalletSessionChallenge,
  verifyWalletSessionChallenge,
} from '@/utils/auth/walletSessionChallenge'

function getRequestOrigin(request) {
  const headerOrigin = request.headers.get('origin')
  if (headerOrigin) return headerOrigin
  try {
    return new URL(request.url).origin
  } catch {
    return null
  }
}

function verifyWalletSignature({ challenge, signature, walletAddress, origin }) {
  const challengeValidation = verifyWalletSessionChallenge(challenge, {
    walletAddress,
    origin,
  })
  if (!challengeValidation.ok) {
    return challengeValidation
  }

  try {
    const recoveredAddress = verifyMessage(challenge, signature)
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return { ok: false, code: 'SIGNATURE_MISMATCH' }
    }
    return { ok: true, payload: challengeValidation.payload }
  } catch (error) {
    return { ok: false, code: 'SIGNATURE_INVALID', error }
  }
}

/**
 * GET /api/auth/wallet-session?walletAddress=0x...
 * Issues a short-lived challenge for wallet signature verification.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')

    if (!walletAddress || !isValidAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 },
      )
    }

    if (!canIssueWalletSessionChallenge()) {
      return NextResponse.json(
        { error: 'Wallet session challenge is unavailable' },
        { status: 503 },
      )
    }

    const origin = getRequestOrigin(request)
    const challengeData = issueWalletSessionChallenge({
      walletAddress,
      origin,
    })

    const response = NextResponse.json({
      success: true,
      wallet: walletAddress,
      challenge: challengeData.challenge,
      expiresAt: challengeData.expiresAt,
      ttlSeconds: challengeData.ttlSeconds,
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    devLog.error('Error issuing wallet session challenge:', error)
    return NextResponse.json(
      { error: 'Failed to issue challenge' },
      { status: 500 }
    )
  }
}

/**
 * Creates a session for a wallet user
 * @param {Request} request - Request with wallet address in body
 * @returns {Response} JSON response confirming session creation
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const { walletAddress } = body || {}
    const challenge = body?.challenge || body?.walletSessionChallenge || null
    const signature = body?.signature || body?.walletSignature || null

    // Validate wallet address format
    if (!walletAddress || !isValidAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      )
    }

    const normalizedAddress = walletAddress
    const cookieStore = await cookies()
    const existingSession = getSessionFromCookies(cookieStore)
    const hasActiveWalletSession = Boolean(
      existingSession?.authType === 'wallet' &&
      existingSession?.wallet &&
      existingSession.wallet.toLowerCase() === normalizedAddress.toLowerCase()
    )

    // Avoid extra signature prompts when a valid wallet session already exists.
    if (hasActiveWalletSession) {
      return NextResponse.json({
        success: true,
        message: 'Wallet session already active',
        wallet: normalizedAddress,
        signatureVerified: false,
      })
    }

    const requireSignature = isWalletSessionSignatureRequired()
    const hasSignaturePayload = Boolean(challenge && signature)
    const hasPartialSignaturePayload = Boolean((challenge && !signature) || (!challenge && signature))
    const origin = getRequestOrigin(request)
    let signatureVerified = false

    if (hasPartialSignaturePayload) {
      return NextResponse.json(
        { error: 'Invalid signature payload', code: 'INVALID_SIGNATURE_PAYLOAD' },
        { status: 400 }
      )
    }

    if (hasSignaturePayload) {
      const verification = verifyWalletSignature({
        challenge,
        signature,
        walletAddress,
        origin,
      })

      if (!verification.ok) {
        devLog.warn('Wallet session signature verification failed:', verification.code)
        return NextResponse.json(
          { error: 'Invalid wallet signature', code: verification.code },
          { status: 401 }
        )
      }

      signatureVerified = true
    } else if (requireSignature) {
      return NextResponse.json(
        {
          error: 'Wallet signature is required',
          code: 'MISSING_SIGNATURE',
        },
        { status: 401 }
      )
    } else {
      devLog.warn('Wallet session created without signature verification (legacy compatibility mode)')
    }

    // Create session data for wallet user
    const sessionData = {
      id: `wallet:${normalizedAddress.toLowerCase()}`,
      wallet: normalizedAddress,
      authType: 'wallet',
    }

    // Create the signed JWT session cookie
    const cookieConfigs = createSessionCookie(sessionData)

    const configs = Array.isArray(cookieConfigs) ? cookieConfigs : [cookieConfigs]
    configs.forEach((cookieConfig) => {
      cookieStore.set(cookieConfig.name, cookieConfig.value, {
        httpOnly: cookieConfig.httpOnly,
        secure: cookieConfig.secure,
        sameSite: cookieConfig.sameSite,
        path: cookieConfig.path,
        maxAge: cookieConfig.maxAge,
      })
    })

    devLog.log('Wallet session created for:', normalizedAddress)

    return NextResponse.json({
      success: true,
      message: 'Wallet session created',
      wallet: normalizedAddress,
      signatureVerified,
    })
  } catch (error) {
    devLog.error('Error creating wallet session:', error)
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    )
  }
}
