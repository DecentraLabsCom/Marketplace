import { render, screen, waitFor } from '@testing-library/react'
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
        value={['1.3', '1.4']}
        onChange={mockOnChange}
      />
    )

    expect(screen.getByText('Physical sciences')).toBeInTheDocument()
    expect(screen.getByText('Chemical sciences')).toBeInTheDocument()
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
    expect(screen.getByText('1 Natural Sciences')).toBeInTheDocument()
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
    const physicsOption = screen.getByText('Physical sciences')
    await user.click(physicsOption)

    expect(mockOnChange).toHaveBeenCalledWith(['1.3'])
  })

  test('removes a category when X button clicked', async () => {
    const user = userEvent.setup()
    
    render(
      <CategoryMultiSelect
        value={['1.3', '1.4']}
        onChange={mockOnChange}
      />
    )

    // Get all remove buttons (X icons)
    const removeButtons = screen.getAllByRole('button')
    // Click the first remove button (Physical sciences tag)
    await user.click(removeButtons[0])

    expect(mockOnChange).toHaveBeenCalledWith(['1.4'])
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
    expect(screen.queryByText('1 Natural Sciences')).not.toBeInTheDocument()
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

    expect(screen.getByText('1 Natural Sciences')).toBeInTheDocument()

    // Click outside
    const outsideElement = screen.getByTestId('outside')
    await user.click(outsideElement)

    await waitFor(() => {
      expect(screen.queryByText('1 Natural Sciences')).not.toBeInTheDocument()
    })
  })

  test('toggles category selection', async () => {
    const user = userEvent.setup()
    
    render(
      <CategoryMultiSelect
        value={['1.3']}
        onChange={mockOnChange}
      />
    )

    // Open dropdown by clicking on the container (not on the tag)
    const container = screen.getByText('Physical sciences').closest('.w-full')
    await user.click(container)

    // Click the checkbox for Physics to deselect
    const checkboxes = screen.getAllByRole('checkbox')
    const physicsCheckbox = checkboxes.find(cb => cb.checked && cb.parentElement.textContent.includes('Physical sciences'))
    
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
