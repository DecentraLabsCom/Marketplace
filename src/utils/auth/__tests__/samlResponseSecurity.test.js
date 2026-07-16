/** @jest-environment node */

import { extractSamlResponseIdentifiers } from '../samlResponseSecurity'

const encode = (xml) => Buffer.from(xml, 'utf8').toString('base64')

describe('SAML response correlation identifiers', () => {
  test('extracts the response, AuthnRequest and assertion identifiers', () => {
    const response = encode(`
      <samlp:Response ID="_response-1" InResponseTo="_request-1">
        <saml:Assertion ID="_assertion-1" />
      </samlp:Response>
    `)

    expect(extractSamlResponseIdentifiers(response)).toEqual({
      responseId: '_response-1',
      inResponseTo: '_request-1',
      assertionId: '_assertion-1',
    })
  })

  test('rejects a response without an InResponseTo value', () => {
    const response = encode('<samlp:Response ID="_response"><saml:Assertion ID="_assertion" /></samlp:Response>')

    expect(() => extractSamlResponseIdentifiers(response)).toThrow('missing correlation identifiers')
  })

  test('rejects malformed base64 input before passing it to the SAML library', () => {
    expect(() => extractSamlResponseIdentifiers('not valid base64 !!!')).toThrow('Malformed SAML response encoding')
  })
})
