"use client";

function bufferDecode(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function bufferEncode(value) {
  const bytes = new Uint8Array(value)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function transformRegistrationOptions(options) {
  if (!options) return null
  return {
    ...options,
    challenge: bufferDecode(options.challenge),
    user: {
      ...options.user,
      id: bufferDecode(options.user.id),
    },
    excludeCredentials: (options.excludeCredentials || []).map((cred) => ({
      ...cred,
      id: bufferDecode(cred.id),
    })),
  }
}

export function transformAssertionOptions(options) {
  if (!options) return null
  return {
    ...options,
    challenge: bufferDecode(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((cred) => ({
      ...cred,
      id: bufferDecode(cred.id),
    })),
  }
}

export function attestationToJSON(credential) {
  if (!credential) return null
  return {
    id: credential.id,
    rawId: bufferEncode(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferEncode(credential.response.clientDataJSON),
      attestationObject: bufferEncode(credential.response.attestationObject),
      transports: credential.response.getTransports?.(),
    },
    authenticatorAttachment: credential.authenticatorAttachment,
  }
}

export function assertionToJSON(assertion) {
  if (!assertion) return null
  return {
    id: assertion.id,
    rawId: bufferEncode(assertion.rawId),
    type: assertion.type,
    response: {
      clientDataJSON: bufferEncode(assertion.response.clientDataJSON),
      authenticatorData: bufferEncode(assertion.response.authenticatorData),
      signature: bufferEncode(assertion.response.signature),
      userHandle: assertion.response.userHandle
        ? bufferEncode(assertion.response.userHandle)
        : undefined,
    },
    authenticatorAttachment: assertion.authenticatorAttachment,
  }
}

export function base64UrlEncode(buffer) {
  return bufferEncode(buffer)
}

export default {
  transformRegistrationOptions,
  transformAssertionOptions,
  attestationToJSON,
  assertionToJSON,
  base64UrlEncode,
}
