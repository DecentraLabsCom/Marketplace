import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProvisioningTrustReviewModal from '../ProvisioningTrustReviewModal'

describe('ProvisioningTrustReviewModal', () => {
  test('requires an explicit acknowledgement before issuing a token bound to the reviewed origin', async () => {
    const user = userEvent.setup()
    const onConfirm = jest.fn()

    render(
      <ProvisioningTrustReviewModal
        isOpen
        institutionId="university.edu"
        walletAddress="0x1234567890123456789012345678901234567890"
        backendOrigin="https://gateway.university.edu"
        registrationType="provider"
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />
    )

    const dialog = screen.getByRole('dialog', { name: /review institutional trust/i })
    expect(within(dialog).getByText('university.edu')).toBeInTheDocument()
    expect(within(dialog).getByText('https://gateway.university.edu')).toBeInTheDocument()
    expect(within(dialog).getByText(/subdomains are not trusted automatically/i)).toBeInTheDocument()

    const confirm = within(dialog).getByRole('button', { name: /generate provisioning token/i })
    expect(confirm).toBeDisabled()
    await user.click(within(dialog).getByRole('checkbox', { name: /I have verified/i }))
    await user.click(confirm)

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
