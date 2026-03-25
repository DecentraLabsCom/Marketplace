import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Login from '../Login'

jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn(),
}))

jest.mock('@/utils/auth/account', () => function MockAccount() {
  return <div data-testid="account">Account</div>
})

jest.mock('@/components/auth/InstitutionalLogin', () => function MockInstitutionalLogin({ setIsModalOpen }) {
  return (
    <button type="button" onClick={() => setIsModalOpen(false)}>
      Institutional Login Action
    </button>
  )
})

const { useUser } = jest.requireMock('@/context/UserContext')

describe('Login', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders the institutional login modal for anonymous users', async () => {
    useUser.mockReturnValue({ isLoggedIn: false })

    render(<Login />)

    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    expect(await screen.findByText('Institutional Login')).toBeInTheDocument()
    expect(screen.getByText('Loading institutional login...')).toBeInTheDocument()
  })

  test('renders account summary for authenticated users', () => {
    useUser.mockReturnValue({ isLoggedIn: true })

    render(<Login />)

    expect(screen.getByTestId('account')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /login/i })).not.toBeInTheDocument()
  })
})
