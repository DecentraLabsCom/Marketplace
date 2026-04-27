import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LabAccess, { buildLabAccessUrl } from '../LabAccess'

const mockAuthenticateLabAccessSSO = jest.fn()
const mockGetAuthErrorMessage = jest.fn(() => 'Connection failed. Please try again.')

jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn(),
}))

jest.mock('@/hooks/booking/useBookings', () => ({
  useReservation: jest.fn(() => ({
    data: null,
    isFetching: false,
  })),
}))

jest.mock('@/utils/auth/labAuth', () => ({
  authenticateLabAccessSSO: (...args) => mockAuthenticateLabAccessSSO(...args),
  getAuthErrorMessage: (...args) => mockGetAuthErrorMessage(...args),
}))

const { useUser } = jest.requireMock('@/context/UserContext')

describe('LabAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn(async (input) => {
      if (String(input).includes('/api/contract/lab/getLabAuthURI?labId=')) {
        return {
          ok: true,
          json: async () => ({ authURI: 'https://auth.example.com/auth' }),
        }
      }

      if (String(input).includes('/api/contract/institution/getActiveReservationKey?labId=')) {
        return {
          ok: true,
          json: async () => ({
            reservationKey: '0xabc123',
            hasActiveReservation: true,
          }),
        }
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`)
    })
  })

  test('blocks access when the user is not institutionally logged in', async () => {
    useUser.mockReturnValue({ isSSO: false })

    render(<LabAccess id="123" hasActiveBooking reservationKey="rk-1" />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/contract/lab/getLabAuthURI?labId=123')
    })
    fireEvent.click(await screen.findByRole('button', { name: /access/i }))

    expect(await screen.findByText('Institutional login is required to access this lab.')).toBeInTheDocument()
    expect(mockAuthenticateLabAccessSSO).not.toHaveBeenCalled()
  })

  test('authenticates through the institutional flow on success', async () => {
    useUser.mockReturnValue({ isSSO: true })
    mockAuthenticateLabAccessSSO.mockResolvedValue({
      token: 'jwt-token',
      labURL: 'https://lab.example.com/run',
    })

    render(<LabAccess id="123" hasActiveBooking reservationKey="rk-1" />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/contract/lab/getLabAuthURI?labId=123')
    })
    fireEvent.click(await screen.findByRole('button', { name: /access/i }))

    await waitFor(() => {
      expect(mockAuthenticateLabAccessSSO).toHaveBeenCalledWith({
        labId: '123',
        reservationKey: 'rk-1',
        authEndpoint: 'https://auth.example.com/auth',
        skipCheckIn: false,
      })
    })

  })

  test('shows friendly authentication errors from the institutional path', async () => {
    const error = new Error('network')
    useUser.mockReturnValue({ isSSO: true })
    mockAuthenticateLabAccessSSO.mockRejectedValue(error)

    render(<LabAccess id="123" hasActiveBooking reservationKey="rk-1" />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/contract/lab/getLabAuthURI?labId=123')
    })
    fireEvent.click(await screen.findByRole('button', { name: /access/i }))

    await waitFor(() => {
      expect(mockGetAuthErrorMessage).toHaveBeenCalledWith(error)
    })

    expect(await screen.findByText('Connection failed. Please try again.')).toBeInTheDocument()
  })

  test('preserves existing query params when building the redirect URL', () => {
    expect(buildLabAccessUrl('https://lab.example.com/run?mode=remote', 'jwt-token'))
      .toBe('https://lab.example.com/run?mode=remote&jwt=jwt-token')
  })

  test('resolves the active reservation key before authenticating when Home does not provide one', async () => {
    useUser.mockReturnValue({ isSSO: true })
    mockAuthenticateLabAccessSSO.mockResolvedValue({
      token: 'jwt-token',
      labURL: 'https://lab.example.com/run',
    })

    render(<LabAccess id="123" hasActiveBooking reservationKey={null} />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/contract/lab/getLabAuthURI?labId=123')
    })

    fireEvent.click(await screen.findByRole('button', { name: /access/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/contract/institution/getActiveReservationKey?labId=123',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        }),
      )
    })

    await waitFor(() => {
      expect(mockAuthenticateLabAccessSSO).toHaveBeenCalledWith({
        labId: '123',
        reservationKey: '0xabc123',
        authEndpoint: 'https://auth.example.com/auth',
        skipCheckIn: false,
      })
    })
  })
})
