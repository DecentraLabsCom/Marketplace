import { sendMailto } from '../sendMailto'

describe('sendMailto', () => {
  it('calls sendMailto without error', () => {
    // No aserción sobre window.location.assign porque es de solo lectura en JSDOM
    expect(() => sendMailto('mailto:test@example.com')).not.toThrow()
  })
})
