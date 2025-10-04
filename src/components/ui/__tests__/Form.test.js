/**
 * Form Components Unit Tests
 * 
 * Tests the form component library including Input, Textarea, Select,
 * Checkbox, RadioGroup, and layout wrappers (FormField, FormGroup).
 * 
 * Key testing areas:
 * - Label association and accessibility
 * - Error/help text display logic
 * - User interactions (typing, selecting, clicking)
 * - Ref forwarding to native elements
 * - Required field indicators
 */

import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import {
  Input,
  Textarea,
  Select,
  Checkbox,
  RadioGroup,
  FormField,
  FormGroup
} from '../Form';

describe('Input', () => {
  test('should render with label correctly associated', () => {
    render(<Input label="Email" />);
    
    // Label should be linked to input via htmlFor/id
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  test('should show asterisk when required', () => {
    render(<Input label="Name" required />);
    
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  test('should prioritize error message over help text', () => {
    render(
      <Input 
        label="Price" 
        error="Invalid price" 
        helpText="Enter a number" 
      />
    );
    
    // Only error should be visible when both are provided
    expect(screen.getByText('Invalid price')).toBeInTheDocument();
    expect(screen.queryByText('Enter a number')).not.toBeInTheDocument();
  });

  test('should show help text when no error present', () => {
    render(<Input label="Age" helpText="Must be 18+" />);
    
    expect(screen.getByText('Must be 18+')).toBeInTheDocument();
  });

  test('should apply error border styling', () => {
    render(<Input label="Email" error="Required" />);
    
    const input = screen.getByLabelText('Email');
    expect(input).toHaveClass('border-error');
  });

  test('should handle user typing', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    render(<Input label="City" onChange={handleChange} />);
    
    const input = screen.getByLabelText('City');
    await user.type(input, 'Madrid');
    
    expect(handleChange).toHaveBeenCalled();
    expect(input).toHaveValue('Madrid');
  });

  test('should forward ref to native input element', () => {
    const ref = createRef();
    render(<Input ref={ref} />);
    
    // Ref should point to the actual input DOM element
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  test('should auto-generate unique ID for label association', () => {
    const { container } = render(<Input label="Test" />);
    
    const input = container.querySelector('input');
    const label = container.querySelector('label');
    
    expect(input.id).toBeTruthy();
    expect(label.htmlFor).toBe(input.id);
  });

  test('should use custom ID when provided', () => {
    render(<Input id="custom-id" label="Test" />);
    
    expect(screen.getByLabelText('Test')).toHaveAttribute('id', 'custom-id');
  });

  test('should apply size variant classes', () => {
    const { rerender } = render(<Input size="sm" placeholder="Small" />);
    expect(screen.getByPlaceholderText('Small')).toHaveClass('text-sm');
    
    rerender(<Input size="lg" placeholder="Large" />);
    expect(screen.getByPlaceholderText('Large')).toHaveClass('text-lg');
  });
});

describe('Textarea', () => {
  test('should render with label', () => {
    render(<Textarea label="Description" />);
    
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  test('should respect rows prop', () => {
    render(<Textarea rows={10} />);
    
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '10');
  });

  test('should default to 4 rows', () => {
    render(<Textarea />);
    
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '4');
  });

  test('should show required indicator', () => {
    render(<Textarea label="Bio" required />);
    
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  test('should handle user typing', async () => {
    const user = userEvent.setup();
    render(<Textarea label="Notes" />);
    
    const textarea = screen.getByLabelText('Notes');
    await user.type(textarea, 'Test note');
    
    expect(textarea).toHaveValue('Test note');
  });

  test('should forward ref to native textarea', () => {
    const ref = createRef();
    render(<Textarea ref={ref} />);
    
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });
});

describe('Select', () => {
  const options = [
    { value: 'es', label: 'Spain' },
    { value: 'fr', label: 'France' }
  ];

  test('should render label and all options', () => {
    render(<Select label="Country" options={options} />);
    
    expect(screen.getByLabelText('Country')).toBeInTheDocument();
    expect(screen.getByText('Spain')).toBeInTheDocument();
    expect(screen.getByText('France')).toBeInTheDocument();
  });

  test('should render disabled placeholder option', () => {
    render(<Select placeholder="Choose..." options={options} />);
    
    const placeholder = screen.getByText('Choose...');
    expect(placeholder.closest('option')).toHaveAttribute('disabled');
  });

  test('should handle option selection', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    render(<Select label="Country" options={options} onChange={handleChange} />);
    
    const select = screen.getByLabelText('Country');
    await user.selectOptions(select, 'fr');
    
    expect(select).toHaveValue('fr');
    expect(handleChange).toHaveBeenCalled();
  });

  test('should forward ref to native select', () => {
    const ref = createRef();
    render(<Select ref={ref} options={options} />);
    
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });

  test('should handle empty options array gracefully', () => {
    render(<Select options={[]} />);
    
    const select = screen.getByRole('combobox');
    expect(select.children.length).toBe(0);
  });
});

describe('Checkbox', () => {
  test('should render with label', () => {
    render(<Checkbox label="Accept terms" />);
    
    expect(screen.getByLabelText('Accept terms')).toBeInTheDocument();
  });

  test('should show optional description text', () => {
    render(<Checkbox label="Newsletter" description="Weekly updates" />);
    
    expect(screen.getByText('Weekly updates')).toBeInTheDocument();
  });

  test('should toggle between checked states', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Subscribe" />);
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  test('should work as controlled component', () => {
    const { rerender } = render(
      <Checkbox label="Test" checked={false} onChange={() => {}} />
    );
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    
    // Parent controls the checked state
    rerender(<Checkbox label="Test" checked={true} onChange={() => {}} />);
    expect(checkbox).toBeChecked();
  });

  test('should forward ref to native checkbox input', () => {
    const ref = createRef();
    render(<Checkbox ref={ref} label="Test" />);
    
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current.type).toBe('checkbox');
  });
});

describe('RadioGroup', () => {
  const options = [
    { value: 'sm', label: 'Small' },
    { value: 'md', label: 'Medium' },
    { value: 'lg', label: 'Large' }
  ];

  test('should render legend and all radio options', () => {
    render(<RadioGroup label="Size" name="size" options={options} />);
    
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByLabelText('Small')).toBeInTheDocument();
    expect(screen.getByLabelText('Medium')).toBeInTheDocument();
    expect(screen.getByLabelText('Large')).toBeInTheDocument();
  });

  test('should handle radio selection', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    render(<RadioGroup name="size" options={options} onChange={handleChange} />);
    
    await user.click(screen.getByLabelText('Medium'));
    
    expect(handleChange).toHaveBeenCalled();
  });

  test('should show correct checked state based on value prop', () => {
    render(
      <RadioGroup 
        name="size" 
        options={options} 
        value="md" 
        onChange={() => {}}
      />
    );
    
    // Only the matching radio should be checked
    expect(screen.getByLabelText('Medium')).toBeChecked();
    expect(screen.getByLabelText('Small')).not.toBeChecked();
  });

  test('should use fieldset and legend for proper semantics', () => {
    const { container } = render(
      <RadioGroup label="Size" name="size" options={options} />
    );
    
    // Ensures proper accessibility structure
    expect(container.querySelector('fieldset')).toBeInTheDocument();
    expect(container.querySelector('legend')).toBeInTheDocument();
  });
});

describe('FormField', () => {
  test('should render children without modification', () => {
    render(
      <FormField>
        <Input label="Test" />
      </FormField>
    );
    
    expect(screen.getByLabelText('Test')).toBeInTheDocument();
  });

  test('should merge custom className with defaults', () => {
    const { container } = render(
      <FormField className="custom-class">
        <div>Content</div>
      </FormField>
    );
    
    expect(container.firstChild).toHaveClass('custom-class');
  });
});

describe('FormGroup', () => {
  test('should render children', () => {
    render(
      <FormGroup>
        <Input label="Name" />
      </FormGroup>
    );
    
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  test('should display optional title and description', () => {
    render(
      <FormGroup title="Personal Info" description="Enter your details">
        <Input label="Name" />
      </FormGroup>
    );
    
    expect(screen.getByText('Personal Info')).toBeInTheDocument();
    expect(screen.getByText('Enter your details')).toBeInTheDocument();
  });

  test('should work without title or description', () => {
    render(
      <FormGroup>
        <Input label="Name" />
      </FormGroup>
    );
    
    // Should still render children normally
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });
});