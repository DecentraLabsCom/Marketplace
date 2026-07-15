import { Container } from '@/components/ui'

/**
 * FAQ page component displaying frequently asked questions
 * @returns {JSX.Element} FAQ page with accordion-style questions and answers
 */
export default function FAQ() {
  const faqData = [
    {
      question: ' 1. What is DecentraLabs?',
      answer: 'DecentraLabs is a project for sharing online laboratories among educational and research institutions, using institutional identity, managed infrastructure and blockchain-backed reservations.',
    },
    {
      question: ' 2. What is DecentraLabs Marketplace?',
      answer: 'The Marketplace offers a catalogue of online laboratories shared by universities and research institutions. Users can browse listed labs, reserve an available time window and access the lab through the provider gateway.',
    },
    {
      question: ' 3. How do I access a lab on DecentraLabs?',
      answer: 'You need institutional SSO credentials. After signing in through your institution, you can browse listed labs, make a reservation and use the applicable internal service credits.',
    },
    {
      question: ' 4. Do I need to pay to access a lab?',
      answer: 'It depends on the lab. Some labs may be free, while others consume internal service credits according to the provider pricing and unit shown in the catalogue. Service credits cannot be exchanged for cash.',
    },
    {
      question: ' 5. How do reservations work?',
      answer: 'Users reserve an available date, start time and duration. A pending or confirmed reservation can be cancelled before the access period begins; eligible internal service credits are then returned to the institutional credit account. This is not a cash refund.',
    },
    {
      question: ' 6. What are providers and how can I become one?',
      answer: 'Providers are institutions that publish and operate laboratories. Provider onboarding requires institutional SSO and an authorized institution administrator. The administrator provisions the institutional backend and managed wallet; providers do not connect a personal wallet or pay gas in the Marketplace.',
    },
    {
      question: ' 7. How does authentication work?',
      answer: 'DecentraLabs uses institutional SSO for user authentication. The browser receives an opaque session identifier, while reservation and access authorization are handled by the Marketplace and the configured institutional backend.',
    },
    {
      question: ' 8. What are service credits?',
      answer: 'Service credits are prepaid internal units used to reserve and access labs. They are issued and managed for an institutional account, support eligible lifecycle returns, and cannot be converted into cash or treated as an external $LAB/ERC-20 payment.',
    },
    {
      question: ' 9. How is lab access secured?',
      answer: 'The Marketplace checks the institutional session and reservation state. The blockchain-services component then issues a short-lived signed access token that the provider Lab Gateway validates for the requested lab and time window.',
    },
    {
      question: ' 10. Can I share my lab with others?',
      answer: 'Yes. An authorized institutional provider can configure a lab, its availability, its price unit and its publication state through the Lab Panel.',
    },
    {
      question: ' 11. Can I access labs from anywhere?',
      answer: 'Remote access is available wherever the provider gateway permits it, provided that you have internet access and can authenticate through your institution.',
    },
    {
      question: ' 12. Is there a time limit for accessing a lab?',
      answer: 'Yes. Access is limited to the active reservation window. When it ends, the provider gateway closes the session and a new reservation is required for additional time.',
    },
    {
      question: ' 13. What does unlisted mean?',
      answer: 'An unlisted lab is not included in the normal listed-only catalogue and is not eligible for public booking. It may appear only when the explicit discovery filter is enabled. If its listing status cannot be read, it is not treated as listed.',
    },
    {
      question: ' 14. How can I contact DecentraLabs support?',
      answer: 'Contact your institution administrator or use the support and contact channels published by DecentraLabs for Marketplace issues.',
    },
  ]

  return (
    <Container padding="sm">
      <div className="relative bg-cover bg-center text-white py-5 text-center">
        <h1 className="text-3xl font-bold mb-2">Frequently Asked Questions</h1>
      </div>

      <div className="relative w-full bg-white pt-10 pb-5 shadow-xl ring-1
        ring-gray-900/5 sm:mx-auto sm:max-w-3xl sm:rounded-lg">
        <div className="mx-auto grid max-w-2xl divide-y divide-neutral-200">
          {faqData.map((item, index) => (
            <div key={index} className="py-5">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between
                text-2xl font-semibold mb-4 text-hover-dark">
                  <span>{item.question}</span>
                  <span className="transition group-open:rotate-180">
                    <svg fill="none" height="24" shapeRendering="geometricPrecision"
                      stroke="black" strokeLinecap="round" strokeLinejoin="round"
                      strokeWidth="1.5" viewBox="0 0 24 24" width="24">
                      <path d="M6 9l6 6 6-6"></path>
                    </svg>
                  </span>
                </summary>
                <p className="group-open:animate-fadeIn mt-3 text-neutral-600 text-justify">
                  {item.answer}
                </p>
              </details>
            </div>
          ))}
        </div>
      </div>
    </Container>
  )
}
