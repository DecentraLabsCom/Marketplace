import { render, screen } from '@testing-library/react'
import SspTopology from '../SspTopology'

const metadata = {
  components: [
    {
      name: 'Controller',
      source: 'resources/controller.fmu',
      connectors: [{ name: 'torque', kind: 'output', type: 'Real' }],
    },
    {
      name: 'Plant',
      source: 'resources/plant.fmu',
      connectors: [{ name: 'torque', kind: 'input', type: 'Real' }],
    },
  ],
  connections: [
    {
      startElement: 'Controller',
      startConnector: 'torque',
      endElement: 'Plant',
      endConnector: 'torque',
    },
  ],
  variants: [{ name: 'Nominal' }],
}

describe('SspTopology', () => {
  test('renders components and connections', () => {
    render(<SspTopology metadata={metadata} />)

    expect(screen.getAllByText('Controller').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Plant').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Connections')).toBeInTheDocument()
    expect(screen.getByText('Nominal')).toBeInTheDocument()
  })

  test('renders nothing when metadata is missing', () => {
    const { container } = render(<SspTopology metadata={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
