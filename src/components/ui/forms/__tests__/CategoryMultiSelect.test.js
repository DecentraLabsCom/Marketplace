import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CategoryMultiSelect from '../CategoryMultiSelect'

describe('CategoryMultiSelect', () => {
  const mockOnChange = jest.fn()

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  test('renders with placeholder when no categories selected', () => {
    render(
      <CategoryMultiSelect
        value={[]}
        onChange={mockOnChange}
        placeholder="Select categories..."
      />
    )

    expect(screen.getByText('Select categories...')).toBeInTheDocument()
  })

  test('displays selected categories as tags', () => {
    render(
      <CategoryMultiSelect
        value={['Physics', 'Chemistry']}
        onChange={mockOnChange}
      />
    )

    expect(screen.getByText('Physics')).toBeInTheDocument()
    expect(screen.getByText('Chemistry')).toBeInTheDocument()
  })

  test('opens dropdown when clicked', async () => {
    const user = userEvent.setup()
    
    render(
      <CategoryMultiSelect
        value={[]}
        onChange={mockOnChange}
      />
    )

    const dropdown = screen.getByText('Select categories...')
    await user.click(dropdown)

    // Check for at least one group name
    expect(screen.getByText('Physical Sciences')).toBeInTheDocument()
  })

  test('selects a category when clicked', async () => {
    const user = userEvent.setup()
    
    render(
      <CategoryMultiSelect
        value={[]}
        onChange={mockOnChange}
      />
    )

    // Open dropdown
    const dropdown = screen.getByText('Select categories...')
    await user.click(dropdown)

    // Find and click Physics category
    const physicsOption = screen.getByText('Physics')
    await user.click(physicsOption)

    expect(mockOnChange).toHaveBeenCalledWith(['Physics'])
  })

  test('removes a category when X button clicked', async () => {
    const user = userEvent.setup()
    
    render(
      <CategoryMultiSelect
        value={['Physics', 'Chemistry']}
        onChange={mockOnChange}
      />
    )

    // Get all remove buttons (X icons)
    const removeButtons = screen.getAllByRole('button')
    // Click the first remove button (Physics tag)
    await user.click(removeButtons[0])

    expect(mockOnChange).toHaveBeenCalledWith(['Chemistry'])
  })

  test('does not open dropdown when disabled', async () => {
    const user = userEvent.setup()
    
    render(
      <CategoryMultiSelect
        value={[]}
        onChange={mockOnChange}
        disabled={true}
      />
    )

    const dropdown = screen.getByText('Select categories...')
    await user.click(dropdown)

    // Dropdown should not open - group names should not appear
    expect(screen.queryByText('Physical Sciences')).not.toBeInTheDocument()
  })

  test('displays error message when provided', () => {
    render(
      <CategoryMultiSelect
        value={[]}
        onChange={mockOnChange}
        error="Category is required"
      />
    )

    expect(screen.getByText('Category is required')).toBeInTheDocument()
  })

  test('closes dropdown when clicking outside', async () => {
    const user = userEvent.setup()
    
    render(
      <div>
        <CategoryMultiSelect
          value={[]}
          onChange={mockOnChange}
        />
        <div data-testid="outside">Outside element</div>
      </div>
    )

    // Open dropdown
    const dropdown = screen.getByText('Select categories...')
    await user.click(dropdown)

    expect(screen.getByText('Physical Sciences')).toBeInTheDocument()

    // Click outside
    const outsideElement = screen.getByTestId('outside')
    await user.click(outsideElement)

    await waitFor(() => {
      expect(screen.queryByText('Physical Sciences')).not.toBeInTheDocument()
    })
  })

  test('toggles category selection', async () => {
    const user = userEvent.setup()
    
    render(
      <CategoryMultiSelect
        value={['Physics']}
        onChange={mockOnChange}
      />
    )

    // Open dropdown by clicking on the container (not on the tag)
    const container = screen.getByText('Physics').closest('.w-full')
    await user.click(container)

    // Click the checkbox for Physics to deselect
    const checkboxes = screen.getAllByRole('checkbox')
    const physicsCheckbox = checkboxes.find(cb => cb.checked && cb.parentElement.textContent.includes('Physics'))
    
    if (physicsCheckbox) {
      await user.click(physicsCheckbox.parentElement)
    }

    expect(mockOnChange).toHaveBeenCalledWith([])
  })

  test('handles array normalization for non-array values', () => {
    render(
      <CategoryMultiSelect
        value={null}
        onChange={mockOnChange}
      />
    )

    expect(screen.getByText('Select categories...')).toBeInTheDocument()
  })
})
