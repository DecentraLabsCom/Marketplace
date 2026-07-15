import PropTypes from 'prop-types'
import { Container } from '@/components/ui'

const CONTENT = {
  privacy: {
    title: 'Privacy notice',
    intro: 'This notice explains what information the DecentraLabs Marketplace handles, why it is needed, and which parties may receive it.',
    sections: [
      {
        heading: 'Information handled',
        items: [
          'Institutional identity attributes received through SAML SSO, such as name, email, affiliation, role and stable pseudonymous identifiers.',
          'WebAuthn onboarding state and browser markers used to recognise completion for an institution and browser.',
          'Wallet and institution identifiers, reservations, lab access events, service-credit activity and intent/request identifiers.',
          'Provider-submitted lab metadata, including documentation, images and the registered institutional backend origin.',
          'Technical security data such as correlation IDs, request timestamps and bounded operational logs.',
        ],
      },
      {
        heading: 'Purposes and recipients',
        paragraphs: [
          'The platform uses this information to authenticate institutional users, determine permissions, coordinate onboarding, create and enforce reservations, provide lab access, operate service-credit flows, and protect the service against abuse.',
          'Depending on the operation, information may be sent to the user\'s institution, a provider\'s registered institutional backend, the lab gateway, blockchain infrastructure, or service providers supporting hosting and observability. Only the data required for the operation should be sent.',
        ],
      },
      {
        heading: 'Retention and control',
        paragraphs: [
          'Session identity claims are kept server-side behind an opaque session cookie. Query caches and onboarding/browser markers may remain in the browser for the periods described in the Cookies notice. Reservation and on-chain records may have longer retention because they are required for accounting, auditability and the operation of the decentralized system.',
          'Requests about access, correction, deletion, restriction or objection should be directed to the responsible institution or platform contact after the legal ownership and applicable retention duties have been confirmed.',
        ],
      },
      {
        heading: 'International and institutional transfers',
        paragraphs: [
          'Institutional backends are independently operated by participating institutions. Their privacy notices and security controls also apply when the Marketplace sends an onboarding or lab-operation request to them. The Marketplace should only use origins registered and verified through the platform trust model.',
        ],
      },
      {
        heading: 'Contact and governance status',
        paragraphs: [
          'The legal entity, privacy contact, data protection officer, supervisory authority information and applicable legal bases must be completed by DecentraLabs/Nebsyst legal counsel and the responsible DPO. This page is intentionally explicit about that governance dependency.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of use',
    intro: 'These operational terms describe the main rules for using the Marketplace.',
    sections: [
      {
        heading: 'Acceptable use',
        items: [
          'Use an institutional account only for yourself and follow your institution\'s policies.',
          'Do not bypass reservations, access controls, onboarding ceremonies, rate limits or trust checks.',
          'Do not upload unlawful, malicious, confidential or third-party material without the required authority.',
          'Do not submit a backend origin, document or lab description that you do not control or have permission to use.',
        ],
      },
      {
        heading: 'Labs, providers and institutional services',
        paragraphs: [
          'Providers remain responsible for the accuracy and legality of their lab metadata, documents, availability and institutional backend. Institutions remain responsible for their identity provider, backend configuration and users.',
          'Availability, pricing, service credits and cancellation rules may vary by lab and are shown as part of the applicable reservation flow.',
        ],
      },
      {
        heading: 'Security and suspension',
        paragraphs: [
          'The platform may suspend or limit an account, provider, lab or integration when required to protect users, investigate abuse, respond to a security incident or comply with a legal or institutional requirement.',
        ],
      },
      {
        heading: 'Legal review required',
        paragraphs: [
          'Liability, governing law, consumer or institutional contracting, intellectual property, service-credit treatment and dispute procedures must be completed by legal counsel for the deployment and jurisdiction.',
        ],
      },
    ],
  },
  cookies: {
    title: 'Cookies and browser storage',
    intro: 'The Marketplace uses browser storage mainly to keep the authenticated experience working and to reduce repeated reads. This page distinguishes essential session mechanisms from client-side caches and onboarding markers.',
    sections: [
      {
        heading: 'Essential cookies',
        items: [
          'An opaque, HttpOnly, Secure, SameSite session cookie identifies the server-side authenticated session. SAML assertions and full identity claims are not stored in that cookie.',
          'A short-lived FMU/session context cookie may be used for an authorised lab-operation flow.',
        ],
      },
      {
        heading: 'Local and session storage',
        items: [
          'React Query persists selected catalogue, metadata, provider, reservation and booking caches in localStorage for up to 72 hours.',
          'A browser passkey marker is stored in localStorage to avoid repeatedly showing the institutional WebAuthn advisory for the same institution and stable user identifier.',
          'A temporary onboarding session is held in sessionStorage while the institutional ceremony is completed and is removed when the flow ends.',
        ],
      },
      {
        heading: 'Choices and limitations',
        paragraphs: [
          'Blocking essential cookies or storage can prevent SSO, onboarding, reservations or lab access from working. Clearing browser data removes local caches and markers, but does not remove server-side or on-chain records.',
          'Optional analytics, advertising cookies and third-party tracking should not be enabled without a separate reviewed configuration and consent mechanism.',
        ],
      },
    ],
  },
  security: {
    title: 'Security and responsible disclosure',
    intro: 'DecentraLabs applies security controls at the browser, API, gateway, institutional-backend and smart-contract boundaries. This page gives users and providers a practical summary.',
    sections: [
      {
        heading: 'Current controls',
        items: [
          'Opaque server-side sessions, SAML/WebAuthn integration and authorization checks for sensitive operations.',
          'Exact-origin trust for provider metadata and institutional backends, HTTPS requirements in production, DNS and redirect protections for server-side fetches.',
          'Sandboxed same-origin document previews, referrer suppression, restrictive Permissions-Policy and nonce-based CSP for application documents.',
          'Normalized public API errors with correlation IDs; detailed diagnostics remain in bounded, redacted server logs.',
        ],
      },
      {
        heading: 'Provider responsibilities',
        paragraphs: [
          'Providers must keep their institutional backend, identity integration, wallet administration and uploaded content secure. Register only origins and keys that the institution controls, rotate compromised credentials, and report changes or incidents promptly.',
        ],
      },
      {
        heading: 'Reporting a vulnerability',
        paragraphs: [
          'Use the Contact page to report a suspected vulnerability. Do not include passwords, SAML assertions, bearer tokens, private keys or full personal-data exports in the initial report. Include the affected route, approximate time, safe reproduction steps and any returned correlation ID.',
        ],
      },
      {
        heading: 'Disclosure process',
        paragraphs: [
          'The security contact, response targets, supported versions and coordinated-disclosure terms must be confirmed by the project owner before this page is considered a formal security policy.',
        ],
      },
    ],
  },
}

export default function GovernancePage({ kind }) {
  const content = CONTENT[kind]

  return (
    <Container padding="sm">
      <div className="relative bg-cover bg-center text-white py-5 text-center">
        <h1 className="text-3xl font-bold mb-2">{content.title}</h1>
        <p className="text-sm text-slate-200">Operational transparency document · July 2026</p>
      </div>
      <article className="sm:mx-auto sm:max-w-4xl bg-white shadow-md rounded-lg p-6 prose prose-neutral prose-lg max-w-none">
        <p className="lead">{content.intro}</p>
        {content.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.items && (
              <ul>
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
          </section>
        ))}
      </article>
    </Container>
  )
}

GovernancePage.propTypes = {
  kind: PropTypes.oneOf(['privacy', 'terms', 'cookies', 'security']).isRequired,
}
