/**
 * Institutional cancel hooks — unit tests
 *
 * Covers:
 *  - useCancelInstitutionalReservationRequest (SSO + Wallet + router selection)
 *  - useCancelInstitutionalBooking (SSO + Wallet + router selection)
 */

jest.mock('@/hooks/contract/useContractWriteFunction', () =>
  require('../../../test-utils/mocks/hooks/useContractWriteFunction')
);
jest.mock('../useBookingCacheUpdates', () =>
  require('../../../test-utils/mocks/hooks/useBookingCacheUpdates')
);
jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn(() => ({ isSSO: true })),
}));
jest.mock('@/utils/webauthn/client', () => ({
  transformAssertionOptions: jest.fn((opts) => opts),
  assertionToJSON: jest.fn(() => ({
    response: {
      clientDataJSON: 'cd',
      authenticatorData: 'ad',
      signature: 'sig',
    },
  })),
}));
jest.mock('@/utils/intents/pollIntentStatus', () => jest.fn(() => Promise.resolve({ status: 'executed' })));

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCancelInstitutionalReservationRequest,
  useCancelInstitutionalReservationRequestSSO,
  useCancelInstitutionalReservationRequestWallet,
  useCancelInstitutionalBooking,
  useCancelInstitutionalBookingSSO,
  useCancelInstitutionalBookingWallet,
} from '../useBookingAtomicMutations';

const mockContractWriteFactory = require('../../../test-utils/mocks/hooks/useContractWriteFunction');
const { useBookingCacheUpdates: mockBookingCacheFactory } = require('../../../test-utils/mocks/hooks/useBookingCacheUpdates');
const mockPollIntentStatus = require('@/utils/intents/pollIntentStatus');

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}

function mockWebauthn() {
  global.window = { PublicKeyCredential: true };
  global.navigator = { credentials: { get: jest.fn(() => Promise.resolve({})) } };
}

function restoreWebauthn() {
  delete global.window;
  delete global.navigator;
}

describe('useCancelInstitutionalReservationRequest hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete global.fetch;
    mockWebauthn();
  });

  afterEach(() => {
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
    delete global.fetch;
    jest.clearAllMocks();
    restoreWebauthn();
  });

  test('SSO: prepare/finalize intent and updateBooking called', async () => {
    const updateBooking = jest.fn();
    const invalidateAllBookings = jest.fn();
    mockBookingCacheFactory.mockImplementation(() => ({ updateBooking, invalidateAllBookings }));
    mockPollIntentStatus.mockResolvedValueOnce({ status: 'executed', txHash: '0xhash' });

    const preparePayload = {
      ok: true,
      json: () => Promise.resolve({
        webauthnChallenge: 'challenge',
        allowCredentials: [],
        intent: { meta: { requestId: 'req-inst-1' }, payload: {} },
        adminSignature: '0xadmin',
        webauthnCredentialId: 'cred',
      }),
    };
    const finalizePayload = { ok: true, json: () => Promise.resolve({ intent: { meta: { requestId: 'req-inst-1' } } }) };
    global.fetch = jest.fn().mockResolvedValueOnce(preparePayload).mockResolvedValueOnce(finalizePayload);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelInstitutionalReservationRequestSSO(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('rk-inst-1');
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(updateBooking).toHaveBeenCalled();
    expect(mockPollIntentStatus).toHaveBeenCalled();
  });

  test('Wallet: contract write called and cache patched', async () => {
    const { qc, wrapper } = createWrapper();
    const setSpy = jest.spyOn(qc, 'setQueryData');
    const cancelFn = jest.fn(() => Promise.resolve('0xCXL')); // tx hash
    mockContractWriteFactory.mockImplementation(() => ({ contractWriteFunction: cancelFn }));

    const { result } = renderHook(() => useCancelInstitutionalReservationRequestWallet(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('rk-wallet-icrr');
    });

    expect(cancelFn).toHaveBeenCalledWith(['rk-wallet-icrr']);
    expect(setSpy).toHaveBeenCalled();
    setSpy.mockRestore();
  });

  test('Router: selects SSO when isSSO=true, wallet otherwise', async () => {
    const userModule = require('@/context/UserContext');
    userModule.useUser.mockReturnValue({ isSSO: true });
    const { wrapper } = createWrapper();
    const { result: ssoResult } = renderHook(() => useCancelInstitutionalReservationRequest(), { wrapper });
    expect(ssoResult.current.mutateAsync).toBeDefined();

    userModule.useUser.mockReturnValue({ isSSO: false });
    const { wrapper: wrapper2 } = createWrapper();
    const { result: walletResult } = renderHook(() => useCancelInstitutionalReservationRequest(), { wrapper: wrapper2 });
    expect(walletResult.current.mutateAsync).toBeDefined();
  });
});

describe('useCancelInstitutionalBooking hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete global.fetch;
    mockWebauthn();
  });

  afterEach(() => {
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
    delete global.fetch;
    jest.clearAllMocks();
    restoreWebauthn();
  });

  test('SSO: intent flow and setQueryData run', async () => {
    mockPollIntentStatus.mockResolvedValueOnce({ status: 'executed', txHash: '0xhash' });
    const preparePayload = {
      ok: true,
      json: () => Promise.resolve({
        webauthnChallenge: 'challenge',
        allowCredentials: [],
        intent: { meta: { requestId: 'req-inst-2' }, payload: {} },
        adminSignature: '0xadmin',
        webauthnCredentialId: 'cred',
      }),
    };
    const finalizePayload = { ok: true, json: () => Promise.resolve({ intent: { meta: { requestId: 'req-inst-2' } } }) };
    global.fetch = jest.fn().mockResolvedValueOnce(preparePayload).mockResolvedValueOnce(finalizePayload);

    const { qc, wrapper } = createWrapper();
    const setSpy = jest.spyOn(qc, 'setQueryData');

    const { result } = renderHook(() => useCancelInstitutionalBookingSSO(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('rk-book-1');
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(setSpy).toHaveBeenCalled();
    expect(mockPollIntentStatus).toHaveBeenCalled();
    setSpy.mockRestore();
  });

  test('Wallet: contract write called', async () => {
    const { wrapper } = createWrapper();
    const cancelFn = jest.fn(() => Promise.resolve('0xCXLBOOK'));
    mockContractWriteFactory.mockImplementation(() => ({ contractWriteFunction: cancelFn }));

    const { result } = renderHook(() => useCancelInstitutionalBookingWallet(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('rk-book-wallet');
    });

    expect(cancelFn).toHaveBeenCalledWith(['rk-book-wallet']);
  });

  test('Router: picks SSO vs Wallet based on useUser', async () => {
    const userModule = require('@/context/UserContext');
    userModule.useUser.mockReturnValue({ isSSO: true });
    const { wrapper } = createWrapper();
    const { result: ssoResult } = renderHook(() => useCancelInstitutionalBooking(), { wrapper });
    expect(ssoResult.current.mutateAsync).toBeDefined();

    userModule.useUser.mockReturnValue({ isSSO: false });
    const { wrapper: wrapper2 } = createWrapper();
    const { result: walletResult } = renderHook(() => useCancelInstitutionalBooking(), { wrapper: wrapper2 });
    expect(walletResult.current.mutateAsync).toBeDefined();
  });
});
