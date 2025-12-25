/**
 * Atomic React Query Hooks for Lab-related Write Operations
 * Each hook maps 1:1 to an API endpoint in /api/contract/lab/
 * All write operations for authenticated users generate intents to the institutional wallet.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { useUser } from '@/context/UserContext'
import { useOptimisticUI } from '@/context/OptimisticUIContext'
import { labQueryKeys, metadataQueryKeys } from '@/utils/hooks/queryKeys'
import { useLabCacheUpdates } from './useLabCacheUpdates'
import devLog from '@/utils/dev/logger'
import pollIntentStatus from '@/utils/intents/pollIntentStatus'
import pollIntentAuthorizationStatus from '@/utils/intents/pollIntentAuthorizationStatus'
import { ACTION_CODES } from '@/utils/intents/signInstitutionalActionIntent'
import { transformAssertionOptions, assertionToJSON } from '@/utils/webauthn/client'
import { useAccount, usePublicClient } from 'wagmi'
import { selectChain } from '@/utils/blockchain/selectChain'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { decodeEventLog } from 'viem'

const resolveAuthorizationInfo = (prepareData) => ({
  authorizationUrl: prepareData?.authorizationUrl || prepareData?.ceremonyUrl || null,
  authorizationSessionId: prepareData?.authorizationSessionId || prepareData?.sessionId || null,
});

async function awaitGatewayAuthorization(prepareData, { gatewayUrl } = {}) {
  const { authorizationUrl, authorizationSessionId } = resolveAuthorizationInfo(prepareData);
  if (!authorizationUrl || !authorizationSessionId) {
    return null;
  }

  const popup = window.open(
    authorizationUrl,
    'intent-authorization',
    'width=480,height=720,noopener,noreferrer'
  );
  if (!popup) {
    throw new Error('Authorization window was blocked');
  }

  const status = await pollIntentAuthorizationStatus(authorizationSessionId, {
    gatewayUrl: prepareData?.gatewayUrl || gatewayUrl,
  });

  const normalized = (status?.status || '').toUpperCase();
  if (normalized === 'FAILED') {
    throw new Error(status?.error || 'Intent authorization failed');
  }

  try {
    if (!popup.closed) {
      popup.close();
    }
  } catch {
    // ignore close errors
  }

  return status;
}

async function runActionIntent(action, payload) {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new Error('WebAuthn not supported in this environment');
  }

  const prepareResponse = await fetch('/api/gateway/intents/actions/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      action,
      payload,
      gatewayUrl: payload.gatewayUrl,
    }),
  });

  const prepareData = await prepareResponse.json();
  if (!prepareResponse.ok) {
    throw new Error(prepareData.error || `Failed to prepare action intent: ${prepareResponse.status}`);
  }

  const authorizationStatus = await awaitGatewayAuthorization(prepareData, { gatewayUrl: payload.gatewayUrl });
  if (authorizationStatus) {
    const requestId = authorizationStatus?.requestId || resolveRequestId(prepareData);
    return {
      ...prepareData,
      requestId,
      intent: prepareData.intent,
      authorization: authorizationStatus,
    };
  }

  const publicKey = transformAssertionOptions({
    challenge: prepareData.webauthnChallenge,
    allowCredentials: prepareData.allowCredentials || [],
    rpId: prepareData.webauthnRpId || undefined,
    userVerification: 'required',
    timeout: 90_000,
  });

  if (!publicKey) {
    throw new Error('Unable to build WebAuthn request options');
  }

  const assertion = await navigator.credentials.get({ publicKey });
  const assertionPayload = assertionToJSON(assertion);

  const finalizeResponse = await fetch('/api/gateway/intents/actions/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      meta: prepareData.intent?.meta,
      payload: prepareData.intent?.payload,
      adminSignature: prepareData.adminSignature,
      webauthnCredentialId: prepareData.webauthnCredentialId,
      webauthnClientDataJSON: assertionPayload?.response?.clientDataJSON,
      webauthnAuthenticatorData: assertionPayload?.response?.authenticatorData,
      webauthnSignature: assertionPayload?.response?.signature,
      gatewayUrl: payload.gatewayUrl,
    }),
  });

  const finalizeData = await finalizeResponse.json();
  if (!finalizeResponse.ok) {
    throw new Error(finalizeData.error || 'Failed to finalize action intent');
  }

  const requestId =
    finalizeData?.intent?.meta?.requestId ||
    resolveRequestId(prepareData);

  return {
    ...finalizeData,
    requestId,
    intent: finalizeData.intent || prepareData.intent,
  };
}

const resolveRequestId = (data) =>
  data?.requestId ||
  data?.intent?.meta?.requestId ||
  data?.intent?.requestId ||
  data?.intent?.request_id ||
  data?.intent?.requestId?.toString?.();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pollExecutedIntentForLabId = async (requestId, {
  gatewayUrl,
  signal,
  maxDurationMs = 60_000,
  initialDelayMs = 2_000,
  maxDelayMs = 5_000,
} = {}) => {
  if (!gatewayUrl || !requestId) return null;

  const start = Date.now();
  let delay = initialDelayMs;

  while (true) {
    if (signal?.aborted) {
      throw new Error('Intent polling aborted');
    }
    if (Date.now() - start > maxDurationMs) {
      return null;
    }

    try {
      const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/intents/${requestId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.labId) {
          return data;
        }
      }
    } catch (err) {
      devLog.warn('pollExecutedIntentForLabId error:', err?.message || err);
    }

    await sleep(delay);
    delay = Math.min(delay * 1.5, maxDelayMs);
  }
};

const scanOwnerTokensForUri = async ({
  publicClient,
  contractAddress,
  ownerAddress,
  uri,
  lookbackCount = 5,
}) => {
  if (!publicClient || !contractAddress || !ownerAddress || !uri) return null;

  try {
    const balanceRaw = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'balanceOf',
      args: [ownerAddress],
    });

    const balance = Number(balanceRaw);
    if (!Number.isFinite(balance) || balance <= 0) return null;

    const startIndex = Math.max(0, balance - lookbackCount);
    for (let index = balance - 1; index >= startIndex; index -= 1) {
      const tokenId = await publicClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'tokenOfOwnerByIndex',
        args: [ownerAddress, BigInt(index)],
      });

      const tokenUri = await publicClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'tokenURI',
        args: [tokenId],
      });

      if (tokenUri === uri) {
        return tokenId?.toString?.();
      }
    }
  } catch (err) {
    devLog.error('Failed scanning owner tokens for URI match:', err);
  }

  return null;
};

const findLabAddedIdFromReceipt = ({ receipt, contractAddress, providerAddress, uri }) => {
  if (!receipt?.logs?.length) return null;

  for (const log of receipt.logs) {
    if (!log?.address || log.address.toLowerCase() !== contractAddress?.toLowerCase()) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: contractABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded?.eventName !== 'LabAdded') continue;

      const labId = decoded.args?._labId?.toString?.();
      const provider = decoded.args?._provider;
      const decodedUri = decoded.args?._uri;

      if (!labId) continue;
      if (providerAddress && provider && provider.toLowerCase() !== providerAddress.toLowerCase()) continue;
      if (uri && decodedUri && decodedUri !== uri) continue;

      return labId;
    } catch {
      // Not a matching event log - ignore.
    }
  }

  return null;
};

// ===== MUTATIONS =====

// Intent hook for /api/contract/lab/addLab (institutional wallet executes)
export const useAddLabSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (labData) => {
      const intentResponse = await runActionIntent(ACTION_CODES.LAB_ADD, {
        labId: 0,
        uri: labData.uri,
        price: labData.price,
        accessURI: labData.accessURI,
        accessKey: labData.accessKey,
        gatewayUrl: labData.gatewayUrl,
      });

      const requestId = resolveRequestId(intentResponse);
      if (!requestId) {
        throw new Error('Institution intent did not return requestId');
      }

      devLog.log('useAddLabSSO intent created; polling status', { requestId });
      const statusResult = await pollIntentStatus(requestId, {
        gatewayUrl: labData.gatewayUrl,
        signal: labData.abortSignal,
        maxDurationMs: labData.pollMaxDurationMs,
        initialDelayMs: labData.pollInitialDelayMs,
        maxDelayMs: labData.pollMaxDelayMs,
      });

      const status = statusResult?.status;
      if (status !== 'executed') {
        const reason = statusResult?.error || statusResult?.reason || 'Intent not executed';
        throw new Error(reason);
      }

      let labId = statusResult?.labId?.toString?.();
      let txHash = statusResult?.txHash;

      // Some gateways may mark an intent executed before attaching the labId/txHash fields.
      if (!labId) {
        const followUp = await pollExecutedIntentForLabId(requestId, {
          gatewayUrl: labData.gatewayUrl,
          signal: labData.abortSignal,
          maxDurationMs: labData.postExecutePollMaxDurationMs ?? 60_000,
          initialDelayMs: labData.postExecutePollInitialDelayMs ?? 2_000,
          maxDelayMs: labData.postExecutePollMaxDelayMs ?? 5_000,
        });

        labId = followUp?.labId?.toString?.() || labId;
        txHash = followUp?.txHash || txHash;
      }

      if (!labId) throw new Error('Institution intent executed but did not include labId');

      return {
        requestId,
        labId,
        txHash,
        status,
      };
    },
    onSuccess: (data) => {
      const labId = data?.labId?.toString?.();
      queryClient.invalidateQueries({ queryKey: labQueryKeys.getAllLabs() });
      if (labId) {
        queryClient.invalidateQueries({ queryKey: labQueryKeys.getLab(labId) });
        queryClient.invalidateQueries({ queryKey: labQueryKeys.tokenURI(labId) });
      }
    },
    onError: (error) => {
      devLog.error('Failed to create lab intent:', error);
    },
    ...options,
  });
};
// Wallet hook for adding labs (on-chain tx)
export const useAddLabWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { chain, address: userAddress } = useAccount();
  const safeChain = selectChain(chain);
  const chainKey = safeChain.name.toLowerCase();
  const contractAddress = contractAddresses[chainKey];
  const publicClient = usePublicClient({ chainId: safeChain.id });
  const { addOptimisticLab, replaceOptimisticLab, removeOptimisticLab, invalidateAllLabs } = useLabCacheUpdates();
  const { contractWriteFunction: addLab } = useContractWriteFunction('addLab');

  return useMutation({
    mutationFn: async (labData) => {
      const optimisticLab = addOptimisticLab(labData);

      try {
        devLog.log('🔍 Optimistic lab added to cache:', optimisticLab.id);

        const uri = labData.uri || '';
        const rawPrice = labData.price || '0';
        let priceInContractUnits;
        try {
          priceInContractUnits = BigInt(rawPrice.toString());
        } catch (error) {
          devLog.error('Error converting price to BigInt:', { rawPrice, error });
          priceInContractUnits = BigInt('0');
        }
        const accessURI = labData.accessURI || '';
        const accessKey = labData.accessKey || '';
        
        const txHash = await addLab([uri, priceInContractUnits, accessURI, accessKey]);
        
        devLog.log('🔗 useAddLabWallet - Transaction Hash:', txHash);

        // Update optimistic lab immediately with transaction hash so UI can reflect "sent" state
        try {
          replaceOptimisticLab(optimisticLab.id, {
            ...labData,
            id: optimisticLab.id,
            labId: optimisticLab.id,
            transactionHash: txHash,
            isPending: true,
            isProcessing: false,
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          devLog.error('Failed updating optimistic lab with txHash:', err);
        }

        let labId = null;
        if (publicClient && contractAddress) {
          try {
            const confirmations = Number(labData.confirmations ?? 1);
            const timeout = Number(labData.receiptTimeoutMs ?? 600_000);
            const receipt = await publicClient.waitForTransactionReceipt({
              hash: txHash,
              confirmations: Number.isFinite(confirmations) && confirmations > 0 ? confirmations : 1,
              timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 600_000,
            });

            labId = findLabAddedIdFromReceipt({
              receipt,
              contractAddress,
              providerAddress: userAddress,
              uri,
            });

            if (!labId) {
              labId = await scanOwnerTokensForUri({
                publicClient,
                contractAddress,
                ownerAddress: userAddress,
                uri,
                lookbackCount: Number(labData.scanLookbackCount ?? 5),
              });
            }
          } catch (err) {
            devLog.error('Failed to wait for tx receipt / resolve labId:', {
              err,
              txHash,
              chainId: safeChain?.id,
              contractAddress,
              uri,
              userAddress,
            });
          }
        }

        return { hash: txHash, optimisticId: optimisticLab.id, labId };
      } catch (error) {
        removeOptimisticLab(optimisticLab.id);
        throw error;
      }
    },
    onSuccess: (result, variables) => {
      try {
        const resolvedLabId = result.labId?.toString?.();
        const updatedLab = {
          ...variables,
          id: resolvedLabId || result.optimisticId,
          labId: resolvedLabId || result.optimisticId,
          transactionHash: result.hash,
          isPending: !resolvedLabId,
          isProcessing: false,
          timestamp: new Date().toISOString()
        };
        
        replaceOptimisticLab(result.optimisticId, updatedLab);

        if (resolvedLabId) {
          devLog.log('✅ Lab confirmed via wallet receipt', { labId: resolvedLabId });
          queryClient.invalidateQueries({ queryKey: labQueryKeys.getAllLabs() });
          queryClient.invalidateQueries({ queryKey: labQueryKeys.getLab(resolvedLabId) });
          queryClient.invalidateQueries({ queryKey: labQueryKeys.tokenURI(resolvedLabId) });
        } else {
          devLog.log('⚠️ Lab tx mined but labId not decoded; UI will rely on events/refetch');
        }
      } catch (error) {
        devLog.error('Failed to update optimistic data, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to add lab via wallet:', error);
    },
    ...options,
  });
};

// Unified add lab hook
export const useAddLab = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useAddLabSSO(options);
  const walletMutation = useAddLabWallet(options);

  return useMutation({
    mutationFn: async (labData) => (isSSO ? ssoMutation.mutateAsync(labData) : walletMutation.mutateAsync(labData)),
    onSuccess: () => {
      devLog.log('✅ Lab add mutation completed');
    },
    onError: (error) => {
      devLog.error('❌ Failed to add lab via unified hook:', error);
    },
    ...options,
  });
};

// Intent hook for updating labs (institutional wallet executes)
export const useUpdateLabSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab, invalidateAllLabs } = useLabCacheUpdates();

  return useMutation({
    mutationFn: async (updateData) => {
      const payload = {
        labId: updateData.labId,
        uri: updateData.labData?.uri,
        price: updateData.labData?.price,
        accessURI: updateData.labData?.accessURI,
        accessKey: updateData.labData?.accessKey,
        tokenURI: updateData.labData?.tokenURI,
        gatewayUrl: updateData.gatewayUrl,
      };
      const data = await runActionIntent(ACTION_CODES.LAB_UPDATE, payload);
      devLog.log('useUpdateLabSSO intent (webauthn):', data);
      return data;
    },
    onSuccess: (data, variables) => {
      try {
        if (variables.labId && variables.labData) {
          const requestId =
            data?.requestId ||
            data?.intent?.meta?.requestId ||
            data?.intent?.requestId ||
            data?.intent?.request_id ||
            data?.intent?.requestId?.toString?.();
          const updatedLab = {
            ...variables.labData,
            id: variables.labId,
            labId: variables.labId,
            isIntentPending: true,
            intentRequestId: requestId,
            intentStatus: 'requested',
            note: 'Requested to institution',
            timestamp: new Date().toISOString()
          };

          updateLab(variables.labId, updatedLab);
          if (variables.labData.uri) {
            queryClient.invalidateQueries({
              queryKey: metadataQueryKeys.byUri(variables.labData.uri),
              exact: true,
              refetchType: 'active'
            });
          }
        if (requestId) {
          (async () => {
            try {
              const result = await pollIntentStatus(requestId);
              const status = result?.status;
              const txHash = result?.txHash;
              const reason = result?.error || result?.reason;

              if (status === 'executed') {
                updateLab(variables.labId, {
                  ...variables.labData,
                  id: variables.labId,
                  labId: variables.labId,
                  transactionHash: txHash,
                  isIntentPending: false,
                  intentStatus: 'executed',
                  note: 'Executed by institution',
                  timestamp: new Date().toISOString()
                });
              } else if (status === 'failed' || status === 'rejected') {
                updateLab(variables.labId, {
                  ...variables.labData,
                  id: variables.labId,
                  labId: variables.labId,
                  isIntentPending: false,
                  intentStatus: status,
                  note: reason || 'Rejected by institution',
                  intentError: reason,
                  timestamp: new Date().toISOString()
                });
              }
            } catch (err) {
              devLog.error('Polling intent updateLab failed:', err);
              invalidateAllLabs();
            }
          })();
        }
        }
      } catch (error) {
        devLog.error('Failed to handle update intent response:', error);
        invalidateAllLabs();
      }
    },
    onError: (error) => {
      devLog.error('Failed to create update intent:', error);
    },
    ...options,
  });
};
// Wallet hook for updating labs
export const useUpdateLabWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab, invalidateAllLabs } = useLabCacheUpdates();
  const { contractWriteFunction: updateLabContract } = useContractWriteFunction('updateLab');

  return useMutation({
    mutationFn: async (updateData) => {
      const labId = updateData.labId;
      const labDataObj = updateData.labData || updateData;
      const uri = labDataObj.uri || '';
      const rawPrice = labDataObj.price || '0';
      let priceInContractUnits;
      try {
        priceInContractUnits = BigInt(rawPrice.toString());
      } catch (error) {
        devLog.error('Error converting price to BigInt:', { rawPrice, error });
        priceInContractUnits = BigInt('0');
      }
      const accessURI = labDataObj.accessURI || '';
      const accessKey = labDataObj.accessKey || '';
      
      const txHash = await updateLabContract([labId, uri, priceInContractUnits, accessURI, accessKey]);
      
      devLog.log('🔗 useUpdateLabWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, variables) => {
      try {
        if (variables.labId && variables.labData) {
          const updatedLab = {
            ...variables.labData,
            id: variables.labId,
            labId: variables.labId,
            transactionHash: result.hash,
            isPending: true,
            timestamp: new Date().toISOString()
          };

          updateLab(variables.labId, updatedLab);
          if (variables.labData.uri) {
            queryClient.invalidateQueries({ 
              queryKey: metadataQueryKeys.byUri(variables.labData.uri),
              exact: true,
              refetchType: 'active'
            });
          }
        } else {
          invalidateAllLabs();
        }
      } catch (error) {
        devLog.error('Failed granular cache update, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to update lab via wallet:', error);
    },
    ...options,
  });
};

// Unified update lab hook
export const useUpdateLab = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useUpdateLabSSO(options);
  const walletMutation = useUpdateLabWallet(options);

  return useMutation({
    mutationFn: async (updateData) => (isSSO ? ssoMutation.mutateAsync(updateData) : walletMutation.mutateAsync(updateData)),
    onSuccess: () => {
      devLog.log('✅ Lab update mutation completed');
    },
    onError: (error) => {
      devLog.error('❌ Failed to update lab via unified hook:', error);
    },
    ...options,
  });
};

// Intent hook for deleting labs (institutional wallet executes)
export const useDeleteLabSSO = (options = {}) => {
  const { updateLab, invalidateAllLabs, removeLab } = useLabCacheUpdates();

  return useMutation({
    mutationFn: async (labId) => {
      const data = await runActionIntent(ACTION_CODES.LAB_DELETE, {
        labId,
        gatewayUrl: undefined,
      });
      devLog.log('useDeleteLabSSO intent (webauthn):', data);
      return data;
    },
    onSuccess: (_data, labId) => {
      try {
        const requestId =
          _data?.requestId ||
          _data?.intent?.meta?.requestId ||
          _data?.intent?.requestId ||
          _data?.intent?.request_id ||
          _data?.intent?.requestId?.toString?.();
        updateLab(labId, {
          id: labId,
          labId: labId,
          isIntentPending: true,
          intentRequestId: requestId,
          intentStatus: 'requested',
          note: 'Requested to institution',
          status: 'deleting',
          timestamp: new Date().toISOString(),
        });

        if (requestId) {
          (async () => {
            try {
              const result = await pollIntentStatus(requestId);
              const status = result?.status;
              const reason = result?.error || result?.reason;

              if (status === 'executed') {
                removeLab(labId);
              } else if (status === 'failed' || status === 'rejected') {
                updateLab(labId, {
                  isIntentPending: false,
                  intentStatus: status,
                  intentError: reason,
                  note: reason || 'Rejected by institution',
                  status: 'delete-failed',
                  timestamp: new Date().toISOString(),
                });
              }
            } catch (err) {
              devLog.error('Polling delete intent failed:', err);
              invalidateAllLabs();
            }
          })();
        }
      } catch (error) {
        devLog.error('Failed to mark delete intent:', error);
        invalidateAllLabs();
      }
    },
    onError: (error) => {
      devLog.error('Failed to create delete intent:', error);
    },
    ...options,
  });
};
// Wallet hook for deleting labs
export const useDeleteLabWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { addOptimisticLab, removeLab, updateLab, invalidateAllLabs } = useLabCacheUpdates();
  const { contractWriteFunction: deleteLab } = useContractWriteFunction('deleteLab');

  return useMutation({
    mutationFn: async (labId) => {
      const optimisticDeletingLab = addOptimisticLab({
        id: labId,
        labId: labId,
        isDeleted: false,
        isPending: true,
        status: 'deleting'
      });

      try {
        devLog.log('🔍 Optimistic lab deletion via wallet:', labId);

        const txHash = await deleteLab([labId]);
        
        devLog.log('🔗 useDeleteLabWallet - Transaction Hash:', txHash);
        return { hash: txHash, optimisticId: optimisticDeletingLab.id };
      } catch (error) {
        removeLab(optimisticDeletingLab.id);
        throw error;
      }
    },
    onSuccess: (result, labId) => {
      try {
        const transactionPendingLab = {
          id: labId,
          labId: labId,
          transactionHash: result.hash,
          isPending: true,
          status: 'pending-deletion',
          timestamp: new Date().toISOString()
        };

        updateLab(labId, transactionPendingLab);
      } catch (error) {
        devLog.error('Failed to update optimistic data, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to delete lab via wallet:', error);
    },
    ...options,
  });
};

// Unified delete lab hook
export const useDeleteLab = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useDeleteLabSSO(options);
  const walletMutation = useDeleteLabWallet(options);

  return useMutation({
    mutationFn: async (labId) => (isSSO ? ssoMutation.mutateAsync(labId) : walletMutation.mutateAsync(labId)),
    onSuccess: () => {
      devLog.log('✅ Lab delete mutation completed');
    },
    onError: (error) => {
      devLog.error('❌ Failed to delete lab via unified hook:', error);
    },
    ...options,
  });
};

// Intent hook for listing labs (institutional wallet executes)
export const useListLabSSO = (options = {}) => {
  const { updateLab } = useLabCacheUpdates();

  return useMutation({
    mutationFn: async ({ labId, gatewayUrl }) => {
      const data = await runActionIntent(ACTION_CODES.LAB_LIST, {
        labId,
        gatewayUrl,
      });
      devLog.log('useListLabSSO intent (webauthn):', data);
      return data;
    },
    onSuccess: (data, { labId }) => {
      try {
        const requestId =
          data?.requestId ||
          data?.intent?.meta?.requestId ||
          data?.intent?.requestId ||
          data?.intent?.request_id ||
          data?.intent?.requestId?.toString?.();

        updateLab(labId, {
          id: labId,
          labId,
          isIntentPending: true,
          intentRequestId: requestId,
          intentStatus: 'requested',
          note: 'Requested to institution',
          timestamp: new Date().toISOString(),
        });

        if (requestId) {
          (async () => {
            try {
              const result = await pollIntentStatus(requestId);
              const status = result?.status;
              const txHash = result?.txHash;
              const reason = result?.error || result?.reason;

              if (status === 'executed') {
                updateLab(labId, {
                  id: labId,
                  labId,
                  isIntentPending: false,
                  intentStatus: 'executed',
                  status: 'listed',
                  transactionHash: txHash,
                  note: 'Executed by institution',
                  timestamp: new Date().toISOString(),
                });
              } else if (status === 'failed' || status === 'rejected') {
                updateLab(labId, {
                  id: labId,
                  labId,
                  isIntentPending: false,
                  intentStatus: status,
                  intentError: reason,
                  note: reason || 'Rejected by institution',
                  timestamp: new Date().toISOString(),
                });
              }
            } catch (err) {
              devLog.error('Polling list intent failed:', err);
            }
          })();
        }
      } catch (error) {
        devLog.error('Failed to handle list intent response:', error);
      }
    },
    onError: (error) => {
      devLog.error('Failed to create list intent:', error);
    },
    ...options,
  });
};
// Wallet hook for listing labs
export const useListLabWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab, invalidateAllLabs } = useLabCacheUpdates();
  const { setOptimisticListingState, completeOptimisticListingState, clearOptimisticListingState } = useOptimisticUI();
  const { contractWriteFunction: listToken } = useContractWriteFunction('listToken');
  
  return useMutation({
    mutationFn: async (labId) => {
      setOptimisticListingState(labId, true, true);
      const txHash = await listToken([labId]);
      devLog.log('🔗 useListLabWallet - Transaction Hash:', txHash);
      return { hash: txHash, labId };
    },
    onSuccess: (result, labId) => {
      completeOptimisticListingState(labId);
      try {
        queryClient.setQueryData(labQueryKeys.isTokenListed(labId), {
          labId: parseInt(labId),
          isListed: true,
          timestamp: new Date().toISOString(),
          processingTime: 0
        });        
        const transactionCompleteLab = {
          id: labId,
          labId: labId,
          transactionHash: result.hash,
          isPending: false,
          status: 'listed',
          timestamp: new Date().toISOString()
        };

        updateLab(labId, transactionCompleteLab);
      } catch (error) {
        devLog.error('Failed to update optimistic data, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error, labId) => {
      clearOptimisticListingState(labId);
      devLog.error('❌ Failed to list lab via wallet:', error);
    },
    ...options,
  });
};

// Unified list hook
export const useListLab = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useListLabSSO(options);
  const walletMutation = useListLabWallet(options);
  return isSSO ? ssoMutation : walletMutation;
};

// Intent hook for unlisting labs (institutional wallet executes)
export const useUnlistLabSSO = (options = {}) => {
  const { updateLab } = useLabCacheUpdates();

  return useMutation({
    mutationFn: async ({ labId, gatewayUrl }) => {
      const data = await runActionIntent(ACTION_CODES.LAB_UNLIST, {
        labId,
        gatewayUrl,
      });
      devLog.log('useUnlistLabSSO intent (webauthn):', data);
      return data;
    },
    onSuccess: (data, { labId }) => {
      try {
        const requestId =
          data?.requestId ||
          data?.intent?.meta?.requestId ||
          data?.intent?.requestId ||
          data?.intent?.request_id ||
          data?.intent?.requestId?.toString?.();

        updateLab(labId, {
          id: labId,
          labId,
          isIntentPending: true,
          intentRequestId: requestId,
          intentStatus: 'requested',
          note: 'Requested to institution',
          timestamp: new Date().toISOString(),
        });

        if (requestId) {
          (async () => {
            try {
              const result = await pollIntentStatus(requestId);
              const status = result?.status;
              const txHash = result?.txHash;
              const reason = result?.error || result?.reason;

              if (status === 'executed') {
                updateLab(labId, {
                  id: labId,
                  labId,
                  isIntentPending: false,
                  intentStatus: 'executed',
                  status: 'unlisted',
                  transactionHash: txHash,
                  note: 'Executed by institution',
                  timestamp: new Date().toISOString(),
                });
              } else if (status === 'failed' || status === 'rejected') {
                updateLab(labId, {
                  id: labId,
                  labId,
                  isIntentPending: false,
                  intentStatus: status,
                  intentError: reason,
                  note: reason || 'Rejected by institution',
                  timestamp: new Date().toISOString(),
                });
              }
            } catch (err) {
              devLog.error('Polling unlist intent failed:', err);
            }
          })();
        }
      } catch (error) {
        devLog.error('Failed to handle unlist intent response:', error);
      }
    },
    onError: (error) => {
      devLog.error('Failed to create unlist intent:', error);
    },
    ...options,
  });
};
// Wallet hook for unlisting labs
export const useUnlistLabWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab, invalidateAllLabs } = useLabCacheUpdates();
  const { setOptimisticListingState, completeOptimisticListingState, clearOptimisticListingState } = useOptimisticUI();
  const { contractWriteFunction: unlistToken } = useContractWriteFunction('unlistToken');
  
  return useMutation({
    mutationFn: async (labId) => {
      setOptimisticListingState(labId, false, true);
      const txHash = await unlistToken([labId]);
      devLog.log('🔗 useUnlistLabWallet - Transaction Hash:', txHash);
      return { hash: txHash, labId };
    },
    onSuccess: (result, labId) => {
      completeOptimisticListingState(labId);
      try {
        queryClient.setQueryData(labQueryKeys.isTokenListed(labId), {
          labId: parseInt(labId),
          isListed: false,
          timestamp: new Date().toISOString(),
          processingTime: 0
        });        
        const transactionCompleteLab = {
          id: labId,
          labId: labId,
          transactionHash: result.hash,
          isPending: false,
          status: 'unlisted',
          timestamp: new Date().toISOString()
        };

        updateLab(labId, transactionCompleteLab);
      } catch (error) {
        devLog.error('Failed to update optimistic data, falling back to invalidation:', error);
        invalidateAllLabs();
      }
    },
    onError: (error, labId) => {
      clearOptimisticListingState(labId);
      devLog.error('❌ Failed to unlist lab via wallet:', error);
    },
    ...options,
  });
};

// Unified unlist hook
export const useUnlistLab = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useUnlistLabSSO(options);
  const walletMutation = useUnlistLabWallet(options);
  return isSSO ? ssoMutation : walletMutation;
};

// Intent hook for setTokenURI (institutional wallet executes)
export const useSetTokenURISSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab } = useLabCacheUpdates();

  return useMutation({
    mutationFn: async ({ labId, tokenURI, gatewayUrl }) => {
      const data = await runActionIntent(ACTION_CODES.LAB_SET_URI, {
        labId,
        tokenURI,
        gatewayUrl,
      });
      devLog.log('useSetTokenURISSO intent (webauthn):', data);
      return data;
    },
    onSuccess: (_data, { labId, tokenURI }) => {
      try {
        updateLab(labId, {
          id: labId,
          labId,
          tokenURI,
          isIntentPending: true,
          intentStatus: 'requested',
          note: 'Requested to institution',
          timestamp: new Date().toISOString(),
        });

        const requestId =
          _data?.requestId ||
          _data?.intent?.meta?.requestId ||
          _data?.intent?.requestId ||
          _data?.intent?.request_id ||
          _data?.intent?.requestId?.toString?.();

        if (requestId) {
          (async () => {
            try {
              const result = await pollIntentStatus(requestId);
              const status = result?.status;
              const txHash = result?.txHash;
              const reason = result?.error || result?.reason;

              if (status === 'executed') {
                updateLab(labId, {
                  id: labId,
                  labId,
                  tokenURI,
                  isIntentPending: false,
                  intentStatus: 'executed',
                  status: 'listed',
                  transactionHash: txHash,
                  note: 'Executed by institution',
                  timestamp: new Date().toISOString(),
                });
              } else if (status === 'failed' || status === 'rejected') {
                updateLab(labId, {
                  id: labId,
                  labId,
                  tokenURI,
                  isIntentPending: false,
                  intentStatus: status,
                  intentError: reason,
                  note: reason || 'Rejected by institution',
                  timestamp: new Date().toISOString(),
                });
              }
            } catch (err) {
              devLog.error('Polling setTokenURI intent failed:', err);
            }
          })();
        }
      } catch (error) {
        devLog.error('Failed to handle setTokenURI intent:', error);
      }
    },
    onError: (error) => {
      devLog.error('Failed to create setTokenURI intent:', error);
    },
    ...options,
  });
};
// Wallet hook for setTokenURI
export const useSetTokenURIWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab, invalidateAllLabs } = useLabCacheUpdates();
  const { contractWriteFunction: setTokenURI } = useContractWriteFunction('setTokenURI');

  return useMutation({
    mutationFn: async (payload) => {
      const { labId, tokenURI } = payload;
      const txHash = await setTokenURI([labId, tokenURI]);
      return { hash: txHash, labId, tokenURI };
    },
    onSuccess: (result, variables) => {
      try {
        updateLab(variables.labId, {
          tokenURI: variables.tokenURI,
          transactionHash: result.hash,
          isPending: true,
          note: 'Pending confirmation',
          timestamp: new Date().toISOString(),
        });
        if (variables.tokenURI) {
          queryClient.invalidateQueries({
            queryKey: metadataQueryKeys.byUri(variables.tokenURI),
            exact: true,
            refetchType: 'active'
          });
        }
      } catch (error) {
        devLog.error('Failed cache update on setTokenURI wallet; invalidating:', error);
        invalidateAllLabs();
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to set token URI via wallet:', error);
    },
    ...options,
  });
};

// Unified hook for setTokenURI
export const useSetTokenURI = (options = {}) => {
  const { isSSO } = useUser();
  const ssoMutation = useSetTokenURISSO(options);
  const walletMutation = useSetTokenURIWallet(options);
  return isSSO ? ssoMutation : walletMutation;
};

// Re-export cache updates utility
export { useLabCacheUpdates } from './useLabCacheUpdates';
