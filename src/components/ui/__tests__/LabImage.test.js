/**
 * Unit Tests for LabImage Component
 * 
 * Coverage:
 * - Error callback loop prevention (critical guard)
 * - Loading state management (spinner → image)
 * - Fallback image switching on failures
 * - LabCardImage variant defaults
 * 
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LabImage, { LabCardImage } from '../LabImage'

jest.mock('@/utils/dev/logger', () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

// Mock Next.js Image - filters out Next-specific props to avoid DOM warnings
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    const { unoptimized, loader, placeholder, priority, layout, sizes, fill, alt = '', ...rest } = props
    return <img {...rest} alt={alt} />
  }
}))

beforeEach(() => {
  jest.clearAllMocks()
})

describe('LabImage', () => {
  const SRC = 'https://example.com/image.jpg'
  const FALLBACK = '/labs/fallback.png'
  const ALT = 'lab image'

  // Prevents infinite loops when onError triggers state updates in parent
  test('calls onError only once on multiple errors', () => {
    const onError = jest.fn()
    render(<LabImage src={SRC} alt={ALT} onError={onError} fallbackSrc={FALLBACK} />)
    
    const img = screen.getByAltText(ALT)
    fireEvent.error(img)
    fireEvent.error(img)
    
    expect(onError).toHaveBeenCalledTimes(1)
  })

  // Ensures spinner displays during load and hides after
  test('shows spinner until image loads', async () => {
    const onLoad = jest.fn()
    render(<LabImage src={SRC} alt={ALT} onLoad={onLoad} />)
    
    expect(screen.getByText(/Loading image/i)).toBeInTheDocument()
    
    fireEvent.load(screen.getByAltText(ALT))
    
    expect(onLoad).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByText(/Loading image/i)).not.toBeInTheDocument()
    })
  })

  // Verifies graceful degradation when primary image fails
  test('switches to fallback image on error', async () => {
    render(<LabImage src={SRC} alt={ALT} fallbackSrc={FALLBACK} />)
    
    const img = screen.getByAltText(ALT)
    expect(img).toHaveAttribute('src', SRC)
    
    fireEvent.error(img)
    
    await waitFor(() => {
      expect(screen.getByAltText(ALT)).toHaveAttribute('src', FALLBACK)
    })
  })

  // Validates auto-generated alt text for accessibility
  test('LabCardImage generates default alt from labId', () => {
    render(<LabCardImage src={SRC} labId="123" />)
    
    expect(screen.getByAltText('Lab 123 image')).toBeInTheDocument()
  })
})
