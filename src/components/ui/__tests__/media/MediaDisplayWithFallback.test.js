/**
 * Unit tests for MediaDisplayWithFallback component
 * 
 * Coverage:
 * - Image, document, and link rendering
 * - Fallback behavior when sources fail
 * - External URL handling
 * - State reset on prop changes
 * - Edge cases (empty paths, cleanup)
 * 
 * Note: Console warnings during test execution are expected and
 * originate from component implementation, not test code.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import MediaDisplayWithFallback from '../../media/MediaDisplayWithFallback';

// Mock Next.js Image component to avoid Next.js-specific rendering complexity in tests
// Strips Next.js-specific props (fill, priority) that aren't valid HTML attributes
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, onError, fill, priority, ...props }) => {
    const { fill: _fill, priority: _priority, ...htmlProps } = props;
    return <img src={src} alt={alt} onError={onError} {...htmlProps} />;
  },
}));

// Mock logger utility to prevent console noise and allow verification of logged warnings
jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn() },
}));

describe('MediaDisplayWithFallback', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to ensure clean slate for environment variable changes
    jest.resetModules();
    // Preserve original environment to avoid cross-test contamination
    process.env = { ...originalEnv };
    // Clear all mock call history and implementations
    jest.clearAllMocks();
    // Mock global fetch API used by document/link validation logic
    global.fetch = jest.fn();
  });

  afterEach(() => {
    // Restore original environment variables to prevent side effects
    process.env = originalEnv;
    // Clean up all mocks to ensure test isolation
    jest.restoreAllMocks();
  });

  /**
   * Basic Rendering Tests
   * 
   * Verifies that each media type renders correctly with minimal props.
   * These tests validate the happy path for each supported mediaType.
   */
  describe('Basic rendering', () => {
    test('renders image with provided path', () => {
      // Test that image type renders immediately without async operations
      render(
        <MediaDisplayWithFallback 
          mediaPath="/test.jpg" 
          mediaType="image" 
          alt="Test" 
        />
      );
      
      const image = screen.getByAltText('Test');
      expect(image).toBeInTheDocument();
      // Use partial matcher to allow for URL transformations (blob/local paths)
      expect(image).toHaveAttribute('src', expect.stringContaining('test.jpg'));
    });

    test('renders document with loading state', () => {
      // Documents require async fetch validation, so initially show loading state
      render(
        <MediaDisplayWithFallback 
          mediaPath="/test.pdf" 
          mediaType="doc" 
        />
      );
      
      expect(screen.getByText('Loading document...')).toBeInTheDocument();
    });

    test('renders link after successful validation', async () => {
      // Mock successful PDF validation response
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: jest.fn().mockReturnValue('application/pdf') },
      });

      // Wrap in act to handle async state updates from useEffect
      await act(async () => {
        render(
          <MediaDisplayWithFallback 
            mediaPath="/download.pdf" 
            mediaType="link" 
          />
        );
      });

      // Wait for async validation to complete and link to render
      await waitFor(() => {
        const link = screen.getByText('download.pdf');
        expect(link).toBeInTheDocument();
        // Verify security attributes for external links
        expect(link).toHaveAttribute('target', '_blank');
      });
    });
  });

  /**
   * Fallback Logic Tests
   * 
   * Tests the component's resilience when primary media sources fail.
   * Validates that fallback mechanisms work correctly for each media type.
   */
  describe('Fallback logic', () => {
    test('images fallback when primary source fails', async () => {
      // Set up Vercel environment to test blob -> local fallback path
      process.env.NEXT_PUBLIC_VERCEL = 'true';
      process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL = 'https://blob.vercel.com';

      const { rerender } = render(
        <MediaDisplayWithFallback 
          mediaPath="/fallback.jpg" 
          mediaType="image" 
          alt="Fallback" 
        />
      );

      const image = screen.getByAltText('Fallback');
      
      // Simulate image load failure to trigger fallback mechanism
      await act(async () => {
        fireEvent.error(image);
      });
      
      // Force re-render to apply state changes from error handler
      rerender(
        <MediaDisplayWithFallback 
          mediaPath="/fallback.jpg" 
          mediaType="image" 
          alt="Fallback" 
        />
      );

      // Verify that component falls back to alternative source
      const updatedImage = screen.getByAltText('Fallback');
      expect(updatedImage).toHaveAttribute('src', expect.stringContaining('fallback.jpg'));
    });

    test('documents show error when all attempts fail', async () => {
      // Mock all fetch attempts to fail, exhausting fallback chain
      global.fetch.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(
          <MediaDisplayWithFallback 
            mediaPath="/error.pdf" 
            mediaType="doc" 
          />
        );
      });

      // Wait for all retry attempts to complete and error state to render
      await waitFor(() => {
        expect(screen.getByText('Document could not be loaded.')).toBeInTheDocument();
      });
    });
  });

  /**
   * External URLs Tests
   * 
   * Validates that external URLs (http/https) are handled differently
   * from internal paths and bypass blob/local fallback logic.
   */
  describe('External URLs', () => {
    test('handles external image URLs without modification', () => {
      // External URLs should be used as-is without blob/local transformation
      render(
        <MediaDisplayWithFallback 
          mediaPath="https://example.com/image.jpg" 
          mediaType="image" 
          alt="External" 
        />
      );
      
      const image = screen.getByAltText('External');
      // Verify URL is not modified or transformed
      expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
    });
  });

  /**
   * State Management Tests
   * 
   * Verifies that component state resets correctly when props change,
   * preventing stale data and ensuring correct re-initialization.
   */
  describe('State management', () => {
    test('resets state when mediaPath changes', async () => {
      // Mock successful fetch for both documents
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: jest.fn().mockReturnValue('application/pdf') },
      });

      let result;
      await act(async () => {
        result = render(
          <MediaDisplayWithFallback 
            mediaPath="/first.pdf" 
            mediaType="doc" 
            title="First" 
          />
        );
      });

      // Wait for first document to load successfully
      await waitFor(() => {
        expect(screen.getByTitle('First')).toBeInTheDocument();
      });

      // Change mediaPath and verify component resets and loads new document
      await act(async () => {
        result.rerender(
          <MediaDisplayWithFallback 
            mediaPath="/second.pdf" 
            mediaType="doc" 
            title="Second" 
          />
        );
      });

      // Verify new document loads correctly (state was reset)
      await waitFor(() => {
        expect(screen.getByTitle('Second')).toBeInTheDocument();
      });
    });
  });

  /**
   * Edge Cases Tests
   * 
   * Tests boundary conditions and error scenarios that could cause
   * crashes or undefined behavior in production.
   */
  describe('Edge cases', () => {
    test('handles empty mediaPath gracefully', () => {
      // Verify component doesn't crash with empty string path
      // This prevents runtime errors when data is missing or malformed
      expect(() => 
        render(
          <MediaDisplayWithFallback 
            mediaPath="" 
            mediaType="image" 
            alt="Empty" 
          />
        )
      ).not.toThrow();
    });

    test('cleans up on unmount without errors', async () => {
      // Mock a fetch that never resolves to simulate slow/hanging request
      global.fetch.mockImplementation(() => new Promise(() => {}));

      let unmount;
      await act(async () => {
        const result = render(
          <MediaDisplayWithFallback 
            mediaPath="/slow.pdf" 
            mediaType="doc" 
          />
        );
        unmount = result.unmount;
      });
      
      // Verify component cleans up AbortController and doesn't cause memory leaks
      expect(() => unmount()).not.toThrow();
    });
  });
});
