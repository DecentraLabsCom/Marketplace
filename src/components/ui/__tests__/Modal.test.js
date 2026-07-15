import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import Modal from '../Modal'

describe('Modal accessibility', () => {
  test('exposes a named dialog and restores focus to the trigger', async () => {
    const onClose = jest.fn()
    const { rerender } = render(
      <>
        <button type="button">Open modal</button>
        <Modal isOpen={false} onClose={onClose} title="Example modal">
          <button type="button">First action</button>
        </Modal>
      </>,
    )

    const trigger = screen.getByRole('button', { name: 'Open modal' })
    trigger.focus()
    rerender(
      <>
        <button type="button">Open modal</button>
        <Modal isOpen onClose={onClose} title="Example modal">
          <button type="button">First action</button>
        </Modal>
      </>,
    )

    const dialog = await screen.findByRole('dialog', { name: 'Example modal' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    rerender(
      <>
        <button type="button">Open modal</button>
        <Modal isOpen={false} onClose={onClose} title="Example modal">
          <button type="button">First action</button>
        </Modal>
      </>,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open modal' })).toHaveFocus())
  })

  test('keeps Tab navigation inside the dialog', async () => {
    render(
      <Modal isOpen onClose={jest.fn()} title="Example modal">
        <button type="button">First action</button>
        <button type="button">Second action</button>
      </Modal>,
    )

    const second = screen.getByRole('button', { name: 'Second action' })
    const close = screen.getByRole('button', { name: 'Close modal' })
    close.focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })

    expect(second).toHaveFocus()
  })
})
