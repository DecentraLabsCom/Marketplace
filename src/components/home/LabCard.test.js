// src/components/home/LabCard.test.js
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LabCard from './LabCard'

// Mock next/link -> use a simple anchor so href is testable
jest.mock('next/link', () => {
  return ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>
})

// Mock contexts
jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn()
}))

jest.mock('@/context/LabTokenContext', () => ({
  useLabToken: () => ({ formatPrice: (p) => `$${p}` })
}))

// Mock LabAccess as a stub
jest.mock('@/components/home/LabAccess', () => () => (
  <div data-testid="lab-access">LabAccess</div>
))

// Mock image component but DO NOT pass non-DOM props through
jest.mock('@/components/ui/ReactQueryLabImage', () => ({
  LabCardImage: ({ src, alt }) => <img data-testid="lab-image" src={src} alt={alt} />
}))

import { useUser } from '@/context/UserContext'

describe('LabCard component', () => {
  const baseProps = {
    id: 'lab-1',
    name: 'Electronics Lab',
    provider: 'ProviderX',
    price: 10,
    auth: null,
    activeBooking: false,
    image: '/lab.png'
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders lab name, provider, and formatted price', () => {
    useUser.mockReturnValue({ address: null, isConnected: false })

    render(<LabCard {...baseProps} />)

    expect(screen.getByText(baseProps.name)).toBeInTheDocument()
    expect(screen.getByText(baseProps.provider)).toBeInTheDocument()
    expect(screen.getByText('$10 $LAB / hour')).toBeInTheDocument()
  })

  test('renders image when provided; shows fallback otherwise', () => {
    useUser.mockReturnValue({ address: null, isConnected: false })

    const { rerender } = render(<LabCard {...baseProps} />)
    const img = screen.getByTestId('lab-image')
    expect(img).toHaveAttribute('src', baseProps.image)
    expect(img).toHaveAttribute('alt', baseProps.name)

    rerender(<LabCard {...baseProps} image="" />)
    expect(screen.getByText(/No image/i)).toBeInTheDocument()
  })

  test('shows Active badge and applies activeBooking classes on Card root', () => {
    useUser.mockReturnValue({ address: null, isConnected: false })

    const { container } = render(<LabCard {...baseProps} activeBooking />)
    expect(screen.getByText(/Active/i)).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('border-4', 'border-brand', 'animate-glow')
  })

  test('renders Explore Lab overlay link with correct href', () => {
    useUser.mockReturnValue({ address: null, isConnected: false })

    render(<LabCard {...baseProps} />)

    const link = screen.getByRole('link', { name: /Explore Lab/i })
    expect(link).toHaveAttribute('href', `/lab/${baseProps.id}/${baseProps.provider}`)
    expect(screen.getByText(/Explore Lab/i)).toBeInTheDocument()
  })

  test('overlay carries Tailwind classes for hover (opacity-0 and group-hover:opacity-100)', () => {
    useUser.mockReturnValue({ address: null, isConnected: false })

    render(<LabCard {...baseProps} />)

    // The overlay element is the DIV inside the anchor Link wrapper
    const link = screen.getByRole('link', { name: /Explore Lab/i })
    const overlayDiv = link.firstElementChild // the absolute inset-0 container
    expect(overlayDiv).toBeTruthy()
    expect(overlayDiv).toHaveClass('opacity-0')
    expect(overlayDiv.className).toMatch(/group-hover:opacity-100/)
  })

  test('renders LabAccess only when user is connected', () => {
    // Case 1: connected
    useUser.mockReturnValue({ address: '0x123', isConnected: true })
    const { unmount } = render(<LabCard {...baseProps} />)
    expect(screen.getByTestId('lab-access')).toBeInTheDocument()

    // Case 2: not connected — remount to avoid memo/context caching
    unmount()
    cleanup()
    useUser.mockReturnValue({ address: null, isConnected: false })
    render(<LabCard {...baseProps} />)
    expect(screen.queryByTestId('lab-access')).not.toBeInTheDocument()
  })

  test('supports different prices through formatPrice', () => {
    useUser.mockReturnValue({ address: null, isConnected: false })

    const { rerender } = render(<LabCard {...baseProps} price={0.5} />)
    expect(screen.getByText('$0.5 $LAB / hour')).toBeInTheDocument()

    rerender(<LabCard {...baseProps} price={42} />)
    expect(screen.getByText('$42 $LAB / hour')).toBeInTheDocument()
  })
})
