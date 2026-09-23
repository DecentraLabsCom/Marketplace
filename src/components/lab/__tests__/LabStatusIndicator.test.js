import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import LabStatusIndicator from '../LabStatusIndicator'

describe('LabStatusIndicator', () => {
  test('renders a ready LED with a soft glow and accessible tooltip', () => {
    render(<LabStatusIndicator status={{ state: 'ready', reason: 'station_ready', ageSeconds: 24 }} />)

    const indicator = screen.getByTestId('lab-status-indicator')
    expect(indicator).toHaveAttribute('data-status', 'ready')
    expect(indicator).toHaveAttribute('title', expect.stringContaining('Ready'))
    expect(indicator.querySelector('[aria-hidden="true"]')).toHaveClass('animate-status-glow')
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent('Ready')
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent('24s ago')
  })

  test('renders an occupied busy LED with an orange pulse', () => {
    render(<LabStatusIndicator status={{ state: 'busy', severity: 'warning', reason: 'local_session_active' }} />)

    const dot = screen.getByTestId('lab-status-indicator').querySelector('[aria-hidden="true"]')
    expect(dot).toHaveClass('animate-status-pulse', 'bg-orange-400')
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent('local session')
  })

  test('renders local-mode busy as a red pulse', () => {
    render(<LabStatusIndicator status={{ state: 'busy', severity: 'critical', reason: 'local_mode_enabled' }} />)

    const dot = screen.getByTestId('lab-status-indicator').querySelector('[aria-hidden="true"]')
    expect(dot).toHaveClass('animate-status-pulse', 'bg-red-500')
  })

  test('renders a stale signal as amber glow', () => {
    render(<LabStatusIndicator status={{ state: 'unknown', reason: 'heartbeat_stale', ageSeconds: 181 }} />)

    const dot = screen.getByTestId('lab-status-indicator').querySelector('[aria-hidden="true"]')
    expect(dot).toHaveClass('animate-status-glow', 'bg-amber-400')
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent('heartbeat is stale')
  })

  test('can place the tooltip above indicators anchored near the bottom of an image', () => {
    render(<LabStatusIndicator tooltipPlacement="above" />)

    expect(screen.getByTestId('lab-status-tooltip')).toHaveClass('bottom-full', 'mb-2')
    expect(screen.getByTestId('lab-status-tooltip')).not.toHaveClass('top-full')
  })
})
