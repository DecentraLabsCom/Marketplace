export default function FAQ() {
  const faqData = [
    {
      question: " 1. What is DecentraLabs?",
      answer: "DecentraLabs is a project revolutionizing the way online labs are shared among institutions through the application of decentralized technologies to make the process more open and sustainable."
    },
    {
      question: " 2. What is DecentraLabs Marketplace?",
      answer: "The marketplace offers a catalogue of online laboratories shared by universities and research institutions. Through our platform, users can securely and transparently reserve access to online labs, managed by smart contracts on the blockchain."
    },
    {
      question: " 3. How do I access a lab on DecentraLabs?",
      answer: "To access a lab on DecentraLabs, you simply need a compatible cryptocurrency wallet (e.g., MetaMask). Once your wallet is set up, you can browse through the listed labs, make a reservation, and pay using $LAB tokens."
    },
    {
      question: " 4. So, do I need to pay to access a lab?",
      answer: "It depends on the lab. Some labs may be free to access, while others require a fee, which is paid using the $LAB token. Each lab has its own access model specified by the lab owner/provider."
    },
    {
      question: " 5. How do reservations work?",
      answer: "Users can make reservations for available labs on the platform. Once reserved, you will have access to the lab for the specified period. If the reservation is cancelled or expires, access is revoked. You can cancel your reservation at any time before the access period begins."
    },
    {
      question: " 6. What are “owners” or “providers” and how can I become one?",
      answer: "Owners or providers are those responsible for listing and managing labs on the platform. To become a lab provider, you must be registered as an employee of an educational or research institution and go through a validation process. To start with this process, simply go to the “Register as a provider” section in the marketplace and fill the form."
    },
    {
      question: " 7. What is wallet authentication?",
      answer: "In DecentraLabs, user authentication is done through their wallet instead of a traditional username and password system. This provides enhanced security and allows payments and reservations to be directly integrated with the blockchain."
    },
    {
      question: " 8. What is the $LAB token?",
      answer: "The $LAB token is an ERC-20 token used to pay for access to labs on DecentraLabs. This token facilitates transactions within the marketplace and is managed through smart contracts."
    },
    {
      question: " 9. How is lab access secured and reliable?",
      answer: "DecentraLabs uses smart contracts deployed on the blockchain to manage lab access. These contracts ensure that only users with a valid reservation can access a lab, and all transactions are performed securely and transparently. Each transaction is recorded on the blockchain, providing traceability and immutability."
    },
    {
      question: " 10. Can I share my lab with others?",
      answer: "Yes. As a lab provider, you can choose to share it for free or charge a fee, depending on your preference. You can specify the access conditions and restrictions when registering your lab on the marketplace."
    },
    {
      question: " 11. Can I access labs from anywhere in the world?",
      answer: "Yes, all labs on DecentraLabs are remotely accessible, allowing you to access them from anywhere in the world, as long as you have an internet connection, and your wallet set up correctly."
    },
    {
      question: " 12. Is there a time limit for accessing a lab?",
      answer: "Each lab has a specified access time slot previously determined by the owner. Once the reservation expires, access to the lab is revoked. If you need more time, you will need to make a new reservation."
    },
    {
      question: " 13. What if the lab I want to access is already reserved?",
      answer: "If the lab is reserved during the time you want to access it, you won’t be able to access it until it becomes available again. You can choose another available lab or wait for your desired lab to be free."
    },
    {
      question: " 14. How can I contact DecentraLabs support?",
      answer: "If you have any questions or need support, you can contact us in our social media channels, through the contact form on our website, or via email. Our support team will be happy to assist you with any queries."
    }
  ];

  return (
    <div className="container mx-auto p-4">
      <div className="relative bg-cover bg-center text-white py-5 text-center">
        <h1 className="text-3xl font-bold mb-2">Frequently Asked Questions</h1>
      </div>

      <div className="relative w-full bg-white px-6 pt-10 pb-5 shadow-xl ring-1
        ring-gray-900/5 sm:mx-auto sm:max-w-2xl sm:rounded-lg sm:px-10">
        <div className="mx-auto  grid max-w-xl divide-y divide-neutral-200">
          {faqData.map((item, index) => (
            <div key={index} className="py-5">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between 
                text-2xl font-semibold mb-4 text-gray-800">
                    <span>{item.question}</span>
                    <span className="transition group-open:rotate-180">
                            <svg fill="none" height="24" shape-rendering="geometricPrecision"
                                stroke="black" stroke-linecap="round" stroke-linejoin="round"
                                stroke-width="1.5" viewBox="0 0 24 24" width="24">
                                <path d="M6 9l6 6 6-6"></path>
                            </svg>
                        </span>
                </summary>
                <p className="group-open:animate-fadeIn mt-3 text-neutral-600 text-justify">
                {item.answer}</p>
              </details>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}