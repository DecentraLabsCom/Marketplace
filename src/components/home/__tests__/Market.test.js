import React from 'react'
import { render, screen } from '@testing-library/react'
import Market from '../Market'

const mockUseUserBookingsForMarket = jest.fn()

jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn(),
}))

jest.mock('@/hooks/lab/useLabs', () => ({
  useLabsForMarket: jest.fn(() => ({
    data: { labs: [] },
    isLoading: false,
    isFetching: false,
    isError: false,
  })),
  useLabFilters: jest.fn((labs) => ({
    selectedCategory: 'All',
    selectedPrice: 'All',
    selectedProvider: 'All',
    selectedFilter: 'All',
    selectedResourceType: 'All',
    searchFilteredLabs: labs,
    setSelectedCategory: jest.fn(),
    setSelectedPrice: jest.fn(),
    setSelectedProvider: jest.fn(),
    setSelectedFilter: jest.fn(),
    setSelectedResourceType: jest.fn(),
    categories: [],
    providers: [],
    searchInputRef: { current: null },
    resetFilters: jest.fn(),
  })),
}))

jest.mock('@/hooks/booking/useBookings', () => ({
  useUserBookingsForMarket: (...args) => mockUseUserBookingsForMarket(...args),
}))

jest.mock('@/components/home/LabFilters', () => function MockLabFilters() {
  return <div>filters</div>
})

jest.mock('@/components/home/LabGrid', () => function MockLabGrid({ labs }) {
  return <div>labs:{labs.length}</div>
})

const { useUser } = jest.requireMock('@/context/UserContext')

describe('Market', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseUserBookingsForMarket.mockReturnValue({
      data: {
        userLabsWithActiveBookings: new Set(),
        activeBookingsCount: 0,
        hasBookingInLab: () => false,
      },
      isLoading: false,
      isFetching: false,
    })
  })

  test('enables booking queries for institutional sessions', () => {
    useUser.mockReturnValue({
      isLoggedIn: true,
      isSSO: true,
      address: '0xInstitution',
    })

    render(<Market />)

    expect(mockUseUserBookingsForMarket).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ enabled: true })
    )
    expect(screen.getByText('labs:0')).toBeInTheDocument()
  })

  test('disables booking queries when the user is not institutionally logged in', () => {
    useUser.mockReturnValue({
      isLoggedIn: false,
      isSSO: false,
      address: null,
    })

    render(<Market />)

    expect(mockUseUserBookingsForMarket).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ enabled: false })
    )
  })
})
