describe('Provider Registration API (E2E)', () => {
  const DATA_FILE = 'data/pendingProviders.json'

  beforeEach(() => {
    // Ensure a clean providers file
    cy.writeFile(DATA_FILE, '[]')
  })

  it('accepts valid registration and persists provider', () => {
    const payload = {
      name: 'Acme Lab',
      email: 'Test@Example.COM',
      organization: 'Acme Org',
      registrationType: 'manual'
    }

    cy.request({
      method: 'POST',
      url: '/api/provider/saveRegistration',
      body: payload,
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(201)
      expect(res.body).to.have.property('provider')
      expect(res.body.provider.email).to.eq('test@example.com') // normalized in endpoint

      // File should contain the provider
      cy.readFile(DATA_FILE).then((contents) => {
        expect(contents).to.be.an('array')
        expect(contents.length).to.eq(1)
        expect(contents[0].email).to.eq('test@example.com')
      })
    })
  })

  it('rejects duplicate email with 409', () => {
    const payload = {
      name: 'Acme Lab',
      email: 'dup@example.com',
      organization: 'Acme Org',
      registrationType: 'manual'
    }

    // First request
    cy.request('POST', '/api/provider/saveRegistration', payload)
      .its('status')
      .should('eq', 201)

    // Duplicate
    cy.request({
      method: 'POST',
      url: '/api/provider/saveRegistration',
      body: payload,
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(409)
      expect(res.body).to.have.property('code', 'DUPLICATE_EMAIL')
    })
  })

  it('returns 400 for missing required fields', () => {
    cy.request({
      method: 'POST',
      url: '/api/provider/saveRegistration',
      body: {},
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400)
      expect(res.body).to.have.property('code')
    })
  })
})
