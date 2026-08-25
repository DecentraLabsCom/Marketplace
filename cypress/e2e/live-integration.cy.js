const liveDescribe = Cypress.env('liveIntegration') ? describe : describe.skip
const liveBookingDescribe = Cypress.env('liveIntegration') && Cypress.env('liveBooking')
  ? describe
  : describe.skip
const liveAccessDescribe = Cypress.env('liveIntegration') && Cypress.env('liveAccess')
  ? describe
  : describe.skip
const sessionCookieName = '__Host-user_session'

liveDescribe('live Marketplace integration', () => {
  before(() => {
    expect(Cypress.config('baseUrl')).to.match(/^https:\/\//)
  })

  it('reads the public catalogue without fixtures or intercepted API responses', () => {
    cy.request('/api/market/labs?limit=1').then((response) => {
      expect(response.status).to.equal(200)
      expect(response.body).to.have.property('labs').that.is.an('array')
      expect(response.body).to.have.property('catalogueStatus')
    })
  })

  it('uses a real opaque session to load authenticated Marketplace routes', () => {
    const sessionId = Cypress.env('liveSessionId')
    expect(sessionId, 'CYPRESS_LIVE_SESSION_ID').to.match(/^[A-Za-z0-9_-]{43}$/)

    cy.setCookie(sessionCookieName, sessionId, {
      secure: true,
      sameSite: 'lax',
      path: '/',
    })
    cy.request('/api/auth/sso/session').then((response) => {
      expect(response.status).to.equal(200)
      expect(response.body).to.not.have.property('samlAssertion')
    })
    cy.visit('/userdashboard')
    cy.location('pathname').should('eq', '/userdashboard')
  })
})

liveBookingDescribe('live Marketplace booking and access boundaries', () => {
  let authenticatorId = null

  const setLiveSession = () => {
    const sessionId = Cypress.env('liveSessionId')
    expect(sessionId, 'CYPRESS_LIVE_SESSION_ID').to.match(/^[A-Za-z0-9_-]{43}$/)

    cy.setCookie(sessionCookieName, sessionId, {
      secure: true,
      sameSite: 'lax',
      path: '/',
    })
  }

  const pollMarketplace = (url, predicate, label, timeoutMs = 180000) => {
    const startedAt = Date.now()

    const attempt = () => cy.request({
      url,
      failOnStatusCode: false,
    }).then((response) => {
      if (response.status === 200 && predicate(response.body)) {
        return response
      }

      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`Timed out waiting for live ${label}`)
      }

      return cy.wait(1000).then(attempt)
    })

    return attempt()
  }

  beforeEach(() => {
    setLiveSession()
    cy.request('/api/auth/sso/session').then((response) => {
      expect(response.status).to.equal(200)
      expect(response.body).not.to.have.property('samlAssertion')
    })

    cy.enableLiveVirtualWebAuthn({
      rpId: Cypress.env('liveBookingRpId'),
      credentialId: Cypress.env('liveBookingCredentialId'),
      privateKey: Cypress.env('liveBookingCredentialPrivateKey'),
    }).then((createdAuthenticatorId) => {
      authenticatorId = createdAuthenticatorId
    })
  })

  afterEach(() => {
    cy.disableLiveVirtualWebAuthn(authenticatorId)
    authenticatorId = null
  })

  it('runs a real prepare → WebAuthn → intent → on-chain execution flow', () => {
    const labId = Cypress.env('liveBookingLabId')
    const start = Number(Cypress.env('liveBookingStart')) || Math.floor(Date.now() / 1000) + 3600
    const end = Number(Cypress.env('liveBookingEnd')) || start + 1800
    const timeslot = Number(Cypress.env('liveBookingTimeslot')) || end - start

    expect(labId, 'CYPRESS_LIVE_BOOKING_LAB_ID').to.match(/^\d+$/)
    expect(end).to.be.greaterThan(start)

    cy.request({
      method: 'POST',
      url: '/api/backend/intents/actions/prepare',
      body: {
        action: 8,
        payload: { labId: Number(labId), start, end, timeslot },
      },
    }).then((response) => {
      expect(response.status).to.equal(200)
      expect(response.body).to.include.keys(
        'requestId',
        'authorizationSessionId',
        'authorizationUrl',
      )

      const { authorizationSessionId, authorizationUrl, requestId } = response.body
      const authorizationOrigin = new URL(authorizationUrl).origin

      // The ceremony is the real backend HTML page. The only browser aid is
      // Chrome's virtual authenticator with a credential registered in that
      // same institutional backend.
      cy.visit(authorizationUrl)
      cy.origin(authorizationOrigin, () => {
        cy.contains('Authorize Intent').should('be.visible')
        cy.contains('Authorization complete.', { timeout: 120000 }).should('be.visible')
      })

      pollMarketplace(
        `/api/backend/intents/authorize/status/${encodeURIComponent(authorizationSessionId)}?sessionId=${encodeURIComponent(authorizationSessionId)}`,
        (body) => ['SUCCESS', 'AUTHORIZED'].includes(String(body?.status || '').toUpperCase()),
        'WebAuthn authorization',
      )

      pollMarketplace(
        `/api/backend/intents/${encodeURIComponent(requestId)}?requestId=${encodeURIComponent(requestId)}`,
        (body) => body?.status === 'executed',
        'intent execution',
      )

      cy.request(`/api/backend/intents/${encodeURIComponent(requestId)}/onchain`).then((onchain) => {
        expect(onchain.status).to.equal(200)
        expect(Number(onchain.body.state)).to.equal(2)
      })
    })
  })

})

liveAccessDescribe('live Marketplace access boundary', () => {
  it('requests a real opaque access code and renders the gateway handoff', () => {
    const sessionId = Cypress.env('liveSessionId')
    const labId = Cypress.env('liveAccessLabId')
    const reservationKey = Cypress.env('liveAccessReservationKey')

    expect(sessionId, 'CYPRESS_LIVE_SESSION_ID').to.match(/^[A-Za-z0-9_-]{43}$/)
    expect(labId, 'CYPRESS_LIVE_ACCESS_LAB_ID').to.match(/^\d+$/)
    expect(reservationKey, 'CYPRESS_LIVE_ACCESS_RESERVATION_KEY')
      .to.match(/^0x[a-fA-F0-9]{64}$/)

    cy.setCookie(sessionCookieName, sessionId, {
      secure: true,
      sameSite: 'lax',
      path: '/',
    })
    cy.request('/api/auth/sso/session').then((session) => {
      expect(session.status).to.equal(200)
      expect(session.body).not.to.have.property('samlAssertion')
    })

    cy.request({
      method: 'POST',
      url: '/api/auth/lab-access',
      body: { labId: Number(labId), reservationKey },
    }).then((response) => {
      expect(response.status).to.equal(200)
      expect(response.body.accessCode).to.match(/^[A-Za-z0-9_-]+$/)
      expect(response.body.gatewayOrigin).to.match(/^https:\/\//)
      expect(response.body).not.to.have.any.keys(
        'samlAssertion',
        'institutionalBackendSessionToken',
        'marketplaceToken',
      )

      cy.request({
        method: 'POST',
        url: '/api/auth/lab-access/handoff',
        form: true,
        body: {
          lab_id: String(labId),
          access_code: response.body.accessCode,
        },
      }).then((handoff) => {
        expect(handoff.status).to.equal(200)
        expect(handoff.body).to.include(`${response.body.gatewayOrigin}/auth/access`)
        expect(handoff.body).to.include(`name="access_code" value="${response.body.accessCode}"`)
        expect(handoff.body).not.to.match(/samlAssertion|institutionalBackendSessionToken|Bearer /i)
      })
    })
  })
})
