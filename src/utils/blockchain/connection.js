/**
 * Wagmi connection helpers
 * Normalize connection fields across wagmi versions
 */

export const getConnectionAddress = (connection) => (
  connection?.address
    ?? connection?.addresses?.[0]
    ?? connection?.accounts?.[0]
    ?? null
);

export const isConnectionConnected = (connection) => {
  if (connection?.isConnected !== undefined) return connection.isConnected;
  return connection?.status === 'connected';
};

export const isConnectionConnecting = (connection) => {
  if (connection?.isConnecting !== undefined) return connection.isConnecting;
  return connection?.status === 'connecting';
};

export const isConnectionReconnecting = (connection) => {
  if (connection?.isReconnecting !== undefined) return connection.isReconnecting;
  return connection?.status === 'reconnecting';
};
