const demoDescribe = Cypress.env('demoLive') ? describe : describe.skip

const requiredUrl = (name) => {
  const value = String(Cypress.env(name) || '').trim().replace(/\/$/, '')
  expect(value, name).to.match(/^https:\/\//)
  return value
}

const requiredNumericId = (name) => {
  const value = String(Cypress.env(name) || '').trim()
  expect(value, name).to.match(/^\d+$/)
  return value.replace(/^0+(?=\d)/, '')
}

demoDescribe('real demo handoff through Marketplace, Gateway and Guacamole', () => {
  let gatewayUrl
  let labId
  let connectionId

  before(() => {
    gatewayUrl = requiredUrl('demoGatewayUrl')
    labId = requiredNumericId('demoLabId')
    connectionId = requiredNumericId('demoConnectionId')

    cy.request({
      url: `${gatewayUrl}/gateway/health`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, 'Gateway health').to.equal(200)
      expect(response.body.status).to.equal('UP')
    })

    cy.request('/api/market/labs?limit=100').then((response) => {
      expect(response.status, 'Marketplace catalogue').to.equal(200)
      const lab = response.body.labs.find((candidate) => String(candidate.id) === labId)
      expect(lab, `catalogue lab ${labId}`).to.exist
      expect(lab.demoEnabled, 'catalogue demoEnabled').to.equal(true)
      expect(lab.isListed, 'catalogue listing').to.equal(true)
      expect(lab.resourceType, 'catalogue resource type').to.not.equal(1)
    })
  })

  it('redeems the demo cookie and exposes only the configured Guacamole connection', () => {
    cy.request({
      url: `${gatewayUrl}/auth/demo?labId=${labId}`,
      followRedirect: false,
      failOnStatusCode: false,
    }).then((handoff) => {
      expect(handoff.status, 'demo handoff').to.equal(303)
      expect(handoff.headers.location).to.match(/^\/guacamole\/?$/)
      const cookies = [].concat(handoff.headers['set-cookie'] || [])
      const demoCookie = cookies.find((cookie) => cookie.startsWith('DEMO_JTI='))
      expect(demoCookie, 'DEMO_JTI cookie').to.match(
        /^DEMO_JTI=[^;]+;[^]*Secure;[^]*HttpOnly;[^]*SameSite=Lax/i,
      )
    })

    cy.request({
      url: `${gatewayUrl}/guacamole/`,
      failOnStatusCode: false,
    }).its('status').should('eq', 200)

    cy.request({
      method: 'POST',
      url: `${gatewayUrl}/guacamole/api/tokens`,
      form: true,
      body: {},
      failOnStatusCode: false,
    }).then((tokenResponse) => {
      expect(tokenResponse.status, 'Guacamole token exchange').to.equal(200)
      expect(tokenResponse.body.username).to.match(/^demo-/)
      expect(tokenResponse.body.authToken).to.be.a('string').and.not.be.empty

      cy.request({
        url: `${gatewayUrl}/guacamole/api/session`,
        headers: { 'Guacamole-Token': tokenResponse.body.authToken },
      }).then((session) => {
        expect(session.status).to.equal(200)
        expect(session.body.username).to.equal(tokenResponse.body.username)
      })

      cy.request({
        url: `${gatewayUrl}/guacamole/api/session/data/mysql/connections`,
        headers: { 'Guacamole-Token': tokenResponse.body.authToken },
      }).then((connections) => {
        expect(connections.status).to.equal(200)
        expect(Object.keys(connections.body)).to.deep.equal([connectionId])
      })
    })
  })
})
