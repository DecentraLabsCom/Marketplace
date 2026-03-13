import React from 'react'
import { render } from '@testing-library/react'
import ClientQueryProvider, { globalQueryClient } from '../ClientQueryProvider'

jest.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: () => <div data-testid="devtools" />
}))

jest.mock('@tanstack/query-sync-storage-persister', () => ({
  createSyncStoragePersister: jest.fn(() => ({
    persist: jest.fn(),
    restore: jest.fn(),
    remove: jest.fn()
  }))
}))

describe('ClientQueryProvider', () => {
  it('renders children and devtools', () => {
    const { getByText, getByTestId } = render(
      <ClientQueryProvider>
        <div>child-content</div>
      </ClientQueryProvider>
    )
    expect(getByText('child-content')).toBeInTheDocument()
    expect(getByTestId('devtools')).toBeInTheDocument()
  })

  it('globalQueryClient is a QueryClient instance', () => {
    expect(globalQueryClient).toBeInstanceOf(Object)
    expect(typeof globalQueryClient.getQueryData).toBe('function')
    expect(typeof globalQueryClient.setQueryData).toBe('function')
  })
})
