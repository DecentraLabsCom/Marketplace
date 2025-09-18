import { render, screen, fireEvent } from '@testing-library/react';
import Navbar from './Navbar';

// Mock Next.js <Link> to behave like a simple <a> element.
// This avoids Next.js routing internals interfering with tests.
jest.mock('next/link', () => ({ children, href }) => <a href={href}>{children}</a>);

// Mock Next.js <Image> to behave like a simple <img> element.
// We strip out unsupported props (fill, priority) to prevent React warnings.
jest.mock('next/image', () => (props) => {
  const { fill, priority, ...rest } = props;
  return <img {...rest} />;
});

// Mock the Login component to a simple placeholder.
// This isolates Navbar tests from Login’s internal logic.
jest.mock('@/components/auth/Login', () => () => <div>Login Component</div>);

// Mock the useUser hook so we can simulate different authentication states.
jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn(),
}));

// Mock role validation utility to always return valid.
// This avoids testing role logic here and keeps focus on Navbar behavior.
jest.mock('@/utils/auth/roleValidation', () => ({
  validateProviderRole: jest.fn(() => ({ isValid: true })),
}));

import { useUser } from '@/context/UserContext';

describe('Navbar Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders logo and mobile menu button', () => {
    // Simulate a logged-out user
    useUser.mockReturnValue({ isLoggedIn: false });

    render(<Navbar />);

    // The logo should always be visible
    expect(screen.getByAltText(/DecentraLabs Logo/i)).toBeInTheDocument();

    // The hamburger button for mobile menu should always be present
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('shows menu links when user is logged in', () => {
    // Simulate a logged-in user who is not a provider
    useUser.mockReturnValue({
      isLoggedIn: true,
      isProvider: false,
      isProviderLoading: false,
      isSSO: false,
      user: { role: 'user', scopedRole: 'basic' },
    });

    render(<Navbar />);

    // Authenticated users should see these links
    expect(screen.getByText(/Book a Lab/i)).toBeInTheDocument();
    expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Register as a Provider/i)).toBeInTheDocument();
  });

  test('shows provider link when user is provider', () => {
    // Simulate a logged-in user who is already a provider
    useUser.mockReturnValue({
      isLoggedIn: true,
      isProvider: true,
      isProviderLoading: false,
      isSSO: false,
      user: { role: 'provider', scopedRole: 'lab' },
    });

    render(<Navbar />);

    // Providers should see the "Lab Panel" link
    expect(screen.getByText(/Lab Panel/i)).toBeInTheDocument();
  });

  test('toggles mobile menu on click', () => {
    // Simulate a logged-in user
    useUser.mockReturnValue({
      isLoggedIn: true,
      isProvider: false,
      isProviderLoading: false,
      isSSO: false,
      user: {},
    });

    render(<Navbar />);

    // Click the hamburger button to open the mobile menu
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // "Book a Lab" appears in both desktop and mobile menus.
    // We use getAllByText to handle duplicates.
    const links = screen.getAllByText(/Book a Lab/i);
    expect(links.length).toBeGreaterThan(1);

    // Ensure at least one of the links points to the correct route
    expect(
      links.some(link => link.getAttribute('href') === '/reservation')
    ).toBe(true);
  });
});
