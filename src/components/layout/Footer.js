import { FaXTwitter, FaGlobe, FaGithub } from 'react-icons/fa6'
import Image from 'next/image'
import Link from 'next/link'
import { Container } from '../ui/Layout'

/**
 * Site footer component with branding, links, and funding acknowledgments
 * Displays logos, navigation links, and EU funding information
 * @returns {JSX.Element} Footer with responsive grid layout and external logos
 */
export default function Footer() {
  return (
    <footer className="bg-hover-dark text-slate-100 text-center p-3 mt-8 relative">
      <Container padding="none" className="p-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 place-items-center">
          {/* Left: Support */}
          <div className="flex justify-center">
            <div className="flex items-center justify-center gap-4">
              <Image
                src="/eu_funded_en.jpg"
                alt="EU Funded"
                width={220}
                height={50}
                sizes="(max-width: 640px) 120px, 160px"
                className="h-10 w-auto"
              />
              <Image
                src="/ngi_sargasso.jpg"
                alt="NGI Sargasso"
                width={200}
                height={46}
                sizes="(max-width: 640px) 120px, 160px"
                className="h-10 w-auto"
              />
            </div>
          </div>

          {/* Center: Links */}
          <div className="flex space-x-4 justify-center items-center">
            <Link href="/about" className="text-slate-100 hover:text-white transition font-semibold">
              About
            </Link>
            <Link href="/faq" className="text-slate-100 hover:text-white transition font-semibold">
              FAQ
            </Link>
            <Link href="/contact" className="text-slate-100 hover:text-white transition font-semibold">
              Contact
            </Link>
          </div>

          {/* Right: Social Media */}
          <div className="flex space-x-4 justify-center items-center">
            <a
              href="https://decentralabs.nebsyst.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="DecentraLabs website"
              title="DecentraLabs website"
            >
              <FaGlobe className="size-6 text-slate-100 hover:text-white transition" />
              <span className="sr-only">DecentraLabs website</span>
            </a>
            <a
              href="https://github.com/DecentraLabsCom"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="DecentraLabs on GitHub"
              title="DecentraLabs on GitHub"
            >
              <FaGithub className="size-6 text-slate-100 hover:text-white transition" />
              <span className="sr-only">DecentraLabs on GitHub</span>
            </a>
            <a
              href="https://x.com/DecentraLabsCom"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="DecentraLabs on X"
              title="DecentraLabs on X"
            >
              <FaXTwitter className="size-6 text-slate-100 hover:text-white transition" />
              <span className="sr-only">DecentraLabs on X</span>
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
}

// Footer component doesn't accept any props
Footer.propTypes = {}
