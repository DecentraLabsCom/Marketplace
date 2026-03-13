- `src/components/register/InstitutionProviderRegister.js` (nuevo)
- `src/components/layout/GlobalNotificationStack.js` (nuevo)
### Cobertura añadida (marzo 2026)

Se agregaron tests para los siguientes componentes sencillos que tenían 0% de cobertura:

- `src/components/layout/ClientOnly.js`
- `src/components/layout/DataRefreshIndicator.js`
- `src/components/register/ProviderAccessDenied.js`

Todos los tests pasan correctamente y estos archivos ya cuentan con cobertura.
# Tests implementados para componentes sencillos

## AboutPage
Archivo: src/components/about/__tests__/AboutPage.test.js
1. Renderiza correctamente el título y las secciones Nebsyst y DecentraLabs.
2. Renderiza la descripción y el enlace de Nebsyst.
3. Renderiza la descripción y el enlace de DecentraLabs.
Todos los tests pasan y el archivo tiene 100% de cobertura.

## InstitutionalOnboardingWrapper
Archivo: src/components/auth/__tests__/InstitutionalOnboardingWrapper.test.js
1. Renderiza null si el usuario no es SSO.
2. Renderiza el modal con las props correctas si el usuario es SSO.
Mock de contexto y modal aplicado. Todos los tests pasan y el archivo tiene 100% de cobertura.

## ContactPage
Archivo: src/components/contact/__tests__/ContactPage.test.js
1. Renderiza correctamente el formulario y la información de contacto.
2. Envía el formulario y dispara el mailto con los datos correctos (mockeado).
Todos los tests pasan y el archivo tiene 100% de cobertura.

## FAQPage
Archivo: src/components/faq/__tests__/FAQPage.test.js
1. Renderiza el título y todas las preguntas frecuentes.
2. Renderiza las respuestas para cada pregunta.
Usa getAllByText para manejar coincidencias múltiples. Todos los tests pasan y el archivo tiene 100% de cobertura.
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

## BookingSummarySection
Archivo: src/components/dashboard/user/__tests__/BookingSummarySection.test.js
1. Muestra loading mientras carga (estado inicial).
2. Muestra mensaje de error si hay error en la carga.
3. Muestra correctamente los datos de resumen (total, active, upcoming, completed, pending).
4. Muestra 0 en todas las métricas si no hay datos.
Mock de hook useUserBookingsDashboard aplicado. Todos los tests pasan y el archivo tiene 100% de cobertura.

## Footer
Archivo: src/components/layout/__tests__/Footer.test.js
1. Renderiza el footer envuelto en el componente Container.
2. Muestra correctamente los logos de financiación (EU, NGI, Vietsch) con sus rutas y alt text.
3. Renderiza los enlaces internos de navegación (About, FAQ, Contact) con las rutas correctas.
4. Renderiza los enlaces externos a redes sociales con atributos de seguridad y clases de hover.
5. Muestra los iconos de redes sociales (Globe, Github, Twitter) usando mocks de react-icons.
6. Verifica accesibilidad: todas las imágenes tienen alt y los links son accesibles por teclado.
Mocks aplicados para next/image, next/link, Container y react-icons. Todos los tests pasan y el archivo tiene 100% de cobertura.

## AppProviders
Archivo: src/components/layout/__tests__/AppProviders.test.js
1. Renderiza todos los providers principales y los componentes de layout (Navbar, Footer, GlobalNotificationStack, PopupBlockerModal, DataRefreshIndicator, InstitutionalOnboardingWrapper) y los children.
2. Usa mocks para todos los context providers y componentes de layout, asegurando que cada uno exporta correctamente como default.
3. El test verifica que todos los elementos principales están presentes en el DOM.
Todos los tests pasan y el archivo tiene 100% de cobertura.

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

## ActiveLabCard
Archivo: src/components/dashboard/user/__tests__/ActiveLabCard.test.js
0 líneas de código de producción añadidas.
1. Muestra mensaje si no hay lab activo/próximo.
2. Renderiza datos principales, carrousel y enlace de exploración.
3. Renderiza LabAccess solo si isActive.
4. Renderiza iframe para documentos y mensaje alternativo si no hay docs.
5. Renderiza y deshabilita el botón de acción según estado.
6. Renderiza estados visuales (borde animado, fechas, etc.).
7. Cobertura de edge cases: datos nulos, fechas inválidas, props opcionales.
Notas:
- Se corrigió el test para el texto "Available today" asegurando que isActive sea true en el test correspondiente.
- Todos los tests pasan correctamente tras el ajuste y el archivo tiene 100% de cobertura.

## ActiveBookingSection
Archivo: src/components/dashboard/user/__tests__/ActiveBookingSection.test.js
0 líneas de código de producción añadidas.
1. Muestra mensaje si no hay bookings.
2. Renderiza correctamente activeBooking (cabecera, nombre, estado, botón, horas).
3. Renderiza correctamente nextBooking si no hay activeBooking.
4. Llama onBookingAction solo si está permitido.
5. Deshabilita el botón si isBusy.
- Mock aplicado para ActiveLabCard.
- El test es robusto a la zona horaria usando un matcher flexible para las horas.
Todos los tests pasan y el archivo tiene 100% de cobertura en los escenarios principales.

## BookingsList
Archivo: src/components/dashboard/user/__tests__/BookingsList.test.js
1. Renderiza correctamente los títulos y mensajes vacíos para upcoming y past.
2. Muestra el skeleton de carga y el mensaje de loading según el estado.
3. Filtra bookings correctamente: upcoming, past, excluye cancelados, excluye activos, excluye booking destacado, excluye pending de past.
4. Renderiza los items de booking y los botones de acción (cancel/refund) según el tipo.
5. Llama correctamente a los callbacks onCancel y onRefund.
6. Edge cases: maneja bookings sin fechas, sin labDetails, array vacío y currentTime nulo.
- Mocks aplicados para LabBookingItem, DashboardSectionSkeleton y utilidades de estado de booking.
Todos los tests pasan y el archivo tiene 100% de cobertura en los escenarios principales.

## backendProxyHelpers
Archivo: src/utils/api/__tests__/backendProxyHelpers.test.js
1. `resolveBackendUrl`: Devuelve la URL de backend desde searchParams o variable de entorno, o null si no está configurada.
2. `shouldUseServerToken`: Devuelve true si useServerToken=1 en searchParams, false en caso contrario.
3. `resolveForwardHeaders`: Reenvía el header Authorization válido del cliente, o genera un token de servidor si es inválido o useServerToken=1. Incluye x-api-key desde header o variable de entorno.
- Se mockea marketplaceJwtService para simular generación de token.
Todos los tests pasan y el archivo tiene 100% de cobertura en los escenarios principales.

## useGetIsSSO
Archivo: src/hooks/utils/useGetIsSSO.js (reexporta de utils/hooks/authMode.js)
1. `useGetIsSSO`: Devuelve el valor de isSSO desde el contexto de usuario o desde las opciones recibidas.
2. `getIsSSOFromOptions`: Permite forzar el valor de isSSO o usar fallback durante la inicialización.
- Tests cubren: override explícito, uso de contexto, fallback y error si no hay fuente.
Todos los tests pasan y el archivo tiene 100% de cobertura en los escenarios principales.

## Onboarding barrel (index.js)
Archivo: src/utils/onboarding/index.js
1. Exporta correctamente todos los utilitarios de onboarding: institutionalBackend, institutionalOnboarding, onboardingResultStore y callbackAuth.
2. El test verifica que todos los miembros esperados existen y son del tipo correcto (función u objeto).
Todos los tests pasan y el archivo tiene 100% de cobertura de exportación.