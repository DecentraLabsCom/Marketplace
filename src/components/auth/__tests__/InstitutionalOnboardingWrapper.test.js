jest.mock('../InstitutionalOnboardingModal', () => ({
  InstitutionalOnboardingModal: (props) => <div role="dialog" {...props} />,
}));
import { render, screen } from '@testing-library/react';
import InstitutionalOnboardingWrapper from '../InstitutionalOnboardingWrapper';
jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn(),
}));
import { useUser } from '@/context/UserContext';

describe('InstitutionalOnboardingWrapper', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders null if not SSO', () => {
    useUser.mockReturnValue({ isSSO: false });
    const { container } = render(<InstitutionalOnboardingWrapper />);
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with correct props if SSO', () => {
    const mockProps = {
      isSSO: true,
      showOnboardingModal: true,
      closeOnboardingModal: jest.fn(),
      handleOnboardingComplete: jest.fn(),
      handleOnboardingSkip: jest.fn(),
    };
    useUser.mockReturnValue(mockProps);
    render(<InstitutionalOnboardingWrapper />);
    // Modal should be in the document
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
