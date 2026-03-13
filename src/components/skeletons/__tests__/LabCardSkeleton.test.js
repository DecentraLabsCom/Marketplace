import React from 'react'
import { render, screen } from '@testing-library/react'
import { LabCardSkeleton, LabCardGridSkeleton } from '../LabCardSkeleton'

describe('LabCardSkeleton', () => {
  it('renders all main skeleton elements', () => {
    render(<LabCardSkeleton />)
    // Image skeleton
    expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument()
    // Title skeleton (w-3/4 h-6)
    expect(screen.getAllByTestId('skeleton')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ className: expect.stringContaining('w-3/4') }),
        expect.objectContaining({ className: expect.stringContaining('h-6') })
      ])
    )
    // Category/keywords skeletons
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(6)
    // Description skeleton (SkeletonText)
    // Provider skeletons
    // Price and button skeletons
  })
})

describe('LabCardGridSkeleton', () => {
  it('renders the correct number of LabCardSkeletons (default)', () => {
    render(<LabCardGridSkeleton />)
    expect(screen.getAllByTestId('lab-card-skeleton').length).toBe(6)
  })
  it('renders the correct number of LabCardSkeletons (custom count)', () => {
    render(<LabCardGridSkeleton count={3} />)
    expect(screen.getAllByTestId('lab-card-skeleton').length).toBe(3)
  })
})
