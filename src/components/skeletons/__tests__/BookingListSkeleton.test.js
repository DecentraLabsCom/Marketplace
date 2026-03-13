import React from 'react'
import { render, screen } from '@testing-library/react'
import { BookingItemSkeleton, BookingListSkeleton, DashboardSectionSkeleton } from '../BookingListSkeleton'

describe('BookingItemSkeleton', () => {
  it('renders all main skeleton elements', () => {
    render(<BookingItemSkeleton />)
    // Lab image
    expect(screen.getAllByTestId('skeleton').some(el => el.className.includes('w-16') && el.className.includes('h-16'))).toBe(true)
    // Lab name
    expect(screen.getAllByTestId('skeleton').some(el => el.className.includes('w-48') && el.className.includes('h-5'))).toBe(true)
    // Date/time
    expect(screen.getAllByTestId('skeleton').some(el => el.className.includes('w-24'))).toBe(true)
    expect(screen.getAllByTestId('skeleton').some(el => el.className.includes('w-20'))).toBe(true)
    // Provider
    expect(screen.getAllByTestId('skeleton').some(el => el.className.includes('w-32'))).toBe(true)
    // Status badge
    expect(screen.getAllByTestId('skeleton').some(el => el.className.includes('w-20') && el.className.includes('rounded-full'))).toBe(true)
    // Action button
    expect(screen.getByTestId('skeleton-button')).toBeInTheDocument()
  })
})

describe('BookingListSkeleton', () => {
  it('renders the correct number of BookingItemSkeletons (default)', () => {
    render(<BookingListSkeleton />)
    // There should be 3 BookingItemSkeleton root cards
    expect(screen.getAllByTestId('booking-item-skeleton').length).toBe(3)
  })
  it('renders the correct number of BookingItemSkeletons (custom count)', () => {
    render(<BookingListSkeleton count={5} />)
    expect(screen.getAllByTestId('booking-item-skeleton').length).toBe(5)
  })
})

describe('DashboardSectionSkeleton', () => {
  it('renders the title skeleton if title=true', () => {
    render(<DashboardSectionSkeleton title={true} />)
    expect(screen.getAllByTestId('skeleton').some(el => el.className.includes('w-48') && el.className.includes('h-7'))).toBe(true)
  })
  it('does not render the title skeleton if title=false', () => {
    render(<DashboardSectionSkeleton title={false} />)
    expect(screen.getAllByTestId('skeleton').some(el => el.className.includes('w-48') && el.className.includes('h-7'))).toBe(false)
  })
  it('renders 2 BookingItemSkeletons in the section', () => {
    render(<DashboardSectionSkeleton />)
    expect(screen.getAllByTestId('booking-item-skeleton').length).toBe(2)
  })
})
