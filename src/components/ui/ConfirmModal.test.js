import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmModal from './ConfirmModal'

describe('ConfirmModal', () => {
  const onClose = jest.fn()
  const onContinue = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('does not render anything when isOpen is false', () => {
    const { container } = render(
      <ConfirmModal isOpen={false} onClose={onClose} onContinue={onContinue} />
    )
    expect(container.firstChild).toBeNull()
  })

  test('renders title and buttons when isOpen is true', () => {
    render(<ConfirmModal isOpen onClose={onClose} onContinue={onContinue} />)

    // Title
    expect(
      screen.getByText(/Are you sure you want to proceed\?/i)
    ).toBeInTheDocument()

    // Buttons
    expect(
      screen.getByRole('button', { name: /Continue/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Cancel/i })
    ).toBeInTheDocument()
  })

  test('calls onContinue when clicking the Continue button', () => {
    render(<ConfirmModal isOpen onClose={onClose} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  test('calls onClose when clicking the Cancel button', () => {
    render(<ConfirmModal isOpen onClose={onClose} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('calls onClose when pressing the Escape key', () => {
    render(<ConfirmModal isOpen onClose={onClose} onContinue={onContinue} />)
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
