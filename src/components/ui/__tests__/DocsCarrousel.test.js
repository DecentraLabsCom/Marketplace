/**
 * DocsCarrousel Component Tests
 * 
 * Tests the document carousel component that displays multiple documents
 * with navigation controls (previous/next buttons and indicators).
 * 
 * Coverage:
 * - Rendering: Initial state, conditional controls, indicators, filtering
 * - Navigation: Previous/Next buttons, circular navigation, direct indicator jumps
 * - Accessibility: ARIA labels and attributes
 * - Props: maxHeight customization and defaults
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DocsCarrousel from '../DocsCarrousel';

// Mock MediaDisplayWithFallback to isolate DocsCarrousel logic
// Returns a simple component that displays mediaPath and title as text
jest.mock('@/components/ui/media/MediaDisplayWithFallback', () => {
  return function MediaDisplayWithFallback({ mediaPath, title }) {
    return (
      <div data-testid="media-display">
        <span>{title}</span>
        <span>{mediaPath}</span>
      </div>
    );
  };
});

describe('DocsCarrousel', () => {
  // Test fixtures - mock data for different scenarios
  const singleDoc = ['https://docs.example.edu/doc1.pdf'];
  const multipleDocs = ['https://docs.example.edu/doc1.pdf', 'https://docs.example.edu/doc2.pdf', 'https://docs.example.edu/doc3.pdf'];

  describe('Rendering', () => {
    test('should render the first document by default', () => {
      render(<DocsCarrousel docs={multipleDocs} labId={7} />);
      
      expect(screen.getByText('doc 1')).toBeInTheDocument();
      expect(screen.getByText('/api/metadata/document?labId=7&uri=https%3A%2F%2Fdocs.example.edu%2Fdoc1.pdf')).toBeInTheDocument();
    });

    test('should not show navigation controls with a single document', () => {
      render(<DocsCarrousel docs={singleDoc} labId={7} />);
      
      // Navigation controls should be hidden when docs.length <= 1
      expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
    });

    test('should show navigation controls with multiple documents', () => {
      render(<DocsCarrousel docs={multipleDocs} labId={7} />);
      
      expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    test('should render indicators for each document', () => {
      render(<DocsCarrousel docs={multipleDocs} labId={7} />);
      
      const indicators = screen.getAllByRole('button', { name: /slide \d+/i });
      expect(indicators).toHaveLength(3);
    });

    test('should filter out null or undefined documents', () => {
      const docsWithNull = ['https://docs.example.edu/doc1.pdf', null, 'https://docs.example.edu/doc2.pdf'];
      render(<DocsCarrousel docs={docsWithNull} labId={7} />);
      
      // Only the active document is mounted; the rest are not fetched until selected.
      const mediaDisplays = screen.getAllByTestId('media-display');
      expect(mediaDisplays).toHaveLength(1);
      expect(screen.queryByText('doc 2')).not.toBeInTheDocument();
    });

    test('should apply custom maxHeight', () => {
      const { container } = render(<DocsCarrousel docs={multipleDocs} labId={7} maxHeight={300} />);
      
      expect(container.firstChild).toHaveStyle({ height: '300px' });
    });

    test('should use default height of 200px when maxHeight is not provided', () => {
      const { container } = render(<DocsCarrousel docs={multipleDocs} labId={7} />);
      
      expect(container.firstChild).toHaveStyle({ height: '200px' });
    });

    test('should give the maximized viewer a taller, bounded layout', () => {
      render(<DocsCarrousel docs={singleDoc} labId={7} />);

      fireEvent.click(screen.getByRole('button', { name: /maximize document/i }));

      const dialog = screen.getByRole('dialog', { name: /maximized document viewer/i });
      const viewer = dialog.querySelector('.h-\\[94vh\\]');
      const mediaContainer = dialog.querySelector('.min-h-0.flex-1');

      expect(viewer).toBeInTheDocument();
      expect(viewer).toHaveClass('max-h-[calc(100vh-2rem)]', 'flex-col');
      expect(mediaContainer).toHaveClass('overflow-hidden', 'pb-2');
    });
  });

  describe('Navigation', () => {
    test('should navigate to next document when clicking Next button', async () => {
      render(<DocsCarrousel docs={multipleDocs} labId={7} />);
      
      const nextButton = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextButton);
      
      // Wait for transition animation to complete
      await waitFor(() => {
        expect(screen.getByText('doc 2')).toBeInTheDocument();
      });
    });

    test('should navigate to previous document when clicking Previous button', async () => {
      render(<DocsCarrousel docs={multipleDocs} labId={7} />);
      
      const nextButton = screen.getByRole('button', { name: /next/i });
      const prevButton = screen.getByRole('button', { name: /previous/i });
      
      // Navigate forward first
      fireEvent.click(nextButton);
      await waitFor(() => expect(screen.getByText('doc 2')).toBeInTheDocument());
      
      // Then navigate backward
      fireEvent.click(prevButton);
      await waitFor(() => expect(screen.getByText('doc 1')).toBeInTheDocument());
    });

    test('should navigate in a circular manner from last to first', async () => {
      render(<DocsCarrousel docs={multipleDocs} labId={7} />);
      
      const nextButton = screen.getByRole('button', { name: /next/i });
      
      // Navigate to last document (index 2)
      fireEvent.click(nextButton);
      fireEvent.click(nextButton);
      await waitFor(() => expect(screen.getByText('doc 3')).toBeInTheDocument());
      
      // Next click should wrap around to first document
      fireEvent.click(nextButton);
      await waitFor(() => expect(screen.getByText('doc 1')).toBeInTheDocument());
    });

    test('should navigate in a circular manner from first to last', async () => {
      render(<DocsCarrousel docs={multipleDocs} labId={7} />);
      
      const prevButton = screen.getByRole('button', { name: /previous/i });
      
      // Previous from first document should wrap to last
      fireEvent.click(prevButton);
      await waitFor(() => {
        expect(screen.getByText('doc 3')).toBeInTheDocument();
      });
    });

    test('should navigate directly to a document when clicking an indicator', async () => {
      render(<DocsCarrousel docs={multipleDocs} labId={7} />);
      
      const indicators = screen.getAllByRole('button', { name: /slide \d+/i });
      
      // Click third indicator to jump directly to doc 3
      fireEvent.click(indicators[2]);
      await waitFor(() => {
        expect(screen.getByText('doc 3')).toBeInTheDocument();
      });
    });

    test('should update active indicator on navigation', async () => {
      render(<DocsCarrousel docs={multipleDocs} labId={7} />);
      
      const indicators = screen.getAllByRole('button', { name: /slide \d+/i });
      
      // Initially, first indicator should be active
      expect(indicators[0]).toHaveAttribute('aria-current', 'true');
      
      // After navigation, second indicator should be active
      const nextButton = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextButton);
      
      await waitFor(() => {
        expect(indicators[1]).toHaveAttribute('aria-current', 'true');
        expect(indicators[0]).toHaveAttribute('aria-current', 'false');
      });
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA labels on indicators', () => {
      render(<DocsCarrousel docs={multipleDocs} labId={7} />);
      
      const indicators = screen.getAllByRole('button', { name: /slide \d+/i });
      
      // Each indicator should have descriptive aria-label for screen readers
      expect(indicators[0]).toHaveAttribute('aria-label', 'Slide 1');
      expect(indicators[1]).toHaveAttribute('aria-label', 'Slide 2');
      expect(indicators[2]).toHaveAttribute('aria-label', 'Slide 3');
    });
  });
});
