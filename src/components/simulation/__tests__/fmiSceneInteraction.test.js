import { createAxisDragContext, getAxisCoordinateFromRay } from '../digital-twin/fmiSceneInteraction'

describe('fmiSceneInteraction', () => {
  test('projects a pointer ray onto the configured local object axis', () => {
    const context = createAxisDragContext({
      axisOrigin: [0, 0, 0],
      axisDirection: [1, 0, 0],
      cameraDirection: [0, 0, -1],
      cameraUp: [0, 1, 0],
      cameraRight: [1, 0, 0],
      worldUnitsPerLocalUnit: 1,
    })
    const ray = { origin: [5, 4, 10], direction: [0, 0, -1] }

    expect(getAxisCoordinateFromRay(ray, context)).toBeCloseTo(5)
  })

  test('handles scaled and rotated parents while returning local-axis coordinates', () => {
    const context = createAxisDragContext({
      axisOrigin: [0, 0, 0],
      axisDirection: [0, 1, 0],
      cameraDirection: [-1, 0, 0],
      cameraUp: [0, 0, 1],
      cameraRight: [0, 1, 0],
      worldUnitsPerLocalUnit: 2,
    })
    const ray = { origin: [-10, 8, 0], direction: [1, 0, 0] }

    expect(getAxisCoordinateFromRay(ray, context)).toBeCloseTo(4)
  })

  test('returns no coordinate when the pointer ray is parallel to the drag plane', () => {
    const context = createAxisDragContext({
      axisOrigin: [0, 0, 0],
      axisDirection: [1, 0, 0],
      cameraDirection: [0, 0, -1],
      cameraUp: [0, 1, 0],
      cameraRight: [1, 0, 0],
      worldUnitsPerLocalUnit: 1,
    })
    const ray = { origin: [0, 0, 1], direction: [0, 1, 0] }

    expect(getAxisCoordinateFromRay(ray, context)).toBeNull()
  })
})
