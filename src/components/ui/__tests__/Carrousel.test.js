/**
 * Unit tests for Carrousel component.
 * Purpose: verify visible behaviour (render, navigation, auto-slide, edge-cases, accessibility).
 * Notes: media component is mocked for determinism; timer tests use jest fake timers.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import Carrousel from '../Carrousel';

// Mock external dependencies to keep tests fast and deterministic
jest.mock('@/components/ui/media/MediaDisplayWithFallback', () => {
  return function MockMediaDisplay({ mediaPath, alt, priority }) {
    return (
      <img 
        src={mediaPath} 
        alt={alt} 
        data-priority={priority ? 'true' : 'false'}
        data-testid="media-display"
      />
    );
  };
});

describe('Carrousel Component', () => {
  // Test fixtures
  const mockLabWithImages = { images: ['/image1.jpg', '/image2.jpg', '/image3.jpg'] };
  const mockLabSingleImage = { images: ['/single.jpg'] };
  const mockLabEmpty = { images: [] };
  const mockLabWithNulls = { images: ['/image1.jpg', null, '/image2.jpg', undefined] };

  afterEach(() => {
    jest.clearAllTimers(); // clear timers after each test that may use fake timers
  });

  describe('Rendering', () => {
    test('renders placeholder when no images available', () => {
      render(<Carrousel lab={mockLabEmpty} />);
      expect(screen.getByText('No images available')).toBeInTheDocument();
    });

    test('renders images and filters out null values', () => {
      render(<Carrousel lab={mockLabWithNulls} />);
      const images = screen.getAllByTestId('media-display');
      expect(images).toHaveLength(2); // only valid images remain
    });

    test('applies custom height when provided', () => {
      const { container } = render(<Carrousel lab={mockLabWithImages} maxHeight="500" />);
      expect(container.firstChild).toHaveStyle({ height: '500px' });
    });
  });

  describe('Navigation', () => {
    test('shows controls only when multiple images exist', () => {
      // Multiple images -> controls present
      const { rerender } = render(<Carrousel lab={mockLabWithImages} />);
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Slide \d+/ })).toHaveLength(3);
      
      // Single image -> no controls
      rerender(<Carrousel lab={mockLabSingleImage} />);
      expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    });

    test('navigates between images correctly', async () => {
      const user = userEvent.setup();
      render(<Carrousel lab={mockLabWithImages} />);
      
      const indicators = screen.getAllByRole('button', { name: /Slide \d+/ });
      
      // Initial: first slide active
      expect(indicators[0]).toHaveAttribute('aria-current', 'true');
      
      // Click next
      await user.click(screen.getByRole('button', { name: 'Next' }));
      expect(indicators[1]).toHaveAttribute('aria-current', 'true');
      
      // Click previous
      await user.click(screen.getByRole('button', { name: 'Previous' }));
      expect(indicators[0]).toHaveAttribute('aria-current', 'true');
      
      // Direct navigation to third slide
      await user.click(indicators[2]);
      expect(indicators[2]).toHaveAttribute('aria-current', 'true');
    });

    test('wraps around at boundaries', async () => {
      const user = userEvent.setup();
      render(<Carrousel lab={mockLabWithImages} />);
      
      const indicators = screen.getAllByRole('button', { name: /Slide \d+/ });
      
      // Previous from first -> last
      await user.click(screen.getByRole('button', { name: 'Previous' }));
      expect(indicators[2]).toHaveAttribute('aria-current', 'true');
      
      // Next from last -> first
      await user.click(screen.getByRole('button', { name: 'Next' }));
      expect(indicators[0]).toHaveAttribute('aria-current', 'true');
    });
  });

  describe('Auto-slide', () => {
    beforeEach(() => {
      jest.useFakeTimers(); // control timer-driven behaviour
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('automatically advances every 3 seconds', () => {
      render(<Carrousel lab={mockLabWithImages} />);
      const indicators = screen.getAllByRole('button', { name: /Slide \d+/ });
      
      // Initial
      expect(indicators[0]).toHaveAttribute('aria-current', 'true');
      
      // After 3s -> slide 2
      act(() => jest.advanceTimersByTime(3000));
      expect(indicators[1]).toHaveAttribute('aria-current', 'true');
      
      // After 6s -> slide 3
      act(() => jest.advanceTimersByTime(3000));
      expect(indicators[2]).toHaveAttribute('aria-current', 'true');
    });

    test('resets timer on manual navigation', async () => {
      const user = userEvent.setup({ delay: null }); // disable internal delays for timer tests
      render(<Carrousel lab={mockLabWithImages} />);
      
      const indicators = screen.getAllByRole('button', { name: /Slide \d+/ });
      
      // Advance 2s
      act(() => jest.advanceTimersByTime(2000));
      
      // Manual navigation resets interval
      await user.click(screen.getByRole('button', { name: 'Next' }));
      expect(indicators[1]).toHaveAttribute('aria-current', 'true');
      
      // Advance 2s (should not change since timer reset)
      act(() => jest.advanceTimersByTime(2000));
      expect(indicators[1]).toHaveAttribute('aria-current', 'true');
      
      // Complete remaining 1s -> moves to next
      act(() => jest.advanceTimersByTime(1000));
      expect(indicators[2]).toHaveAttribute('aria-current', 'true');
    });

    test('cleans up interval on unmount', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const { unmount } = render(<Carrousel lab={mockLabWithImages} />);
      
      unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();
      
      clearIntervalSpy.mockRestore();
    });
  });

  describe('Edge cases', () => {
    test('handles null/undefined lab prop gracefully', () => {
      const { rerender } = render(<Carrousel lab={null} />);
      expect(screen.getByText('No images available')).toBeInTheDocument();
      
      rerender(<Carrousel lab={undefined} />);
      expect(screen.getByText('No images available')).toBeInTheDocument();
    });

    test('resets index when images array shrinks', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<Carrousel lab={mockLabWithImages} />);
      
      // Move to last image then shrink images array
      const indicators = screen.getAllByRole('button', { name: /Slide \d+/ });
      await user.click(indicators[2]);
      
      // Rerender with a single image; should not crash
      rerender(<Carrousel lab={mockLabSingleImage} />);
      expect(screen.getByTestId('media-display')).toBeInTheDocument();
    });

    test('prioritizes only first image for loading', () => {
      render(<Carrousel lab={mockLabWithImages} />);
      const images = screen.getAllByTestId('media-display');
      
      expect(images[0]).toHaveAttribute('data-priority', 'true');
      expect(images[1]).toHaveAttribute('data-priority', 'false');
      expect(images[2]).toHaveAttribute('data-priority', 'false');
    });
  });

  describe('Accessibility', () => {
    test('provides proper ARIA attributes and alt text', () => {
      render(<Carrousel lab={mockLabWithImages} />);
      
      // Indicators: aria-label and aria-current
      const indicators = screen.getAllByRole('button', { name: /Slide \d+/ });
      indicators.forEach((button, index) => {
        expect(button).toHaveAttribute('aria-label', `Slide ${index + 1}`);
        expect(button).toHaveAttribute('aria-current', index === 0 ? 'true' : 'false');
      });
      
      // Images: meaningful alt text
      const images = screen.getAllByTestId('media-display');
      images.forEach((img, index) => {
        expect(img).toHaveAttribute('alt', `Image ${index + 1}`);
      });
      
      // Screen-reader only text for controls
      expect(screen.getByText('Previous')).toHaveClass('sr-only');
      expect(screen.getByText('Next')).toHaveClass('sr-only');
    });
  });
});
