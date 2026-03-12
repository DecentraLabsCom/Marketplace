#### Tests implementados para useReservationWallet
1. **Happy path**
   - Normaliza correctamente los datos de wagmi y devuelve la información esperada para un reservationKey válido.
2. **Error**
   - Si el hook de wagmi devuelve error, el hook propaga el error correctamente.
3. **Normalización de datos**
   - Soporta y normaliza correctamente cuando wagmi devuelve un array o datos incompletos.
#### Tests implementados para useReservationSSO
1. **Happy path**
   - Devuelve la información de la reserva correctamente para un reservationKey válido.
2. **Error en fetch**
   - Si la llamada a la API falla, el hook devuelve error (error puede ser null o instancia de Error según entorno).
3. **reservationKey inválido**
   - Si el reservationKey es null, undefined o vacío, el hook no ejecuta la query.

Tests implementados en src/hooks/booking/__tests__/useBookingAtomicQueries.test.js.
Todos los tests pasan y cubren los casos del plan.

## useBookingAtomicQueries
### useReservationSSO
1. **Happy path**
   - Devuelve la información de la reserva correctamente para un reservationKey válido.
2. **Error en fetch**
   - Si la llamada a la API falla, el hook devuelve error.
3. **reservationKey inválido**
   - Si el reservationKey es null, undefined o vacío, el hook no ejecuta la query.

Tests implementados en src/hooks/booking/__tests__/useBookingAtomicQueries.test.js.
Todos los tests pasan y cubren los casos del plan.

### useReservationWallet
1. **Happy path**
   - Normaliza correctamente los datos de wagmi y devuelve la información esperada para un reservationKey válido.
2. **Error**
   - Si el hook de wagmi devuelve error, el hook propaga el error correctamente.
3. **Normalización de datos**
   - Soporta y normaliza correctamente cuando wagmi devuelve un array o datos incompletos.

Tests implementados en src/hooks/booking/__tests__/useBookingAtomicQueries.test.js.
Todos los tests pasan y cubren los casos del plan.

### useReservationsOfTokenSSO
1. **Happy path**
   - Devuelve todas las reservas para un labId válido.
2. **labId inválido**
   - Si el labId es null o undefined, el hook no ejecuta la query.

Tests implementados en src/hooks/booking/__tests__/useBookingAtomicQueries.test.js.
Todos los tests pasan y cubren los casos del plan.

### useReservation (router)
1. **Normalización**
   - Normaliza datos de wagmi a formato SSO y cache key consistente.
2. **Network degradation**
   - Retenta una vez en caso de timeout y recupera.
3. **Error tras retries**
   - Propaga error si los retries se agotan.

Tests implementados en src/hooks/booking/__tests__/useBookingAtomicQueries.test.js.
Todos los tests pasan y cubren los casos del plan.

### usePendingLabPayouts
1. **Array de ids válidos**
   - Devuelve payouts correctamente para un array de labIds válidos.
2. **Ids inválidos**
   - Ignora ids inválidos (null, undefined, string vacía, negativos).
3. **Ids repetidos**
   - Elimina ids repetidos y solo consulta una vez por id.
4. **Array vacío o todos inválidos**
   - Devuelve payouts vacíos si el array de ids es vacío o todos inválidos.

Tests implementados en src/hooks/staking/__tests__/useStakingAtomicQueries.test.js.
Todos los tests pasan y cubren los casos del plan.

### usePendingLabPayoutWallet
1. **Happy path**
   - Normaliza correctamente los datos de wagmi y devuelve la información esperada para un labId válido.
2. **Error**
   - Si el hook de wagmi devuelve error, el hook propaga el error correctamente.
3. **Normalización de array**
   - Soporta y normaliza correctamente cuando wagmi devuelve un array de datos en vez de un objeto.

Tests implementados en src/hooks/staking/__tests__/useStakingAtomicQueries.test.js.
Todos los tests pasan y cubren los casos del plan.

### useRequiredStakeWallet
1. **Happy path**
   - Normaliza correctamente los datos de wagmi y devuelve la información esperada para un provider válido.
2. **Error**
   - Si el hook de wagmi devuelve error, el hook propaga el error correctamente.
3. **Normalización de array**
   - Soporta y normaliza correctamente cuando wagmi devuelve un array de datos en vez de un valor simple.
### useRequiredStakeSSO
1. **Happy path**
   - Devuelve la cantidad de stake requerida correctamente para un provider válido.
2. **Error en fetch**
   - Si la llamada a la API falla, el hook devuelve error.
3. **Provider inválido**
   - Si el provider es null, undefined o vacío, el hook no ejecuta la query.


### useLabWallet
1. **Happy path**
   - Devuelve datos normalizados correctamente para un labId válido.
2. **Error**
   - Propaga error si el contrato falla.
3. **labId inválido**
   - No ejecuta la query si el labId es null, undefined o vacío.

Tests implementados en src/hooks/lab/__tests__/useLabAtomicQueries.wallet.test.js.
Tests ejecutados y pasan correctamente (marzo 2026).
Todos los casos del plan están cubiertos.

### useLabBalanceWallet
1. **Happy path**
   - Devuelve balance normalizado correctamente para un ownerAddress válido.
2. **Error**
   - Propaga error si el contrato falla.
3. **ownerAddress inválido**
   - No ejecuta la query si el ownerAddress es null, undefined o vacío.

Tests implementados en src/hooks/lab/__tests__/useLabBalanceWallet.test.js.
Tests ejecutados y pasan correctamente (marzo 2026).
Todos los casos del plan están cubiertos.

### useLabTokenHook
1. **Estado inicial**
   - Devuelve correctamente balance, allowance y decimals desde el contrato.
2. **calculateReservationCost**
   - Calcula correctamente el coste de reserva.
3. **approveLabTokens**
   - Devuelve el hash de la transacción y llama a la función write.
4. **after receipt success**
   - Refresca balance y allowance tras confirmación de transacción.

Tests implementados en src/hooks/__tests__/useLabToken.test.js.

### useStakeInfoSSO
1. **Happy path**
   - Devuelve la información de stake correctamente para un provider válido.
2. **Error en fetch**
   - Si la llamada a la API falla, el hook devuelve error.
3. **Provider inválido**
   - Si el provider es null, undefined o vacío, el hook no ejecuta la query.

### useStakeInfoWallet
1. **Happy path**
   - Normaliza correctamente los datos de wagmi y devuelve la información esperada para un provider válido.
2. **Error**
   - Si el hook de wagmi devuelve error, el hook propaga el error correctamente.
3. **Normalización de array**
   - Soporta y normaliza correctamente cuando wagmi devuelve un array de datos en vez de un objeto.

### usePendingLabPayoutSSO
1. **Happy path**
   - Devuelve el payout pendiente correctamente para un labId válido.
2. **Error en fetch**
   - Si la llamada a la API falla, el hook devuelve error.
3. **labId inválido**
   - No ejecuta la query si el labId es null, undefined o vacío.

Todos los tests anteriores están implementados y pasan correctamente (marzo 2026).
Todos los casos del plan están cubiertos.

# Test Plan General: Marketplace

Este documento lleva un seguimiento de todos los tests implementados en el proyecto, por módulo y función.

## getMarketLabsSnapshot
1. **Llama a todos los métodos del contrato y transforma los datos correctamente**
   - Verifica que se llamen todos los métodos del contrato para cada labId válido.
   - Verifica que la estructura de datos transformada sea la esperada.
2. **Filtra correctamente IDs no numéricos y duplicados**
   - Verifica que solo los IDs numéricos y únicos sean procesados.
   - Los métodos del contrato solo se llaman para los IDs válidos.
3. **Excluye labs no listados por defecto**
   - Labs cuyo token no está listado no aparecen en el resultado por defecto.
4. **Incluye labs no listados si includeUnlisted=true**
   - Labs no listados aparecen si se llama con `{ includeUnlisted: true }`.
5. **Devuelve snapshot vacía si getLabsPaginated falla**
   - Si la llamada a getLabsPaginated falla, el resultado es `{ labs: [], totalLabs: 0 }`.
6. **Excluye labs cuyo getLab falla, pero incluye los válidos**
   - Si getLab falla para un lab, ese lab se excluye del resultado, pero los demás labs válidos sí aparecen.
7. **Incluye labs cuyo ownerOf falla, pero con ownerAddress null**
   - Si ownerOf falla para un lab, ese lab sigue incluido, pero con ownerAddress null.
8. **Considera listado el lab si isTokenListed falla**
   - Si isTokenListed falla, el lab se considera listado y aparece en el resultado.
9. **Incluye labs cuyo getLabReputation falla, pero con reputation null**
   - Si getLabReputation falla, el lab se incluye pero con reputation null.
10. **Incluye labs aunque getLabProviders falle (sin provider info)**
    - Si getLabProviders falla, el snapshot sigue devolviendo labs, pero sin información de provider.
11. **Incluye labs aunque loadMetadataDocument falle (sin metadata ni imágenes)**
    - Si la carga de metadata falla, el lab se incluye pero sin metadata ni imágenes.
12. **snapshotAt es siempre una fecha ISO válida**
    - Verifica que el campo snapshotAt siempre sea una fecha ISO válida.
13. **providerMapping asocia ownerAddress al provider correcto**
    - Verifica que el mapping de provider funciona correctamente (ownerAddress se asocia al provider correcto).
14. **transforma correctamente los campos base del lab**
    - Verifica que los campos base (uri, price, accessURI, accessKey, createdAt) se transforman correctamente para distintos valores de entrada.

## useStakingAtomicQueries

### useStakeInfoWallet
1. **Happy path**
   - Normaliza correctamente los datos de wagmi y devuelve la información esperada para un provider válido.
2. **Error**
   - Si el hook de wagmi devuelve error, el hook propaga el error correctamente.
3. **Normalización de array**
   - Soporta y normaliza correctamente cuando wagmi devuelve un array de datos en vez de un objeto.

### useStakeInfoSSO
1. **Happy path**
   - Devuelve la información de stake correctamente para un provider válido.
2. **Error en fetch**
   - Si la llamada a la API falla, el hook devuelve error.
3. **Provider inválido**
   - Si el provider es null, undefined o vacío, el hook no ejecuta la query.

Tests implementados en src/hooks/staking/__tests__/useStakingAtomicQueries.test.js.
Todos los tests pasan y cubren los casos del plan.

- [x] Booking atomic queries (integration): useReservationsOfTokenSSO, useReservationOfTokenByIndexSSO — tested via integration test (BookingAtomicQueries.integration.test.js) due to React Query v5/SSR test issues. All integration tests pass and validate real data flow.
