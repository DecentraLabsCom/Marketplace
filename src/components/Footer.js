import { FaXTwitter, FaGlobe, FaGithub } from 'react-icons/fa6'
import Image from 'next/image'
import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-[#333f63] text-center p-3 mt-8 relative">
      <div className="container mx-auto p-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 items-center">
          {/* Left: Support */}
          <div className="flex md:justify-center">
              <div className="flex space-x-4 md:justify-center h-10 w-3/4 relative">
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
          <div className="flex space-x-4 md:justify-center items-center">
            <Link href="/about" className="hover:text-[#715c8c] transition font-semibold">
              About
            </Link>
            <Link href="/faq" className="hover:text-[#715c8c] transition font-semibold">
              FAQ
            </Link>
            <Link href="/contact" className="hover:text-[#715c8c] transition font-semibold">
              Contact
            </Link>
          </div>

          {/* Right: Social Media */}
          <div className="flex space-x-4 md:justify-center items-center">
            <a href="https://decentralabs.nebsyst.com" target="_blank" rel="noopener noreferrer">
              <FaGlobe className="size-6 hover:text-[#715c8c]" />
            </a>
            <a href="https://github.com/DecentraLabsCom" target="_blank" rel="noopener noreferrer">
              <FaGithub className="size-6 hover:text-[#715c8c]" />
            </a>
            <a href="https://x.com/DecentraLabsCom" target="_blank" rel="noopener noreferrer">
              <FaXTwitter className="size-6 hover:text-[#715c8c]" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}