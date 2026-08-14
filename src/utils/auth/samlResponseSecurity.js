import { DOMParser } from '@xmldom/xmldom'

const MAX_SAML_RESPONSE_BYTES = 192 * 1024
const MAX_IDENTIFIER_LENGTH = 512
const SAML_PROTOCOL_NAMESPACE = 'urn:oasis:names:tc:SAML:2.0:protocol'
const SAML_ASSERTION_NAMESPACE = 'urn:oasis:names:tc:SAML:2.0:assertion'
const SAML_BEARER_METHOD = 'urn:oasis:names:tc:SAML:2.0:cm:bearer'
const CLOCK_SKEW_MS = 60 * 1000

function normalizeIdentifier(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && normalized.length <= MAX_IDENTIFIER_LENGTH ? normalized : null
}

function decodeSamlResponse(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing SAML response')
  const compact = value.replace(/\s/g, '')
  if (compact.startsWith('<')) {
    if (Buffer.byteLength(compact, 'utf8') > MAX_SAML_RESPONSE_BYTES) {
      throw new Error('SAML response is too large')
    }
    return compact
  }

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 === 1) {
    throw new Error('Malformed SAML response encoding')
  }
  const xml = Buffer.from(compact, 'base64').toString('utf8')
  if (!xml || Buffer.byteLength(xml, 'utf8') > MAX_SAML_RESPONSE_BYTES) {
    throw new Error('SAML response is too large')
  }
  return xml
}

function directChildren(parent, namespace, localName) {
  const matches = []
  for (let index = 0; index < (parent?.childNodes?.length || 0); index += 1) {
    const child = parent.childNodes[index]
    if (child.nodeType === 1 && child.namespaceURI === namespace && child.localName === localName) {
      matches.push(child)
    }
  }
  return matches
}

function readAttribute(element, attributeName) {
  return normalizeIdentifier(element?.getAttribute?.(attributeName))
}

function parseSamlDocument(xml) {
  let parseError = null
  const document = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (message) => { parseError = message },
      fatalError: (message) => { parseError = message },
    },
  }).parseFromString(xml, 'text/xml')

  if (parseError || !document?.documentElement) {
    throw new Error(`Malformed SAML XML${parseError ? `: ${parseError}` : ''}`)
  }
  return document
}

function requiredSamlTime(element, attributeName, fieldName) {
  const value = readAttribute(element, attributeName)
  if (!value) throw new Error(`${fieldName} is required`)
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error(`${fieldName} is invalid`)
  return timestamp
}

function validateSamlTimeWindow(element, fieldName, now) {
  const notBefore = element.hasAttribute('NotBefore')
    ? requiredSamlTime(element, 'NotBefore', `${fieldName}.NotBefore`)
    : null
  const notOnOrAfter = requiredSamlTime(element, 'NotOnOrAfter', `${fieldName}.NotOnOrAfter`)

  if (notBefore !== null && now + CLOCK_SKEW_MS < notBefore) {
    throw new Error(`${fieldName}.NotBefore is in the future`)
  }
  if (now >= notOnOrAfter + CLOCK_SKEW_MS) {
    throw new Error(`${fieldName}.NotOnOrAfter has expired`)
  }
}

function validateSamlWebSsoProfile(xml, { responseId, inResponseTo, assertionId }) {
  const expectedAudience = normalizeIdentifier(process.env.NEXT_PUBLIC_SAML_SP_METADATA_URL)
  const expectedRecipient = normalizeIdentifier(process.env.NEXT_PUBLIC_SAML_SP_CALLBACK_URL)
  if (!expectedAudience || !expectedRecipient) {
    throw new Error('SAML SP audience and callback URL must be configured')
  }

  const document = parseSamlDocument(xml)
  const response = document.documentElement
  if (response.namespaceURI !== SAML_PROTOCOL_NAMESPACE || response.localName !== 'Response') {
    throw new Error('SAML response root is invalid')
  }

  const responses = document.getElementsByTagNameNS(SAML_PROTOCOL_NAMESPACE, 'Response')
  const assertions = document.getElementsByTagNameNS(SAML_ASSERTION_NAMESPACE, 'Assertion')
  if (responses.length !== 1 || assertions.length !== 1) {
    throw new Error('SAML response must contain exactly one response and assertion')
  }
  const assertion = assertions[0]
  if (directChildren(response, SAML_ASSERTION_NAMESPACE, 'Assertion')[0] !== assertion) {
    throw new Error('SAML Assertion must be a direct child of the Response')
  }

  const destination = readAttribute(response, 'Destination')
  if (destination !== expectedRecipient) {
    throw new Error('SAML response Destination does not match the configured callback')
  }
  if (readAttribute(response, 'ID') !== responseId || readAttribute(response, 'InResponseTo') !== inResponseTo) {
    throw new Error('SAML response correlation identifiers are inconsistent')
  }
  if (readAttribute(assertion, 'ID') !== assertionId) {
    throw new Error('SAML assertion identifier is inconsistent')
  }

  const now = Date.now()
  const conditions = directChildren(assertion, SAML_ASSERTION_NAMESPACE, 'Conditions')
  if (conditions.length !== 1) throw new Error('SAML Conditions is required')
  validateSamlTimeWindow(conditions[0], 'SAML Conditions', now)

  const restrictions = directChildren(conditions[0], SAML_ASSERTION_NAMESPACE, 'AudienceRestriction')
  if (restrictions.length === 0) throw new Error('SAML AudienceRestriction is required')
  for (const restriction of restrictions) {
    const audiences = directChildren(restriction, SAML_ASSERTION_NAMESPACE, 'Audience')
      .map((node) => normalizeIdentifier(node.textContent))
      .filter(Boolean)
    if (audiences.length === 0 || !audiences.includes(expectedAudience)) {
      throw new Error('SAML AudienceRestriction does not match the configured service provider')
    }
  }

  const subjects = directChildren(assertion, SAML_ASSERTION_NAMESPACE, 'Subject')
  if (subjects.length !== 1) throw new Error('SAML Subject is required')
  const confirmations = directChildren(subjects[0], SAML_ASSERTION_NAMESPACE, 'SubjectConfirmation')
  if (confirmations.length !== 1 || readAttribute(confirmations[0], 'Method') !== SAML_BEARER_METHOD) {
    throw new Error('SAML SubjectConfirmation bearer method is required')
  }
  const confirmationData = directChildren(confirmations[0], SAML_ASSERTION_NAMESPACE, 'SubjectConfirmationData')
  if (confirmationData.length !== 1) throw new Error('SAML SubjectConfirmationData is required')
  const data = confirmationData[0]
  validateSamlTimeWindow(data, 'SAML SubjectConfirmationData', now)
  if (readAttribute(data, 'Recipient') !== expectedRecipient) {
    throw new Error('SAML SubjectConfirmationData Recipient does not match the configured callback')
  }
  if (readAttribute(data, 'InResponseTo') !== inResponseTo) {
    throw new Error('SAML SubjectConfirmationData InResponseTo does not match the response')
  }
}

/**
 * Extracts identifiers and enforces the SAML Web SSO profile needed for
 * response correlation before identity parsing. XML signature and IdP
 * certificate validation remains delegated to saml2-js in parseSAMLResponse.
 */
export function extractSamlResponseIdentifiers(samlResponse) {
  const xml = decodeSamlResponse(samlResponse)
  const document = parseSamlDocument(xml)
  const responseNodes = document.getElementsByTagNameNS(SAML_PROTOCOL_NAMESPACE, 'Response')
  const assertionNodes = document.getElementsByTagNameNS(SAML_ASSERTION_NAMESPACE, 'Assertion')
  const response = responseNodes.length === 1 ? responseNodes[0] : null
  const assertion = assertionNodes.length === 1 ? assertionNodes[0] : null
  const responseId = readAttribute(response, 'ID')
  const inResponseTo = readAttribute(response, 'InResponseTo')
  const assertionId = readAttribute(assertion, 'ID')
  if (!responseId || !inResponseTo || !assertionId) {
    throw new Error('SAML response is missing correlation identifiers')
  }
  if (responseNodes.length !== 1 || assertionNodes.length !== 1) {
    throw new Error('SAML response must contain exactly one response and assertion')
  }
  validateSamlWebSsoProfile(xml, { responseId, inResponseTo, assertionId })
  return { responseId, inResponseTo, assertionId }
}

export const MAX_SAML_FORM_BYTES = 256 * 1024
