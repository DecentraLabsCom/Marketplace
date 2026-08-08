const releaseGateDescribe = Cypress.env('releaseGate') ? describe : describe.skip

function requiredUrl(name) {
  const value = Cypress.env(name)
  expect(value, name).to.be.a('string').and.not.be.empty
  return value.replace(/\/$/, '')
}

releaseGateDescribe('release gate across Marketplace and Gateway services', () => {
  it('reads the real catalogue and backend readiness without intercepts', () => {
    cy.request('/api/market/labs?limit=1').then((response) => {
      expect(response.status).to.equal(200)
      expect(response.body.labs).to.be.an('array')
      expect(response.body).to.have.property('catalogueStatus')
    })

    const services = [
      ['consumer', 'releaseGateConsumerUrl'],
      ['provider', 'releaseGateProviderUrl'],
    ]
    services.forEach(([name, envName]) => {
      cy.request(`${requiredUrl(envName)}/actuator/health/readiness`).then((response) => {
        expect(response.status, `${name} readiness`).to.equal(200)
        expect(response.body.status).to.equal('UP')
      })
    })
  })

  it('exposes the same auth discovery through Gateway and its backend', () => {
    cy.request(`${requiredUrl('releaseGateConsumerUrl')}/auth/jwks`).then((backend) => {
      expect(backend.status).to.equal(200)
      expect(backend.body.keys).to.be.an('array').and.not.be.empty
    })

    cy.request(`${requiredUrl('releaseGateGatewayUrl')}/auth/jwks`).then((gateway) => {
      expect(gateway.status).to.equal(200)
      expect(gateway.body.keys).to.be.an('array').and.not.be.empty
    })
  })

  it('exercises the real Redis REST atomic path used by Marketplace', () => {
    const url = requiredUrl('releaseGateRedisRestUrl')
    const token = Cypress.env('releaseGateRedisRestToken')
    expect(token, 'releaseGateRedisRestToken').to.be.a('string').and.not.be.empty
    const key = `release-gate:marketplace:${Date.now()}`
    const headers = { Authorization: `Bearer ${token}` }

    cy.request({ method: 'POST', url, headers, body: ['SET', key, 'prepared', 'EX', '300'] })
      .its('body.result').should('eq', 'OK')
    cy.request({ method: 'POST', url, headers, body: ['SET', key, 'duplicate', 'NX'] })
      .its('body.result').should('be.null')
    cy.request({
      method: 'POST',
      url,
      headers,
      body: ['EVAL', "return redis.call('SET', KEYS[1], ARGV[1], 'XX')", '1', key, 'committed'],
    }).its('body.result').should('eq', 'OK')
    cy.request({ method: 'POST', url, headers, body: ['GET', key] })
      .its('body.result').should('eq', 'committed')
      .then(() => cy.request({ method: 'POST', url, headers, body: ['DEL', key] }))
  })
})
