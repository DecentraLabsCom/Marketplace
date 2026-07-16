const liveDescribe = Cypress.env('liveIntegration') ? describe : describe.skip
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
