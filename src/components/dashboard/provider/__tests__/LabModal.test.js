/**
 * Unit tests for LabModal component
 *
 * Tested behaviors:
 * - Modal visibility: renders when open, hidden when closed
 * - Tab switching: toggles between Full Setup and Quick Setup modes
 * - Close handlers: ESC key, and cancel button
 * - Lab initialization: new lab vs editing existing lab with price conversion
 * - Edge cases: modal with null lab, missing props
 *
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Mock data
const mockOnClose = jest.fn();
const mockOnSubmit = jest.fn();
const mockFormatPrice = jest.fn((price) => price);
const mockUploadFile = jest.fn();
const mockDeleteFile = jest.fn();

let mockLabTokenData = {
  decimals: 18,
  formatPrice: mockFormatPrice
};

// External dependencies
jest.mock('@/context/LabTokenContext', () => ({
  useLabToken: () => mockLabTokenData
}));

jest.mock('@/hooks/provider/useProvider', () => ({
  useUploadFile: () => ({
    mutateAsync: mockUploadFile
  }),
  useDeleteFile: () => ({
    mutateAsync: mockDeleteFile,
    mutate: jest.fn()
  })
}));

jest.mock('@/utils/labValidation', () => ({
  validateLabFull: jest.fn(() => ({})),
  validateLabQuick: jest.fn(() => ({}))
}));

jest.mock('@/utils/dates/dateFormatter', () => ({
  normalizeLabDates: jest.fn((lab) => lab)
}));

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Child components mocked with functional stubs
jest.mock('@/components/dashboard/provider/LabFormFullSetup', () => ({
  __esModule: true,
  default: ({ onSubmit, onCancel }) => (
    <div data-testid="full-setup-form">
      <button onClick={onSubmit}>Submit Full</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )
}));

jest.mock('@/components/dashboard/provider/LabFormQuickSetup', () => ({
  __esModule: true,
  default: ({ onSubmit, onCancel }) => (
    <div data-testid="quick-setup-form">
      <button onClick={onSubmit}>Submit Quick</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )
}));

import LabModal from '@/components/dashboard/provider/LabModal';

describe('LabModal - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLabTokenData = {
      decimals: 18,
      formatPrice: mockFormatPrice
    };
  });

  describe('Modal Visibility', () => {
    test('renders modal when isOpen is true', () => {
      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={null}
          maxId={0}
        />
      );

      expect(screen.getByText('Add New Lab')).toBeInTheDocument();
    });

    test('does not render modal when isOpen is false', () => {
      render(
        <LabModal
          isOpen={false}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={null}
          maxId={0}
        />
      );

      expect(screen.queryByText('Add New Lab')).not.toBeInTheDocument();
    });

    test('shows Edit Lab title when lab prop has id', () => {
      const existingLab = { id: '123', name: 'Test Lab', price: '100' };

      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={existingLab}
          maxId={0}
        />
      );

      expect(screen.getByText('Edit Lab')).toBeInTheDocument();
    });
  });

  describe('Tab Switching', () => {
    test('renders Full Setup tab by default', () => {
      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={null}
          maxId={0}
        />
      );

      expect(screen.getByTestId('full-setup-form')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-setup-form')).not.toBeInTheDocument();
    });

    test('switches to Quick Setup when tab clicked', async () => {
      const user = userEvent.setup();

      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={null}
          maxId={0}
        />
      );

      const quickSetupTab = screen.getByRole('button', { name: /Quick Setup/i });
      await user.click(quickSetupTab);

      expect(screen.getByTestId('quick-setup-form')).toBeInTheDocument();
      expect(screen.queryByTestId('full-setup-form')).not.toBeInTheDocument();
    });

    test('switches back to Full Setup from Quick Setup', async () => {
      const user = userEvent.setup();

      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={null}
          maxId={0}
        />
      );

      const quickSetupTab = screen.getByRole('button', { name: /Quick Setup/i });
      await user.click(quickSetupTab);

      const fullSetupTab = screen.getByRole('button', { name: /Full Setup/i });
      await user.click(fullSetupTab);

      expect(screen.getByTestId('full-setup-form')).toBeInTheDocument();
    });
  });

  describe('Close Handlers', () => {
    
    test('closes modal when Cancel button clicked', async () => {
      const user = userEvent.setup();

      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={null}
          maxId={0}
        />
      );

      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    test('closes modal when ESC key pressed', async () => {
      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={null}
          maxId={0}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    test('does not close when clicking inside modal content', async () => {
      const user = userEvent.setup();

      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={null}
          maxId={0}
        />
      );

      const modalContent = screen.getByText('Add New Lab');
      await user.click(modalContent);

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Lab Initialization', () => {
    test('initializes with empty form for new lab', () => {
      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={null}
          maxId={0}
        />
      );

      expect(screen.getByText('Add New Lab')).toBeInTheDocument();
      expect(screen.getByTestId('full-setup-form')).toBeInTheDocument();
    });

    test('initializes with lab data when editing', async () => {
      const existingLab = {
        id: '123',
        name: 'Existing Lab',
        price: '100',
        category: 'Biology'
      };

      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={existingLab}
          maxId={123}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Edit Lab')).toBeInTheDocument();
      });
    });

    test('converts price format when lab has price', async () => {
      mockFormatPrice.mockReturnValue('150');
      
      const labWithPrice = {
        id: '123',
        name: 'Lab',
        price: '100'
      };

      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={labWithPrice}
          maxId={123}
        />
      );

      await waitFor(() => {
        expect(mockFormatPrice).toHaveBeenCalledWith('100');
      });
    });
  });

  describe('Form Submission', () => {
    test('calls onSubmit when Full Setup form submitted', async () => {
      const user = userEvent.setup();
      mockOnSubmit.mockResolvedValue();

      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={null}
          maxId={0}
        />
      );

      const submitButton = screen.getByText('Submit Full');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });
    });

    test('calls onSubmit when Quick Setup form submitted', async () => {
      const user = userEvent.setup();
      mockOnSubmit.mockResolvedValue();

      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={null}
          maxId={0}
        />
      );

      const quickSetupTab = screen.getByRole('button', { name: /Quick Setup/i });
      await user.click(quickSetupTab);

      const submitButton = screen.getByText('Submit Quick');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });
    });
  });

  describe('Edge Cases', () => {
    test('handles null lab prop without crashing', () => {
      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={null}
          maxId={0}
        />
      );

      expect(screen.getByText('Add New Lab')).toBeInTheDocument();
    });

    test('handles undefined decimals in context', () => {
      mockLabTokenData.decimals = undefined;

      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={{ id: '1', price: '100' }}
          maxId={0}
        />
      );

      expect(screen.getByText('Edit Lab')).toBeInTheDocument();
    });

    test('handles lab without id as new lab', () => {
      const labWithoutId = { name: 'Lab', price: '100' };

      render(
        <LabModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          lab={labWithoutId}
          maxId={0}
        />
      );

      expect(screen.getByText('Add New Lab')).toBeInTheDocument();
    });
  });
});