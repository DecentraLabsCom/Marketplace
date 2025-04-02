import { FaXTwitter, FaGlobe, FaGithub } from 'react-icons/fa6'
import { appendPath } from '../utils/pathUtils'

export default function Footer() {
  return (
    <footer className="bg-[#333f63] text-gray-300 text-center p-3 mt-8 relative">
      <div className="container mx-auto p-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 items-center">
          {/* Left: Support */}
          <div className="flex space-x-4 mt-4 md:mt-0 md:justify-center">
            <img src={appendPath + "/eu_funded_en.jpg"} alt="EU Funded" className="h-10" />
            <img src={appendPath + "/ngi_sargasso.jpg"} alt="NGI Sargasso" className="h-10" />
          </div>

          {/* Center: Links */}
          <div className="flex space-x-4 mt-4 md:mt-0 md:justify-center items-center">
            <a href="/about" className="hover:text-white transition font-semibold">About</a>
            <a href="/faq" className="hover:text-white transition font-semibold">FAQ</a>
            <a href="/contact" className="hover:text-white transition font-semibold">Contact</a>
          </div>

          {/* Right: Social Media */}
          <div className="flex space-x-4 mt-4 md:mt-0 md:justify-center items-center">
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