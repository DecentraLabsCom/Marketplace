describe('Public Market Journey', () => {
  beforeEach(() => {
    // 1. Mock base Market APIs and metadata to have a deterministic catalog
    cy.mockLabApis([
      {
        id: 1,
        owner: '0x1111111111111111111111111111111111111111',
        providerName: 'Nebsyst Institute',
        isListed: true,
        price: '500000000000000000', // 0.5 LAB
        uri: 'ipfs://mock-uri',
        metadata: {
          name: 'Quantum Optics Lab',
          description: 'A remote quantum optics setup.',
          attributes: [{ trait_type: 'Type', value: 'Physics' }]
        }
      },
      {
        id: 2,
        owner: '0x2222222222222222222222222222222222222222',
        providerName: 'DecentraLabs Core',
        isListed: true,
        price: '1000000000000000000', // 1 LAB
        uri: 'ipfs://mock-uri-2',
        metadata: {
          name: 'Biotech Simulator',
          description: 'CRISPR simulator for academic use.',
          attributes: [{ trait_type: 'Type', value: 'Biology' }]
        }
      }
    ]);
  });

  it('allows anonymous users to browse the catalog and view details', () => {
    // Navigate to root market
    cy.visit('/');

    // Ensure we are rendering the mocked catalog
    cy.contains('Quantum Optics Lab').should('be.visible');
    cy.contains('Biotech Simulator').should('be.visible');

    // Click on the first lab to view details (using force to bypass the hover overlay div block)
    // We target the anchor tag directly since Next.js wraps the cards in Links that might miss bubbled text clicks
    cy.get('a[href="/lab/1"]').first().click({ force: true });

    // Ensure URL changed properly and we are rendering the Laboratory Detail page
    cy.url().should('include', '/lab/1');
    
    // Check specific metadata rendering on details page
    cy.contains('A remote quantum optics setup.').should('be.visible');
  });

  it('prompts authentication or wallet connection when attempting to reserve', () => {
    // Directly inject to a lab detail page directly via Command (defaults to "Physics Lab" payload)
    cy.visitLabDetail("2"); 
    
    // We are on /lab/2
    cy.contains('Physics Lab').should('be.visible');

    // As an anonymous user, finding the primary call-to-action button
    // It could be 'Connect Wallet to Reserve', 'Login to Book', 'Reserve', etc.
    // In our marketplace UI, typically clicking the reserve button forces wallet auth.
    // Since class/text variants differ, we grab the main CTA button on the detail page:
    cy.get('button').contains(/reserve|book|connect/i).first().click();

    // Verify side effect: a modal opens asking to connect a wallet OR NextAuth SSO redirect happens
    // We assert the typical Web3Modal/ConnectKit dialog presence OR a warning DOM element
    // Usually, unauthenticated interactions trigger either a toast warning or modal popup.
    cy.get('body').then(($body) => {
      // It's either triggering a Wallet modal, an SSO portal, or showing an error notification
      const promptsAuth = $body.text().match(/connect wallet|sign in|nebsyst id|unauthorized/i);
      expect(promptsAuth).to.not.be.null;
    });
  });

  it('shows informative static pages without requiring authentication', () => {
    // Verifying static pages work normally
    cy.visit('/about');
    cy.contains('About DecentraLabs').should('be.visible');

    cy.visit('/faq');
    cy.contains('Frequently Asked Questions').should('be.visible');
  });
});
