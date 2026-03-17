import { renderHook, act } from '@testing-library/react';
import useContractWriteFunction from './useContractWriteFunction';

// Mocks
const mockWriteContractAsync = jest.fn();
const mockConnection = { chain: { name: 'Ethereum', id: 1 }, address: '0x123', isConnected: true };

jest.mock('@/utils/dev/logger', () => ({ __esModule: true, default: { log: jest.fn() } }));
jest.mock('wagmi', () => ({
  useWriteContract: () => ({ writeContractAsync: mockWriteContractAsync }),
  useConnection: () => mockConnection
}));
jest.mock('@/contracts/diamond', () => ({
  contractABI: ['diamondABI'],
  contractAddresses: { ethereum: '0xdiamond', broken: undefined }
}));
jest.mock('@/contracts/lab', () => ({
  contractAddressesLAB: { ethereum: '0xlab' },
  labTokenABI: ['labABI']
}));
jest.mock('@/utils/blockchain/selectChain', () => ({
  selectChain: chain => chain
}));
jest.mock('@/utils/blockchain/connection', () => ({
  getConnectionAddress: () => '0x123',
  isConnectionConnected: () => true
}));
jest.mock('@/utils/blockchain/address', () => ({
  normalizeContractAddress: addr => addr
}));

describe('useContractWriteFunction', () => {
  let logCalls;
  beforeEach(() => {
    mockWriteContractAsync.mockReset();
    logCalls = [];
    const loggerModule = require('@/utils/dev/logger');
    loggerModule.default.log = (...args) => logCalls.push(args);
  });

  it('retorna contractWriteFunction y utilidades', () => {
    const { result } = renderHook(() => useContractWriteFunction('mint'));
    expect(typeof result.current.contractWriteFunction).toBe('function');
    expect(result.current.writeContractAsync).toBeDefined();
  });

  it('llama a writeContractAsync con diamond config', async () => {
    mockWriteContractAsync.mockResolvedValue('txHash');
    const { result } = renderHook(() => useContractWriteFunction('mint'));
    const tx = await act(() => result.current.contractWriteFunction(['arg1']));
    expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      address: '0xdiamond',
      abi: ['diamondABI'],
      functionName: 'mint',
      args: ['arg1']
    }));
    expect(tx).toBe('txHash');
  });

  it('llama a writeContractAsync con lab config', async () => {
    mockWriteContractAsync.mockResolvedValue('labTx');
    const { result } = renderHook(() => useContractWriteFunction('transfer', 'lab'));
    const tx = await act(() => result.current.contractWriteFunction(['labArg']));
    expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({
      address: '0xlab',
      abi: ['labABI'],
      functionName: 'transfer',
      args: ['labArg']
    }));
    expect(tx).toBe('labTx');
  });

  it('propaga error si wallet no está conectado', async () => {
    jest.resetModules();
    jest.doMock('@/utils/blockchain/connection', () => ({
      getConnectionAddress: () => '0x123',
      isConnectionConnected: () => false
    }));
    const useContractWriteFunctionReloaded = require('./useContractWriteFunction').default;
    const { result } = renderHook(() => useContractWriteFunctionReloaded('mint'));
    await expect(result.current.contractWriteFunction(['arg'])).rejects.toThrow('Wallet not connected');
  });

  it('propaga error si contract address no está definida', async () => {
    const { result } = renderHook(() => useContractWriteFunction('mint', 'diamond'));
    // Usamos chainKey 'broken' para simular address undefined
    result.current.contractWriteFunction([], { chainKey: 'broken' }).catch(e => {
      expect(e.message).toMatch(/Contract address not found/);
    });
  });

  it('llama a devLog.log con los datos correctos', async () => {
    mockWriteContractAsync.mockResolvedValue('txHash');
    const { result } = renderHook(() => useContractWriteFunction('mint'));
    await act(() => result.current.contractWriteFunction(['arg1'], { gas: 100 }));
    expect(logCalls).toContainEqual([
      'Contract write function called with:',
      expect.objectContaining({
        functionName: 'mint',
        args: ['arg1'],
        contractAddress: '0xdiamond',
        contractType: 'diamond',
        safeChain: 'Ethereum',
        chainId: 1
      })
    ]);
    expect(logCalls).toContainEqual([
      'Contract write result:', 'txHash'
    ]);
  });
});