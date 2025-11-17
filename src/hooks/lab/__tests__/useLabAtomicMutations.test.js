/**
 * Unit Tests: useLabAtomicMutations
 *
 * Tests the lab mutation hooks including:
 * - Add lab (SSO/Wallet/Unified)
 * - Update lab (SSO/Wallet/Unified)
 * - Delete lab (SSO/Wallet/Unified)
 * - List/Unlist lab (SSO/Wallet/Unified)
 * - SetTokenURI (SSO/Wallet/Unified)
 * - Optimistic updates and cache management
 * - Error handling and rollback
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAddLab,
  useAddLabSSO,
  useAddLabWallet,
  useUpdateLab,
  useUpdateLabSSO,
  useUpdateLabWallet,
  useDeleteLab,
  useDeleteLabSSO,
  useDeleteLabWallet,
  useListLab,
  useListLabSSO,
  useListLabWallet,
  useUnlistLab,
  useUnlistLabSSO,
  useUnlistLabWallet,
  useSetTokenURI,
  useSetTokenURISSO,
  useSetTokenURIWallet,
} from '@/hooks/lab/useLabAtomicMutations';

// Mock dependencies
const mockAddOptimisticLab = jest.fn((lab) => ({ ...lab, id: 'optimistic-id-123' }));
const mockReplaceOptimisticLab = jest.fn();
const mockRemoveOptimisticLab = jest.fn();
const mockUpdateLab = jest.fn();
const mockRemoveLab = jest.fn();
const mockInvalidateAllLabs = jest.fn();

jest.mock('@/hooks/lab/useLabCacheUpdates', () => ({
  useLabCacheUpdates: () => ({
    addOptimisticLab: mockAddOptimisticLab,
    replaceOptimisticLab: mockReplaceOptimisticLab,
    removeOptimisticLab: mockRemoveOptimisticLab,
    updateLab: mockUpdateLab,
    removeLab: mockRemoveLab,
    invalidateAllLabs: mockInvalidateAllLabs,
  }),
}));

const mockSetOptimisticListingState = jest.fn();
const mockClearOptimisticListingState = jest.fn();
const mockCompleteOptimisticListingState = jest.fn();

jest.mock('@/context/OptimisticUIContext', () => ({
  useOptimisticUI: () => ({
    setOptimisticListingState: mockSetOptimisticListingState,
    clearOptimisticListingState: mockClearOptimisticListingState,
    completeOptimisticListingState: mockCompleteOptimisticListingState,
  }),
}));

const mockContractWrite = jest.fn(() => Promise.resolve('0xMockTxHash'));

jest.mock('@/hooks/contract/useContractWriteFunction', () => ({
  __esModule: true,
  default: (functionName) => ({
    contractWriteFunction: mockContractWrite,
  }),
}));

const mockUserContext = {
  isSSO: false,
};

jest.mock('@/context/UserContext', () => ({
  useUser: () => mockUserContext,
}));

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Helper to create QueryClient wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

// Mock fetch globally
global.fetch = jest.fn();

describe('useLabAtomicMutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserContext.isSSO = false;
    global.fetch.mockClear();
  });

  describe('useAddLabSSO', () => {
    test('successfully adds lab via SSO', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ labId: 1, id: 1, hash: '0xSSOMockHash' }),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useAddLabSSO(), { wrapper });

      const labData = { name: 'Test Lab', price: '100' };

      await act(async () => {
        await result.current.mutateAsync(labData);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/contract/lab/addLabSSO',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(labData),
        })
      );

      expect(mockAddOptimisticLab).toHaveBeenCalledWith(labData);
      expect(mockReplaceOptimisticLab).toHaveBeenCalled();
    });

    test('removes optimistic update on error', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useAddLabSSO(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync({ name: 'Test Lab' });
        } catch (error) {
          // Expected error
        }
      });

      expect(mockRemoveOptimisticLab).toHaveBeenCalledWith('optimistic-id-123');
    });
  });

  describe('useAddLabWallet', () => {
    test('successfully adds lab via wallet', async () => {
      mockContractWrite.mockResolvedValue('0xWalletTxHash');

      const wrapper = createWrapper();
      const { result } = renderHook(() => useAddLabWallet(), { wrapper });

      const labData = {
        name: 'Test Lab',
        price: '100000000000000000',
        uri: 'ipfs://test',
      };

      await act(async () => {
        await result.current.mutateAsync(labData);
      });

      expect(mockContractWrite).toHaveBeenCalledWith([
        'ipfs://test',
        BigInt('100000000000000000'),
        '',
        '',
        '',
      ]);

      expect(mockAddOptimisticLab).toHaveBeenCalledWith(labData);
      expect(mockReplaceOptimisticLab).toHaveBeenCalled();
    });

    test('handles price conversion errors gracefully', async () => {
      mockContractWrite.mockResolvedValue('0xTxHash');

      const wrapper = createWrapper();
      const { result } = renderHook(() => useAddLabWallet(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          name: 'Test Lab',
          price: 'invalid-price', // Invalid price
        });
      });

      // Should fallback to 0
      expect(mockContractWrite).toHaveBeenCalledWith(['', BigInt('0'), '', '', '']);
    });

    test('removes optimistic update on wallet error', async () => {
      mockContractWrite.mockRejectedValue(new Error('User rejected transaction'));

      const wrapper = createWrapper();
      const { result } = renderHook(() => useAddLabWallet(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync({ name: 'Test Lab' });
        } catch (error) {
          // Expected error
        }
      });

      expect(mockRemoveOptimisticLab).toHaveBeenCalled();
    });
  });

  describe('useAddLab (Unified)', () => {
    test('uses SSO mutation when isSSO is true', async () => {
      mockUserContext.isSSO = true;
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ labId: 1, id: 1 }),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useAddLab(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ name: 'Test Lab' });
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/contract/lab/addLabSSO',
        expect.any(Object)
      );
    });

    test('uses wallet mutation when isSSO is false', async () => {
      mockUserContext.isSSO = false;
      mockContractWrite.mockResolvedValue('0xHash');

      const wrapper = createWrapper();
      const { result } = renderHook(() => useAddLab(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ name: 'Test Lab' });
      });

      expect(mockContractWrite).toHaveBeenCalled();
    });
  });

  describe('useUpdateLabSSO', () => {
    test('successfully updates lab via SSO', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUpdateLabSSO(), { wrapper });

      const updateData = {
        labId: 1,
        labData: { name: 'Updated Lab', uri: 'ipfs://new-uri' },
      };

      await act(async () => {
        await result.current.mutateAsync(updateData);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/contract/lab/updateLabSSO',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(updateData),
        })
      );

      expect(mockUpdateLab).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          name: 'Updated Lab',
          id: 1,
          labId: 1,
        })
      );
    });

    test('handles update error', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUpdateLabSSO(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync({
            labId: 1,
            labData: { name: 'Updated Lab' },
          });
        } catch (error) {
          expect(error.message).toContain('Failed to update lab');
        }
      });
    });
  });

  describe('useUpdateLabWallet', () => {
    test('successfully updates lab via wallet', async () => {
      mockContractWrite.mockResolvedValue('0xUpdateHash');

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUpdateLabWallet(), { wrapper });

      const updateData = {
        labId: 1,
        labData: {
          name: 'Updated Lab',
          price: '200000000000000000',
          uri: 'ipfs://updated',
        },
      };

      await act(async () => {
        await result.current.mutateAsync(updateData);
      });

      expect(mockContractWrite).toHaveBeenCalledWith([
        1,
        'ipfs://updated',
        BigInt('200000000000000000'),
        '',
        '',
        '',
      ]);

      expect(mockUpdateLab).toHaveBeenCalled();
    });
  });

  describe('useUpdateLab (Unified)', () => {
    test('uses SSO mutation when isSSO is true', async () => {
      mockUserContext.isSSO = true;
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUpdateLab(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          labId: 1,
          labData: { name: 'Updated' },
        });
      });

      expect(global.fetch).toHaveBeenCalled();
    });

    test('uses wallet mutation when isSSO is false', async () => {
      mockUserContext.isSSO = false;
      mockContractWrite.mockResolvedValue('0xHash');

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUpdateLab(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          labId: 1,
          labData: { name: 'Updated' },
        });
      });

      expect(mockContractWrite).toHaveBeenCalled();
    });
  });

  describe('useDeleteLabSSO', () => {
    test('successfully deletes lab via SSO', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useDeleteLabSSO(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(1);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/contract/lab/deleteLabSSO',
        expect.objectContaining({
          body: JSON.stringify({ labId: 1 }),
        })
      );

      expect(mockAddOptimisticLab).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          isDeleted: true,
          isPending: true,
        })
      );

      expect(mockRemoveLab).toHaveBeenCalledWith(1);
    });

    test('removes optimistic update on delete error', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useDeleteLabSSO(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync(1);
        } catch (error) {
          // Expected error
        }
      });

      expect(mockRemoveLab).toHaveBeenCalled();
    });
  });

  describe('useDeleteLabWallet', () => {
    test('successfully deletes lab via wallet', async () => {
      mockContractWrite.mockResolvedValue('0xDeleteHash');

      const wrapper = createWrapper();
      const { result } = renderHook(() => useDeleteLabWallet(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(1);
      });

      expect(mockContractWrite).toHaveBeenCalledWith([1]);

      expect(mockAddOptimisticLab).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          isDeleted: false,
          isPending: true,
          status: 'deleting',
        })
      );

      expect(mockUpdateLab).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          transactionHash: '0xDeleteHash',
          isPending: true,
          status: 'pending-deletion',
        })
      );
    });
  });

  describe('useDeleteLab (Unified)', () => {
    test('uses SSO mutation when isSSO is true', async () => {
      mockUserContext.isSSO = true;
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useDeleteLab(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(1);
      });

      expect(global.fetch).toHaveBeenCalled();
    });

    test('uses wallet mutation when isSSO is false', async () => {
      mockUserContext.isSSO = false;
      mockContractWrite.mockResolvedValue('0xHash');

      const wrapper = createWrapper();
      const { result } = renderHook(() => useDeleteLab(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(1);
      });

      expect(mockContractWrite).toHaveBeenCalled();
    });
  });

  describe('useListLabSSO', () => {
    test('successfully lists lab via SSO', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useListLabSSO(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(1);
      });

      expect(mockSetOptimisticListingState).toHaveBeenCalledWith(1, true, true);
      expect(mockClearOptimisticListingState).toHaveBeenCalledWith(1);
      expect(mockUpdateLab).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          isListed: true,
          status: 'listed',
          isPending: false,
        })
      );
    });

    test('clears optimistic state on error', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Failed to list' }),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useListLabSSO(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync(1);
        } catch (error) {
          // Expected error
        }
      });

      expect(mockClearOptimisticListingState).toHaveBeenCalledWith(1);
    });
  });

  describe('useListLabWallet', () => {
    test('successfully lists lab via wallet', async () => {
      mockContractWrite.mockResolvedValue('0xListHash');

      const wrapper = createWrapper();
      const { result } = renderHook(() => useListLabWallet(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(1);
      });

      expect(mockSetOptimisticListingState).toHaveBeenCalledWith(1, true, true);
      expect(mockCompleteOptimisticListingState).toHaveBeenCalledWith(1);
      expect(mockUpdateLab).toHaveBeenCalled();
    });

    test('clears optimistic state on wallet error', async () => {
      mockContractWrite.mockRejectedValue(new Error('User rejected'));

      const wrapper = createWrapper();
      const { result } = renderHook(() => useListLabWallet(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync(1);
        } catch (error) {
          // Expected error
        }
      });

      expect(mockClearOptimisticListingState).toHaveBeenCalledWith(1);
    });
  });

  describe('useListLab (Unified)', () => {
    test('returns SSO mutation when isSSO is true', () => {
      mockUserContext.isSSO = true;

      const wrapper = createWrapper();
      const { result } = renderHook(() => useListLab(), { wrapper });

      expect(result.current).toBeDefined();
      expect(result.current.mutate).toBeDefined();
    });

    test('returns wallet mutation when isSSO is false', () => {
      mockUserContext.isSSO = false;

      const wrapper = createWrapper();
      const { result } = renderHook(() => useListLab(), { wrapper });

      expect(result.current).toBeDefined();
      expect(result.current.mutate).toBeDefined();
    });
  });

  describe('useUnlistLabSSO', () => {
    test('successfully unlists lab via SSO', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUnlistLabSSO(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(1);
      });

      expect(mockSetOptimisticListingState).toHaveBeenCalledWith(1, false, true);
      expect(mockClearOptimisticListingState).toHaveBeenCalledWith(1);
      expect(mockUpdateLab).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          isListed: false,
          status: 'unlisted',
          isPending: false,
        })
      );
    });
  });

  describe('useUnlistLabWallet', () => {
    test('successfully unlists lab via wallet', async () => {
      mockContractWrite.mockResolvedValue('0xUnlistHash');

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUnlistLabWallet(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(1);
      });

      expect(mockSetOptimisticListingState).toHaveBeenCalledWith(1, false, true);
      expect(mockCompleteOptimisticListingState).toHaveBeenCalledWith(1);
      expect(mockUpdateLab).toHaveBeenCalled();
    });
  });

  describe('useUnlistLab (Unified)', () => {
    test('returns SSO mutation when isSSO is true', () => {
      mockUserContext.isSSO = true;

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUnlistLab(), { wrapper });

      expect(result.current).toBeDefined();
      expect(result.current.mutate).toBeDefined();
    });

    test('returns wallet mutation when isSSO is false', () => {
      mockUserContext.isSSO = false;

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUnlistLab(), { wrapper });

      expect(result.current).toBeDefined();
      expect(result.current.mutate).toBeDefined();
    });
  });

  describe('useSetTokenURISSO', () => {
    test('successfully sets token URI via SSO', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useSetTokenURISSO(), { wrapper });

      const uriData = { labId: 1, tokenURI: 'ipfs://new-token-uri' };

      await act(async () => {
        await result.current.mutateAsync(uriData);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/contract/lab/setTokenURI',
        expect.objectContaining({
          body: JSON.stringify(uriData),
        })
      );

      expect(mockUpdateLab).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          tokenURI: 'ipfs://new-token-uri',
        })
      );
    });
  });

  describe('useSetTokenURIWallet', () => {
    test('successfully sets token URI via wallet', async () => {
      mockContractWrite.mockResolvedValue('0xSetURIHash');

      const wrapper = createWrapper();
      const { result } = renderHook(() => useSetTokenURIWallet(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          labId: 1,
          tokenURI: 'ipfs://token-uri',
        });
      });

      expect(mockContractWrite).toHaveBeenCalledWith([1, 'ipfs://token-uri']);
      expect(mockUpdateLab).toHaveBeenCalled();
    });
  });

  describe('useSetTokenURI (Unified)', () => {
    test('uses SSO mutation when isSSO is true', async () => {
      mockUserContext.isSSO = true;
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useSetTokenURI(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ labId: 1, tokenURI: 'ipfs://uri' });
      });

      expect(global.fetch).toHaveBeenCalled();
    });

    test('uses wallet mutation when isSSO is false', async () => {
      mockUserContext.isSSO = false;
      mockContractWrite.mockResolvedValue('0xHash');

      const wrapper = createWrapper();
      const { result } = renderHook(() => useSetTokenURI(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ labId: 1, tokenURI: 'ipfs://uri' });
      });

      expect(mockContractWrite).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Fallbacks', () => {
    test('falls back to cache invalidation on granular update failure', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }), // Missing labId
      });

      mockUpdateLab.mockImplementation(() => {
        throw new Error('Cache update failed');
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUpdateLabSSO(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          labId: 1,
          labData: { name: 'Test' },
        });
      });

      expect(mockInvalidateAllLabs).toHaveBeenCalled();
    });

    test('handles missing lab ID in response', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({}), // No labId
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useAddLabSSO(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ name: 'Test Lab' });
      });

      expect(mockInvalidateAllLabs).toHaveBeenCalled();
    });
  });
});
