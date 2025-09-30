import React from 'react'
import { render, screen } from '@testing-library/react'
import Footer from '../Footer'

// Mock next/image: expose only src and alt to avoid passing unsupported props to <img>
jest.mock('next/image', () => ({ src, alt }) => (
  <img src={src} alt={alt} data-testid="mock-image" />
))

// Mock next/link: render <Link> as a plain <a> element for href testing
jest.mock('next/link', () => ({ href, children, ...rest }) => (
  <a href={href} {...rest}>{children}</a>
))

// Mock Container component: simplify layout rendering and provide a test identifier
jest.mock('../../ui/Layout', () => ({
  Container: ({ children }) => <div data-testid="container">{children}</div>
}))

// Mock react-icons/fa6: render identifiable SVGs with data-testid attributes
jest.mock('react-icons/fa6', () => ({
  FaGlobe: () => <svg data-testid="icon-globe" />,
  FaGithub: () => <svg data-testid="icon-github" />,
  FaXTwitter: () => <svg data-testid="icon-twitter" />
}))

describe('Footer component', () => {
  beforeEach(() => {
    render(<Footer />)
  })

  test('wraps all content within the Container component', () => {
    expect(screen.getByTestId('container')).toBeInTheDocument()
  })

  test('renders two funding images (EU and NGI) with correct src and alt attributes', () => {
    const images = screen.getAllByTestId('mock-image')
    expect(images).toHaveLength(2)

    expect(images[0]).toHaveAttribute('src', '/eu_funded_en.jpg')
    expect(images[0]).toHaveAttribute('alt', 'EU Funded')

    expect(images[1]).toHaveAttribute('src', '/ngi_sargasso.jpg')
    expect(images[1]).toHaveAttribute('alt', 'NGI Sargasso')
  })

  test('renders internal navigation links with correct href attributes', () => {
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/faq')
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact')
  })

  test('renders external social media links with correct href, target, and rel attributes', () => {
    const externalUrls = [
      'https://decentralabs.nebsyst.com',
      'https://github.com/DecentraLabsCom',
      'https://x.com/DecentraLabsCom'
    ]

    externalUrls.forEach(url => {
      // Locate external links by href attribute since they have no visible text
      const link = document.querySelector(`a[href="${url}"]`)
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    // Verify that each social media icon is rendered and identifiable
    expect(screen.getByTestId('icon-globe')).toBeInTheDocument()
    expect(screen.getByTestId('icon-github')).toBeInTheDocument()
    expect(screen.getByTestId('icon-twitter')).toBeInTheDocument()
  })
})
