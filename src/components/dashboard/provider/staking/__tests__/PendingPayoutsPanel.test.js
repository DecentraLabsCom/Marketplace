import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

jest.mock('@/context/LabTokenContext', () => ({ useLabToken: () => ({ decimals: 6 }) }))
jest.mock('@/hooks/staking/useStakingAtomicQueries', () => ({
  usePendingLabPayouts: () => ({ data: { payoutsByLabId: {}, items: [] }, isLoading: false }),
}))
import PendingPayoutsPanel from '../PendingPayoutsPanel'

describe('PendingPayoutsPanel - revenue split boxes', () => {
  test('split boxes have matching base width and governance is 10% larger', () => {
    const { container } = render(<PendingPayoutsPanel labs={[]} onCollect={() => {}} isCollectEnabled={false} isSSO={false} isCollecting={false} />)

    const providerBox = screen.getByText(/^provider$/i).closest('div')
    const treasuryBox = screen.getByText(/^treasury$/i).closest('div')
    const subsidiesBox = screen.getByText(/^subsidies$/i).closest('div')
    const governanceBox = screen.getByText(/^governance$/i).closest('div')

    // stronger horizontal padding reduction applied to panel container
    const panel = container.querySelector('[data-testid="pending-payouts-panel"]')
    expect(panel?.className || '').toMatch(/px-3/)

    expect(providerBox).toBeInTheDocument()
    expect(treasuryBox).toBeInTheDocument()
    expect(subsidiesBox).toBeInTheDocument()
    expect(governanceBox).toBeInTheDocument()

    // style.flex should reflect the inline flex value we set
    const pFlex = parseFloat(providerBox.style.flex || '1')
    const tFlex = parseFloat(treasuryBox.style.flex || '1')
    const sFlex = parseFloat(subsidiesBox.style.flex || '1')
    const gFlex = parseFloat(governanceBox.style.flex || '1')

    // base boxes equal
    expect(pFlex).toBeCloseTo(tFlex)
    expect(pFlex).toBeCloseTo(sFlex)

    // governance ~10% larger
    expect(gFlex).toBeCloseTo(pFlex * 1.1)
  })
})
