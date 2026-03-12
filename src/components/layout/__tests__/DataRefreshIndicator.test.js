import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DataRefreshIndicator from '../DataRefreshIndicator';

jest.mock('@/context/UserContext', () => ({
  useUser: () => ({
    hasIncompleteData: true,
    isProviderLoading: false,
    refreshProviderStatus: jest.fn().mockResolvedValue(),
  }),
}));

describe('DataRefreshIndicator', () => {
  it('renders refresh indicator when data is incomplete', () => {
    render(<DataRefreshIndicator />);
    expect(screen.getByText(/Provider data incomplete/i)).toBeInTheDocument();
  });

  it('calls refreshProviderStatus on button click', async () => {
    const refreshProviderStatus = jest.fn().mockResolvedValue();
    jest.spyOn(require('@/context/UserContext'), 'useUser').mockReturnValue({
      hasIncompleteData: true,
      isProviderLoading: false,
      refreshProviderStatus,
    });
    render(<DataRefreshIndicator />);
    const button = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(button);
    expect(refreshProviderStatus).toHaveBeenCalled();
  });

  it('does not render if data is complete or loading', () => {
    jest.spyOn(require('@/context/UserContext'), 'useUser').mockReturnValue({
      hasIncompleteData: false,
      isProviderLoading: false,
      refreshProviderStatus: jest.fn(),
    });
    const { container } = render(<DataRefreshIndicator />);
    expect(container.firstChild).toBeNull();
  });
});
