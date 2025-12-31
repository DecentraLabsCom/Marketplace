import { Container } from '@/components/ui'

/**
 * About page component displaying information about Nebsyst and DecentraLabs
 * @returns {JSX.Element} About page with company and project descriptions
 */
export default function About() {
  return (
    <Container padding="sm">
      <div className="relative bg-cover bg-center text-white py-5 text-center">
        <h1 className="text-3xl font-bold mb-2">About DecentraLabs</h1>
      </div>
      <div className="sm:mx-auto sm:max-w-3xl">
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-accent">Nebsyst</h2>
          <div className="prose prose-neutral prose-lg max-w-none">
            <p>
              Nebsyst is a leading provider of innovative solutions in the field of blockchain technology 
              and decentralized systems. Our mission is to empower individuals and organizations by 
              providing them with the tools and knowledge they need to succeed in the rapidly evolving 
              digital landscape.
            </p>
            <p>
              At Nebsyst, we believe in the transformative power of blockchain technology and its 
              potential to create a more transparent, secure, and efficient world. Our team of experts is 
              dedicated to developing cutting-edge solutions that leverage the power of blockchain to 
              solve real-world problems.
            </p>
            <p>
              For more information, visit our website: &nbsp;
              <a href="https://nebsyst.com">nebsyst.com</a>
            </p>
          </div>
        </div>
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 text-accent">DecentraLabs</h2>
          <div className="prose prose-neutral prose-lg max-w-none">
            <p>
              DecentraLabs is a project by Nebsyst focused on creating decentralized remote labs. Our goal 
              is to provide a platform where users can access and utilize remote labs in a secure and 
              decentralized manner. By leveraging blockchain technology, we ensure that the labs are 
              accessible, transparent, and tamper-proof.
            </p>
            <p>
              DecentraLabs aims to revolutionize the way remote labs are accessed and utilized, making it 
              easier for individuals and organizations to conduct experiments, research, and training 
              without the need for physical presence.
            </p>
            <p>
              For more information, visit our project page: &nbsp;
              <a href="https://decentralabs.nebsyst.com">decentralabs.nebsyst.com</a>
            </p>
          </div>
        </div>
      </div>
    </Container>
  )
}
