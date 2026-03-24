/**
 * CreditAccountPanel — shows an institutional user's service-credit balance,
 * upcoming lot expiries, recent credit movements, and pending funding-order status.
 *
 * Only rendered for SSO (institutional) users that have a billing backend URL.
 */
import React, { useMemo, useState } from 'react';
import {
  useCreditAccountSummary,
  useCreditLots,
  useFundingOrders,
  useCreditMovements,
} from '@/hooks/billing/useBillingAccount';

const STATUS_LABELS = {
  DRAFT: 'Awaiting invoice',
  INVOICED: 'Invoice issued — payment pending',
  PAID: 'Payment received',
  CREDITED: 'Credits issued',
  CANCELLED: 'Cancelled',
};

const FUNDING_ORDER_STATUS_COLOR = {
  DRAFT: 'text-yellow-400',
  INVOICED: 'text-blue-400',
  PAID: 'text-green-400',
  CREDITED: 'text-emerald-400',
  CANCELLED: 'text-slate-500',
};

const MOVEMENT_LABELS = {
  MINT: 'Credited',
  LOCK: 'Locked',
  CAPTURE: 'Captured',
  CANCEL: 'Refunded',
  ADJUST: 'Adjusted',
  EXPIRE: 'Expired',
};

const MOVEMENT_COLORS = {
  MINT: 'text-emerald-400',
  LOCK: 'text-yellow-400',
  CAPTURE: 'text-blue-400',
  CANCEL: 'text-orange-400',
  ADJUST: 'text-purple-400',
  EXPIRE: 'text-red-400',
};

const formatCredits = (value) => {
  if (value === null || value === undefined) return '0.0';
  return parseFloat(value).toFixed(1);
};

const formatEur = (value) => {
  if (value === null || value === undefined) return '—';
  return `€${parseFloat(value).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (isoString) => {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleDateString('en-IE', { dateStyle: 'medium' });
  } catch {
    return isoString;
  }
};

const formatDateTime = (isoString) => {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return isoString;
  }
};

export default function CreditAccountPanel() {
  const { data: account, isLoading: accountLoading } = useCreditAccountSummary();
  const { data: lots } = useCreditLots();
  const { data: fundingOrders } = useFundingOrders();
  const { data: movements } = useCreditMovements({ limit: 10 });
  const [showAllMovements, setShowAllMovements] = useState(false);

  const expiringLots = useMemo(() => {
    if (!Array.isArray(lots)) return [];
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    return lots
      .filter((lot) => lot.expiresAt && !lot.expired && new Date(lot.expiresAt) <= soon)
      .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))
      .slice(0, 3);
  }, [lots]);

  const activeFundingOrders = useMemo(() => {
    if (!Array.isArray(fundingOrders)) return [];
    return fundingOrders
      .filter((o) => o.status !== 'CANCELLED' && o.status !== 'CREDITED')
      .slice(0, 5);
  }, [fundingOrders]);

  const recentMovements = useMemo(() => {
    if (!Array.isArray(movements)) return [];
    return showAllMovements ? movements : movements.slice(0, 5);
  }, [movements, showAllMovements]);

  if (accountLoading) {
    return (
      <div
        data-testid="credit-account-panel-loading"
        className="rounded-xl p-5 animate-pulse"
        style={{ backgroundColor: 'var(--color-background-surface)', border: '1px solid var(--color-ui-label-medium)' }}
      >
        <div className="h-4 bg-slate-700 rounded w-40 mb-3" />
        <div className="h-3 bg-slate-700 rounded w-64" />
      </div>
    );
  }

  if (!account) return null;

  return (
    <div
      data-testid="credit-account-panel"
      className="rounded-xl p-5 space-y-4"
      style={{ backgroundColor: 'var(--color-background-surface)', border: '1px solid var(--color-ui-label-medium)' }}
    >
      {/* Header */}
      <h3
        className="text-sm font-semibold flex items-center gap-2"
        style={{ color: 'var(--color-text-inverse)' }}
      >
        <span className="text-base">💳</span>
        Service Credit Account
      </h3>

      {/* Balance grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs" style={{ color: 'var(--color-text-primary)' }}>
        <span className="opacity-60">Available</span>
        <span className="font-medium text-right">{formatCredits(account.available)} credits</span>
        <span className="opacity-60">Locked</span>
        <span className="font-medium text-right">{formatCredits(account.locked)} credits</span>
        <span className="opacity-60">Consumed</span>
        <span className="font-medium text-right">{formatCredits(account.consumed)} credits</span>
        {account.adjusted > 0 && (
          <>
            <span className="opacity-60">Adjusted</span>
            <span className="font-medium text-right">{formatCredits(account.adjusted)} credits</span>
          </>
        )}
        {account.expired > 0 && (
          <>
            <span className="opacity-60">Expired</span>
            <span className="font-medium text-right">{formatCredits(account.expired)} credits</span>
          </>
        )}
      </div>

      {/* Expiring lots */}
      {expiringLots.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-inverse)' }}>
            ⚠️ Expiring credit lots (next 30 days)
          </p>
          <ul className="space-y-1">
            {expiringLots.map((lot) => (
              <li key={lot.id} className="flex justify-between text-xs" style={{ color: 'var(--color-text-primary)' }}>
                <span>{formatCredits(lot.remaining ?? lot.amount)} credits</span>
                <span className="opacity-60">expires {formatDate(lot.expiresAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Active funding orders */}
      {activeFundingOrders.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-inverse)' }}>
            📄 Pending top-up orders
          </p>
          <ul className="space-y-1">
            {activeFundingOrders.map((order) => (
              <li key={order.id} className="flex justify-between text-xs">
                <span style={{ color: 'var(--color-text-primary)' }}>
                  {formatEur(order.eurGrossAmount)}
                  {order.reference ? ` · ${order.reference}` : ''}
                </span>
                <span className={FUNDING_ORDER_STATUS_COLOR[order.status] || 'text-slate-400'}>
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent activity */}
      {recentMovements.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-inverse)' }}>
            📋 Recent activity
          </p>
          <ul data-testid="credit-movements-list" className="space-y-1">
            {recentMovements.map((mov) => (
              <li key={mov.id} className="flex justify-between text-xs" style={{ color: 'var(--color-text-primary)' }}>
                <span className="flex items-center gap-1.5">
                  <span className={MOVEMENT_COLORS[mov.movementType] || 'text-slate-400'}>
                    {MOVEMENT_LABELS[mov.movementType] || mov.movementType}
                  </span>
                  {mov.reference && (
                    <span className="opacity-40 truncate max-w-[120px]">{mov.reference}</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium">{formatCredits(mov.amount)}</span>
                  <span className="opacity-40">{formatDateTime(mov.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
          {Array.isArray(movements) && movements.length > 5 && !showAllMovements && (
            <button
              onClick={() => setShowAllMovements(true)}
              className="text-xs mt-1 opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Show all {movements.length} movements
            </button>
          )}
        </div>
      )}

      {/* No orders message */}
      {activeFundingOrders.length === 0 && (
        <p className="text-xs opacity-50" style={{ color: 'var(--color-text-primary)' }}>
          No pending top-up orders. Contact your administrator to request service-credit top-up.
        </p>
      )}
    </div>
  );
}
