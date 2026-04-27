/**
 * Atomic React Query Hooks for Lab-related Write Operations
 * Institutional write operations use /api/backend/intents/* for managed signing.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useOptimisticUI } from '@/context/OptimisticUIContext'
import { useOptionalUser } from '@/context/UserContext'
import { labQueryKeys, metadataQueryKeys } from '@/utils/hooks/queryKeys'
import { useLabCacheUpdates } from './useLabCacheUpdates'
import devLog from '@/utils/dev/logger'
import pollIntentStatus from '@/utils/intents/pollIntentStatus'
import { awaitIntentAuthorization } from '@/utils/intents/authorizationOrchestrator'
import { ACTION_CODES } from '@/utils/intents/signInstitutionalActionIntent'
import {
  resolveIntentRequestId,
  createIntentMutationError,
  createAuthorizationCancelledError,
  markBrowserCredentialVerifiedFromIntent,
} from '@/utils/intents/clientFlowShared'
import { RESOURCE_TYPES } from '@/utils/resourceType'

const resolveRequestId = resolveIntentRequestId

const toResourceTypeCode = (value) => {
  if (value === 1 || value === '1' || value === RESOURCE_TYPES.FMU || value === 'fmu') {
    return 1
  }
  return 0
}

const resolveLabId = (data) => {
  const candidate = data?.labId ?? data?.lab_id ?? data?.labID;
  if (candidate === undefined || candidate === null) return null;
  if (typeof candidate === 'string') return candidate;
  try {
    return candidate.toString();
  } catch {
    return null;
  }
};

const updateListingCache = (queryClient, labId, isListed) => {
  if (!queryClient) return;

  const ids = new Set([labId, String(labId)]);
  const numericId = Number(labId);
  if (!Number.isNaN(numericId)) {
    ids.add(numericId);
  }

  ids.forEach((id) => {
    try {
      queryClient.setQueryData(labQueryKeys.isTokenListed(id), { isListed });
    } catch (err) {
      devLog.warn('Failed to update listing cache:', err);
    }
  });
};

const awaitBackendAuthorization = async (prepareData, { backendUrl, authToken, popup, presenceFn } = {}) => {
  return awaitIntentAuthorization(prepareData, {
    backendUrl,
    authToken,
    popup,
    presenceFn,
    source: 'lab-intent-authorization',
    requestIdResolver: resolveRequestId,
    closePopupInFinally: false,
    stopOnUnexpected4xx: true,
  })
}

async function runActionIntent(action, payload) {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new Error('WebAuthn not supported in this environment');
  }

  const prepareResponse = await fetch('/api/backend/intents/actions/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      action,
      payload,
      backendUrl: payload.backendUrl,
    }),
  });

  const prepareData = await prepareResponse.json();
  if (!prepareResponse.ok) {
    throw createIntentMutationError(
      prepareData,
      `Failed to prepare action intent: ${prepareResponse.status}`
    );
  }

  const authToken = prepareData?.backendAuthToken || null;
  const authorizationStatus = await awaitBackendAuthorization(prepareData, {
    backendUrl: payload.backendUrl,
    authToken,
    presenceFn: payload?.presenceFn,
  });
  const authorizationRequestId =
    authorizationStatus?.requestId || resolveRequestId(prepareData);
  if (authorizationStatus) {
    const normalizedStatus = (authorizationStatus.status || '').toUpperCase();
    if (normalizedStatus === 'FAILED') {
      throw new Error(authorizationStatus?.error || 'Authorization cancelled');
    }
    if (normalizedStatus === 'CANCELLED') {
      throw createAuthorizationCancelledError(authorizationStatus?.error || 'Authorization cancelled');
    }
    if (normalizedStatus === 'UNKNOWN' && !resolveRequestId(authorizationStatus) && !resolveRequestId(prepareData)) {
      throw createAuthorizationCancelledError(authorizationStatus?.error || 'Authorization cancelled');
    }
    if (normalizedStatus === 'SUCCESS') {
      markBrowserCredentialVerifiedFromIntent(prepareData);
    }
  }
  if (authorizationStatus) {
    const requestId = authorizationRequestId;
    return {
      ...prepareData,
      requestId,
      intent: prepareData.intent,
      authorization: authorizationStatus,
      backendAuthToken: authToken,
      backendAuthExpiresAt: prepareData?.backendAuthExpiresAt || null,
    };
  }
  throw createAuthorizationCancelledError('Authorization session unavailable');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pollExecutedIntentForLabId = async (requestId, {
  backendUrl,
  authToken,
  signal,
  maxDurationMs = 60_000,
  initialDelayMs = 2_000,
  maxDelayMs = 5_000,
} = {}) => {
  if (!backendUrl || !requestId) return null;

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
      const headers = { 'Content-Type': 'application/json' };
      if (typeof authToken === 'string' && authToken.trim().length > 0) {
        const value = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
        headers.Authorization = value;
      }
      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/intents/${requestId}`, {
        method: 'GET',
        headers,
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (resolveLabId(data)) {
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

// ===== MUTATIONS =====

// Intent hook for /api/backend/intents/actions/prepare (institution executes)
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
        resourceType: toResourceTypeCode(labData.resourceType),
        backendUrl: labData.backendUrl,
        presenceFn: labData?.presenceFn,
      });

      const requestId = resolveRequestId(intentResponse);
      if (!requestId) {
        throw new Error('Institution intent did not return requestId');
      }

      const authToken = intentResponse?.backendAuthToken;
      devLog.log('useAddLabSSO intent created; polling status', { requestId });
      const statusResult = await pollIntentStatus(requestId, {
        backendUrl: labData.backendUrl,
        authToken,
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

      let labId = resolveLabId(statusResult);
      let txHash = statusResult?.txHash;

      // Some backends may mark an intent executed before attaching the labId/txHash fields.
      if (!labId) {
        const followUp = await pollExecutedIntentForLabId(requestId, {
          backendUrl: labData.backendUrl,
          authToken,
          signal: labData.abortSignal,
          maxDurationMs: labData.postExecutePollMaxDurationMs ?? 60_000,
          initialDelayMs: labData.postExecutePollInitialDelayMs ?? 2_000,
          maxDelayMs: labData.postExecutePollMaxDelayMs ?? 5_000,
        });

        labId = resolveLabId(followUp) || labId;
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
// Unified add lab hook
export const useAddLab = (options = {}) => {
  return useAddLabSSO(options);
};

// Intent hook for updating labs (institution executes)
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
        resourceType: toResourceTypeCode(updateData.labData?.resourceType),
        backendUrl: updateData.backendUrl,
        presenceFn: updateData?.presenceFn,
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
          const authToken = data?.backendAuthToken;
          const backendUrl = data?.backendUrl || variables?.backendUrl;
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
                const result = await pollIntentStatus(requestId, { authToken, backendUrl });
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
                  queryClient.invalidateQueries({ queryKey: labQueryKeys.getLab(variables.labId), exact: true });
                  queryClient.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
                }
              } catch (err) {
                const reason = err?.message || 'Intent status unavailable';
                devLog.error('Polling intent updateLab failed:', err);
                updateLab(variables.labId, {
                  ...variables.labData,
                  id: variables.labId,
                  labId: variables.labId,
                  isIntentPending: false,
                  intentStatus: 'unknown',
                  intentError: reason,
                  note: reason,
                  timestamp: new Date().toISOString()
                });
                queryClient.invalidateQueries({ queryKey: labQueryKeys.getLab(variables.labId), exact: true });
                queryClient.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
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
    onError: (error, variables) => {
      devLog.error('Failed to create update intent:', error);
      if (variables?.labId) {
        queryClient.invalidateQueries({ queryKey: labQueryKeys.getLab(variables.labId), exact: true });
      }
      queryClient.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
    },
    ...options,
  });
};
// Unified update lab hook
export const useUpdateLab = (options = {}) => {
  return useUpdateLabSSO(options);
};

// Intent hook for deleting labs (institution executes)
export const useDeleteLabSSO = (options = {}) => {
  const { updateLab, invalidateAllLabs, removeLab } = useLabCacheUpdates();
  const userContext = useOptionalUser();
  const institutionBackendUrl = userContext?.institutionBackendUrl;

  const resolveDeletePayload = (input) => {
    if (input && typeof input === 'object') {
      return {
        labId: input.labId,
        backendUrl: input.backendUrl || institutionBackendUrl,
        presenceFn: input.presenceFn,
      };
    }

    return {
      labId: input,
      backendUrl: institutionBackendUrl,
      presenceFn: undefined,
    };
  };

  return useMutation({
    mutationFn: async (input) => {
      const { labId, backendUrl, presenceFn } = resolveDeletePayload(input);
      const data = await runActionIntent(ACTION_CODES.LAB_DELETE, {
        labId,
        backendUrl,
        presenceFn,
      });
      devLog.log('useDeleteLabSSO intent (webauthn):', data);
      return data;
    },
    onSuccess: (_data, input) => {
      const { labId } = resolveDeletePayload(input);
      try {
        const requestId =
          _data?.requestId ||
          _data?.intent?.meta?.requestId ||
          _data?.intent?.requestId ||
          _data?.intent?.request_id ||
          _data?.intent?.requestId?.toString?.();
        const authToken = _data?.backendAuthToken;
        const backendUrl = _data?.backendUrl || resolveDeletePayload(input).backendUrl;
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
              const result = await pollIntentStatus(requestId, { authToken, backendUrl });
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
              const reason = err?.message || 'Intent status unavailable';
              devLog.error('Polling delete intent failed:', err);
              updateLab(labId, {
                id: labId,
                labId,
                isIntentPending: false,
                intentStatus: 'unknown',
                intentError: reason,
                note: reason,
                status: 'delete-unknown',
                timestamp: new Date().toISOString(),
              });
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
// Unified delete lab hook
export const useDeleteLab = (options = {}) => {
  return useDeleteLabSSO(options);
};

// Intent hook for listing labs (institution executes)
export const useListLabSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab } = useLabCacheUpdates();
  const { clearOptimisticListingState } = useOptimisticUI();

  return useMutation({
    mutationFn: async ({ labId, backendUrl, presenceFn } = {}) => {
      const data = await runActionIntent(ACTION_CODES.LAB_LIST, {
        labId,
        backendUrl,
        presenceFn,
      });
      devLog.log('useListLabSSO intent (webauthn):', data);

      const requestId =
        data?.requestId ||
        data?.intent?.meta?.requestId ||
        data?.intent?.requestId ||
        data?.intent?.request_id ||
        data?.intent?.requestId?.toString?.();
      const authToken = data?.backendAuthToken;
      const resolvedBackendUrl = data?.backendUrl || backendUrl;

      if (!requestId) {
        throw new Error('Institution intent did not return requestId');
      }

      const result = await pollIntentStatus(requestId, { authToken, backendUrl: resolvedBackendUrl });
      const status = result?.status;
      if (status !== 'executed') {
        throw new Error(result?.error || result?.reason || 'List intent not executed');
      }

      return {
        ...data,
        requestId,
        authToken,
        backendUrl: resolvedBackendUrl,
        txHash: result?.txHash,
        status,
      };
    },
    onSuccess: (data, { labId }) => {
      try {
        updateLab(labId, {
          id: labId,
          labId,
          isIntentPending: false,
          intentRequestId: data?.requestId || null,
          intentStatus: 'executed',
          status: 'listed',
          transactionHash: data?.txHash,
          note: 'Executed by institution',
          timestamp: new Date().toISOString(),
        });
        updateListingCache(queryClient, labId, true);
        queryClient.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(labId), exact: true });
        queryClient.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
        queryClient.invalidateQueries({ queryKey: labQueryKeys.getLab(labId), exact: true });
      } catch (error) {
        devLog.error('Failed to handle list intent response:', error);
      }
    },
    onError: (error, variables) => {
      if (variables?.labId) {
        clearOptimisticListingState(variables.labId);
        queryClient.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(variables.labId), exact: true });
        queryClient.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
      }
      devLog.error('Failed to create list intent:', error);
    },
    ...options,
  });
};
// Unified list hook
export const useListLab = (options = {}) => {
  return useListLabSSO(options);
};

// Intent hook for unlisting labs (institution executes)
export const useUnlistLabSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab } = useLabCacheUpdates();
  const { clearOptimisticListingState } = useOptimisticUI();

  return useMutation({
    mutationFn: async ({ labId, backendUrl, presenceFn } = {}) => {
      const data = await runActionIntent(ACTION_CODES.LAB_UNLIST, {
        labId,
        backendUrl,
        presenceFn,
      });
      devLog.log('useUnlistLabSSO intent (webauthn):', data);

      const requestId =
        data?.requestId ||
        data?.intent?.meta?.requestId ||
        data?.intent?.requestId ||
        data?.intent?.request_id ||
        data?.intent?.requestId?.toString?.();
      const authToken = data?.backendAuthToken;
      const resolvedBackendUrl = data?.backendUrl || backendUrl;

      if (!requestId) {
        throw new Error('Institution intent did not return requestId');
      }

      const result = await pollIntentStatus(requestId, { authToken, backendUrl: resolvedBackendUrl });
      const status = result?.status;
      if (status !== 'executed') {
        throw new Error(result?.error || result?.reason || 'Unlist intent not executed');
      }

      return {
        ...data,
        requestId,
        authToken,
        backendUrl: resolvedBackendUrl,
        txHash: result?.txHash,
        status,
      };
    },
    onSuccess: (data, { labId }) => {
      try {
        updateLab(labId, {
          id: labId,
          labId,
          isIntentPending: false,
          intentRequestId: data?.requestId || null,
          intentStatus: 'executed',
          status: 'unlisted',
          transactionHash: data?.txHash,
          note: 'Executed by institution',
          timestamp: new Date().toISOString(),
        });
        updateListingCache(queryClient, labId, false);
        queryClient.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(labId), exact: true });
        queryClient.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
        queryClient.invalidateQueries({ queryKey: labQueryKeys.getLab(labId), exact: true });
      } catch (error) {
        devLog.error('Failed to handle unlist intent response:', error);
      }
    },
    onError: (error, variables) => {
      if (variables?.labId) {
        clearOptimisticListingState(variables.labId);
        queryClient.invalidateQueries({ queryKey: labQueryKeys.isTokenListed(variables.labId), exact: true });
        queryClient.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
      }
      devLog.error('Failed to create unlist intent:', error);
    },
    ...options,
  });
};
// Unified unlist hook
export const useUnlistLab = (options = {}) => {
  return useUnlistLabSSO(options);
};

// Intent hook for setTokenURI (institution executes)
export const useSetTokenURISSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateLab } = useLabCacheUpdates();

  return useMutation({
    mutationFn: async ({ labId, tokenURI, backendUrl, presenceFn } = {}) => {
      const data = await runActionIntent(ACTION_CODES.LAB_SET_URI, {
        labId,
        tokenURI,
        backendUrl,
        presenceFn,
      });
      devLog.log('useSetTokenURISSO intent (webauthn):', data);
      return data;
    },
    onSuccess: (_data, { labId, tokenURI, backendUrl }) => {
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
        const authToken = _data?.backendAuthToken;

        if (requestId) {
          (async () => {
            try {
              const result = await pollIntentStatus(requestId, { authToken, backendUrl });
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
              const reason = err?.message || 'Intent status unavailable';
              devLog.error('Polling setTokenURI intent failed:', err);
              updateLab(labId, {
                id: labId,
                labId,
                tokenURI,
                isIntentPending: false,
                intentStatus: 'unknown',
                intentError: reason,
                note: reason,
                timestamp: new Date().toISOString(),
              });
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
// Unified hook for setTokenURI
export const useSetTokenURI = (options = {}) => {
  return useSetTokenURISSO(options);
};

// Re-export cache updates utility
export { useLabCacheUpdates } from './useLabCacheUpdates';

