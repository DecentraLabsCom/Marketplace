/**
 * Unit Tests for LabCard Component
 *
 * Tested Behaviors:
 * - Rendering behavior with various prop combinations
 * - Image handling (valid URLs, placeholders, edge cases)
 * - Conditional badge display (Unlisted, Active booking)
 * - LabAccess component integration
 * - Link generation and navigation
 * - Price formatting and display
 * - Active booking visual styling
 * - React.memo performance optimization
 * - Prop validation and edge cases
 * - Accessibility compliance
 * - Context integration (UserContext, LabTokenContext)
 *
 */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import LabCard from "../LabCard";

// Mock Setup

/**
 * Mock booking hooks to avoid real API calls
 */
jest.mock("@/hooks/booking/useBookings", () => ({
  useActiveReservationKeyForUser: jest.fn(() => ({ data: null })),
}));

/**
 * Mock UserContext to control authentication state
 */
jest.mock("@/context/UserContext", () => ({
  useUser: jest.fn(),
}));

/**
 * Mock LabTokenContext to control token operations
 */
jest.mock("@/context/LabTokenContext", () => ({
  useLabToken: jest.fn(),
}));

/**
 * Mock LabAccess component for isolation testing
 * Exposes props for verification
 */
jest.mock("@/components/home/LabAccess", () => {
  return function MockLabAccess(props) {
    return (
      <div data-testid="lab-access-mock">
        LabAccess - {props.id}
        {props.reservationKey && ` - Key: ${props.reservationKey}`}
      </div>
    );
  };
});

/**
 * Mock UI components with minimal implementation
 * Maintains className forwarding for style testing
 */
jest.mock("@/components/ui", () => ({
  Card: ({ children, className }) => (
    <div className={className} data-testid="card-container">
      {children}
    </div>
  ),
  Badge: ({ children, className }) => (
    <span className={className} data-testid="badge">
      {children}
    </span>
  ),
  cn: (...args) => {
    return args
      .flat()
      .filter(Boolean)
      .map((arg) => {
        if (typeof arg === "string") return arg;
        if (Array.isArray(arg)) return arg.join(" ");
        if (typeof arg === "object" && arg !== null) {
          return Object.keys(arg)
            .filter((k) => arg[k])
            .join(" ");
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
  },
  LabCardImage: ({ src, alt, labId }) => (
    <img src={src} alt={alt} data-labid={labId} data-testid="lab-card-image" />
  ),
}));

/**
 * Mock Next.js Link component as plain anchor
 */
jest.mock("next/link", () => {
  return function MockLink({ href, children }) {
    return <a href={href}>{children}</a>;
  };
});

// Mock References

const mockUseUser = require("@/context/UserContext").useUser;
const mockUseLabToken = require("@/context/LabTokenContext").useLabToken;

// Test Fixtures

/**
 * Default props for standard test scenarios
 */
const defaultProps = {
  id: "lab-123",
  name: "Advanced Research Lab",
  provider: "ProviderCorp",
  price: 15.75,
  auth: "https://auth.example.com/api",
  activeBooking: false,
  isListed: true,
  image: "https://cdn.example.com/labs/research-lab.jpg",
};

/**
 * Helper function to render LabCard with default mocks
 */
const renderLabCard = (props = {}) => {
  return render(<LabCard {...defaultProps} {...props} />);
};

// Test Lifecycle

beforeEach(() => {
  // Setup default mock returns
  mockUseUser.mockReturnValue({
    address: "0xABCDEF1234567890",
    isConnected: true,
  });

  mockUseLabToken.mockReturnValue({
    formatPrice: (price) => `€${Number(price).toFixed(2)}`,
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("LabCard - Basic Rendering", () => {
  /**
   * Test: Core content display
   */
  test("renders lab name as h2 heading", () => {
    renderLabCard();

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent("Advanced Research Lab");
  });

  // Test: Provider information display

  test("renders provider name", () => {
    renderLabCard();

    expect(screen.getByText("ProviderCorp")).toBeInTheDocument();
  });

  //Test: Price formatting integration

  test("renders formatted price with LAB token suffix", () => {
    const mockFormatPrice = jest.fn((price) => `€${Number(price).toFixed(2)}`);
    mockUseLabToken.mockReturnValue({
      formatPrice: mockFormatPrice,
    });

    renderLabCard();

    expect(screen.getByText("€15.75 $LAB / hour")).toBeInTheDocument();
    expect(mockFormatPrice).toHaveBeenCalledWith(15.75);
  });

  // Test: Complete component structure

  test("renders complete card structure with all sections", () => {
    renderLabCard();

    // Image section
    expect(screen.getByTestId("lab-card-image")).toBeInTheDocument();

    // Content section
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();

    // Action section
    expect(
      screen.getByRole("link", { name: /Explore Lab/i })
    ).toBeInTheDocument();
  });
});

describe("LabCard - Image Handling", () => {
  // Test: Valid image URL rendering

  test("renders image with valid URL", () => {
    renderLabCard();

    const img = screen.getByTestId("lab-card-image");
    expect(img).toHaveAttribute(
      "src",
      "https://cdn.example.com/labs/research-lab.jpg"
    );
    expect(img).toHaveAttribute("alt", "Advanced Research Lab");
    expect(img).toHaveAttribute("data-labid", "lab-123");
  });

  // Test: Empty string fallback

  test("renders placeholder image when image is empty string", () => {
    renderLabCard({ image: "" });

    const img = screen.getByTestId("lab-card-image");
    expect(img).toHaveAttribute("src", "/labs/lab_placeholder.png");
    expect(img).toHaveAttribute("alt", "Advanced Research Lab");
  });

  /**
   * Test: Whitespace-only string fallback
   * Verifies .trim() logic works correctly
   */
  test("renders placeholder image when image is whitespace", () => {
    renderLabCard({ image: "   " });

    const img = screen.getByTestId("lab-card-image");
    expect(img).toHaveAttribute("src", "/labs/lab_placeholder.png");
  });

  // Test: Null value fallback
  test("renders placeholder image when image is null", () => {
    renderLabCard({ image: null });

    const img = screen.getByTestId("lab-card-image");
    expect(img).toHaveAttribute("src", "/labs/lab_placeholder.png");
  });

  // Test: Undefined value fallback

  test("renders placeholder image when image is undefined", () => {
    renderLabCard({ image: undefined });

    const img = screen.getByTestId("lab-card-image");
    expect(img).toHaveAttribute("src", "/labs/lab_placeholder.png");
  });

  // Test: Alt text consistency

  test("uses lab name as alt text for accessibility", () => {
    renderLabCard({ name: "Special Lab Name" });

    const img = screen.getByAltText("Special Lab Name");
    expect(img).toBeInTheDocument();
  });

  /**
   * Test: Different image formats
   * Verifies support for various image extensions
   */
  test("handles different image file formats", () => {
    const formats = [
      "https://example.com/lab.jpg",
      "https://example.com/lab.png",
      "https://example.com/lab.webp",
      "https://example.com/lab.svg",
    ];

    formats.forEach((imageUrl) => {
      const { unmount } = renderLabCard({ image: imageUrl });
      const img = screen.getByTestId("lab-card-image");
      expect(img).toHaveAttribute("src", imageUrl);
      unmount();
    });
  });
});

describe("LabCard - Badge Display", () => {
  /**
   * Test: Unlisted badge visibility
   * Verifies badge appears when lab is not listed
   */
  test('displays "Unlisted" badge when isListed is false', () => {
    renderLabCard({ isListed: false });

    expect(screen.getByText(/Unlisted/i)).toBeInTheDocument();
  });

  /**
   * Test: No badge for listed labs
   * Verifies badge is hidden when lab is listed
   */
  test("does not display badge when isListed is true", () => {
    renderLabCard({ isListed: true });

    expect(screen.queryByText(/Unlisted/i)).not.toBeInTheDocument();
  });

  /**
   * Test: Badge styling
   * Verifies badge has appropriate styling classes
   */
  test("applies correct styling to unlisted badge", () => {
    renderLabCard({ isListed: false });

    const badge = screen.getByText(/Unlisted/i);
    expect(badge.className).toContain("uppercase");
    expect(badge.className).toContain("tracking-wide");
  });
});

describe("LabCard - LabAccess Integration", () => {
  // Test: LabAccess visibility for connected users

  test("renders LabAccess when user is connected", () => {
    mockUseUser.mockReturnValue({
      address: "0x123",
      isConnected: true,
    });

    renderLabCard();

    const labAccess = screen.getByTestId("lab-access-mock");
    expect(labAccess).toBeInTheDocument();
    expect(labAccess).toHaveTextContent("LabAccess - lab-123");
  });

  // Test: LabAccess hidden for disconnected users

  test("does not render LabAccess when user is not connected", () => {
    mockUseUser.mockReturnValue({
      address: null,
      isConnected: false,
    });

    renderLabCard();

    expect(screen.queryByTestId("lab-access-mock")).not.toBeInTheDocument();
  });

  test("forwards correct props to LabAccess component", () => {
    mockUseUser.mockReturnValue({
      address: "0xWallet",
      isConnected: true,
    });

    renderLabCard({
      id: "special-lab",
      auth: "https://special-auth.com",
    });

    const labAccess = screen.getByTestId("lab-access-mock");
    expect(labAccess).toHaveTextContent("LabAccess - special-lab");
  });

  test("renders Explore Lab link even when user is disconnected", () => {
    mockUseUser.mockReturnValue({
      address: null,
      isConnected: false,
    });

    renderLabCard();

    expect(
      screen.getByRole("link", { name: /Explore Lab/i })
    ).toBeInTheDocument();
  });
});

describe("LabCard - Link Generation", () => {
  test("generates correct href with string ID and provider", () => {
    renderLabCard();

    const link = screen.getByRole("link", { name: /Explore Lab/i });
    expect(link).toHaveAttribute("href", "/lab/lab-123/ProviderCorp");
  });

  test("generates correct href with numeric ID", () => {
    renderLabCard({ id: 42 });

    const link = screen.getByRole("link", { name: /Explore Lab/i });
    expect(link).toHaveAttribute("href", "/lab/42/ProviderCorp");
  });

  test("handles provider names with spaces in URL", () => {
    renderLabCard({ provider: "Research Corp Inc" });

    const link = screen.getByRole("link", { name: /Explore Lab/i });
    expect(link).toHaveAttribute("href", "/lab/lab-123/Research Corp Inc");
  });

  test("handles special characters in lab ID", () => {
    renderLabCard({ id: "lab_test-123" });

    const link = screen.getByRole("link", { name: /Explore Lab/i });
    expect(link).toHaveAttribute("href", "/lab/lab_test-123/ProviderCorp");
  });

  test("link has accessible label", () => {
    renderLabCard();

    const link = screen.getByRole("link", { name: /Explore Lab/i });
    expect(link).toBeInTheDocument();
  });
});

describe("LabCard - Price Formatting", () => {
  test("formats decimal price correctly", () => {
    renderLabCard({ price: 12.5 });

    expect(screen.getByText("€12.50 $LAB / hour")).toBeInTheDocument();
  });

  test("handles zero price correctly", () => {
    renderLabCard({ price: 0 });

    expect(screen.getByText("€0.00 $LAB / hour")).toBeInTheDocument();
  });

  test("handles large price values", () => {
    renderLabCard({ price: 999.99 });

    expect(screen.getByText("€999.99 $LAB / hour")).toBeInTheDocument();
  });

  test("handles very small decimal prices", () => {
    renderLabCard({ price: 0.01 });

    expect(screen.getByText("€0.01 $LAB / hour")).toBeInTheDocument();
  });

  test("formats integer prices with decimal places", () => {
    renderLabCard({ price: 50 });

    expect(screen.getByText("€50.00 $LAB / hour")).toBeInTheDocument();
  });

  test("uses custom formatPrice function from LabToken context", () => {
    mockUseLabToken.mockReturnValue({
      formatPrice: (price) => `$${price.toFixed(3)}`,
    });

    renderLabCard({ price: 25.5 });

    expect(screen.getByText("$25.500 $LAB / hour")).toBeInTheDocument();
  });

  test("calls formatPrice with correct price value", () => {
    const mockFormatPrice = jest.fn((price) => `€${price}`);
    mockUseLabToken.mockReturnValue({
      formatPrice: mockFormatPrice,
    });

    renderLabCard({ price: 33.33 });

    expect(mockFormatPrice).toHaveBeenCalledWith(33.33);
  });
});

describe("LabCard - Active Booking Styling", () => {
  test("applies border and glow animation when activeBooking is true", () => {
    const { container } = renderLabCard({ activeBooking: true });

    const card = screen.getByTestId("card-container");
    expect(card.className).toMatch(/border-4/);
    expect(card.className).toMatch(/border-brand/);
    expect(card.className).toMatch(/animate-glow/);
  });

  test("does not apply active styling when activeBooking is false", () => {
    const { container } = renderLabCard({ activeBooking: false });

    const card = screen.getByTestId("card-container");
    expect(card.className).not.toMatch(/border-4/);
    expect(card.className).not.toMatch(/animate-glow/);
  });

  test("maintains hover effects in both states", () => {
    const { container, rerender } = render(
      <LabCard {...defaultProps} activeBooking={false} />
    );

    let card = screen.getByTestId("card-container");
    expect(card.className).toMatch(/hover:scale-105/);

    rerender(<LabCard {...defaultProps} activeBooking={true} />);
    card = screen.getByTestId("card-container");
    expect(card.className).toMatch(/hover:scale-105/);
  });

  test("always includes base card styling classes", () => {
    renderLabCard();

    const card = screen.getByTestId("card-container");
    expect(card.className).toMatch(/relative/);
    expect(card.className).toMatch(/group/);
    expect(card.className).toMatch(/h-\[400px\]/);
  });

  test("updates styling when activeBooking prop changes", () => {
    const { rerender } = render(
      <LabCard {...defaultProps} activeBooking={false} />
    );

    let card = screen.getByTestId("card-container");
    expect(card.className).not.toMatch(/border-4/);

    rerender(<LabCard {...defaultProps} activeBooking={true} />);
    card = screen.getByTestId("card-container");
    expect(card.className).toMatch(/border-4/);
  });
});
// Test Suite: React.memo Performance

describe("LabCard - Performance Optimization", () => {
  test("component is wrapped with React.memo", () => {
    // React.memo components have a $$typeof property
    expect(LabCard.$$typeof).toBeDefined();
  });

  test("does not re-render when props are unchanged", () => {
    const { rerender } = renderLabCard();

    const initialCard = screen.getByTestId("card-container");
    const initialHeading = screen.getByRole("heading", { level: 2 });

    rerender(<LabCard {...defaultProps} />);

    expect(screen.getByTestId("card-container")).toBe(initialCard);
    expect(screen.getByRole("heading", { level: 2 })).toBe(initialHeading);
  });

  test("re-renders when props change", () => {
    const { rerender } = renderLabCard({ name: "Original Name" });

    expect(screen.getByText("Original Name")).toBeInTheDocument();

    rerender(<LabCard {...defaultProps} name="Updated Name" />);

    expect(screen.queryByText("Original Name")).not.toBeInTheDocument();
    expect(screen.getByText("Updated Name")).toBeInTheDocument();
  });
});

describe("LabCard - Prop Validation and Edge Cases", () => {
  test("renders correctly with all required props", () => {
    const minimalProps = {
      id: 1,
      name: "Minimal Lab",
      provider: "Provider",
      price: 10,
      auth: null,
      activeBooking: false,
      isListed: true,
      image: "",
    };

    render(<LabCard {...minimalProps} />);

    expect(screen.getByText("Minimal Lab")).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
  });

  test("handles null auth prop gracefully", () => {
    renderLabCard({ auth: null });

    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  test("handles empty string auth prop", () => {
    renderLabCard({ auth: "" });

    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  test("handles very long lab names", () => {
    const longName = "A".repeat(200);
    renderLabCard({ name: longName });

    expect(screen.getByText(longName)).toBeInTheDocument();
  });

  test("handles special characters in lab name", () => {
    renderLabCard({ name: 'Lab & Research <Center> "Advanced"' });

    expect(
      screen.getByText('Lab & Research <Center> "Advanced"')
    ).toBeInTheDocument();
  });

  test("handles unicode characters in provider name", () => {
    renderLabCard({ provider: "Université de Recherche 研究所" });

    expect(
      screen.getByText("Université de Recherche 研究所")
    ).toBeInTheDocument();
  });

  test("renders with negative price (edge case)", () => {
    renderLabCard({ price: -10 });

    // Component should still render even with invalid data
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });
});

describe("LabCard - Context Integration", () => {
  test("integrates with UserContext for authentication state", () => {
    mockUseUser.mockReturnValue({
      address: "0xTEST",
      isConnected: true,
    });

    renderLabCard();

    // LabAccess should render when connected
    expect(screen.getByTestId("lab-access-mock")).toBeInTheDocument();
    expect(mockUseUser).toHaveBeenCalled();
  });

  test("integrates with LabTokenContext for price formatting", () => {
    const mockFormatPrice = jest.fn((p) => `Custom: ${p}`);
    mockUseLabToken.mockReturnValue({
      formatPrice: mockFormatPrice,
    });

    renderLabCard({ price: 42 });

    expect(mockFormatPrice).toHaveBeenCalledWith(42);
    expect(screen.getByText(/Custom: 42/)).toBeInTheDocument();
  });

  test("works correctly with both UserContext and LabTokenContext", () => {
    mockUseUser.mockReturnValue({
      address: "0xMULTI",
      isConnected: true,
    });

    mockUseLabToken.mockReturnValue({
      formatPrice: (p) => `Multi: €${p}`,
    });

    renderLabCard();

    expect(screen.getByTestId("lab-access-mock")).toBeInTheDocument();
    expect(screen.getByText(/Multi: €/)).toBeInTheDocument();
  });

  test("handles missing context values gracefully", () => {
    mockUseUser.mockReturnValue({
      isConnected: false,
    });
    mockUseLabToken.mockReturnValue({
      formatPrice: (p) => String(p), // Fallback formatter
    });

    // Should not crash even with incomplete context
    expect(() => renderLabCard()).not.toThrow();

    // Component should still render basic content
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });
});

describe("LabCard - Accessibility", () => {
  test("uses semantic heading for lab name", () => {
    renderLabCard();

    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Advanced Research Lab",
    });
    expect(heading).toBeInTheDocument();
  });

  test("provides accessible link text", () => {
    renderLabCard();

    const link = screen.getByRole("link", { name: /Explore Lab/i });
    expect(link).toBeInTheDocument();
  });

  test("provides meaningful alt text for images", () => {
    renderLabCard({ name: "Accessible Lab" });

    const img = screen.getByAltText("Accessible Lab");
    expect(img).toBeInTheDocument();
  });

  test("supports keyboard navigation for links", () => {
    renderLabCard();

    const link = screen.getByRole("link", { name: /Explore Lab/i });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href");
  });
});

describe("LabCard - Integration Scenarios", () => {
  test("renders complete experience for connected user with active booking", () => {
    mockUseUser.mockReturnValue({
      address: "0xCOMPLETE",
      isConnected: true,
    });

    renderLabCard({
      activeBooking: true,
      isListed: true,
    });

    // Should show all features
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId("lab-card-image")).toBeInTheDocument();
    expect(screen.getByTestId("lab-access-mock")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Explore Lab/i })
    ).toBeInTheDocument();

    // Should have active booking styling
    const card = screen.getByTestId("card-container");
    expect(card.className).toMatch(/border-4/);
  });

  test("renders limited experience for disconnected user", () => {
    mockUseUser.mockReturnValue({
      address: null,
      isConnected: false,
    });

    renderLabCard({ isListed: false });

    // Should show basic info
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId("lab-card-image")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Explore Lab/i })
    ).toBeInTheDocument();

    // Should NOT show LabAccess
    expect(screen.queryByTestId("lab-access-mock")).not.toBeInTheDocument();

    // Should show unlisted badge
    expect(screen.getByText(/Unlisted/i)).toBeInTheDocument();
  });

  test("handles lab with edge case prop combination", () => {
    mockUseUser.mockReturnValue({
      address: "0xEDGE",
      isConnected: true,
    });

    renderLabCard({
      id: 0,
      name: "",
      provider: "",
      price: 0,
      auth: null,
      activeBooking: false,
      isListed: false,
      image: null,
    });

    // Should still render without crashing
    expect(screen.getByTestId("card-container")).toBeInTheDocument();
  });

  test("handles rapid prop changes without errors", () => {
    const { rerender } = renderLabCard({ activeBooking: false });

    // Simulate rapid state changes
    for (let i = 0; i < 10; i++) {
      rerender(<LabCard {...defaultProps} activeBooking={i % 2 === 0} />);
    }

    // Should still be stable
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });
});
