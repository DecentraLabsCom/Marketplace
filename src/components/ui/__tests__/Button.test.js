/**
 * Button Component Unit Tests
 * 
 * Tests core functionality of Button, IconButton, and ButtonGroup components.
 * These components use Tailwind CSS for styling.
 * 
 * Coverage:
 * - User interactions (clicks, keyboard navigation)
 * - States (disabled, loading)
 * - Variants and sizes
 * - Accessibility (ARIA, keyboard)
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, IconButton, ButtonGroup } from '../Button';

describe('Button', () => {
  describe('Basic functionality', () => {
    test('renders with children', () => {
      render(<Button>Click me</Button>);
      
      expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
    });

    test('calls onClick handler when clicked', () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>Click me</Button>);
      
      fireEvent.click(screen.getByRole('button'));
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    test('prevents clicks when disabled', () => {
      const handleClick = jest.fn();
      render(<Button disabled onClick={handleClick}>Disabled</Button>);
      
      const button = screen.getByRole('button');
      
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(handleClick).not.toHaveBeenCalled();
    });

    test('shows spinner and prevents clicks when loading', () => {
      const handleClick = jest.fn();
      render(<Button loading onClick={handleClick}>Loading</Button>);
      
      const button = screen.getByRole('button');
      const spinner = document.querySelector('.animate-spin');
      
      expect(spinner).toBeInTheDocument();
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Variants', () => {
    test('applies correct variant classes', () => {
      const { rerender } = render(<Button variant="primary">Primary</Button>);
      let button = screen.getByRole('button');
      expect(button).toHaveClass('bg-primary-600');
      
      rerender(<Button variant="secondary">Secondary</Button>);
      button = screen.getByRole('button');
      expect(button).toHaveClass('bg-secondary-200');
      
      rerender(<Button variant="outline">Outline</Button>);
      button = screen.getByRole('button');
      expect(button).toHaveClass('border-2');
    });

    test('uses primary variant by default', () => {
      render(<Button>Default</Button>);
      
      expect(screen.getByRole('button')).toHaveClass('bg-primary-600');
    });
  });

  describe('Sizes', () => {
    test('applies correct size classes', () => {
      const { rerender } = render(<Button size="sm">Small</Button>);
      let button = screen.getByRole('button');
      expect(button).toHaveClass('text-sm');
      
      rerender(<Button size="lg">Large</Button>);
      button = screen.getByRole('button');
      expect(button).toHaveClass('text-lg');
    });
  });

  describe('Props', () => {
    test('accepts custom className', () => {
      render(<Button className="custom-class">Custom</Button>);
      
      expect(screen.getByRole('button')).toHaveClass('custom-class');
    });

    test('supports different button types', () => {
      const { rerender } = render(<Button type="submit">Submit</Button>);
      let button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'submit');
      
      rerender(<Button type="button">Button</Button>);
      button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'button');
    });

    test('passes through additional HTML attributes', () => {
      render(<Button id="test-id" data-custom="value">Test</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('id', 'test-id');
      expect(button).toHaveAttribute('data-custom', 'value');
    });
  });

  describe('Accessibility', () => {
    test('supports keyboard navigation', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();
      
      render(<Button onClick={handleClick}>Accessible</Button>);
      const button = screen.getByRole('button');
      
      button.focus();
      await user.keyboard('{Enter}');
      
      expect(handleClick).toHaveBeenCalled();
    });
  });
});

describe('IconButton', () => {
  const TestIcon = () => <svg data-testid="test-icon" />;

  test('renders with icon', () => {
    render(<IconButton icon={<TestIcon />} label="Close" />);
    
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  test('has accessible label and title', () => {
    render(<IconButton icon={<TestIcon />} label="Delete item" />);
    
    const button = screen.getByRole('button', { name: /delete item/i });
    expect(button).toHaveAttribute('aria-label', 'Delete item');
    expect(button).toHaveAttribute('title', 'Delete item');
  });

  test('is circular', () => {
    render(<IconButton icon={<TestIcon />} label="Test" />);
    
    expect(screen.getByRole('button')).toHaveClass('rounded-full');
  });
});

describe('ButtonGroup', () => {
  test('renders multiple buttons', () => {
    render(
      <ButtonGroup>
        <Button>First</Button>
        <Button>Second</Button>
        <Button>Third</Button>
      </ButtonGroup>
    );
    
    expect(screen.getByText(/first/i)).toBeInTheDocument();
    expect(screen.getByText(/second/i)).toBeInTheDocument();
    expect(screen.getByText(/third/i)).toBeInTheDocument();
  });

  test('is horizontal by default', () => {
    const { container } = render(
      <ButtonGroup>
        <Button>One</Button>
        <Button>Two</Button>
      </ButtonGroup>
    );
    
    expect(container.firstChild).toHaveClass('flex-row');
  });

  test('supports vertical orientation', () => {
    const { container } = render(
      <ButtonGroup orientation="vertical">
        <Button>One</Button>
        <Button>Two</Button>
      </ButtonGroup>
    );
    
    expect(container.firstChild).toHaveClass('flex-col');
  });

  test('adjusts button corners for grouped appearance', () => {
    render(
      <ButtonGroup>
        <Button>First</Button>
        <Button>Middle</Button>
        <Button>Last</Button>
      </ButtonGroup>
    );
    
    const buttons = screen.getAllByRole('button');
    expect(buttons[1]).toHaveClass('rounded-none');
  });
});