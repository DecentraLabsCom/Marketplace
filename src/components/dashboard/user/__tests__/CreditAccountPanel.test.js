import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// ── Hook mocks ──────────────────────────────────────────────────────────────
const mockAccount = {
  available: '150.0',
  locked: '20.0',
  consumed: '30.0',
  adjusted: '0',
  expired: '0',
};

const mockLots = [];
const mockFundingOrders = [];
const mockMovements = [];

let accountLoading = false;
let accountData = mockAccount;
let accountError = null;
let accountRefetch = jest.fn();
let lotsError = null;
let fundingOrdersError = null;
let movementsError = null;
let accountUpdatedAt = Date.now();

jest.mock('@/hooks/billing/useBillingAccount', () => ({
  useCreditAccountSummary: () => ({
    data: accountData,
    isLoading: accountLoading,
    isError: Boolean(accountError),
    error: accountError,
    refetch: accountRefetch,
    dataUpdatedAt: accountUpdatedAt,
  }),
  useCreditLots: () => ({ data: mockLots, isError: Boolean(lotsError), error: lotsError, refetch: jest.fn() }),
  useFundingOrders: () => ({ data: mockFundingOrders, isError: Boolean(fundingOrdersError), error: fundingOrdersError, refetch: jest.fn() }),
  useCreditMovements: () => ({ data: mockMovements, isError: Boolean(movementsError), error: movementsError, refetch: jest.fn() }),
}));

import CreditAccountPanel from '../CreditAccountPanel';

describe('CreditAccountPanel', () => {
  beforeEach(() => {
    accountLoading = false;
    accountData = { ...mockAccount };
    accountError = null;
    accountRefetch = jest.fn();
    lotsError = null;
    fundingOrdersError = null;
    movementsError = null;
    accountUpdatedAt = Date.now();
    mockLots.length = 0;
    mockFundingOrders.length = 0;
    mockMovements.length = 0;
  });

  // ── Loading state ─────────────────────────────────────────────────────
  test('renders loading skeleton when data is loading', () => {
    accountLoading = true;
    accountData = undefined;

    render(<CreditAccountPanel />);
    expect(screen.getByTestId('credit-account-panel-loading')).toBeInTheDocument();
  });

  // ── Null account → no render ──────────────────────────────────────────
  test('explains when no credit account exists instead of disappearing', () => {
    accountData = null;
    accountError = { status: 404, code: 'CREDIT_ACCOUNT_NOT_FOUND' };

    render(<CreditAccountPanel />);
    expect(screen.getByRole('alert')).toHaveTextContent('No credit account exists');
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  test('shows an account load error and retry control without a technical timestamp', () => {
    accountData = { ...mockAccount };
    accountError = { status: 502, code: 'BILLING_UNAVAILABLE' };
    accountUpdatedAt = Date.parse('2026-07-19T10:00:00.000Z');

    render(<CreditAccountPanel />);

    expect(screen.getByRole('alert')).toHaveTextContent('Credit account could not be loaded');
    expect(screen.queryByText(/Last successful update:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(accountRefetch).toHaveBeenCalled();
  });

  test('warns when a secondary credit dataset is incomplete', () => {
    lotsError = { status: 502 };

    render(<CreditAccountPanel />);

    expect(screen.getByRole('alert')).toHaveTextContent('Credit account details could not be loaded');
  });

  // ── Balance grid ──────────────────────────────────────────────────────
  test('renders balance grid with trimmed credit formatting', () => {
    render(<CreditAccountPanel />);

    expect(screen.getByTestId('credit-account-panel')).toBeInTheDocument();
    expect(screen.getByText('Service Credit Account')).toBeInTheDocument();
    expect(screen.getByText('150 credits')).toBeInTheDocument();
    expect(screen.getByText('20 credits')).toBeInTheDocument();
    expect(screen.getByText('30 credits')).toBeInTheDocument();
    expect(screen.getByText('Available')).toHaveStyle({ color: 'var(--color-ui-label-light)' });
  });

  test('does not show the top-up notice when available credits are not low', () => {
    render(<CreditAccountPanel />);

    expect(screen.queryByText(/No pending top-up orders/)).not.toBeInTheDocument();
  });

  test('shows the top-up notice below the low-credit threshold', () => {
    accountData = { ...mockAccount, available: '49.99999' };

    render(<CreditAccountPanel />);

    expect(screen.getByText(/No pending top-up orders/)).toBeInTheDocument();
  });

  test('does not show the top-up notice at the low-credit threshold', () => {
    accountData = { ...mockAccount, available: '50' };

    render(<CreditAccountPanel />);

    expect(screen.queryByText(/No pending top-up orders/)).not.toBeInTheDocument();
  });

  test('does not show the technical update timestamp during a healthy refresh', () => {
    render(<CreditAccountPanel />);

    expect(screen.queryByText(/Last successful update:/)).not.toBeInTheDocument();
  });

  test('shows adjusted and expired rows only when > 0', () => {
    render(<CreditAccountPanel />);

    // With 0 values, these labels shouldn't appear
    expect(screen.queryByText('Adjusted')).not.toBeInTheDocument();
    expect(screen.queryByText('Expired')).not.toBeInTheDocument();

    // Now set adjusted > 0
    accountData = { ...mockAccount, adjusted: '5.0', expired: '10.0' };
    const { unmount } = render(<CreditAccountPanel />);

    expect(screen.getByText('Adjusted')).toBeInTheDocument();
    expect(screen.getByText('5 credits')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText('10 credits')).toBeInTheDocument();
    unmount();
  });

  // ── Expiring lots ─────────────────────────────────────────────────────
  test('shows expiring lots within 30+1 days', () => {
    const soonDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    mockLots.push(
      { id: 1, remaining: '80.0', amount: '100.0', expiresAt: soonDate, expired: false },
    );

    render(<CreditAccountPanel />);

    expect(screen.getByText(/Expiring credit lots/)).toBeInTheDocument();
    expect(screen.getByText('80 credits')).toBeInTheDocument();
  });

  test('does not show lots expiring beyond 30 days', () => {
    const farDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    mockLots.push({ id: 1, remaining: '80.0', amount: '100.0', expiresAt: farDate, expired: false });

    render(<CreditAccountPanel />);
    expect(screen.queryByText(/Expiring credit lots/)).not.toBeInTheDocument();
  });

  // ── Funding orders ────────────────────────────────────────────────────
  test('shows active funding orders with EUR amount and status', () => {
    mockFundingOrders.push(
      { id: 1, eurGrossAmount: '500.00', status: 'INVOICED', reference: 'REF-001' },
    );

    render(<CreditAccountPanel />);

    expect(screen.getByText(/Pending top-up orders/)).toBeInTheDocument();
    // EUR amount formatted
    expect(screen.getByText(/€500/)).toBeInTheDocument();
    expect(screen.getByText(/REF-001/)).toBeInTheDocument();
    expect(screen.getByText('Invoice issued — payment pending')).toBeInTheDocument();
  });

  test('filters out CANCELLED and CREDITED orders', () => {
    accountData = { ...mockAccount, available: '25' };
    mockFundingOrders.push(
      { id: 1, eurGrossAmount: '100.00', status: 'CANCELLED' },
      { id: 2, eurGrossAmount: '200.00', status: 'CREDITED' },
    );

    render(<CreditAccountPanel />);
    // Only the no-orders message should appear
    expect(screen.getByText(/No pending top-up orders/)).toBeInTheDocument();
  });

  // ── Credit movements ──────────────────────────────────────────────────
  test('shows recent credit movements with type labels', () => {
    mockMovements.push(
      { id: 1, movementType: 'MINT', amount: '500.0', createdAt: '2026-03-20T10:00:00Z', reference: 'FO-001' },
      { id: 2, movementType: 'LOCK', amount: '50.0', createdAt: '2026-03-21T14:00:00Z', reference: null },
    );

    render(<CreditAccountPanel />);

    expect(screen.getByText(/Recent activity/)).toBeInTheDocument();
    expect(screen.getByTestId('credit-movements-list')).toBeInTheDocument();
    const list = screen.getByTestId('credit-movements-list');
    expect(list.textContent).toContain('Credited');
    expect(list.textContent).toContain('Locked');
    expect(list.textContent).toContain('FO-001');
  });

  test('shows "Show all" button when more than 5 movements, and expands', () => {
    for (let i = 0; i < 8; i++) {
      mockMovements.push({
        id: i + 1,
        movementType: 'CAPTURE',
        amount: `${10 + i}.0`,
        createdAt: '2026-03-20T10:00:00Z',
        reference: null,
      });
    }

    render(<CreditAccountPanel />);

    const showAllBtn = screen.getByText(/Show all 8 movements/);
    expect(showAllBtn).toBeInTheDocument();

    // Initially only 5 list items visible
    const items = screen.getByTestId('credit-movements-list').querySelectorAll('li');
    expect(items).toHaveLength(5);

    fireEvent.click(showAllBtn);

    // After click, all 8 visible
    const expandedItems = screen.getByTestId('credit-movements-list').querySelectorAll('li');
    expect(expandedItems).toHaveLength(8);
  });

  // ── No-orders message ─────────────────────────────────────────────────
  test('shows contact admin message when no active orders and credits are low', () => {
    accountData = { ...mockAccount, available: '25' };

    render(<CreditAccountPanel />);

    expect(screen.getByText(/Contact your administrator/)).toBeInTheDocument();
  });
});
