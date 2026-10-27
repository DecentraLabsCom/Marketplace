const VECTOR_EPSILON = 1e-8

function isVector(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
}

function subtract(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]]
}

function scale(vector, scalar) {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar]
}

function normalize(vector) {
  const length = Math.sqrt(dot(vector, vector))
  return length > VECTOR_EPSILON ? scale(vector, 1 / length) : null
}

function getPerpendicular(vector, axis) {
  return subtract(vector, scale(axis, dot(vector, axis)))
}

export function createAxisDragContext({
  axisOrigin,
  axisDirection,
  cameraDirection,
  cameraUp,
  cameraRight,
  worldUnitsPerLocalUnit = 1,
}) {
  if (!isVector(axisOrigin) || !isVector(axisDirection)
    || !Number.isFinite(worldUnitsPerLocalUnit) || worldUnitsPerLocalUnit <= VECTOR_EPSILON) return null

  const normalizedAxis = normalize(axisDirection)
  if (!normalizedAxis) return null

  const planeNormal = [cameraDirection, cameraUp, cameraRight]
    .filter(isVector)
    .map((candidate) => normalize(getPerpendicular(candidate, normalizedAxis)))
    .find(Boolean)
  if (!planeNormal) return null

  return {
    axisOrigin,
    axisDirection: normalizedAxis,
    planeNormal,
    worldUnitsPerLocalUnit,
  }
}

export function getAxisCoordinateFromRay(ray, context) {
  if (!context || !isVector(ray?.origin) || !isVector(ray?.direction)) return null
  const denominator = dot(context.planeNormal, ray.direction)
  if (Math.abs(denominator) <= VECTOR_EPSILON) return null

  const rayDistance = dot(context.planeNormal, subtract(context.axisOrigin, ray.origin)) / denominator
  if (!Number.isFinite(rayDistance) || rayDistance < 0) return null

  const intersection = [
    ray.origin[0] + ray.direction[0] * rayDistance,
    ray.origin[1] + ray.direction[1] * rayDistance,
    ray.origin[2] + ray.direction[2] * rayDistance,
  ]
  const distanceOnWorldAxis = dot(subtract(intersection, context.axisOrigin), context.axisDirection)
  return distanceOnWorldAxis / context.worldUnitsPerLocalUnit
}
