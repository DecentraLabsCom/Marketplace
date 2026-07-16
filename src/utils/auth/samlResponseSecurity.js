const MAX_SAML_RESPONSE_BYTES = 192 * 1024
const MAX_IDENTIFIER_LENGTH = 512

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

function openingTags(xml, elementName) {
  const pattern = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${elementName}\\b([^>]*)>`, 'gi')
  return [...xml.matchAll(pattern)].map((match) => match[1])
}

function readAttribute(attributes, attributeName) {
  const pattern = new RegExp(`\\b${attributeName}\\s*=\\s*(["'])([^"']+)\\1`, 'i')
  const match = attributes.match(pattern)
  return normalizeIdentifier(match?.[2])
}

/**
 * Extracts only the identifiers required for response correlation and replay
 * prevention. Signature, issuer and condition validation remains delegated to
 * saml2-js in parseSAMLResponse.
 */
export function extractSamlResponseIdentifiers(samlResponse) {
  const xml = decodeSamlResponse(samlResponse)
  const responseTags = openingTags(xml, 'Response')
  const assertionTags = openingTags(xml, 'Assertion')
  if (responseTags.length !== 1 || assertionTags.length !== 1) {
    throw new Error('SAML response must contain exactly one response and assertion')
  }

  const responseId = readAttribute(responseTags[0], 'ID')
  const inResponseTo = readAttribute(responseTags[0], 'InResponseTo')
  const assertionId = readAttribute(assertionTags[0], 'ID')
  if (!responseId || !inResponseTo || !assertionId) {
    throw new Error('SAML response is missing correlation identifiers')
  }
  return { responseId, inResponseTo, assertionId }
}

export const MAX_SAML_FORM_BYTES = 256 * 1024
