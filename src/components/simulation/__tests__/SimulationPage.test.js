import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithAllProviders } from '@/test-utils/test-providers'
import { useLabById } from '@/hooks/lab/useLabs'
import { useRouter } from 'next/navigation'
import SimulationPage from '../SimulationPage'

jest.mock('@/hooks/lab/useLabs', () => ({
  useLabById: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

jest.mock('@/components/ui', () => ({
  Container: ({ children }) => <div data-testid="page-container">{children}</div>,
}))

jest.mock('@/components/skeletons', () => ({
  LabHeroSkeleton: () => <div data-testid="lab-hero-skeleton" />,
}))

jest.mock('../SimulationRunner', () => ({
  __esModule: true,
  default: ({ lab, reservationKey }) => (
    <section
      data-testid="simulation-runner"
      data-lab-id={String(lab.id)}
      data-reservation-key={reservationKey}
    >
      Simulation runner for {lab.name}
    </section>
  ),
}))

const fmuLab = {
  id: '42',
  name: 'Spring-Damper FMU',
  resourceType: 'fmu',
  fmuFileName: 'spring-damper.fmu',
  modelVariables: [],
}

const regularLab = {
  id: '42',
  name: 'Remote Lab',
  resourceType: 'lab',
}

const loaded = (data) => ({
  data,
  isLoading: false,
  isError: false,
  error: null,
})

beforeEach(() => {
  jest.clearAllMocks()
  useRouter.mockReturnValue({ replace: jest.fn() })
})

describe('SimulationPage', () => {
  test('renders the loading skeleton while the resource query is pending', () => {
    useLabById.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
    })

    renderWithAllProviders(<SimulationPage id="42" />)

    expect(screen.getByTestId('lab-hero-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('simulation-runner')).not.toBeInTheDocument()
  })

  test('shows the query error and retry affordance', () => {
    useLabById.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error('Resource backend unavailable'),
    })

    renderWithAllProviders(<SimulationPage id="42" />)

    expect(screen.getByRole('heading', { name: 'Error Loading Resource' })).toBeInTheDocument()
    expect(screen.getByText('Resource backend unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  test('uses a safe fallback when the query error has no public message', () => {
    useLabById.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: {},
    })

    renderWithAllProviders(<SimulationPage id="42" />)

    expect(screen.getByText('Failed to load resource data')).toBeInTheDocument()
  })

  test('renders an explicit empty state when the resource is not found', () => {
    useLabById.mockReturnValue(loaded(null))

    renderWithAllProviders(<SimulationPage id="missing" />)

    expect(screen.getByText('Resource not found.')).toBeInTheDocument()
    expect(screen.queryByTestId('simulation-runner')).not.toBeInTheDocument()
  })

  test('redirects non-FMU resources to their lab detail page', () => {
    const replace = jest.fn()
    useRouter.mockReturnValue({ replace })
    useLabById.mockReturnValue(loaded(regularLab))

    renderWithAllProviders(<SimulationPage id={42} />)

    expect(replace).toHaveBeenCalledWith('/lab/42')
    expect(screen.queryByTestId('simulation-runner')).not.toBeInTheDocument()
  })

  test('passes the FMU resource and reservation context to the simulation runner', () => {
    useLabById.mockReturnValue(loaded(fmuLab))

    renderWithAllProviders(<SimulationPage id="42" reservationKey="0xreservation" />)

    expect(screen.getByText('Simulation runner for Spring-Damper FMU')).toBeInTheDocument()
    expect(screen.getByTestId('simulation-runner')).toHaveAttribute('data-lab-id', '42')
    expect(screen.getByTestId('simulation-runner')).toHaveAttribute('data-reservation-key', '0xreservation')
    expect(useLabById).toHaveBeenCalledWith('42')
  })
})
