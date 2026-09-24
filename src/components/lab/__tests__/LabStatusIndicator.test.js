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
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent(/another user/i)
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
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent(/availability of this laboratory cannot be confirmed/i)
  })

  test('keeps the LED glow free of a dark backdrop and circular border', () => {
    render(<LabStatusIndicator status={{ state: 'unknown' }} />)

    const indicator = screen.getByTestId('lab-status-indicator')
    const dot = indicator.querySelector('[aria-hidden="true"]')

    expect(indicator).not.toHaveClass('bg-black/45', 'backdrop-blur-sm', 'rounded-full')
    expect(dot).not.toHaveClass('border', 'border-white/50')
  })

  test('supports a compact tooltip aligned to the indicator edge', () => {
    render(
      <LabStatusIndicator
        compact
        status={{ state: 'ready', reason: 'station_ready', ageSeconds: 24 }}
        tooltipAlign="start"
        tooltipPlacement="above"
      />,
    )

    const tooltip = screen.getByTestId('lab-status-tooltip')
    expect(tooltip).toHaveClass('left-0', 'translate-x-0', 'w-40')
    expect(tooltip).not.toHaveClass('left-1/2', '-translate-x-1/2', 'w-64')
    expect(tooltip).toHaveTextContent('Ready')
    expect(tooltip).toHaveTextContent('24s ago')
    expect(tooltip).not.toHaveTextContent('latest Lab Station heartbeat')
  })

  test('renders an available laboratory with a concise consumer-facing tooltip', () => {
    render(<LabStatusIndicator status={{
      state: 'reachable',
      reason: 'target_reachable',
      source: 'guacamole_tcp_probe',
      ageSeconds: 4,
    }} />)

    const dot = screen.getByTestId('lab-status-indicator').querySelector('[aria-hidden="true"]')
    expect(dot).toHaveClass('animate-status-glow', 'bg-emerald-400')
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent('online and available')
  })

  test('does not expose internal reasons or technical components in the tooltip', () => {
    render(<LabStatusIndicator status={{
      state: 'not_ready',
      reason: 'station_not_ready',
      source: 'lab_station_heartbeat',
      ageSeconds: 43,
    }} />)

    const tooltip = screen.getByTestId('lab-status-tooltip')
    expect(tooltip).toHaveTextContent('not ready for use')
    expect(tooltip).toHaveTextContent('Updated 43s ago')
    expect(tooltip).not.toHaveTextContent(/Reason:|Gateway|Lab Station|heartbeat|Signal:|TCP|RDP|VNC|SSH/i)
  })

  test('can place the tooltip above indicators anchored near the bottom of an image', () => {
    render(<LabStatusIndicator tooltipPlacement="above" />)

    expect(screen.getByTestId('lab-status-tooltip')).toHaveClass('bottom-full', 'mb-2')
    expect(screen.getByTestId('lab-status-tooltip')).not.toHaveClass('top-full')
  })
})
