import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Input,
  Textarea,
  Select,
  Checkbox,
  RadioGroup,
  FormField,
  FormGroup
} from './Form'

//
// INPUT
//
describe('Input component', () => {
  test('renders a label and associates it with the input element', () => {
    render(<Input label="Name" value="" onChange={() => {}} />)
    const input = screen.getByLabelText(/Name/i)
    expect(input).toBeInTheDocument()
  })

  test('renders required asterisk when required=true', () => {
    render(<Input label="Email" required value="" onChange={() => {}} />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  test('renders initial value and forwards arbitrary props', () => {
    render(
      <Input
        label="Username"
        value="andres"
        onChange={() => {}}
        placeholder="Enter your username"
        type="text"
      />
    )
    const input = screen.getByLabelText(/Username/i)
    expect(input).toHaveValue('andres')
    expect(input).toHaveAttribute('placeholder', 'Enter your username')
    expect(input).toHaveAttribute('type', 'text')
  })

  test('calls onChange when typing', async () => {
    const user = userEvent.setup()
    const handleChange = jest.fn()
    render(<Input label="City" value="" onChange={handleChange} />)
    const input = screen.getByLabelText(/City/i)
    await user.type(input, 'Madrid')
    expect(handleChange).toHaveBeenCalled()
  })

  test('does not call onChange when disabled', async () => {
    const user = userEvent.setup()
    const handleChange = jest.fn()
    render(
      <Input label="Disabled" value="" onChange={handleChange} disabled />
    )
    const input = screen.getByLabelText(/Disabled/i)
    expect(input).toBeDisabled()
    await user.type(input, 'text')
    expect(handleChange).not.toHaveBeenCalled()
  })

  test('prioritizes error over helpText and applies error styling', () => {
    render(
      <Input
        label="Price"
        value="abc"
        onChange={() => {}}
        error="Invalid price"
        helpText="Enter a valid number"
      />
    )
    // Error message shown, helpText hidden
    expect(screen.getByText(/Invalid price/i)).toBeInTheDocument()
    expect(screen.queryByText(/Enter a valid number/i)).toBeNull()

    // CSS class for error state applied
    const input = screen.getByLabelText(/Price/i)
    expect(input.className).toMatch(/border-error/)
  })

  test('shows helpText when provided and no error', () => {
    render(
      <Input
        label="Duration"
        value=""
        onChange={() => {}}
        helpText="Enter minutes"
      />
    )
    expect(screen.getByText(/Enter minutes/i)).toBeInTheDocument()
  })

  test('applies size and state variant classes', () => {
    const { rerender } = render(
      <Input label="SizeTest" value="" onChange={() => {}} size="sm" />
    )
    expect(screen.getByLabelText(/SizeTest/i).className).toMatch(/text-sm/)

    rerender(
      <Input
        label="SizeTest"
        value=""
        onChange={() => {}}
        state="success"
      />
    )
    expect(screen.getByLabelText(/SizeTest/i).className).toMatch(/border-success/)
  })
})

//
// TEXTAREA
//
describe('Textarea component', () => {
  test('renders label and respects rows prop', () => {
    render(<Textarea label="Description" rows={6} onChange={() => {}} />)
    const textarea = screen.getByLabelText(/Description/i)
    expect(textarea).toHaveAttribute('rows', '6')
  })

  test('allows typing and shows the typed value', async () => {
    const user = userEvent.setup()
    render(<Textarea label="Notes" onChange={() => {}} />)
    const textarea = screen.getByLabelText(/Notes/i)
    await user.type(textarea, 'Some text')
    expect(textarea).toHaveValue('Some text')
  })

  test('prioritizes error message over helpText', () => {
    render(
      <Textarea
        label="Comments"
        onChange={() => {}}
        error="Required field"
        helpText="Add your comments"
      />
    )
    expect(screen.getByText(/Required field/i)).toBeInTheDocument()
    expect(screen.queryByText(/Add your comments/i)).toBeNull()
  })
})

//
// SELECT
//
describe('Select component', () => {
  const options = [
    { value: 'es', label: 'Spain' },
    { value: 'fr', label: 'France' }
  ]

  test('renders label, placeholder and options', () => {
    render(
      <Select
        label="Country"
        options={options}
        placeholder="Select a country"
        onChange={() => {}}
      />
    )
    expect(screen.getByLabelText(/Country/i)).toBeInTheDocument()
    expect(screen.getByText(/Select a country/i)).toBeInTheDocument()
    options.forEach(o => {
      expect(screen.getByText(o.label)).toBeInTheDocument()
    })
  })

  test('allows selecting an option and fires onChange', async () => {
    const user = userEvent.setup()
    const handleChange = jest.fn()
    render(
      <Select label="Country" options={options} onChange={handleChange} />
    )
    const select = screen.getByLabelText(/Country/i)
    await user.selectOptions(select, 'fr')
    expect(select.value).toBe('fr')
    expect(handleChange).toHaveBeenCalled()
  })

  test('shows error message and applies error styling', () => {
    render(
      <Select
        label="Country"
        options={options}
        onChange={() => {}}
        error="Country is required"
      />
    )
    expect(screen.getByText(/Country is required/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Country/i).className).toMatch(/border-error/)
  })
})

//
// CHECKBOX
//
describe('Checkbox component', () => {
  test('renders label and description, toggles checked state', async () => {
    const user = userEvent.setup()
    render(
      <Checkbox
        label="Accept terms"
        description="You must accept to continue"
        onChange={() => {}}
      />
    )
    const checkbox = screen.getByLabelText(/Accept terms/i)
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()
  })
})

//
// RADIOGROUP
//
describe('RadioGroup component', () => {
  test('renders legend and toggles selection, calls onChange', async () => {
    const user = userEvent.setup()
    const handleChange = jest.fn()
    render(
      <RadioGroup
        label="Payment method"
        name="payment"
        value="card"
        onChange={handleChange}
        options={[
          { value: 'card', label: 'Card' },
          { value: 'paypal', label: 'PayPal' }
        ]}
      />
    )
    expect(screen.getByText(/Payment method/i)).toBeInTheDocument()
    const paypal = screen.getByLabelText(/PayPal/i)
    expect(paypal).not.toBeChecked()

    await user.click(paypal)
    expect(handleChange).toHaveBeenCalled()
  })
})

//
// FORMFIELD
//
describe('FormField wrapper', () => {
  test('renders children and merges additional className', () => {
    render(
      <FormField className="custom-class">
        <span>Child content</span>
      </FormField>
    )
    const wrapper = screen.getByText(/Child content/i).parentElement
    expect(wrapper).toHaveClass('custom-class')
  })
})

//
// FORMGROUP
//
describe('FormGroup wrapper', () => {
  test('renders title, description and children', () => {
    render(
      <FormGroup title="Section Title" description="Section description">
        <div data-testid="child">Inner content</div>
      </FormGroup>
    )
    expect(screen.getByText(/Section Title/i)).toBeInTheDocument()
    expect(screen.getByText(/Section description/i)).toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })
})
