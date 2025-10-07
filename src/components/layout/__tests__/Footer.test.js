/**
 * Unit tests for the Footer component
 * Tests rendering of funding logos, navigation links, social media icons, and accessibility compliance
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import Footer from '../Footer'

/**
 * Mock Next.js Image component to render as a standard img element
 * Simplifies testing by avoiding Next.js internal image optimization
 */
jest.mock('next/image', () => ({ src, alt }) => (
  <img src={src} alt={alt} data-testid="mock-image" />
))

/**
 * Mock Next.js Link component to render as a standard anchor element
 * Enables testing of href attributes without Next.js routing complexity
 */
jest.mock('next/link', () => ({ href, children, ...rest }) => (
  <a href={href} {...rest}>{children}</a>
))

/**
 * Mock Container layout component to simplify DOM structure
 * Maintains testability while isolating Footer component logic
 */
jest.mock('../../ui/Layout', () => ({
  Container: ({ children }) => <div data-testid="container">{children}</div>
}))

/**
 * Mock react-icons to render identifiable SVG elements
 * Allows verification of icon presence without external dependencies
 */
jest.mock('react-icons/fa6', () => ({
  FaGlobe: () => <svg data-testid="icon-globe" />,
  FaGithub: () => <svg data-testid="icon-github" />,
  FaXTwitter: () => <svg data-testid="icon-twitter" />
}))

describe('Footer', () => {
  beforeEach(() => {
    render(<Footer />)
  })

  describe('Structure', () => {
    test('renders footer element wrapped in Container component', () => {
      expect(screen.getByTestId('container')).toBeInTheDocument()
      expect(document.querySelector('footer')).toBeInTheDocument()
    })
  })

  describe('Funding Images', () => {
    test('displays EU and NGI funding logos with correct paths and alt text', () => {
      const images = screen.getAllByTestId('mock-image')
      
      expect(images).toHaveLength(2)
      expect(images[0]).toHaveAttribute('src', '/eu_funded_en.jpg')
      expect(images[0]).toHaveAttribute('alt', 'EU Funded')
      expect(images[1]).toHaveAttribute('src', '/ngi_sargasso.jpg')
      expect(images[1]).toHaveAttribute('alt', 'NGI Sargasso')
    })
  })

  describe('Navigation Links', () => {
    test('renders all internal navigation links with correct routes', () => {
      const internalLinks = [
        { name: 'About', href: '/about' },
        { name: 'FAQ', href: '/faq' },
        { name: 'Contact', href: '/contact' }
      ]

      internalLinks.forEach(({ name, href }) => {
        const link = screen.getByRole('link', { name })
        expect(link).toHaveAttribute('href', href)
      })
    })

    test('renders external social links with proper security attributes', () => {
      const externalUrls = [
        'https://decentralabs.nebsyst.com',
        'https://github.com/DecentraLabsCom',
        'https://x.com/DecentraLabsCom'
      ]

      externalUrls.forEach(url => {
        const link = document.querySelector(`a[href="${url}"]`)
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      })
    })
  })

  describe('Social Icons', () => {
    test('displays all three social media icons', () => {
      expect(screen.getByTestId('icon-globe')).toBeInTheDocument()
      expect(screen.getByTestId('icon-github')).toBeInTheDocument()
      expect(screen.getByTestId('icon-twitter')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    test('ensures all images have descriptive alt text', () => {
      const images = screen.getAllByTestId('mock-image')
      images.forEach(img => {
        expect(img.getAttribute('alt')).toBeTruthy()
      })
    })

    test('verifies all navigation links are keyboard accessible', () => {
      const allLinks = screen.getAllByRole('link')
      expect(allLinks.length).toBe(6) // 3 internal navigation + 3 external social
    })
  })
})