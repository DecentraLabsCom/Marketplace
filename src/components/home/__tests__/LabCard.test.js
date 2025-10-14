/**
 * Unit tests for LabCard component.
 * Purpose: verify rendering based on props, conditional UI (badges, LabAccess), 
 *          link generation, and edge cases (empty strings, zero price).
 * Notes: external dependencies (contexts, hooks, UI components) are mocked for isolation;
 *        tests focus on observable behavior, not implementation details.
 *
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import LabCard from '../LabCard';

jest.mock('@/hooks/booking/useBookings', () => ({
  useActiveReservationKeyForUser: jest.fn(() => ({ data: null }))
}));

// External dependency mocks
jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn()
}));
jest.mock('@/context/LabTokenContext', () => ({
  useLabToken: jest.fn()
}));

// Minimal stub for LabAccess to expose the forwarded id for assertions.
jest.mock('@/components/home/LabAccess', () => (props) => {
  return <div>LabAccess - {props.id}</div>;
});

// Minimal, deterministic UI primitives used by LabCard.
// - Card is rendered as a <div> so className assertions are straightforward.
// - cn implements a small class-combiner that supports strings, arrays and objects.
// - LabCardImage is a plain <img> so we can query by alt text.
jest.mock('@/components/ui', () => ({
  Card: ({ children, className }) => <div className={className}>{children}</div>,
  Badge: ({ children }) => <span>{children}</span>,
  cn: (...args) => {
    return args
      .flat()
      .filter(Boolean)
      .map(arg => {
        if (typeof arg === 'string') return arg;
        if (Array.isArray(arg)) return arg.join(' ');
        if (typeof arg === 'object' && arg !== null) {
          return Object.keys(arg).filter(k => arg[k]).join(' ');
        }
        return '';
      })
      .filter(Boolean)
      .join(' ');
  },
  LabCardImage: ({ src, alt, labId }) => <img src={src} alt={alt} data-labid={labId} />
}));

// Render next/link as a plain anchor so href assertions are deterministic.
jest.mock('next/link', () => {
  return ({ href, children }) => <a href={href}>{children}</a>;
});

// References to the jest-generated mocks for per-test customization.
const mockUseUser = require('@/context/UserContext').useUser;
const mockUseLabToken = require('@/context/LabTokenContext').useLabToken;

/* Fixture: typical props used across tests */
const baseProps = {
  id: 'lab-1',
  name: 'Test Lab',
  provider: 'ProviderA',
  price: 12.5,
  auth: null,
  activeBooking: false,
  isListed: true,
  image: 'https://example.com/img.jpg'
};

/* Helper: render the SUT with base props and allow overrides */
const createSut = (props = {}) => {
  return render(<LabCard {...baseProps} {...props} />);
};

/* Test lifecycle: configure default mock returns and clear mocks per test */
beforeEach(() => {
  mockUseUser.mockReturnValue({ address: '0xABC', isConnected: true });
  mockUseLabToken.mockReturnValue({ formatPrice: (p) => `€${Number(p).toFixed(2)}` });
});

afterEach(() => {
  jest.clearAllMocks();
});

/* Test suite */
describe('LabCard - unit tests', () => {
  test('renders heading (h2), provider and formatted price', () => {
    createSut();

    // The lab name must be rendered as an h2 heading.
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Test Lab');

    // Provider label is rendered as visible text.
    expect(screen.getByText('ProviderA')).toBeInTheDocument();

    // Price is produced by the mocked formatter and suffixed by the component.
    expect(screen.getByText('€12.50 $LAB / hour')).toBeInTheDocument();
  });

  test('renders image when a valid image string is provided (query by alt)', () => {
    createSut();

    const img = screen.getByAltText(baseProps.name);
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', baseProps.image);

    // Verify the mock LabCardImage received the labId via the data attribute.
    expect(img).toHaveAttribute('data-labid', baseProps.id);
  });

  test('renders fallback "No image" when image is blank or whitespace', () => {
    createSut({ image: '   ' });

    // Fallback content must be present and no image with the expected alt should exist.
    expect(screen.getByText(/No image/i)).toBeInTheDocument();
    expect(screen.queryByAltText(baseProps.name)).not.toBeInTheDocument();
  });

  test('displays "Unlisted" badge when isListed is false', () => {
    createSut({ isListed: false });
    expect(screen.getByText(/Unlisted/i)).toBeInTheDocument();
  });

  test('does not render LabAccess when user is not connected', () => {
    // Simulate disconnected user
    mockUseUser.mockReturnValue({ address: null, isConnected: false });
    createSut();

    // The LabAccess stub should not be present for unauthenticated users.
    expect(screen.queryByText(/LabAccess/)).not.toBeInTheDocument();

    // Explore link remains available regardless of authentication.
    expect(screen.getByRole('link', { name: /Explore Lab/i })).toBeInTheDocument();
  });

  test('renders LabAccess when user is connected and forwards id prop', () => {
    createSut();
    expect(screen.getByText(/LabAccess - lab-1/i)).toBeInTheDocument();
  });

  test('Explore Lab link builds correct href using id and provider', () => {
    createSut();

    const link = screen.getByRole('link', { name: /Explore Lab/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', `/lab/${baseProps.id}/${baseProps.provider}`);
  });

  test('applies visual classes when activeBooking is true (minimal observable assertion)', () => {
    // Use container for class assertions and rerender support.
    const { container, rerender } = render(<LabCard {...baseProps} activeBooking={false} />);

    // Initially, active-booking classes should not be present.
    expect(container.firstChild.className).not.toMatch(/border-4/);

    // Rerender with activeBooking enabled and assert that classes appear.
    rerender(<LabCard {...baseProps} activeBooking={true} />);
    expect(container.firstChild.className).toMatch(/border-4/);
    expect(container.firstChild.className).toMatch(/animate-glow/);
  });

  test('handles price = 0 correctly (edge case)', () => {
    createSut({ price: 0 });
    expect(screen.getByText('€0.00 $LAB / hour')).toBeInTheDocument();
  });

  test('accepts numeric id and builds href accordingly', () => {
    createSut({ id: 1234 });
    const link = screen.getByRole('link', { name: /Explore Lab/i });
    expect(link).toHaveAttribute('href', `/lab/1234/${baseProps.provider}`);
  });
});
