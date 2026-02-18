import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { convertCOSEtoPKCS, isoBase64URL } from '@simplewebauthn/server/helpers'
import devLog from '@/utils/dev/logger'
import { getOriginFromRequest, getRpId, getRpName } from './config'
import { getNormalizedPucFromSession } from '@/utils/auth/puc'
import {
  consumeRegistrationChallenge,
  getCredentialForUser,
  saveCredential,
  setRegistrationChallenge,
} from './store'

/**
 * Extract PUC from session data.
 * @param {Object} session
 * @returns {string}
 */
export function getPucFromSession(session) {
  return getNormalizedPucFromSession(session)
}

/**
 * Build registration options for the authenticated SSO user.
 * Stores the challenge for later verification.
 * @param {Object} session
 * @param {Request} request
 * @returns {Promise<Object>}
 */
export async function buildRegistrationOptions(session, request) {
  const puc = getPucFromSession(session)
  if (!puc) {
    throw new Error('Missing PUC in session for WebAuthn registration')
  }

  const rpID = getRpId()
  const origin = getOriginFromRequest(request)
  const rpName = getRpName()

  const existing = getCredentialForUser(puc)

  // Use puc as the primary identifier, fall back to email/id
  const userIdentifier = session?.email || session?.id || puc
  // Convert userID to Uint8Array as required by @simplewebauthn/server v13+
  const userIDBytes = new TextEncoder().encode(userIdentifier)

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: userIdentifier,
    userDisplayName: session?.name || session?.email || puc,
    userID: userIDBytes,
    attestationType: 'indirect',
    authenticatorSelection: {
      userVerification: 'required',
      residentKey: 'preferred',
    },
    excludeCredentials: existing
      ? [
          {
            id: isoBase64URL.toBuffer(existing.credentialId),
            type: 'public-key',
            transports: ['hybrid', 'internal', 'usb', 'nfc', 'ble'],
          },
        ]
      : [],
    supportedAlgorithmIDs: [-7, -257],
    timeout: 90_000,
  })

  setRegistrationChallenge(puc, {
    challenge: options.challenge,
    expiresAt: Date.now() + 10 * 60 * 1000,
    rpId: rpID,
    origin,
  })

  devLog.log('[WebAuthn] Registration options generated for', puc)
  return options
}

/**
 * Verify an attestation response and persist the credential.
 * @param {Object} session
 * @param {Object} attestationResponse
 * @param {Request} request
 * @returns {Promise<Object>}
 */
export async function verifyRegistration(session, attestationResponse, request) {
  const puc = getPucFromSession(session)
  if (!puc) {
    throw new Error('Missing PUC in session for WebAuthn registration')
  }

  const pending = consumeRegistrationChallenge(puc)
  if (!pending) {
    throw new Error('No registration challenge found for this session')
  }
  if (pending.expiresAt && pending.expiresAt < Date.now()) {
    throw new Error('Registration challenge expired, please retry')
  }

  const expectedOrigin = pending.origin || getOriginFromRequest(request)
  const expectedRPID = pending.rpId || getRpId()

  const verification = await verifyRegistrationResponse({
    response: attestationResponse,
    expectedChallenge: pending.challenge,
    expectedOrigin: expectedOrigin ? [expectedOrigin] : [],
    expectedRPID: expectedRPID ? [expectedRPID] : undefined,
    requireUserVerification: true,
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('WebAuthn attestation could not be verified')
  }

  const { credential, aaguid, origin, rpID } = verification.registrationInfo
  const credentialId = credential.id
  const cosePublicKey = credential.publicKey
  const spkiDer = convertCOSEtoPKCS(cosePublicKey)

  const credentialRecord = {
    puc,
    credentialId,
    cosePublicKey: isoBase64URL.fromBuffer(cosePublicKey, 'base64'),
    publicKeySpki: isoBase64URL.fromBuffer(spkiDer, 'base64'),
    signCount: credential.counter ?? 0,
    aaguid,
    status: 'active',
    rpId: rpID || expectedRPID,
    registeredAt: new Date().toISOString(),
    origin,
  }

  saveCredential(credentialRecord)

  return credentialRecord
}

/**
 * Optionally mirror the credential on the backend.
 * @param {Object} record
 * @param {string} backendUrl
 * @returns {Promise<boolean>}
 */
export async function registerCredentialInBackend(record, backendUrl) {
  if (!backendUrl) return false
  try {
    const res = await fetch(`${backendUrl.replace(/\/$/, '')}/webauthn/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        puc: record.puc,
        credentialId: record.credentialId,
        publicKey: record.publicKeySpki,
        signCount: record.signCount,
        aaguid: record.aaguid,
      }),
    })
    return res.ok
  } catch (error) {
    devLog.warn('[WebAuthn] Failed to register credential in backend', error)
    return false
  }
}

export default {
  getPucFromSession,
  buildRegistrationOptions,
  verifyRegistration,
  registerCredentialInBackend,
}
