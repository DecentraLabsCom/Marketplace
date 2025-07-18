# Sistema de Pago con Token LAB

## Descripción General

El sistema de pago implementado permite a los usuarios realizar reservas de laboratorio pagando con tokens LAB. El sistema está completamente integrado con el flujo de reservas existente y maneja automáticamente la aprobación de tokens y los pagos.

**Estado del Sistema**: ✅ **COMPLETAMENTE FUNCIONAL**

## Componentes Implementados

### 1. Hook personalizado: `useLabToken.js`
- **Ubicación**: `src/hooks/useLabToken.js`
- **Funcionalidad**:
  - Obtiene el balance de tokens LAB del usuario
  - Maneja la aprobación de tokens para el contrato
  - Calcula el costo total de la reserva
  - Proporciona funciones de formateo para mostrar los balances

**Uso correcto en componentes**:
```javascript
const { 
  balance: userBalance,
  allowance: userAllowance,
  calculateReservationCost, 
  checkBalanceAndAllowance, 
  approveLabTokens, 
  formatTokenAmount: formatBalance,
  isLoading: isLabTokenLoading,
  labTokenAddress
} = useLabToken();
```

### 2. Componente de UI: `LabTokenInfo.js`
- **Ubicación**: `src/components/LabTokenInfo.js`
- **Funcionalidad**:
  - Muestra el balance actual del usuario
  - Muestra el costo de la reserva
  - Indica si se necesita aprobación de tokens
  - Muestra alertas visuales para balances insuficientes

**Parámetros correctos**:
```javascript
<LabTokenInfo 
  labPrice={selectedLab.price}
  durationMinutes={time}
/>
```

### 3. Integración en reservas: `LabReservation.js`
- **Modificaciones**:
  - Integración del hook `useLabToken`
  - Validación de balance antes de realizar reserva
  - Manejo automático de aprobación de tokens
  - Flujo de pago integrado en `handleWalletBooking`

**Cálculo de costo**:
```javascript
const totalCost = selectedLab ? calculateReservationCost(selectedLab.price, time) : 0n;
```

## Flujo de Pago

### Para usuarios con Wallet conectado:

1. **Validación inicial**:
   - Verificar conexión de wallet
   - Verificar red correcta
   - Verificar laboratorio y hora seleccionados

2. **Cálculo de costo**:
   - Precio por hora del laboratorio (desde metadata)
   - Duración de la reserva (timeslot)
   - Costo total = precio × (duración en minutos / 60)

3. **Validación de balance**:
   - Verificar que el usuario tenga suficientes tokens LAB
   - Mostrar mensaje de error si es insuficiente

4. **Aprobación de tokens**:
   - Verificar allowance actual
   - Si es insuficiente, solicitar aprobación
   - Mostrar progreso de aprobación

5. **Realizar reserva**:
   - Ejecutar transacción de reserva
   - El contrato transferirá automáticamente los tokens
   - Mostrar confirmación de pago

### Para usuarios SSO:
- El flujo de pago no se aplica (mantiene lógica original)

## Características Técnicas

### Contrato LAB Token
- **Tipo**: ERC-20 estándar
- **Addresses**: Definidas en `contracts/lab.js`
- **Funciones utilizadas**:
  - `balanceOf()`: Obtener balance del usuario
  - `allowance()`: Verificar aprobación actual
  - `approve()`: Aprobar tokens para el contrato

### Integración con wagmi
- Usa hooks de wagmi para interactuar con contratos
- Manejo automático de eventos y estados de transacción
- Integración con la configuración de red existente

### Manejo de errores
- Validación de balance insuficiente
- Manejo de rechazo de transacciones por el usuario
- Notificaciones informativas en cada paso del proceso

## Configuración de Precios

### Formato de precio en metadata
- El precio se almacena en la propiedad `price` del laboratorio
- Formato: `"25 $LAB / hour"` (ejemplo)
- El sistema extrae el valor numérico y lo convierte a wei

### Cálculo de costo
```javascript
// Implementación actualizada en useLabToken.js
const calculateReservationCost = (labPrice, durationMinutes) => {
  if (!labPrice || !durationMinutes || !decimals) return 0n;
  
  try {
    const pricePerHour = parseFloat(labPrice);
    const pricePerMinute = pricePerHour / 60;
    const totalCost = pricePerMinute * durationMinutes;
    
    return parseUnits(totalCost.toString(), decimals);
  } catch (error) {
    console.error('Error calculating reservation cost:', error);
    return 0n;
  }
};

// Uso en LabReservation.js
const totalCost = selectedLab ? calculateReservationCost(selectedLab.price, time) : 0n;
```

## Validación y Testing

### Checklist de Funcionalidad
- ✅ **Hook useLabToken**: Mapeo correcto de variables
- ✅ **Cálculo automático**: totalCost calculado dinámicamente
- ✅ **Validación de balance**: userBalance >= totalCost
- ✅ **Aprobación de tokens**: approveLabTokens funcional
- ✅ **Formateo de números**: formatBalance para mostrar cantidades
- ✅ **Integración UI**: LabTokenInfo con parámetros correctos
- ✅ **Flujo completo**: De validación a pago exitoso

### Testing del Sistema
Para verificar completamente el sistema:

1. **Verificación de conexión**:
   - Conectar wallet de prueba
   - Verificar red correcta (Sepolia)
   - Confirmar que aparece balance de LAB tokens

2. **Validación de cálculos**:
   - Seleccionar laboratorio con precio definido
   - Verificar que se calcula costo automáticamente
   - Confirmar que se muestra información de pago

3. **Flujo de aprobación**:
   - Intentar reserva sin aprobación previa
   - Verificar solicitud de aprobación
   - Confirmar aprobación exitosa

4. **Proceso de pago**:
   - Ejecutar reserva completa
   - Verificar transferencia de tokens
   - Confirmar creación de reserva

### Logs y Debugging
```javascript
// Información de debug disponible
console.log('User Balance:', formatBalance(userBalance));
console.log('Required Cost:', formatBalance(totalCost));
console.log('Current Allowance:', formatBalance(userAllowance));
console.log('Lab Token Address:', labTokenAddress);
```

## Interfaz de Usuario

### Información mostrada
- Balance actual de tokens LAB
- Costo total de la reserva
- Estado de aprobación (si se necesita)
- Alertas visuales para problemas

### Estados del botón de reserva
- **Habilitado**: Cuando todo está listo para reservar
- **Deshabilitado**: Durante procesamiento o si faltan requisitos
- **Textos dinámicos**: "Sending...", "Confirming...", etc.

## Consideraciones de Seguridad

- Validación de balance antes de cada transacción
- Manejo seguro de aprobaciones de tokens
- Verificación de red antes de ejecutar transacciones
- Manejo de errores para transacciones fallidas

## Extensiones Futuras

1. **Soporte para múltiples tokens de pago**
2. **Descuentos por volumen o membresía**
3. **Sistema de reembolsos automáticos**
4. **Integración con sistema de facturación**

## Anexo: Archivos Modificados

### Archivos Principales
- `src/hooks/useLabToken.js` - Hook personalizado para operaciones LAB
- `src/components/LabTokenInfo.js` - Componente UI para información de pago
- `src/components/LabReservation.js` - Integración del flujo de pago
- `src/contracts/lab.js` - ABI y direcciones del token LAB

### Archivos de Documentación
- `LAB_PAYMENT_SYSTEM.md` - Documentación completa del sistema

### Estado Final del Proyecto
- ✅ **Sistema completo**: Pago con LAB tokens implementado
- ✅ **Errores corregidos**: Todas las variables y funciones funcionando
- ✅ **UI integrada**: Información de pago visible al usuario
- ✅ **Servidor operativo**: Aplicación funcionando sin errores
- ✅ **Documentación actualizada**: Guías completas disponibles