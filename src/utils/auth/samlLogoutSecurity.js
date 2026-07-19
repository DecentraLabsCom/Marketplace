import { DOMParser } from '@xmldom/xmldom'
import { SignedXml } from 'xml-crypto'
import xpath from 'xpath'

const SAML_PROTOCOL_NAMESPACE = 'urn:oasis:names:tc:SAML:2.0:protocol'
const SAML_ASSERTION_NAMESPACE = 'urn:oasis:names:tc:SAML:2.0:assertion'
const XML_SIGNATURE_NAMESPACE = 'http://www.w3.org/2000/09/xmldsig#'
const MAX_SAML_LOGOUT_XML_BYTES = 192 * 1024
const MAX_SAML_LOGOUT_REQUEST_AGE_SECONDS = 300
const ALLOWED_SIGNATURE_ALGORITHMS = new Set([
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512',
])

function parseXml(xml) {
  let parserError = null
  const document = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (message) => { parserError = message },
      fatalError: (message) => { parserError = message },
    },
  }).parseFromString(xml, 'application/xml')

  if (parserError || !document?.documentElement) {
    throw new Error('Malformed SAML logout request XML')
  }

  return document
}

function localName(node) {
  return node?.localName || node?.nodeName?.split(':').pop()
}

function directChildrenByName(node, name, namespace) {
  return xpath.select(
    `./*[local-name(.)='${name}' and namespace-uri(.)='${namespace}']`,
    node,
  )
}

function getRequiredAttribute(node, name, errorMessage) {
  const value = node.getAttribute(name)?.trim()
  if (!value) throw new Error(errorMessage)
  return value
}

function getRequiredChildText(node, name, namespace, errorMessage) {
  const nodes = directChildrenByName(node, name, namespace)
  if (nodes.length !== 1) throw new Error(errorMessage)
  const value = nodes[0].textContent?.trim()
  if (!value) throw new Error(errorMessage)
  return value
}

export function decodeSamlLogoutRequest(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Missing SAML logout request')
  }

  const trimmed = value.trim()
  if (trimmed.startsWith('<')) {
    if (Buffer.byteLength(trimmed, 'utf8') > MAX_SAML_LOGOUT_XML_BYTES) {
      throw new Error('SAML logout request is too large')
    }
    return trimmed
  }

  const compact = trimmed.replace(/\s/g, '')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 === 1) {
    throw new Error('Malformed SAML request encoding')
  }

  const xml = Buffer.from(compact, 'base64').toString('utf8').trim()
  if (!xml.startsWith('<') || Buffer.byteLength(xml, 'utf8') > MAX_SAML_LOGOUT_XML_BYTES) {
    throw new Error('Malformed SAML logout request')
  }
  return xml
}

export function extractSamlLogoutRequest(xml) {
  const document = parseXml(xml)
  const root = document.documentElement

  if (localName(root) !== 'LogoutRequest' || root.namespaceURI !== SAML_PROTOCOL_NAMESPACE) {
    throw new Error('Invalid SAML logout request root')
  }

  const requestId = getRequiredAttribute(root, 'ID', 'Missing SAML logout request ID')
  const version = getRequiredAttribute(root, 'Version', 'Missing SAML logout request version')
  if (version !== '2.0') throw new Error('Invalid SAML logout request version')

  const issueInstant = getRequiredAttribute(root, 'IssueInstant', 'Missing SAML logout request IssueInstant')
  const issueTimestamp = Date.parse(issueInstant)
  if (Number.isNaN(issueTimestamp)) throw new Error('Invalid IssueInstant')

  const timeDiffSeconds = Math.abs(Date.now() - issueTimestamp) / 1000
  if (timeDiffSeconds > MAX_SAML_LOGOUT_REQUEST_AGE_SECONDS) {
    throw new Error('SAML logout request is outside the accepted time window')
  }

  const issuerNodes = directChildrenByName(root, 'Issuer', SAML_ASSERTION_NAMESPACE)
  if (issuerNodes.length !== 1) throw new Error('Missing or ambiguous SAML logout request issuer')

  const issuer = issuerNodes[0].textContent?.trim()
  if (!issuer) throw new Error('Empty SAML logout request issuer')

  const nameId = getRequiredChildText(
    root,
    'NameID',
    SAML_ASSERTION_NAMESPACE,
    'Missing or ambiguous SAML logout request NameID',
  )
  const sessionIndex = getRequiredChildText(
    root,
    'SessionIndex',
    SAML_PROTOCOL_NAMESPACE,
    'Missing or ambiguous SAML logout request SessionIndex',
  )

  return { requestId, issuer, nameId, sessionIndex }
}

export function verifySamlLogoutRequestSignature(xml, certificate, requestId) {
  if (typeof certificate !== 'string' || !certificate.trim() || !requestId) return false

  try {
    const document = parseXml(xml)
    const root = document.documentElement
    const signatures = directChildrenByName(root, 'Signature', XML_SIGNATURE_NAMESPACE)
    if (signatures.length !== 1) return false

    const signatureNode = signatures[0]
    const references = xpath.select(
      ".//*[local-name(.)='Reference' and namespace-uri(.)='http://www.w3.org/2000/09/xmldsig#']",
      signatureNode,
    )
    if (references.length !== 1 || references[0].getAttribute('URI') !== `#${requestId}`) {
      return false
    }

    const signatureMethod = xpath.select1(
      ".//*[local-name(.)='SignatureMethod' and namespace-uri(.)='http://www.w3.org/2000/09/xmldsig#']/@Algorithm",
      signatureNode,
    )
    if (!ALLOWED_SIGNATURE_ALGORITHMS.has(signatureMethod?.value)) return false

    const signature = new SignedXml({
      publicCert: certificate,
      // Never trust a certificate supplied inside the untrusted SAML message.
      getCertFromKeyInfo: () => null,
    })
    signature.loadSignature(signatureNode)
    if (!signature.checkSignature(xml)) return false

    const signedReferences = signature.getSignedReferences()
    if (signedReferences.length !== 1) return false

    const signedDocument = parseXml(signedReferences[0])
    const signedRoot = signedDocument.documentElement
    return (
      localName(signedRoot) === 'LogoutRequest' &&
      signedRoot.namespaceURI === SAML_PROTOCOL_NAMESPACE &&
      signedRoot.getAttribute('ID') === requestId
    )
  } catch {
    return false
  }
}
