import { render, screen } from '@testing-library/react'
import FAQ from '../FAQPage'

describe('FAQ service-credit messaging', () => {
  test('describes credits without legacy token-payment terminology', () => {
    render(<FAQ />)

    expect(screen.getByText(/Service credits are prepaid internal units/i)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\$LAB|ERC-20/i)
  })
})
