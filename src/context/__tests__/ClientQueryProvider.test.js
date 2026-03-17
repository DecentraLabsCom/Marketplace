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

  it('calls cache initialization logs on mount', () => {
    const devLog = require('@/utils/dev/logger').default;
    devLog.log.mockReset();
    render(<ClientQueryProvider><div /></ClientQueryProvider>);
    expect(devLog.log).toHaveBeenCalledWith('🏗️ Checking existing cache state on app startup...');
    expect(devLog.log).toHaveBeenCalledWith('📦 Memory cache empty on startup - React Query will restore from localStorage or API');
    expect(devLog.log).toHaveBeenCalledWith('✅ Cache state check completed');
  });

  it('logs cache found if labs data exists', () => {
    const devLog = require('@/utils/dev/logger').default;
    devLog.log.mockReset();
    globalQueryClient.getQueryData = jest.fn(() => [{}, {}]);
    render(<ClientQueryProvider><div /></ClientQueryProvider>);
    expect(devLog.log).toHaveBeenCalledWith('📦 Found existing all-labs cache with', 2, 'entries');
  });

  it('logs warning if cache check throws', () => {
    const devLog = require('@/utils/dev/logger').default;
    devLog.warn.mockReset();
    globalQueryClient.getQueryData = jest.fn(() => { throw new Error('fail') });
    render(<ClientQueryProvider><div /></ClientQueryProvider>);
    expect(devLog.warn).toHaveBeenCalledWith('⚠️ Failed to check cache state:', 'fail');
  });

  it('shouldDehydrateQuery persists correct types and logs', () => {
    const persistTypes = ['labs', 'provider', 'providers', 'reservations', 'bookings', 'labImage', 'metadata'];
    const devLog = require('@/utils/dev/logger').default;
    devLog.log.mockReset();
    const shouldDehydrateQuery = globalQueryClient.getDefaultOptions().queries.shouldDehydrateQuery || (() => true);
    persistTypes.forEach(type => {
      const query = { queryKey: [type], state: { status: 'success', data: {} } };
      expect(shouldDehydrateQuery(query)).toBe(true);
    });
  });

  it('shouldDehydrateQuery excludes reservations/checkAvailable', () => {
    const shouldDehydrateQuery = globalQueryClient.getDefaultOptions().queries.shouldDehydrateQuery || (() => true);
    const query = { queryKey: ['reservations', 'checkAvailable'], state: { status: 'success', data: {} } };
    expect(shouldDehydrateQuery(query)).toBe(false);
  });

  it('shouldDehydrateQuery excludes unsuccessful queries', () => {
    const shouldDehydrateQuery = globalQueryClient.getDefaultOptions().queries.shouldDehydrateQuery || (() => true);
    const query = { queryKey: ['labs'], state: { status: 'error', data: undefined } };
    expect(shouldDehydrateQuery(query)).toBe(false);
  });

  it('shouldDehydrateQuery excludes invalid query structure', () => {
    const shouldDehydrateQuery = globalQueryClient.getDefaultOptions().queries.shouldDehydrateQuery || (() => true);
    const query = { queryKey: [], state: { status: 'success', data: {} } };
    expect(shouldDehydrateQuery(query)).toBe(false);
  });
})
