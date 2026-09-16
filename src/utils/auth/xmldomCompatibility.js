import { DOMParser } from '@xmldom/xmldom'

const DEFAULT_XML_MIME_TYPE = 'application/xml'
const DEFAULT_MIME_TYPE_PATCH = Symbol.for('decentralabs.xmldom.default-mime-type')
const parseFromString = DOMParser.prototype.parseFromString

// xml-crypto and saml2-js still call xmldom's pre-0.9 API without a MIME type.
// Keep the security-fixed parser while preserving that established XML-only behavior.
if (!parseFromString[DEFAULT_MIME_TYPE_PATCH]) {
  const parseFromStringWithDefaultMimeType = function parseFromStringWithDefaultMimeType(source, mimeType) {
    return parseFromString.call(this, source, mimeType === undefined ? DEFAULT_XML_MIME_TYPE : mimeType)
  }

  Object.defineProperty(parseFromStringWithDefaultMimeType, DEFAULT_MIME_TYPE_PATCH, {
    value: true,
  })
  DOMParser.prototype.parseFromString = parseFromStringWithDefaultMimeType
}
