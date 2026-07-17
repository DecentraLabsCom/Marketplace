/** @jest-environment node */

import { generateKeyPairSync } from 'node:crypto'
import { SignedXml } from 'xml-crypto'
import {
  decodeSamlLogoutRequest,
  extractSamlLogoutRequest,
  verifySamlLogoutRequestSignature,
} from '../samlLogoutSecurity'

describe('SAML logout request security', () => {
  const validXml = `
    <samlp:LogoutRequest
      xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
      xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
      ID="_logout-1"
      Version="2.0"
      IssueInstant="${new Date().toISOString()}">
      <saml:Issuer>https://idp.example/entity</saml:Issuer>
    </samlp:LogoutRequest>`.trim()

  test('decodes a base64 SAMLRequest and accepts raw XML', () => {
    const encoded = Buffer.from(validXml, 'utf8').toString('base64')

    expect(decodeSamlLogoutRequest(encoded)).toBe(validXml)
    expect(decodeSamlLogoutRequest(validXml)).toBe(validXml)
  })

  test('rejects malformed SAMLRequest encoding', () => {
    expect(() => decodeSamlLogoutRequest('not base64!')).toThrow('Malformed SAML request encoding')
  })

  test('extracts the request ID and issuer without depending on namespace prefixes', () => {
    const result = extractSamlLogoutRequest(validXml)

    expect(result).toEqual({
      requestId: '_logout-1',
      issuer: 'https://idp.example/entity',
    })
  })

  test('rejects an expired or malformed logout request', () => {
    expect(() => extractSamlLogoutRequest(validXml.replace(/IssueInstant="[^"]+"/, 'IssueInstant="invalid"')))
      .toThrow('Invalid IssueInstant')
    expect(() => extractSamlLogoutRequest(validXml.replace('ID="_logout-1"', 'ID=""')))
      .toThrow('Missing SAML logout request ID')
  })

  test('rejects an unsigned logout request', () => {
    expect(verifySamlLogoutRequestSignature(validXml, 'unused-certificate', '_logout-1'))
      .toBe(false)
  })

  test('accepts a signed LogoutRequest when the signature covers the request ID', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const signer = new SignedXml({
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    })
    signer.addReference({
      xpath: "//*[local-name(.)='LogoutRequest']",
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/2001/10/xml-exc-c14n#',
      ],
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    })
    signer.canonicalizationAlgorithm = 'http://www.w3.org/2001/10/xml-exc-c14n#'
    signer.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
    signer.computeSignature(validXml)

    expect(verifySamlLogoutRequestSignature(
      signer.getSignedXml(),
      publicKey.export({ type: 'spki', format: 'pem' }),
      '_logout-1',
    )).toBe(true)
  })
})
