import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GlobalNotificationStack from '../GlobalNotificationStack';


const mockUseNotifications = jest.fn();
jest.mock('@/context/NotificationContext', () => ({
  useNotifications: () => mockUseNotifications(),
}));

describe('GlobalNotificationStack', () => {
  beforeEach(() => {
    mockUseNotifications.mockReset();
  });

  it('renders all notifications', () => {
    mockUseNotifications.mockReturnValue({
      notifications: [
        { id: '1', type: 'success', message: 'Success message' },
        { id: '2', type: 'error', message: 'Error message', hash: '0x1234567890abcdef' },
        { id: '3', type: 'pending', message: 'Pending...', hash: '0xabcdef1234567890' },
      ],
      removeNotification: jest.fn(),
    });
    render(<GlobalNotificationStack />);
    expect(screen.getByText('Success message')).toBeInTheDocument();
    expect(screen.getByText('Error message')).toBeInTheDocument();
    expect(screen.getByText('Pending...')).toBeInTheDocument();
  });

  it('renders hash for notifications with hash', () => {
    mockUseNotifications.mockReturnValue({
      notifications: [
        { id: '2', type: 'error', message: 'Error message', hash: '0x1234567890abcdef' },
        { id: '3', type: 'pending', message: 'Pending...', hash: '0xabcdef1234567890' },
      ],
      removeNotification: jest.fn(),
    });
    render(<GlobalNotificationStack />);
    // Buscar por función porque el hash está dividido en varios nodos
    expect(screen.getByText((content, node) =>
      node.textContent === 'Hash: 0x12345678...90abcdef')
    ).toBeInTheDocument();
    expect(screen.getByText((content, node) =>
      node.textContent === 'Hash: 0xabcdef12...34567890')
    ).toBeInTheDocument();
  });

  it('calls removeNotification on close button click', () => {
    const removeNotification = jest.fn();
    mockUseNotifications.mockReturnValue({
      notifications: [
        { id: '1', type: 'success', message: 'Success message' },
      ],
      removeNotification,
    });
    render(<GlobalNotificationStack />);
    const closeBtn = screen.getByRole('button', { name: /close notification/i });
    fireEvent.click(closeBtn);
    expect(removeNotification).toHaveBeenCalledWith('1');
  });

  it('returns null if no notifications', () => {
    mockUseNotifications.mockReturnValue({ notifications: [], removeNotification: jest.fn() });
    const { container } = render(<GlobalNotificationStack />);
    expect(container.firstChild).toBeNull();
  });
});
