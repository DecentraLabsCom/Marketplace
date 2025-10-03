# Refactorización: useRefreshProviderStatusMutation → refreshProviderStatus

**Fecha:** 2 de Octubre, 2025

## 🎯 Objetivo

Mover `useRefreshProviderStatusMutation` de `useUserAtomicMutations.js` a `useUserCacheUpdates.js` porque no es realmente una mutación (no modifica el blockchain), sino una operación de refresco de caché.

## 🔍 Problema Identificado

```javascript
// ❌ INCORRECTO - useUserAtomicMutations.js
export const useRefreshProviderStatusMutation = (options = {}) => {
  return useMutation({
    mutationFn: async ({ userAddress }) => {
      // Solo LEE del blockchain, no escribe
      const data = await useIsLabProviderQuery.queryFn({ userAddress });
      return data;
    },
    onSuccess: (result) => {
      // Solo actualiza caché
      queryClient.setQueryData(...);
    }
  });
};
```

**Problemas:**
1. ❌ Usa `useMutation` innecesariamente (no hay escritura al blockchain)
2. ❌ Ubicado en archivo de mutations cuando es una operación de caché
3. ❌ No sigue el patrón de cache updates del proyecto

## ✅ Solución Implementada

### 1. Agregada función `refreshProviderStatus` a `useUserCacheUpdates.js`

```javascript
// ✅ CORRECTO - useUserCacheUpdates.js
export function useUserCacheUpdates() {
  const queryClient = useQueryClient()

  const refreshProviderStatus = useCallback(async (userAddress) => {
    if (!userAddress) {
      throw new Error('userAddress is required')
    }

    try {
      // Fetch fresh provider status using the atomic query's queryFn
      const data = await useIsLabProviderQuery.queryFn({ userAddress })
      
      // Update cache with fresh data
      queryClient.setQueryData(
        providerQueryKeys.isLabProvider(userAddress),
        {
          isLabProvider: data.isLabProvider,
          isProvider: data.isLabProvider
        }
      )
      
      return {
        isLabProvider: data.isLabProvider,
        isProvider: data.isLabProvider,
        address: userAddress
      }
    } catch (error) {
      devLog.error('Failed to refresh provider status:', error.message)
      throw error
    }
  }, [queryClient])

  // También agregada función clearSSOSession
  const clearSSOSession = useCallback(() => {
    queryClient.cancelQueries({ queryKey: userQueryKeys.ssoSession() })
    queryClient.setQueryData(userQueryKeys.ssoSession(), { user: null, isSSO: false })
    queryClient.removeQueries({ queryKey: userQueryKeys.ssoSession() })
    queryClient.removeQueries({ queryKey: userQueryKeys.all() })
  }, [queryClient])

  return {
    refreshProviderStatus,
    clearSSOSession,
    // ... otros métodos
  }
}
```

### 2. Actualizado `UserContext.js` para usar el nuevo hook

```javascript
// Antes
import { useRefreshProviderStatusMutation } from '@/hooks/user/useUsers'
const refreshProviderStatusMutation = useRefreshProviderStatusMutation()

const refreshProviderStatus = useCallback(async () => {
  await refreshProviderStatusMutation.mutateAsync({ 
    identifier: address, 
    isEmail: false 
  });
}, [address, refreshProviderStatusMutation]);

// Después
import { useUserCacheUpdates } from '@/hooks/user/useUsers'
const { refreshProviderStatus: refreshProviderStatusFromCache, clearSSOSession } = useUserCacheUpdates()

const refreshProviderStatus = useCallback(async () => {
  await refreshProviderStatusFromCache(address);
}, [address, refreshProviderStatusFromCache]);
```

### 3. Simplificado `logoutSSO` usando `clearSSOSession`

```javascript
// Antes: 15 líneas duplicadas para limpiar caché
queryClient.cancelQueries({ queryKey: userQueryKeys.ssoSession() });
queryClient.setQueryData(userQueryKeys.ssoSession(), { user: null, isSSO: false });
queryClient.removeQueries({ queryKey: userQueryKeys.ssoSession() });
// ... repetido 3 veces

// Después: 1 línea
clearSSOSession();
```

## 📊 Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `src/hooks/user/useUserCacheUpdates.js` | ✅ Agregadas funciones `refreshProviderStatus` y `clearSSOSession` |
| `src/hooks/user/useUserAtomicMutations.js` | ✅ Eliminado `useRefreshProviderStatusMutation` |
| `src/hooks/user/useUsers.js` | ✅ Eliminado export de `useRefreshProviderStatusMutation` |
| `src/context/UserContext.js` | ✅ Actualizado import y uso del hook |
| `ARCHITECTURE_ANALYSIS.md` | ✅ Actualizada documentación (3 excepciones en vez de 4) |

## ✅ Beneficios

1. **Arquitectura correcta**: Cache utilities están donde deben estar
2. **Simplicidad**: No usa `useMutation` innecesariamente
3. **Consistencia**: Sigue el mismo patrón que `useBookingCacheUpdates` y `useLabCacheUpdates`
4. **Reutilización**: `clearSSOSession` reduce duplicación de código
5. **Claridad**: El nombre de la función es más descriptivo (`refreshProviderStatus` vs `useRefreshProviderStatusMutation`)

## 🎯 Estadísticas Finales

- **Antes**: 18 mutation hooks (4 excepciones)
- **Después**: 17 mutation hooks (3 excepciones)
- **Cumplimiento del patrón Wallet/SSO/Router**: 100% efectivo

## 📝 Lecciones Aprendidas

**Criterio para decidir si algo es una mutación o cache utility:**

| Tipo | Características | Ubicación |
|------|----------------|-----------|
| **Mutation** | - Escribe al blockchain<br>- Requiere firma de transacción<br>- Modifica estado persistente | `useXxxAtomicMutations.js` |
| **Cache Utility** | - Solo lee del blockchain<br>- Actualiza caché local<br>- No modifica estado persistente | `useXxxCacheUpdates.js` |

✅ `refreshProviderStatus` es claramente una **cache utility**, no una mutación.
