import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import LabStatusIndicator from '../LabStatusIndicator'

describe('LabStatusIndicator', () => {
  test('renders a ready LED with a soft glow and accessible tooltip', () => {
    render(<LabStatusIndicator status={{ state: 'ready', reason: 'station_ready', ageSeconds: 24 }} />)

    const indicator = screen.getByTestId('lab-status-indicator')
    expect(indicator).toHaveAttribute('data-status', 'ready')
    expect(indicator).toHaveAttribute('title', expect.stringContaining('Available'))
    const dot = indicator.querySelector('[aria-hidden="true"]')
    expect(dot).toHaveClass('animate-status-glow', 'status-led')
    expect(dot.style.getPropertyValue('--status-led-color')).toBe('52 211 153')
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent('Available')
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent('24s ago')
  })

  test('renders an occupied busy LED with an orange pulse', () => {
    render(<LabStatusIndicator status={{ state: 'busy', severity: 'warning', reason: 'lab_user_session_active' }} />)

    const dot = screen.getByTestId('lab-status-indicator').querySelector('[aria-hidden="true"]')
    expect(dot).toHaveClass('animate-status-pulse', 'bg-orange-400')
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent(/currently in use/i)
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
    expect(tooltip).toHaveTextContent('Available now')
    expect(tooltip).not.toHaveTextContent('Access:')
    expect(tooltip).not.toHaveTextContent('Wake-on-LAN')
    expect(tooltip).not.toHaveTextContent('Updated')
    expect(screen.getByTestId('lab-status-indicator')).toHaveAttribute(
      'title',
      'Ready. Available now.',
    )
  })

  test('keeps the compact wake-on-demand explanation short but unambiguous', () => {
    render(
      <LabStatusIndicator
        compact
        status={{
          state: 'unknown',
          wake: { state: 'verified', ageSeconds: 42 },
          availability: 'on_demand',
        }}
      />,
    )

    const tooltip = screen.getByTestId('lab-status-tooltip')
    expect(tooltip).toHaveTextContent('Available on demand')
    expect(tooltip).toHaveTextContent('Can be woken on demand')
    expect(tooltip).not.toHaveTextContent('WoL verified')
    expect(tooltip).not.toHaveTextContent('Access:')
    expect(tooltip).not.toHaveTextContent('Availability:')
  })

  test.each([
    [{ state: 'unknown', wake: { state: 'configured' }, availability: 'recoverable' }, 'Wake configured'],
    [{ state: 'unknown', wake: { state: 'failed' }, availability: 'unavailable' }, 'Recovery failed'],
    [{ state: 'busy', severity: 'warning' }, 'In use'],
    [{ state: 'not_ready' }, 'Not available'],
    [{ state: 'unknown' }, 'Not confirmed'],
  ])('uses a short compact explanation for %s', (status, expectedDescription) => {
    render(<LabStatusIndicator compact status={status} />)

    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent(expectedDescription)
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
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent('available now')
  })

  test('uses generic user-facing wording in the detailed tooltip', () => {
    render(<LabStatusIndicator status={{
      state: 'unknown',
      wake: { state: 'verified', ageSeconds: 42 },
      availability: 'on_demand',
    }} />)

    const tooltip = screen.getByTestId('lab-status-tooltip')
    expect(tooltip).toHaveTextContent(/available when needed/i)
    expect(tooltip).not.toHaveTextContent(/Wake-on-LAN|Access:|Guacamole|Lab Station|executor|capacity/i)
  })

  test('uses a green pulse for a recently verified wake-on-demand laboratory', () => {
    render(<LabStatusIndicator status={{
      state: 'unknown',
      access: 'unknown',
      wake: { state: 'verified', ageSeconds: 42 },
      availability: 'on_demand',
    }} />)

    const indicator = screen.getByTestId('lab-status-indicator')
    const dot = indicator.querySelector('[aria-hidden="true"]')
    expect(dot).toHaveClass('animate-status-pulse', 'bg-emerald-400')
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent(/available when needed/i)
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent(/available when needed/i)
  })

  test('uses fixed glowing orange for configured but unverified wake recovery', () => {
    render(<LabStatusIndicator status={{
      state: 'unknown',
      access: 'unknown',
      wake: { state: 'configured' },
      availability: 'recoverable',
    }} />)

    const dot = screen.getByTestId('lab-status-indicator').querySelector('[aria-hidden="true"]')
    expect(dot).toHaveClass('animate-status-glow', 'bg-orange-400')
    expect(dot).not.toHaveClass('animate-status-pulse')
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent(/may become available after a short wait/i)
  })

  test('uses the orange pulse for exhausted FMU execution capacity', () => {
    render(<LabStatusIndicator status={{
      resourceType: 'fmu',
      state: 'busy',
      reason: 'fmu_capacity_exhausted',
      source: 'fmu_runner_health',
      executor: { state: 'ready' },
      capacity: { state: 'busy', active: 2, maximum: 2, available: 0 },
      availability: 'unavailable',
    }} />)

    const indicator = screen.getByTestId('lab-status-indicator')
    const dot = indicator.querySelector('[aria-hidden="true"]')
    expect(dot).toHaveClass('animate-status-pulse', 'bg-orange-400')
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent(/simulations are currently in use/i)
    expect(screen.getByTestId('lab-status-tooltip')).not.toHaveTextContent(/Wake-on-LAN|executor|capacity:/i)
  })

  test('describes FMU availability without showing implementation details', () => {
    render(<LabStatusIndicator status={{
      resourceType: 'fmu',
      state: 'ready',
      reason: 'fmu_ready',
      source: 'fmu_runner_health',
      executor: { state: 'ready' },
      capacity: { state: 'available', available: 1, maximum: 1 },
      availability: 'now',
    }} />)

    const tooltip = screen.getByTestId('lab-status-tooltip')
    expect(tooltip).toHaveTextContent(/simulations are available now/i)
    expect(tooltip).not.toHaveTextContent(/Wake-on-LAN|executor|capacity|fmu_runner_health/i)
  })

  test('keeps an online laboratory green even when its wake evidence is not ready', () => {
    render(<LabStatusIndicator status={{
      state: 'ready',
      access: 'ready',
      wake: { state: 'failed' },
      availability: 'now',
    }} />)

    const dot = screen.getByTestId('lab-status-indicator').querySelector('[aria-hidden="true"]')
    expect(dot).toHaveClass('animate-status-glow', 'bg-emerald-400')
    expect(screen.getByTestId('lab-status-tooltip')).toHaveTextContent(/available for use/i)
  })

  test('does not expose internal reasons or technical components in the tooltip', () => {
    render(<LabStatusIndicator status={{
      state: 'not_ready',
      reason: 'station_not_ready',
      source: 'lab_station_heartbeat',
      ageSeconds: 43,
    }} />)

    const tooltip = screen.getByTestId('lab-status-tooltip')
    expect(tooltip).toHaveTextContent('not currently available')
    expect(tooltip).toHaveTextContent('Updated 43s ago')
    expect(tooltip).not.toHaveTextContent(/Reason:|Gateway|Lab Station|heartbeat|Signal:|TCP|RDP|VNC|SSH/i)
  })

  test('can place the tooltip above indicators anchored near the bottom of an image', () => {
    render(<LabStatusIndicator tooltipPlacement="above" />)

    expect(screen.getByTestId('lab-status-tooltip')).toHaveClass('bottom-full', 'mb-2')
    expect(screen.getByTestId('lab-status-tooltip')).not.toHaveClass('top-full')
  })
})
