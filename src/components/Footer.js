import { FaXTwitter, FaGlobe, FaGithub } from 'react-icons/fa6'
import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="bg-[#333f63] text-gray-300 text-center p-3 mt-8 relative">
      <div className="container mx-auto p-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 items-center">
          {/* Left: Support */}
          <div className="flex md:justify-center">
              <div className="flex space-x-4 md:justify-center h-10 w-1/2 relative">
                <Image src="/eu_funded_en.jpg" alt="EU Funded" fill priority sizes="10vw" 
                            className="!relative" />
                <Image src="/ngi_sargasso.jpg" alt="NGI Sargasso" fill priority sizes="10vw"
                            className="!relative" />
              </div>
          </div>

          {/* Center: Links */}
          <div className="flex space-x-4 md:justify-center items-center">
            <a href="/about" className="hover:text-white transition font-semibold">About</a>
            <a href="/faq" className="hover:text-white transition font-semibold">FAQ</a>
            <a href="/contact" className="hover:text-white transition font-semibold">Contact</a>
          </div>

          {/* Right: Social Media */}
          <div className="flex space-x-4 md:justify-center items-center">
            <a href="https://decentralabs.nebsyst.com" target="_blank" rel="noopener noreferrer">
              <FaGlobe className="h-6 w-6 hover:text-[#715c8c]" />
            </a>
            <a href="https://github.com/DecentraLabsCom" target="_blank" rel="noopener noreferrer">
              <FaGithub className="h-6 w-6 hover:text-[#715c8c]" />
            </a>
            <a href="https://x.com/DecentraLabsCom" target="_blank" rel="noopener noreferrer">
              <FaXTwitter className="h-6 w-6 hover:text-[#715c8c]" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}