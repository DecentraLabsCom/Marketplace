import React from 'react';
import { render, screen } from '@testing-library/react';
import ProviderAccessDenied from '../ProviderAccessDenied';

jest.mock('@/utils/auth/roleValidation', () => ({
  getRoleDisplayName: (role) => `Role: ${role}`,
}));

describe('ProviderAccessDenied', () => {
  it('renders reason and user role', () => {
    render(<ProviderAccessDenied reason="Test reason" userRole="admin" />);
    expect(screen.getByText('Test reason')).toBeInTheDocument();
    expect(screen.getByText('Role: admin')).toBeInTheDocument();
  });

  it('renders scoped role if different from userRole', () => {
    render(<ProviderAccessDenied reason="Denied" userRole="user" scopedRole="scoped" />);
    expect(screen.getByText('Scoped role: Role: scoped')).toBeInTheDocument();
  });

  it('does not render scoped role if same as userRole', () => {
    render(<ProviderAccessDenied reason="Denied" userRole="user" scopedRole="user" />);
    expect(screen.queryByText('Scoped role: Role: user')).not.toBeInTheDocument();
  });
});
