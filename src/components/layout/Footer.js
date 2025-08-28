import { FaXTwitter, FaGlobe, FaGithub } from 'react-icons/fa6'
import Image from 'next/image'
import Link from 'next/link'

/**
 * Site footer component with branding, links, and funding acknowledgments
 * Displays logos, navigation links, and EU funding information
 * @returns {JSX.Element} Footer with responsive grid layout and external logos
 */
export default function Footer() {
  return (
    <footer className="bg-hover-dark text-center p-3 mt-8 relative">
      <div className="container mx-auto p-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 place-items-center">
          {/* Left: Support */}
          <div className="flex justify-center">
              <div className="flex space-x-4 md:justify-center h-10 w-full relative">
                <div className="relative w-1/2 h-full">
                  <Image src="/eu_funded_en.jpg" alt="EU Funded" fill priority sizes="10vw"
                                          className="!relative" />
                </div>
                <div className="relative w-1/2 h-full">
                  <Image src="/ngi_sargasso.jpg" alt="NGI Sargasso" fill priority sizes="10vw"
                                          className="!relative" />
                </div>
              </div>
          </div>

          {/* Center: Links */}
          <div className="flex space-x-4 justify-center items-center">
            <Link href="/about" className="hover:text-brand-secondary transition font-semibold">
              About
            </Link>
            <Link href="/faq" className="hover:text-brand-secondary transition font-semibold">
              FAQ
            </Link>
            <Link href="/contact" className="hover:text-brand-secondary transition font-semibold">
              Contact
            </Link>
          </div>

          {/* Right: Social Media */}
          <div className="flex space-x-4 justify-center items-center">
            <a href="https://decentralabs.nebsyst.com" target="_blank" rel="noopener noreferrer">
              <FaGlobe className="size-6 hover:text-brand-secondary" />
            </a>
            <a href="https://github.com/DecentraLabsCom" target="_blank" rel="noopener noreferrer">
              <FaGithub className="size-6 hover:text-brand-secondary" />
            </a>
            <a href="https://x.com/DecentraLabsCom" target="_blank" rel="noopener noreferrer">
              <FaXTwitter className="size-6 hover:text-brand-secondary" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// Footer component doesn't accept any props
Footer.propTypes = {}
