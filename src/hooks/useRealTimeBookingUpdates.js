import { useEffect, useState, useCallback } from 'react';

/**
 * Hook híbrido para actualizaciones eficientes de bookings activos.
 * Combina:
 * 1. Comparaciones locales rápidas (sin fetch)
 * 2. Actualizaciones precisas en momentos clave
 * 3. Sincronización con eventos de contrato
 * 
 * @param {Array} userBookings - Array de bookings del usuario
 * @param {boolean} isLoggedIn - Si el usuario está logueado
 * @param {Function} refreshBookings - Función para refrescar desde contrato (opcional)
 * @returns {number} forceUpdateTrigger - Valor que cambia cuando hay que actualizar
 */
export function useRealTimeBookingUpdates(userBookings, isLoggedIn = true, refreshBookings = null) {
  const [forceUpdateTrigger, setForceUpdateTrigger] = useState(0);
  
  const scheduleNextUpdate = useCallback(() => {
    if (!isLoggedIn || !Array.isArray(userBookings) || userBookings.length === 0) {
      return;
    }

    const now = new Date();
    let nextUpdateTime = null;
    let needsContractSync = false;

    // Buscar el próximo momento cuando algún booking cambie de estado
    userBookings.forEach(booking => {
      if (!booking.date || !booking.time || !booking.minutes) return;
      
      const startTime = new Date(`${booking.date}T${booking.time}`);
      const endTime = new Date(startTime.getTime() + parseInt(booking.minutes, 10) * 60000);
      
      // Si el booking va a empezar en el futuro
      if (startTime > now) {
        if (!nextUpdateTime || startTime < nextUpdateTime) {
          nextUpdateTime = startTime;
          needsContractSync = true; // Al inicio necesitamos verificar con contrato
        }
      }
      // Si el booking está activo y va a terminar
      else if (now >= startTime && now < endTime) {
        if (!nextUpdateTime || endTime < nextUpdateTime) {
          nextUpdateTime = endTime;
          needsContractSync = false; // Al final solo necesitamos actualización local
        }
      }
    });

    // Programar la actualización exactamente cuando cambie el estado
    if (nextUpdateTime) {
      const timeUntilUpdate = nextUpdateTime.getTime() - now.getTime();
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`⏰ Next booking status update scheduled:`, {
          time: nextUpdateTime.toLocaleString(),
          secondsUntil: Math.round(timeUntilUpdate / 1000),
          willSyncContract: needsContractSync,
          strategy: needsContractSync ? 'contract-sync' : 'local-update'
        });
      }
      
      // Agregar un pequeño delay (1 segundo) para asegurar que el cambio se detecte
      const timeout = setTimeout(async () => {
        // Si necesitamos sincronizar con el contrato (ej: al inicio de booking)
        if (needsContractSync && refreshBookings) {
          if (process.env.NODE_ENV === 'development') {
            console.log('🔄 Syncing with contract for booking state change...');
          }
          await refreshBookings();
        }
        
        // Forzar re-render para actualizar UI
        setForceUpdateTrigger(prev => prev + 1);
        
        // Programar la siguiente actualización recursivamente
        scheduleNextUpdate();
      }, timeUntilUpdate + 1000);

      return timeout;
    }
  }, [userBookings, isLoggedIn, refreshBookings]);

  useEffect(() => {
    const timeout = scheduleNextUpdate();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [scheduleNextUpdate]);

  return forceUpdateTrigger;
}

/**
 * Hook simplificado pero más eficiente para updates regulares
 * Solo hace polling cuando es absolutamente necesario
 * @param {boolean} isLoggedIn 
 * @param {Array} labs 
 * @param {Function} refreshBookings - Función para refrescar desde contrato
 * @returns {number} forceUpdateTrigger
 */
export function useMinuteUpdates(isLoggedIn, labs, refreshBookings = null) {
  const [forceUpdateTrigger, setForceUpdateTrigger] = useState(0);
  const [lastSync, setLastSync] = useState(0);
  
  useEffect(() => {
    if (!isLoggedIn || !labs?.length) return;

    // Estrategia híbrida: 
    // 1. Actualizaciones locales cada minuto (sin fetch)
    // 2. Sync con contrato cada 5 minutos (con fetch)
    
    const interval = setInterval(async () => {
      const now = Date.now();
      const minutesSinceLastSync = (now - lastSync) / (1000 * 60);
      
      // Cada 5 minutos, sincronizar con el contrato
      if (minutesSinceLastSync >= 5 && refreshBookings) {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔄 Periodic contract sync (every 5 minutes)');
        }
        await refreshBookings();
        setLastSync(now);
      }
      
      // Siempre forzar re-render para checks locales
      setForceUpdateTrigger(prev => prev + 1);
    }, 60000); // Every minute

    return () => clearInterval(interval);
  }, [isLoggedIn, labs, refreshBookings, lastSync]);

  return forceUpdateTrigger;
}

/**
 * Hook que se sincroniza con eventos de contrato para máxima eficiencia
 * Usa ReservationEventContext para updates inmediatos
 * @param {boolean} isLoggedIn 
 * @param {Array} labs 
 * @returns {number} forceUpdateTrigger
 */
export function useContractEventUpdates(isLoggedIn, labs) {
  const [forceUpdateTrigger, setForceUpdateTrigger] = useState(0);
  
  // Este hook se activará automáticamente cuando ReservationEventContext
  // detecte eventos de BookingCreated, BookingCanceled, etc.
  // Solo necesitamos forzar re-render cuando cambian los labs
  useEffect(() => {
    if (isLoggedIn && labs?.length) {
      setForceUpdateTrigger(prev => prev + 1);
    }
  }, [isLoggedIn, labs]);

  return forceUpdateTrigger;
}
