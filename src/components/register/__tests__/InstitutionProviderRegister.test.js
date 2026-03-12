import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InstitutionProviderRegister from '../InstitutionProviderRegister';

jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn(),
}));
jest.mock('@/context/NotificationContext', () => ({
  useNotifications: () => ({ addTemporaryNotification: jest.fn() }),
}));
jest.mock('@/utils/notifications/institutionToasts', () => ({
  notifyInstitutionProviderInviteGenerated: jest.fn(),
  notifyInstitutionProviderInviteGenerationFailed: jest.fn(),
  notifyInstitutionProviderRegisterMissingUser: jest.fn(),
  notifyInstitutionProviderRegisterWalletRequired: jest.fn(),
  notifyInstitutionProviderRegistrationFailed: jest.fn(),
}));
jest.mock('@/utils/dev/logger', () => ({ log: jest.fn(), error: jest.fn() }));

describe('InstitutionProviderRegister', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows connect wallet warning if not connected', () => {
    const { useUser } = require('@/context/UserContext');
    useUser.mockReturnValue({ isConnected: false });
    render(<InstitutionProviderRegister />);
    expect(screen.getByText(/you must first connect/i)).toBeInTheDocument();
  });

  it('notifies if user is missing', async () => {
    const { useUser } = require('@/context/UserContext');
    const { notifyInstitutionProviderRegisterMissingUser } = require('@/utils/notifications/institutionToasts');
    useUser.mockReturnValue({ user: null, address: '0xabc', isConnected: true });
    render(<InstitutionProviderRegister />);
    fireEvent.click(screen.getByRole('button', { name: /register institution/i }));
    await waitFor(() => {
      expect(notifyInstitutionProviderRegisterMissingUser).toHaveBeenCalled();
    });
  });


  it('shows invite data after successful registration', async () => {
    const { useUser } = require('@/context/UserContext');
    useUser.mockReturnValue({ user: { id: 1 }, address: '0xabc', isConnected: true });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'test-token', organizationDomains: ['domain.com'], expiresAt: new Date().toISOString() }),
    });
    render(<InstitutionProviderRegister />);
    fireEvent.click(screen.getByRole('button', { name: /register institution/i }));
    await waitFor(() => {
      expect(screen.getByText(/institutional invite token/i)).toBeInTheDocument();
      expect(screen.getByText('domain.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('test-token')).toBeInTheDocument();
    });
    global.fetch.mockRestore();
  });

  it('notifies if invite generation fails', async () => {
    const { useUser } = require('@/context/UserContext');
    const { notifyInstitutionProviderInviteGenerationFailed } = require('@/utils/notifications/institutionToasts');
    useUser.mockReturnValue({ user: { id: 1 }, address: '0xabc', isConnected: true });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'fail' }),
    });
    render(<InstitutionProviderRegister />);
    fireEvent.click(screen.getByRole('button', { name: /register institution/i }));
    await waitFor(() => {
      expect(notifyInstitutionProviderInviteGenerationFailed).toHaveBeenCalledWith(expect.any(Function), 'fail');
    });
    global.fetch.mockRestore();
  });

  it('notifies if registration throws error', async () => {
    const { useUser } = require('@/context/UserContext');
    const { notifyInstitutionProviderRegistrationFailed } = require('@/utils/notifications/institutionToasts');
    useUser.mockReturnValue({ user: { id: 1 }, address: '0xabc', isConnected: true });
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    render(<InstitutionProviderRegister />);
    fireEvent.click(screen.getByRole('button', { name: /register institution/i }));
    await waitFor(() => {
      expect(notifyInstitutionProviderRegistrationFailed).toHaveBeenCalledWith(expect.any(Function), 'network error');
    });
    global.fetch.mockRestore();
  });
});
