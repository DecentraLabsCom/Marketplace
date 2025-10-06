/**
 * ConfirmModal Component Unit Tests
 * 
 * Tests the confirmation modal dialog including visibility control,
 * user interactions (button clicks, backdrop clicks), and keyboard
 * accessibility (Escape key).
 * 
 * These are concise unit tests intended to:
 *  - Assert the modal renders conditionally based on `isOpen`.
 *  - Verify primary callbacks: `onClose` and `onContinue`.
 *  - Ensure Escape key closes the modal when open and that listeners
 *    are not active when closed/unmounted.
 *  - Confirm clicking the backdrop triggers close and clicking inside
 *    the modal content stops propagation.
 * 
 * Notes for future maintainers:
 *  - The tests prefer accessible queries (getByRole/getByText). Where
 *    the component lacks a semantic hook for the backdrop, a small DOM
 *    traversal is used as a pragmatic fallback (keeps tests stable
 *    without modifying the component). If you add `role="dialog"` or
 *    `data-testid` to the markup, update the selectors to use them.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ConfirmModal from '../ConfirmModal';

describe('ConfirmModal', () => {
  // Shared mocks for each test — reset before each spec to avoid cross-test pollution.
  let mockOnClose;
  let mockOnContinue;

  beforeEach(() => {
    mockOnClose = jest.fn();
    mockOnContinue = jest.fn();
  });

  /**
   * Rendering specs
   * - Validate that the modal is not present when closed.
   * - Validate that expected text and buttons render when open.
   */
  describe('Rendering', () => {
    test('should not render when isOpen is false', () => {
      render(
        <ConfirmModal
          isOpen={false}
          onClose={mockOnClose}
          onContinue={mockOnContinue}
        />
      );

      // The heading text is used as a simple indicator that the modal is present.
      expect(screen.queryByText(/Are you sure/i)).not.toBeInTheDocument();
    });

    test('should render when isOpen is true', () => {
      render(
        <ConfirmModal
          isOpen={true}
          onClose={mockOnClose}
          onContinue={mockOnContinue}
        />
      );

      // Assert core visible content and interactive controls are present.
      expect(screen.getByText(/Are you sure you want to proceed/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  /**
   * Button interaction specs
   * - Continue should call onContinue and not onClose.
   * - Cancel should call onClose and not onContinue.
   */
  describe('Button Interactions', () => {
    test('should call onContinue when Continue button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmModal
          isOpen={true}
          onClose={mockOnClose}
          onContinue={mockOnContinue}
        />
      );

      await user.click(screen.getByRole('button', { name: /continue/i }));

      expect(mockOnContinue).toHaveBeenCalledTimes(1);
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    test('should call onClose when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmModal
          isOpen={true}
          onClose={mockOnClose}
          onContinue={mockOnContinue}
        />
      );

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockOnContinue).not.toHaveBeenCalled();
    });
  });

  /**
   * Backdrop interaction specs
   * - Clicking outside the modal content (backdrop) should call onClose.
   * - Clicking inside the modal content should not propagate to the backdrop.
   *
   * Implementation note:
   * The component currently doesn't expose a semantic backdrop role or testid,
   * so we use the heading as a stable anchor and walk up the DOM to find the
   * modal wrapper and its backdrop. This is intentional to avoid changing
   * the component for the unit tests. If you add role="dialog" or data-testid
   * in the component, update the selectors to use them instead.
   */
  describe('Backdrop Interactions', () => {
    test('should call onClose when clicking backdrop', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <ConfirmModal
          isOpen={true}
          onClose={mockOnClose}
          onContinue={mockOnContinue}
        />
      );

      // DOM traversal fallback: component lacks semantic backdrop role.
      // Use the heading as stable anchor, then walk up to modal wrapper/backdrop.
      const heading = screen.getByText(/Are you sure/i);
      const modalContent = heading.closest('.bg-white') || heading.parentElement;
      const backdrop =
        modalContent?.closest('.fixed.inset-0') ||
        modalContent?.parentElement ||
        container.firstChild;

      // Basic sanity checks so failures are clear in CI.
      expect(modalContent).toBeTruthy();
      expect(backdrop).toBeTruthy();

      await user.click(backdrop);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    test('should not call onClose when clicking modal content', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmModal
          isOpen={true}
          onClose={mockOnClose}
          onContinue={mockOnContinue}
        />
      );

      // Find the modal content using heading anchor; this is a stable reference.
      const heading = screen.getByText(/Are you sure/i);
      const modalContent = heading.closest('.bg-white') || heading.parentElement;

      expect(modalContent).toBeTruthy();
      await user.click(modalContent);

      // Clicking the modal content should not trigger the backdrop close handler.
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  /**
   * Keyboard interaction specs
   * - Escape should close the modal when open.
   * - Other keys should not trigger close.
   * - When the modal is closed or unmounted, Escape should no longer trigger onClose.
   *
   * These tests are intentionally minimal: they verify listener behavior rather
   * than implementation details of how listeners are registered.
   */
  describe('Keyboard Interactions', () => {
    test('should call onClose when Escape key is pressed and modal is open', () => {
      render(
        <ConfirmModal
          isOpen={true}
          onClose={mockOnClose}
          onContinue={mockOnContinue}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    test('should not trigger onClose on other key presses', () => {
      render(
        <ConfirmModal
          isOpen={true}
          onClose={mockOnClose}
          onContinue={mockOnContinue}
        />
      );

      fireEvent.keyDown(window, { key: 'Enter' });
      fireEvent.keyDown(window, { key: ' ' }); // Space
      fireEvent.keyDown(window, { key: 'a' });

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    test('should not respond to Escape when modal is closed', () => {
      render(
        <ConfirmModal
          isOpen={false}
          onClose={mockOnClose}
          onContinue={mockOnContinue}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    test('should not respond to Escape after modal is closed (rerender)', () => {
      const { rerender } = render(
        <ConfirmModal
          isOpen={true}
          onClose={mockOnClose}
          onContinue={mockOnContinue}
        />
      );

      // Tests lifecycle: rerender with isOpen=false should cleanup listeners.
      rerender(
        <ConfirmModal
          isOpen={false}
          onClose={mockOnClose}
          onContinue={mockOnContinue}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    test('should not respond to Escape after unmount', () => {
      const { unmount } = render(
        <ConfirmModal
          isOpen={true}
          onClose={mockOnClose}
          onContinue={mockOnContinue}
        />
      );

      // Unmount should remove listeners to avoid leaks.
      unmount();

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  /**
   * Accessibility smoke tests
   * - Buttons are reachable via role queries.
   * - The confirmation message is present for screen readers.
   */
  describe('Accessibility', () => {
    test('should have proper button roles', () => {
      render(
        <ConfirmModal
          isOpen={true}
          onClose={mockOnClose}
          onContinue={mockOnContinue}
        />
      );

      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    test('should have descriptive confirmation message', () => {
      render(
        <ConfirmModal
          isOpen={true}
          onClose={mockOnClose}
          onContinue={mockOnContinue}
        />
      );

      expect(screen.getByText(/Are you sure you want to proceed/i)).toBeInTheDocument();
    });
  });
});
