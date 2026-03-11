describe('useRequiredStakeWallet', () => {
  const validProvider = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
  const requiredStakeWagmiMock = BigInt('500000000000000000');

  beforeEach(() => {
    jest.resetModules();
  });

  it('happy path: normaliza correctamente los datos de wagmi', async () => {
    jest.doMock('@/hooks/contract/useDefaultReadContract', () => ({
      __esModule: true,
      default: () => ({
        data: requiredStakeWagmiMock,
        isSuccess: true,
        isError: false,
        isLoading: false,
      }),
    }));
    const { useRequiredStakeWallet } = require('../useStakingAtomicQueries');
    const { result } = renderHook(() => useRequiredStakeWallet(validProvider), {
      wrapper: createTestWrapper(),
    });
    expect(result.current.data).toEqual({
      requiredStake: '500000000000000000',
      provider: validProvider.toLowerCase(),
    });
    expect(result.current.isError).toBe(false);
  });

  it('error: el hook propaga el error de wagmi', async () => {
    jest.doMock('@/hooks/contract/useDefaultReadContract', () => ({
      __esModule: true,
      default: () => ({
        data: undefined,
        isSuccess: false,
        isError: true,
        error: new Error('wagmi error'),
      }),
    }));
    const { useRequiredStakeWallet } = require('../useStakingAtomicQueries');
    const { result } = renderHook(() => useRequiredStakeWallet(validProvider), {
      wrapper: createTestWrapper(),
    });
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('normalización: soporta array de datos en vez de valor simple', async () => {
    jest.doMock('@/hooks/contract/useDefaultReadContract', () => ({
      __esModule: true,
      default: () => ({
        data: [BigInt('123'), 'otro', 0],
        isSuccess: true,
        isError: false,
      }),
    }));
    const { useRequiredStakeWallet } = require('../useStakingAtomicQueries');
    const { result } = renderHook(() => useRequiredStakeWallet(validProvider), {
      wrapper: createTestWrapper(),
    });
    expect(result.current.data).toEqual({
      requiredStake: '123',
      provider: validProvider.toLowerCase(),
    });
  });
});
describe('useRequiredStakeSSO', () => {
  const validProvider = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
  const requiredStakeMock = { requiredStake: '500000000000000000' };

  afterEach(() => {
    global.fetch.mockReset && global.fetch.mockReset();
  });

  it('happy path: devuelve la cantidad de stake requerida para un provider válido', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(requiredStakeMock),
      })
    );
    const { result } = renderHook(() => useRequiredStakeSSO(validProvider), {
      wrapper: createTestWrapper(),
    });
    await waitForHookState(() => result.current, r => r.isSuccess);
    expect(result.current.data).toEqual(requiredStakeMock);
    expect(result.current.isError).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/contract/provider/getRequiredStake?provider=${validProvider}`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('error en fetch: el hook devuelve error si la llamada a la API falla', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Failed to fetch required stake' }),
      })
    );
    const { result } = renderHook(() => useRequiredStakeSSO(validProvider), {
      wrapper: createTestWrapper(),
    });
    await waitForHookState(() => result.current, r => r.isError);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBeUndefined();
  });

  it('provider inválido: no ejecuta la query si el provider es null, undefined o vacío', async () => {
    global.fetch = jest.fn();
    const { result: r1 } = renderHook(() => useRequiredStakeSSO(null), { wrapper: createTestWrapper() });
    const { result: r2 } = renderHook(() => useRequiredStakeSSO(undefined), { wrapper: createTestWrapper() });
    const { result: r3 } = renderHook(() => useRequiredStakeSSO(''), { wrapper: createTestWrapper() });
    expect(r1.current.isLoading).toBe(false);
    expect(r2.current.isLoading).toBe(false);
    expect(r3.current.isLoading).toBe(false);
    // Debe NO llamarse a la URL de required stake
    const requiredStakeUrl1 = '/api/contract/provider/getRequiredStake?provider=null';
    const requiredStakeUrl2 = '/api/contract/provider/getRequiredStake?provider=undefined';
    const requiredStakeUrl3 = '/api/contract/provider/getRequiredStake?provider=';
    const calls = global.fetch.mock.calls.map(call => call[0]);
    expect(calls).not.toContain(requiredStakeUrl1);
    expect(calls).not.toContain(requiredStakeUrl2);
    expect(calls).not.toContain(requiredStakeUrl3);
  });
});
// Test plan for useStakingAtomicQueries
// - useStakeInfoSSO: happy path, error, invalid provider
// - useStakeInfoWallet: happy path, error, normalization
// - useRequiredStakeSSO: happy path, error, invalid provider
// - useRequiredStakeWallet: happy path, error, normalization
// - usePendingLabPayoutSSO: happy path, error, invalid labId
// - usePendingLabPayoutWallet: happy path, error, normalization
// - usePendingLabPayouts: array, ids invalidos, repetidos, vacios

import { useStakeInfoSSO, useStakeInfoWallet, useRequiredStakeSSO, useRequiredStakeWallet, usePendingLabPayoutSSO, usePendingLabPayoutWallet, usePendingLabPayouts } from '../useStakingAtomicQueries';
import { renderHook } from '@testing-library/react';

// Helper para esperar un estado del hook (isSuccess/isError)
async function waitForHookState(getter, predicate, timeout = 2000, interval = 20) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (predicate(getter())) return;
    if (Date.now() - start > timeout) throw new Error('Timeout waiting for hook state');
    await new Promise(res => setTimeout(res, interval));
  }
}

// TODO: Implement tests for each hook variant as per plan above


import { createTestWrapper } from '@/test-utils/test-providers';

describe('useStakeInfoSSO', () => {
  const validProvider = '0x1234567890abcdef1234567890abcdef12345678';
  const stakeInfoMock = {
    stakedAmount: '1000000000000000000',
    slashedAmount: '0',
    lastReservationTimestamp: 1700000000,
    unlockTimestamp: 1700086400,
    canUnstake: false,
  };

  afterEach(() => {
    global.fetch.mockReset && global.fetch.mockReset();
  });

  it('happy path: devuelve la información de stake correctamente para un provider válido', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(stakeInfoMock),
      })
    );


    const { result, waitFor } = renderHook(() => useStakeInfoSSO(validProvider), {
      wrapper: createTestWrapper(),
    });

    await waitForHookState(() => result.current, r => r.isSuccess);
    expect(result.current.data).toEqual(stakeInfoMock);
    expect(result.current.isError).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/contract/provider/getStakeInfo?provider=${validProvider}`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('error en fetch: el hook devuelve error si la llamada a la API falla', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Failed to fetch stake info' }),
      })
    );


    const { result, waitFor } = renderHook(() => useStakeInfoSSO(validProvider), {
      wrapper: createTestWrapper(),
    });

    await waitForHookState(() => result.current, r => r.isError);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBeUndefined();
  });

  it('provider inválido: no ejecuta la query si el provider es null, undefined o vacío', async () => {
    global.fetch = jest.fn();


    const { result: r1 } = renderHook(() => useStakeInfoSSO(null), { wrapper: createTestWrapper() });
    const { result: r2 } = renderHook(() => useStakeInfoSSO(undefined), { wrapper: createTestWrapper() });
    const { result: r3 } = renderHook(() => useStakeInfoSSO(''), { wrapper: createTestWrapper() });

    expect(r1.current.isLoading).toBe(false);
    expect(r2.current.isLoading).toBe(false);
    expect(r3.current.isLoading).toBe(false);
    // Debe NO llamarse a la URL de stake info, aunque otros fetches ocurran por los contextos
    const stakeInfoUrl = '/api/contract/provider/getStakeInfo?provider=null';
    const stakeInfoUrl2 = '/api/contract/provider/getStakeInfo?provider=undefined';
    const stakeInfoUrl3 = '/api/contract/provider/getStakeInfo?provider=';
    const calls = global.fetch.mock.calls.map(call => call[0]);
    expect(calls).not.toContain(stakeInfoUrl);
    expect(calls).not.toContain(stakeInfoUrl2);
    expect(calls).not.toContain(stakeInfoUrl3);
  });

describe('useStakeInfoWallet', () => {
  const validProvider = '0x1234567890abcdef1234567890abcdef12345678';
  const stakeInfoWagmiMock = {
    stakedAmount: BigInt('1000000000000000000'),
    slashedAmount: BigInt('0'),
    lastReservationTimestamp: 1700000000,
    unlockTimestamp: 1700086400,
    canUnstake: false,
  };

  beforeEach(() => {
    jest.resetModules();
  });

  it('happy path: normaliza correctamente los datos de wagmi', async () => {
    // Simula el hook de wagmi devolviendo la estructura esperada
    jest.doMock('@/hooks/contract/useDefaultReadContract', () => ({
      __esModule: true,
      default: () => ({
        data: stakeInfoWagmiMock,
        isSuccess: true,
        isError: false,
        isLoading: false,
      }),
    }));
    const { useStakeInfoWallet } = require('../useStakingAtomicQueries');
    const { result } = renderHook(() => useStakeInfoWallet(validProvider), {
      wrapper: createTestWrapper(),
    });
    expect(result.current.data).toEqual({
      stakedAmount: '1000000000000000000',
      slashedAmount: '0',
      lastReservationTimestamp: 1700000000,
      unlockTimestamp: 1700086400,
      canUnstake: false,
    });
    expect(result.current.isError).toBe(false);
  });

  it('error: el hook propaga el error de wagmi', async () => {
    jest.doMock('@/hooks/contract/useDefaultReadContract', () => ({
      __esModule: true,
      default: () => ({
        data: undefined,
        isSuccess: false,
        isError: true,
        error: new Error('wagmi error'),
      }),
    }));
    const { useStakeInfoWallet } = require('../useStakingAtomicQueries');
    const { result } = renderHook(() => useStakeInfoWallet(validProvider), {
      wrapper: createTestWrapper(),
    });
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('normalización: soporta array de datos en vez de objeto', async () => {
    jest.doMock('@/hooks/contract/useDefaultReadContract', () => ({
      __esModule: true,
      default: () => ({
        data: [BigInt('1'), BigInt('2'), 3, 4, true],
        isSuccess: true,
        isError: false,
      }),
    }));
    const { useStakeInfoWallet } = require('../useStakingAtomicQueries');
    const { result } = renderHook(() => useStakeInfoWallet(validProvider), {
      wrapper: createTestWrapper(),
    });
    expect(result.current.data).toEqual({
      stakedAmount: '1',
      slashedAmount: '2',
      lastReservationTimestamp: 3,
      unlockTimestamp: 4,
      canUnstake: true,
    });
  });
});
// Cierre del describe principal
});

