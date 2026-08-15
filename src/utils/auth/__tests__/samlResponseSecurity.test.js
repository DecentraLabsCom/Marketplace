/** @jest-environment node */

import { extractSamlResponseIdentifiers } from '../samlResponseSecurity'

const encode = (xml) => Buffer.from(xml, 'utf8').toString('base64')
const callbackUrl = 'https://sp.example.com/callback'
const audience = 'https://sp.example.com/metadata'

const validResponseXml = ({
  conditionsNotOnOrAfter = new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  audienceValue = audience,
  recipient = callbackUrl,
  subjectConfirmationInResponseTo = '_request-1',
  subjectConfirmationNotOnOrAfter = new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  additionalSubjectConfirmations = '',
} = {}) => `
  <samlp:Response
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="_response-1"
    InResponseTo="_request-1"
    Destination="${callbackUrl}">
    <saml:Assertion ID="_assertion-1">
      <saml:Issuer>https://idp.example</saml:Issuer>
      <saml:Subject>
        <saml:NameID>user@example.com</saml:NameID>
        ${additionalSubjectConfirmations}
        <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
          <saml:SubjectConfirmationData
            NotOnOrAfter="${subjectConfirmationNotOnOrAfter}"
            Recipient="${recipient}"
            InResponseTo="${subjectConfirmationInResponseTo}" />
        </saml:SubjectConfirmation>
      </saml:Subject>
      <saml:Conditions
        NotBefore="${new Date(Date.now() - 60 * 1000).toISOString()}"
        NotOnOrAfter="${conditionsNotOnOrAfter}">
        <saml:AudienceRestriction>
          <saml:Audience>${audienceValue}</saml:Audience>
        </saml:AudienceRestriction>
      </saml:Conditions>
    </saml:Assertion>
  </samlp:Response>
`

describe('SAML response correlation identifiers', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SAML_SP_METADATA_URL = audience
    process.env.NEXT_PUBLIC_SAML_SP_CALLBACK_URL = callbackUrl
  })

  test('extracts the response, AuthnRequest and assertion identifiers', () => {
    const response = encode(validResponseXml({
      conditionsNotOnOrAfter: '2099-01-01T00:00:00.000Z',
      subjectConfirmationNotOnOrAfter: '2098-01-01T00:00:00.000Z',
    }))

    expect(extractSamlResponseIdentifiers(response)).toEqual({
      responseId: '_response-1',
      inResponseTo: '_request-1',
      assertionId: '_assertion-1',
      samlAssertionExpiresAt: Date.parse('2098-01-01T00:00:00.000Z'),
    })
  })

  test('accepts a response without Destination and emits a warning', () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const response = encode(validResponseXml().replace(`    Destination="${callbackUrl}">`, '>'))

    try {
      expect(extractSamlResponseIdentifiers(response)).toEqual({
        responseId: '_response-1',
        inResponseTo: '_request-1',
        assertionId: '_assertion-1',
        samlAssertionExpiresAt: expect.any(Number),
      })
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('SAML response Destination is absent')
      )
    } finally {
      warning.mockRestore()
    }
  })

  test('rejects a present Destination that targets another callback', () => {
    const response = encode(validResponseXml().replace(
      `Destination="${callbackUrl}"`,
      'Destination="https://other-sp.example/callback"'
    ))

    expect(() => extractSamlResponseIdentifiers(response)).toThrow('Destination')
  })

  test('accepts multiple SubjectConfirmation elements when one bearer confirmation is valid', () => {
    const expiredConfirmation = `
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData
          NotOnOrAfter="${new Date(Date.now() - 2 * 60 * 1000).toISOString()}"
          Recipient="https://other-sp.example/callback"
          InResponseTo="_other-request" />
      </saml:SubjectConfirmation>`
    const response = encode(validResponseXml({
      additionalSubjectConfirmations: expiredConfirmation,
    }))

    expect(extractSamlResponseIdentifiers(response)).toEqual({
      responseId: '_response-1',
      inResponseTo: '_request-1',
      assertionId: '_assertion-1',
      samlAssertionExpiresAt: expect.any(Number),
    })
  })

  test('rejects a response without an InResponseTo value', () => {
    const response = encode(validResponseXml().replace('InResponseTo="_request-1"', ''))

    expect(() => extractSamlResponseIdentifiers(response)).toThrow('missing correlation identifiers')
  })

  test('rejects an expired assertion condition', () => {
    const response = encode(validResponseXml({
      conditionsNotOnOrAfter: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    }))

    expect(() => extractSamlResponseIdentifiers(response)).toThrow('Conditions.NotOnOrAfter')
  })

  test('requires the configured service-provider audience', () => {
    const response = encode(validResponseXml({ audienceValue: 'https://other-sp.example/metadata' }))

    expect(() => extractSamlResponseIdentifiers(response)).toThrow('AudienceRestriction')
  })

  test('requires SubjectConfirmationData to be bound to the callback and request', () => {
    const response = encode(validResponseXml({
      recipient: 'https://other-sp.example/callback',
    }))

    expect(() => extractSamlResponseIdentifiers(response)).toThrow('Recipient')
  })

  test('requires the response and SubjectConfirmationData request identifiers to match', () => {
    const response = encode(validResponseXml({
      subjectConfirmationInResponseTo: '_different-request',
    }))

    expect(() => extractSamlResponseIdentifiers(response)).toThrow('InResponseTo')
  })

  test('rejects malformed base64 input before passing it to the SAML library', () => {
    expect(() => extractSamlResponseIdentifiers('not valid base64 !!!')).toThrow('Malformed SAML response encoding')
  })
})
