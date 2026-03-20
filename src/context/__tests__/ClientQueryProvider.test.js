import React from 'react'
import { render } from '@testing-library/react'
import ClientQueryProvider, { globalQueryClient, shouldDehydrateQuery, setDevLogLogger, __resetIsInitializedForTests } from '../ClientQueryProvider'
import { act } from '@testing-library/react';

jest.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: () => <div data-testid="devtools" />
}))

jest.mock('@tanstack/query-sync-storage-persister', () => ({
  createSyncStoragePersister: jest.fn(() => ({
    persist: jest.fn(),
    restore: jest.fn(),
    remove: jest.fn(),
    restoreClient: jest.fn(), // Add missing function for PersistQueryClientProvider
  }))
}))

  let devLog;
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    devLog = {
      log: jest.fn(),
      warn: jest.fn(),
    };
    // Reset isInitialized to ensure useEffect runs
    __resetIsInitializedForTests();
  });

  it('renders children and devtools', () => {
    const { getByText, getByTestId } = render(
      <ClientQueryProvider logger={devLog}>
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
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
    };
    __resetIsInitializedForTests();
    globalQueryClient.getQueryData = jest.fn(() => undefined);
    act(() => {
      render(<ClientQueryProvider logger={logger}><div /></ClientQueryProvider>);
    });
    expect(logger.log).toHaveBeenCalledWith('🏗️ Checking existing cache state on app startup...');
    expect(logger.log).toHaveBeenCalledWith('📦 Memory cache empty on startup - React Query will restore from localStorage or API');
    expect(logger.log).toHaveBeenCalledWith('✅ Cache state check completed');
  });

  it('logs cache found if labs data exists', () => {
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
    };
    __resetIsInitializedForTests();
    globalQueryClient.getQueryData = jest.fn(() => [{}, {}]);
    act(() => {
      render(<ClientQueryProvider logger={logger}><div /></ClientQueryProvider>);
    });
    expect(logger.log).toHaveBeenCalledWith('📦 Found existing all-labs cache with', 2, 'entries');
  });

  it('logs warning if cache check throws', () => {
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
    };
    __resetIsInitializedForTests();
    globalQueryClient.getQueryData = jest.fn(() => { throw new Error('fail') });
    act(() => {
      render(<ClientQueryProvider logger={logger}><div /></ClientQueryProvider>);
    });
    expect(logger.warn).toHaveBeenCalledWith('⚠️ Failed to check cache state:', 'fail');
  });

  it('shouldDehydrateQuery persists correct types and logs', () => {
    const persistTypes = ['labs', 'provider', 'providers', 'reservations', 'bookings', 'labImage', 'metadata'];
    persistTypes.forEach(type => {
      const query = { queryKey: [type], state: { status: 'success', data: {} } };
      expect(shouldDehydrateQuery(query)).toBe(true);
    });
  });

  it('shouldDehydrateQuery excludes reservations/checkAvailable', () => {
    const query = { queryKey: ['reservations', 'checkAvailable'], state: { status: 'success', data: {} } };
    expect(shouldDehydrateQuery(query)).toBe(false);
  });

  it('shouldDehydrateQuery excludes unsuccessful queries', () => {
    const query = { queryKey: ['labs'], state: { status: 'error', data: undefined } };
    expect(shouldDehydrateQuery(query)).toBe(false);
  });

  it('shouldDehydrateQuery excludes invalid query structure', () => {
    const query = { queryKey: [], state: { status: 'success', data: {} } };
    expect(shouldDehydrateQuery(query)).toBe(false);
  });

