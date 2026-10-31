'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { getFmiInitialValue, isFmiBindingVisible } from './fmiBindingVisibility'
import {
  getFmiSceneBoundValue,
  getFmiSceneInputValueFromPosition,
  isDraggableFmiSceneBinding,
  normalizeFmiSceneBinding,
} from './fmiSceneBindings'
import { createAxisDragContext, getAxisCoordinateFromRay } from './fmiSceneInteraction'
import { getVariableDescription } from '../utils/simulationParameters'
import {
  applySceneMaterialRendering,
  applySceneObjectRendering,
  applyScenePresentation,
  readScenePresentation,
} from '@decentralabs/digital-twin-app-protocol/scene-presentation'

function disposeObject(object) {
  object.traverse((node) => {
    node.geometry?.dispose?.()
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    materials.filter(Boolean).forEach((material) => material.dispose?.())
  })
}

function getBindingColor(value, fallback) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) {
    return value
  }
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

function findBindingsForObject(object, bindingsByNode) {
  for (let node = object; node; node = node.parent) {
    const bindings = bindingsByNode.get(node)
    if (bindings?.length) return bindings
  }
  return []
}

function isVisibleInScene(object) {
  for (let node = object; node; node = node.parent) {
    if (!node.visible) return false
  }
  return true
}

function getBoxGap(left, right) {
  const x = Math.max(0, left.min.x - right.max.x, right.min.x - left.max.x)
  const y = Math.max(0, left.min.y - right.max.y, right.min.y - left.max.y)
  const z = Math.max(0, left.min.z - right.max.z, right.min.z - left.max.z)
  return Math.sqrt(x * x + y * y + z * z)
}

function clusterNearbyBindings(entries, maximumGap) {
  if (entries.length < 2) return entries.length ? [entries] : []

  const roots = entries.map((_, index) => index)
  const findRoot = (index) => {
    let root = index
    while (roots[root] !== root) root = roots[root]
    while (roots[index] !== index) {
      const next = roots[index]
      roots[index] = root
      index = next
    }
    return root
  }
  const join = (left, right) => {
    const leftRoot = findRoot(left)
    const rightRoot = findRoot(right)
    if (leftRoot !== rightRoot) roots[rightRoot] = leftRoot
  }

  const cellSize = Math.max(maximumGap, 1e-6)
  const maximumCellsPerEntry = 128
  const cells = new Map()
  const largeEntries = []
  const cellKey = (x, y, z) => `${x}:${y}:${z}`

  for (let index = 0; index < entries.length; index += 1) {
    const { bounds } = entries[index]
    const minX = Math.floor((bounds.min.x - maximumGap) / cellSize)
    const minY = Math.floor((bounds.min.y - maximumGap) / cellSize)
    const minZ = Math.floor((bounds.min.z - maximumGap) / cellSize)
    const maxX = Math.floor((bounds.max.x + maximumGap) / cellSize)
    const maxY = Math.floor((bounds.max.y + maximumGap) / cellSize)
    const maxZ = Math.floor((bounds.max.z + maximumGap) / cellSize)
    const cellCount = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1)
    if (cellCount > maximumCellsPerEntry) {
      largeEntries.push(index)
      continue
    }

    const candidates = new Set()
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          const key = cellKey(x, y, z)
          for (const candidate of cells.get(key) || []) candidates.add(candidate)
        }
      }
    }
    for (const candidate of candidates) {
      if (findRoot(index) === findRoot(candidate)) continue
      if (getBoxGap(bounds, entries[candidate].bounds) <= maximumGap) join(index, candidate)
    }

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          const key = cellKey(x, y, z)
          const bucket = cells.get(key) || []
          bucket.push(index)
          cells.set(key, bucket)
        }
      }
    }
  }

  for (const index of largeEntries) {
    for (let candidate = 0; candidate < entries.length; candidate += 1) {
      if (index === candidate || findRoot(index) === findRoot(candidate)) continue
      if (getBoxGap(entries[index].bounds, entries[candidate].bounds) <= maximumGap) join(index, candidate)
    }
  }

  const clusters = new Map()
  entries.forEach((entry, index) => {
    const root = findRoot(index)
    const cluster = clusters.get(root) || []
    cluster.push(entry)
    clusters.set(root, cluster)
  })
  return [...clusters.values()]
}

function getBoxCorners(bounds) {
  const { min, max } = bounds
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ]
}

function getFmiBindingFocusBounds(sceneRoot, boundObjects) {
  const boundNodes = [...new Set(boundObjects
    .filter(({ isOutputBinding }) => isOutputBinding)
    .map(({ node }) => node))]
  if (boundNodes.length === 0) return null

  const fullBounds = new THREE.Box3().setFromObject(sceneRoot)
  if (fullBounds.isEmpty()) return null
  const largestDimension = (bounds) => {
    const size = bounds.getSize(new THREE.Vector3())
    return Math.max(size.x, size.y, size.z)
  }
  const fullLargestDimension = largestDimension(fullBounds)
  const isAncestorOfEveryBoundNode = (candidate) => boundNodes.every((node) => {
    for (let current = node; current; current = current.parent) {
      if (current === candidate) return true
    }
    return false
  })

  let commonAncestor = boundNodes[0]
  while (commonAncestor && !isAncestorOfEveryBoundNode(commonAncestor)) {
    commonAncestor = commonAncestor.parent
  }
  if (commonAncestor && commonAncestor !== sceneRoot) {
    const contextBounds = new THREE.Box3().setFromObject(commonAncestor)
    if (!contextBounds.isEmpty() && largestDimension(contextBounds) < fullLargestDimension * 0.9) {
      return contextBounds
    }
  }

  const boundBounds = new THREE.Box3().makeEmpty()
  for (const node of boundNodes) boundBounds.expandByObject(node)
  const boundLargestDimension = largestDimension(boundBounds)
  if (
    !boundBounds.isEmpty()
    && boundLargestDimension >= fullLargestDimension * 0.25
    && boundLargestDimension < fullLargestDimension * 0.9
  ) return boundBounds

  return null
}

function setTooltipContent(tooltip, bindings) {
  tooltip.replaceChildren()
  for (const { variable } of bindings) {
    const entry = document.createElement('div')
    entry.className = 'border-b border-white/10 py-1.5 last:border-0 last:pb-0 first:pt-0'

    const name = document.createElement('p')
    name.className = 'text-[11px] font-semibold text-white'
    name.textContent = variable.name
    entry.appendChild(name)

    const description = getVariableDescription(variable)
    if (description) {
      const details = document.createElement('p')
      details.className = 'mt-0.5 text-[11px] leading-snug text-[#c1d2d5]'
      details.textContent = description
      entry.appendChild(details)
    }

    tooltip.appendChild(entry)
  }
}

export default function DigitalTwinCanvas({
  sceneUrl,
  values,
  modelVariables,
  pinnedOutputNames = new Set(),
  interactiveInputVariables = [],
  inputEditingEnabled = false,
  onInputChange,
  onSceneInputBindingsReady,
  showOutputMarkers = false,
  showInputMarkers = false,
  onStatus,
  sampleIndex,
  onSampleRendered,
}) {
  const hostRef = useRef(null)
  const valuesRef = useRef(values)
  const variablesRef = useRef(modelVariables)
  const pinnedOutputNamesRef = useRef(pinnedOutputNames)
  const interactiveInputVariablesRef = useRef(interactiveInputVariables)
  const inputEditingEnabledRef = useRef(inputEditingEnabled)
  const onInputChangeRef = useRef(onInputChange)
  const onSceneInputBindingsReadyRef = useRef(onSceneInputBindingsReady)
  const showOutputMarkersRef = useRef(showOutputMarkers)
  const showInputMarkersRef = useRef(showInputMarkers)
  const onStatusRef = useRef(onStatus)
  const sampleIndexRef = useRef(sampleIndex)
  const onSampleRenderedRef = useRef(onSampleRendered)
  const renderedSampleIndexRef = useRef(null)

  valuesRef.current = values
  variablesRef.current = modelVariables
  pinnedOutputNamesRef.current = pinnedOutputNames
  interactiveInputVariablesRef.current = interactiveInputVariables
  inputEditingEnabledRef.current = inputEditingEnabled
  onInputChangeRef.current = onInputChange
  onSceneInputBindingsReadyRef.current = onSceneInputBindingsReady
  showOutputMarkersRef.current = showOutputMarkers
  showInputMarkersRef.current = showInputMarkers
  onStatusRef.current = onStatus
  sampleIndexRef.current = sampleIndex
  onSampleRenderedRef.current = onSampleRendered

  useEffect(() => {
    const host = hostRef.current
    if (!host || !sceneUrl) return undefined

    let disposed = false
    renderedSampleIndexRef.current = null
    onSceneInputBindingsReadyRef.current?.([])
    let frameId = 0
    let mixer = null
    let markerPulseTime = 0
    const sceneMarkers = []
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0b141a')

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(5.2, 4.3, 6.7)
    camera.lookAt(0, 1, 0)

    let renderer
    let environmentTarget = null
    let pmremGenerator = null
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    } catch {
      onStatusRef.current?.('error')
      return undefined
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.92
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.className = 'h-full w-full outline-none'
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D digital twin scene')
    renderer.domElement.tabIndex = 0
    host.appendChild(renderer.domElement)

    const tooltip = document.createElement('div')
    tooltip.setAttribute('role', 'tooltip')
    tooltip.style.position = 'absolute'
    tooltip.style.zIndex = '20'
    tooltip.style.display = 'none'
    tooltip.style.maxWidth = '280px'
    tooltip.style.maxHeight = 'min(70%, 240px)'
    tooltip.style.overflowY = 'auto'
    tooltip.style.pointerEvents = 'none'
    tooltip.style.border = '1px solid rgba(148, 181, 190, 0.34)'
    tooltip.style.borderRadius = '10px'
    tooltip.style.background = 'rgba(7, 16, 20, 0.94)'
    tooltip.style.padding = '9px 11px'
    tooltip.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.36)'
    host.appendChild(tooltip)

    let keyLight = null
    let fillLight = null
    const addStudioEnvironment = () => {
      if (environmentTarget) return
      const studioEnvironment = new RoomEnvironment()
      pmremGenerator = new THREE.PMREMGenerator(renderer)
      environmentTarget = pmremGenerator.fromScene(studioEnvironment, 0.04)
      scene.environment = environmentTarget.texture
      studioEnvironment.dispose()
    }
    const addDefaultSceneLighting = () => {
      addStudioEnvironment()
      if (keyLight) return
      scene.add(new THREE.HemisphereLight('#d9f2ff', '#13212a', 1.3))
      keyLight = new THREE.DirectionalLight('#fff2d4', 2.25)
      keyLight.position.set(-3, 7, 4)
      keyLight.castShadow = true
      keyLight.shadow.mapSize.set(1024, 1024)
      scene.add(keyLight)
      scene.add(keyLight.target)
      fillLight = new THREE.DirectionalLight('#57b9d0', 0.75)
      fillLight.position.set(4, 3, -5)
      scene.add(fillLight)
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.maxPolarAngle = Math.PI * 0.48
    controls.minDistance = 3.5
    controls.maxDistance = 13

    const boundObjects = []
    const bindingsByNode = new WeakMap()
    const raycastTargets = new Set()
    const interactiveBindingsByNode = new WeakMap()
    const interactiveRaycastTargets = new Set()
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let gltfRoot = null
    let cameraFollowNode = null
    let cameraFollowProfile = null
    const cameraFollowPosition = new THREE.Vector3()
    const previousCameraFollowPosition = new THREE.Vector3()
    const cameraFollowDelta = new THREE.Vector3()
    let hasCameraFollowPosition = false
    let gltfBounds = null
    let framingBounds = null
    let autoFrame = true
    let activeDrag = null

    // Fit the projected scene bounds so wide viewers can use their extra horizontal space.
    const frameScene = () => {
      if (!framingBounds || framingBounds.isEmpty()) return

      const center = framingBounds.getCenter(new THREE.Vector3())
      const size = framingBounds.getSize(new THREE.Vector3())
      const largestDimension = Math.max(size.x, size.y, size.z, 0.1)
      const viewDirection = new THREE.Vector3(0.8, 0.6, 1).normalize()
      const forward = viewDirection.clone().negate()
      const cameraRight = new THREE.Vector3().crossVectors(forward, camera.up).normalize()
      const cameraUp = new THREE.Vector3().crossVectors(cameraRight, forward).normalize()
      const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2)
      const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(camera.aspect, 0.01))
      const verticalTangent = Math.tan(verticalHalfFov)
      const horizontalTangent = Math.tan(horizontalHalfFov)
      let distance = 0

      for (const x of [framingBounds.min.x, framingBounds.max.x]) {
        for (const y of [framingBounds.min.y, framingBounds.max.y]) {
          for (const z of [framingBounds.min.z, framingBounds.max.z]) {
            const offset = new THREE.Vector3(x, y, z).sub(center)
            const depthFromTarget = offset.dot(viewDirection)
            distance = Math.max(
              distance,
              depthFromTarget + Math.abs(offset.dot(cameraRight)) / horizontalTangent,
              depthFromTarget + Math.abs(offset.dot(cameraUp)) / verticalTangent,
            )
          }
        }
      }

      distance = Math.max(distance, largestDimension * 0.5) * 1.08
      camera.position.copy(center).addScaledVector(viewDirection, distance)
      camera.near = Math.max(largestDimension / 1000, 0.01)
      camera.far = Math.max(distance * 20, 100)
      camera.lookAt(center)
      camera.updateProjectionMatrix()
      controls.target.copy(center)
      controls.minDistance = Math.max(largestDimension * 0.08, 0.1)
      controls.maxDistance = Math.max(distance * 8, 10)
      controls.update()
    }

    controls.addEventListener('start', () => {
      autoFrame = false
    })

    const hideTooltip = () => {
      tooltip.style.display = 'none'
      renderer.domElement.style.cursor = 'auto'
    }
    const setPointerRay = (event) => {
      const canvasBounds = renderer.domElement.getBoundingClientRect()
      if (canvasBounds.width <= 0 || canvasBounds.height <= 0) return false
      pointer.x = ((event.clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1
      pointer.y = -((event.clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1
      camera.updateMatrixWorld()
      raycaster.setFromCamera(pointer, camera)
      return true
    }
    const findInteractiveBinding = (object, allowedNames) => {
      for (let node = object; node; node = node.parent) {
        const candidates = interactiveBindingsByNode.get(node) || []
        const candidate = candidates.find(({ variable, normalizedBinding }) => (
          allowedNames.has(variable.name) && isDraggableFmiSceneBinding(normalizedBinding)
        ))
        if (candidate) return { node, ...candidate }
      }
      return null
    }
    const getInteractiveBindingFromCurrentRay = () => {
      if (!inputEditingEnabledRef.current || !showInputMarkersRef.current || !gltfRoot) return null
      const allowedNames = new Set((interactiveInputVariablesRef.current || [])
        .filter((variable) => variable?.causality === 'input' && typeof variable.name === 'string')
        .map((variable) => variable.name))
      return raycaster.intersectObjects([...interactiveRaycastTargets], false)
        .filter(({ object }) => isVisibleInScene(object))
        .map(({ object }) => findInteractiveBinding(object, allowedNames))
        .find(Boolean) || null
    }
    const getInteractiveBindingAtPointer = (event) => (
      setPointerRay(event) ? getInteractiveBindingFromCurrentRay() : null
    )
    const getNodeAxisDragContext = (node, axis) => {
      node.updateWorldMatrix(true, false)
      const parentWorld = node.parent?.matrixWorld || new THREE.Matrix4()
      const parentWorldOrigin = new THREE.Vector3().setFromMatrixPosition(parentWorld)
      const axisUnit = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
      const worldAxisVector = axisUnit.clone().applyMatrix4(parentWorld).sub(parentWorldOrigin)
      const worldUnitsPerLocalUnit = worldAxisVector.length()
      if (!Number.isFinite(worldUnitsPerLocalUnit) || worldUnitsPerLocalUnit <= 1e-8) return null

      const axisOriginLocal = node.position.clone()
      axisOriginLocal[axis] = 0
      const axisOrigin = axisOriginLocal.applyMatrix4(parentWorld)
      const cameraQuaternion = camera.getWorldQuaternion(new THREE.Quaternion())
      const cameraDirection = camera.getWorldDirection(new THREE.Vector3())
      const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuaternion)
      const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuaternion)
      const worldAxisDirection = worldAxisVector.normalize()

      return createAxisDragContext({
        axisOrigin: axisOrigin.toArray(),
        axisDirection: worldAxisDirection.toArray(),
        cameraDirection: cameraDirection.toArray(),
        cameraUp: cameraUp.toArray(),
        cameraRight: cameraRight.toArray(),
        worldUnitsPerLocalUnit,
      })
    }
    const handlePointerDown = (event) => {
      const match = getInteractiveBindingAtPointer(event)
      if (!match) return

      const { node, variable, normalizedBinding } = match
      const context = getNodeAxisDragContext(node, normalizedBinding.axis)
      const pointerCoordinate = getAxisCoordinateFromRay(raycaster.ray, context)
      if (pointerCoordinate === null) return

      activeDrag = {
        pointerId: event.pointerId,
        node,
        variable,
        normalizedBinding,
        context,
        pointerCoordinate,
        sceneCoordinate: node.position[normalizedBinding.axis],
        lastInputValue: Number(valuesRef.current?.[variable.name]),
        controlsWereEnabled: controls.enabled,
      }
      controls.enabled = false
      renderer.domElement.style.cursor = 'grabbing'
      tooltip.style.display = 'none'
      try {
        renderer.domElement.setPointerCapture(event.pointerId)
      } catch {
        // Synthetic pointer events may not implement pointer capture.
      }
      event.preventDefault()
      event.stopPropagation()
    }
    const handlePointerMove = (event) => {
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return
      const canEditVariable = inputEditingEnabledRef.current
        && showInputMarkersRef.current
        && (interactiveInputVariablesRef.current || []).some((variable) => variable?.name === activeDrag.variable.name)
      if (!canEditVariable) {
        handlePointerUp(event)
        return
      }
      if (!setPointerRay(event)) return
      const coordinate = getAxisCoordinateFromRay(raycaster.ray, activeDrag.context)
      if (coordinate === null) return

      const nextSceneCoordinate = activeDrag.sceneCoordinate + coordinate - activeDrag.pointerCoordinate
      const nextInputValue = getFmiSceneInputValueFromPosition(nextSceneCoordinate, activeDrag.normalizedBinding)
      if (nextInputValue === null || Object.is(nextInputValue, activeDrag.lastInputValue)) return

      activeDrag.lastInputValue = nextInputValue
      onInputChangeRef.current?.(activeDrag.variable.name, nextInputValue)
      renderer.domElement.style.cursor = 'grabbing'
      event.preventDefault()
      event.stopPropagation()
    }
    const handlePointerUp = (event) => {
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return
      const { controlsWereEnabled } = activeDrag
      activeDrag = null
      controls.enabled = controlsWereEnabled
      renderer.domElement.style.cursor = 'auto'
      try {
        if (renderer.domElement.hasPointerCapture(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId)
        }
      } catch {
        // Ignore release errors from browsers that already dropped pointer capture.
      }
      event.preventDefault()
      event.stopPropagation()
    }
    const showBoundVariableTooltip = (event) => {
      if (activeDrag) return
      if (!gltfRoot) return hideTooltip()

      if (!setPointerRay(event)) return hideTooltip()
      const hostBounds = host.getBoundingClientRect()
      const interactiveBinding = getInteractiveBindingFromCurrentRay()
      let nearestMarker = null
      let nearestMarkerDistance = Infinity
      for (const descriptionMarker of sceneMarkers) {
        const { visible, variable, screenX, screenY, hitRadius } = descriptionMarker
        if (!visible || !variable) continue
        const markerX = hostBounds.left + screenX
        const markerY = hostBounds.top + screenY
        const distance = Math.hypot(event.clientX - markerX, event.clientY - markerY)
        if (distance <= hitRadius && distance < nearestMarkerDistance) {
          nearestMarker = descriptionMarker
          nearestMarkerDistance = distance
        }
      }

      let uniqueBindings
      if (nearestMarker) {
        uniqueBindings = [{ variable: nearestMarker.variable }]
      } else {
        const intersections = raycaster.intersectObjects([...raycastTargets], false)
        const bindings = intersections
          .filter(({ object }) => isVisibleInScene(object))
          .map(({ object }) => findBindingsForObject(object, bindingsByNode))
          .map((nodeBindings) => nodeBindings.filter(({ variable }) => getVariableDescription(variable)))
          .find((nodeBindings) => nodeBindings.length) || []
        uniqueBindings = [...new Map(bindings.map((entry) => [entry.variable.name, entry])).values()]
      }
      if (uniqueBindings.length === 0) {
        hideTooltip()
        if (interactiveBinding) renderer.domElement.style.cursor = 'grab'
        return
      }

      setTooltipContent(tooltip, uniqueBindings)
      tooltip.style.display = 'block'
      renderer.domElement.style.cursor = interactiveBinding ? 'grab' : 'help'
      const x = event.clientX - hostBounds.left
      const y = event.clientY - hostBounds.top
      const left = Math.max(8, Math.min(x + 14, host.clientWidth - tooltip.offsetWidth - 8))
      const top = Math.max(8, Math.min(y + 14, host.clientHeight - tooltip.offsetHeight - 8))
      tooltip.style.left = `${left}px`
      tooltip.style.top = `${top}px`
    }

    renderer.domElement.style.touchAction = 'none'
    renderer.domElement.addEventListener('pointerdown', handlePointerDown, true)
    renderer.domElement.addEventListener('pointermove', handlePointerMove, true)
    renderer.domElement.addEventListener('pointerup', handlePointerUp, true)
    renderer.domElement.addEventListener('pointercancel', handlePointerUp, true)
    renderer.domElement.addEventListener('lostpointercapture', handlePointerUp, true)
    renderer.domElement.addEventListener('pointermove', showBoundVariableTooltip)
    const handlePointerLeave = () => {
      if (!activeDrag) hideTooltip()
    }
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave)

    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return
      camera.aspect = host.clientWidth / host.clientHeight
      camera.updateProjectionMatrix()
      if (autoFrame) frameScene()
      renderer.setSize(host.clientWidth, host.clientHeight, false)
    })
    resize.observe(host)

    const loader = new GLTFLoader()
    loader.load(sceneUrl, (gltf) => {
      if (disposed) {
        disposeObject(gltf.scene)
        return
      }
      gltfRoot = gltf.scene
      const scenePresentation = readScenePresentation(gltfRoot)
      cameraFollowProfile = scenePresentation?.camera?.follow || null
      hasCameraFollowPosition = false
      cameraFollowNode = cameraFollowProfile?.node
        ? gltfRoot.getObjectByName(cameraFollowProfile.node)
        : null
      const presentationSettings = applyScenePresentation(THREE, scenePresentation, {
        scene,
        camera,
        renderer,
        controls,
      })
      autoFrame = presentationSettings.useAutomaticCameraFraming
      controls.update()
      if (presentationSettings.useDefaultLighting) addDefaultSceneLighting()
      else if (presentationSettings.environment === 'room') addStudioEnvironment()

      gltfBounds = new THREE.Box3().setFromObject(gltfRoot)
      framingBounds = gltfBounds
      const modelVariablesByName = new Map(
        (Array.isArray(variablesRef.current) ? variablesRef.current : [])
          .filter((variable) => typeof variable?.name === 'string')
          .map((variable) => [variable.name, variable]),
      )
      const sceneBindingsByNode = new Map()
      gltfRoot.traverse((node) => {
        if (node.isMesh && presentationSettings.lightingMode !== 'authored') {
          node.castShadow = true
          node.receiveShadow = true
          const materials = Array.isArray(node.material) ? node.material : [node.material]
          materials.filter(Boolean).forEach((material) => { material.envMapIntensity = 0.48 })
        }

        const declaredBindings = node.userData?.fmiBindings
        if (!Array.isArray(declaredBindings)) return

        for (const binding of declaredBindings) {
          if (!binding || typeof binding.variable !== 'string') continue
          const variable = modelVariablesByName.get(binding.variable)
          const normalizedBinding = normalizeFmiSceneBinding(binding, variable)
          const isOutputBinding = variable?.causality === 'output'
          const isInputPositionBinding = isDraggableFmiSceneBinding(normalizedBinding)
          if (!normalizedBinding || (!isOutputBinding && !isInputPositionBinding)) continue

          const nodeBindings = sceneBindingsByNode.get(node) || []
          nodeBindings.push({ node, binding, variable, normalizedBinding, isOutputBinding })
          sceneBindingsByNode.set(node, nodeBindings)
        }
      })
      applySceneObjectRendering(gltfRoot)
      applySceneMaterialRendering(gltfRoot, THREE)

      const interactiveNodes = new Set()
      const sceneInputBindingNames = new Set()
      for (const [node, nodeBindings] of sceneBindingsByNode) {
        const bindingCountsByTarget = new Map()
        for (const { binding } of nodeBindings) {
          bindingCountsByTarget.set(binding.target, (bindingCountsByTarget.get(binding.target) || 0) + 1)
        }
        for (const boundObject of nodeBindings) {
          const { binding, variable, normalizedBinding, isOutputBinding } = boundObject
          if (!isOutputBinding && bindingCountsByTarget.get(binding.target) !== 1) continue

          const tooltipBindings = bindingsByNode.get(node) || []
          tooltipBindings.push({ binding, variable, normalizedBinding })
          bindingsByNode.set(node, tooltipBindings)
          if (isOutputBinding && binding.target === 'visible') {
            const initialValue = valuesRef.current?.[binding.variable] ?? getFmiInitialValue(variable)
            if (initialValue !== undefined && initialValue !== null) node.visible = isFmiBindingVisible(initialValue, binding)
          }
          boundObjects.push(boundObject)
          if (isDraggableFmiSceneBinding(normalizedBinding)) {
            const interactiveBindings = interactiveBindingsByNode.get(node) || []
            interactiveBindings.push(boundObject)
            interactiveBindingsByNode.set(node, interactiveBindings)
            interactiveNodes.add(node)
            sceneInputBindingNames.add(variable.name)
          }
        }
      }
      for (const { node } of boundObjects) {
        if (node.isMesh) {
          raycastTargets.add(node)
        } else {
          node.traverse((child) => {
            if (child.isMesh) raycastTargets.add(child)
          })
        }
      }
      for (const node of interactiveNodes) {
        if (node.isMesh) {
          interactiveRaycastTargets.add(node)
        } else {
          node.traverse((child) => {
            if (child.isMesh) interactiveRaycastTargets.add(child)
          })
        }
      }
      onSceneInputBindingsReadyRef.current?.([...sceneInputBindingNames])
      gltfRoot.updateMatrixWorld(true)
      framingBounds = getFmiBindingFocusBounds(gltfRoot, boundObjects) || gltfBounds
      if (framingBounds && !framingBounds.isEmpty()) {
        const center = framingBounds.getCenter(new THREE.Vector3())
        const size = framingBounds.getSize(new THREE.Vector3())
        const largestDimension = Math.max(size.x, size.y, size.z, 0.1)
        if (autoFrame) frameScene()
        if (keyLight && fillLight) {
          keyLight.position.set(
            center.x - largestDimension,
            center.y + largestDimension * 2,
            center.z + largestDimension,
          )
          keyLight.target.position.copy(center)
          fillLight.position.set(
            center.x + largestDimension,
            center.y + largestDimension * 0.7,
            center.z - largestDimension * 1.5,
          )
        }
      }
      const markerEntriesByVariable = new Map()
      const markerNodes = [...new Set(boundObjects.map(({ node }) => node))]
      for (const node of markerNodes) {
        const variables = [...new Map((bindingsByNode.get(node) || [])
          .filter(({ variable, normalizedBinding }) => (
            variable.causality === 'output'
            || isDraggableFmiSceneBinding(normalizedBinding)
          ))
          .map(({ variable, normalizedBinding }) => {
            const kind = variable.causality === 'output' ? 'output' : 'input'
            return [`${kind}:${variable.name}`, { variable, kind }]
          })).values()]
        if (variables.length === 0) continue

        const bounds = new THREE.Box3().setFromObject(node)
        if (bounds.isEmpty()) continue
        node.updateWorldMatrix(true, false)
        const worldCorners = getBoxCorners(bounds)
        const localCorners = worldCorners.map((corner) => node.worldToLocal(corner.clone()))
        const entry = {
          node,
          bounds,
          localCorners,
          worldCorners: localCorners.map(() => new THREE.Vector3()),
        }

        for (const { variable, kind } of variables) {
          const key = `${kind}:${variable.name}`
          const group = markerEntriesByVariable.get(key) || { variable, kind, entries: [] }
          group.entries.push(entry)
          markerEntriesByVariable.set(key, group)
        }
      }
      if (markerEntriesByVariable.size > 0) {
        const sceneSize = (framingBounds || gltfBounds).getSize(new THREE.Vector3())
        const largestSceneDimension = Math.max(sceneSize.x, sceneSize.y, sceneSize.z, 0.1)
        const clusterScale = Math.min(Math.max(largestSceneDimension * 0.006, 0.004), 0.12)
        const maximumClusterGap = Math.max(largestSceneDimension * 0.012, clusterScale * 2)
        const markerClusters = [...markerEntriesByVariable.values()]
          .flatMap(({ variable, kind, entries }) => clusterNearbyBindings(entries, maximumClusterGap)
            .map((members) => ({ members, variable, kind })))

        for (const { members, variable, kind } of markerClusters) {
          const markerStyle = kind === 'input'
            ? {
              waveBorder: 'rgba(255, 209, 102, 0.9)',
              waveShadow: '0 0 6px rgba(255, 209, 102, 0.5)',
              coreBorder: 'rgba(255, 241, 189, 0.95)',
              coreBackground: '#ffd166',
              coreShadow: '0 0 9px 2px rgba(255, 209, 102, 0.65)',
            }
            : {
              waveBorder: 'rgba(114, 243, 228, 0.9)',
              waveShadow: '0 0 6px rgba(84, 213, 201, 0.5)',
              coreBorder: 'rgba(156, 247, 235, 0.95)',
              coreBackground: '#72f3e4',
              coreShadow: '0 0 9px 2px rgba(84, 213, 201, 0.65)',
            }
          const marker = document.createElement('div')
          marker.setAttribute('aria-hidden', 'true')
          marker.style.position = 'absolute'
          marker.style.left = '0'
          marker.style.top = '0'
          marker.style.width = '12px'
          marker.style.height = '12px'
          marker.style.zIndex = '12'
          marker.style.transform = 'translate(-50%, -50%)'
          marker.style.pointerEvents = 'none'
          marker.style.display = 'none'
          marker.style.willChange = 'left, top'

          const waves = [0, 0.5].map((phaseOffset) => {
            const wave = document.createElement('span')
            wave.style.position = 'absolute'
            wave.style.left = '50%'
            wave.style.top = '50%'
            wave.style.width = '10px'
            wave.style.height = '10px'
            wave.style.boxSizing = 'border-box'
            wave.style.border = `1px solid ${markerStyle.waveBorder}`
            wave.style.borderRadius = '50%'
            wave.style.boxShadow = markerStyle.waveShadow
            wave.style.transform = 'translate(-50%, -50%) scale(1.15)'
            wave.style.opacity = '0'
            wave.style.display = 'none'
            wave.style.willChange = 'transform, opacity'
            marker.appendChild(wave)
            return { element: wave, phaseOffset }
          })

          const core = document.createElement('span')
          core.style.position = 'absolute'
          core.style.left = '50%'
          core.style.top = '50%'
          core.style.width = '10px'
          core.style.height = '10px'
          core.style.boxSizing = 'border-box'
          core.style.border = `1px solid ${markerStyle.coreBorder}`
          core.style.borderRadius = '50%'
          core.style.background = markerStyle.coreBackground
          core.style.boxShadow = markerStyle.coreShadow
          core.style.transform = 'translate(-50%, -50%)'
          marker.appendChild(core)
          host.appendChild(marker)

          sceneMarkers.push({
            element: marker,
            members,
            waves,
            variable,
            kind,
            hasDescription: Boolean(getVariableDescription(variable)),
            worldPosition: new THREE.Vector3(),
            projectedPosition: new THREE.Vector3(),
            screenX: 0,
            baseScreenX: 0,
            screenY: 0,
            hitRadius: 16,
            visible: false,
          })
        }
      }
      scene.add(gltfRoot)
      mixer = gltf.animations.length ? new THREE.AnimationMixer(gltfRoot) : null
      onStatusRef.current?.('ready')
    }, undefined, () => {
      if (!disposed) onStatusRef.current?.('error')
    })

    const clock = new THREE.Clock()
    const animate = () => {
      frameId = window.requestAnimationFrame(animate)
      const delta = clock.getDelta()
      markerPulseTime += delta
      if (mixer) mixer.update(delta)
      for (const { node, binding, variable, normalizedBinding, isOutputBinding } of boundObjects) {
        const currentValue = valuesRef.current?.[binding.variable]
        const rawValue = currentValue ?? (!isOutputBinding ? getFmiInitialValue(variable) : undefined)
        if (rawValue === undefined || rawValue === null) continue

        if (binding.target === 'visible') {
          node.visible = isFmiBindingVisible(rawValue, binding)
          continue
        }
        if (binding.target === 'material.color') {
          if (!node.material?.color) continue
          const trueColor = getBindingColor(binding.trueColor, '#ff2738')
          const falseColor = getBindingColor(binding.falseColor, '#4f2028')
          node.material.color.set(rawValue ? trueColor : falseColor)
          if (node.material.emissive) {
            node.material.emissive.set(rawValue ? trueColor : '#160b0d')
          }
          continue
        }

        const mapped = getFmiSceneBoundValue(rawValue, normalizedBinding)
        if (mapped === null) continue
        if (Math.abs(mapped) > 100_000) continue
        const { property, axis } = normalizedBinding
        if (['position', 'rotation', 'scale'].includes(property) && ['x', 'y', 'z'].includes(axis)) {
          node[property][axis] = mapped
        }
      }
      if (cameraFollowNode && cameraFollowProfile) {
        cameraFollowNode.updateWorldMatrix(true, false)
        cameraFollowNode.getWorldPosition(cameraFollowPosition)
        if (!hasCameraFollowPosition) {
          const positionOffset = cameraFollowProfile.positionOffset || [0, 0, 0]
          const targetOffset = cameraFollowProfile.targetOffset || [0, 0, 0]
          camera.position.set(
            cameraFollowPosition.x + positionOffset[0],
            cameraFollowPosition.y + positionOffset[1],
            cameraFollowPosition.z + positionOffset[2],
          )
          controls.target.set(
            cameraFollowPosition.x + targetOffset[0],
            cameraFollowPosition.y + targetOffset[1],
            cameraFollowPosition.z + targetOffset[2],
          )
          hasCameraFollowPosition = true
        } else {
          // Move the follow anchor without resetting the user's orbit, pan, or zoom.
          cameraFollowDelta.subVectors(cameraFollowPosition, previousCameraFollowPosition)
          camera.position.add(cameraFollowDelta)
          controls.target.add(cameraFollowDelta)
        }
        previousCameraFollowPosition.copy(cameraFollowPosition)
      }
      controls.update()
      camera.updateMatrixWorld()
      if (sceneMarkers.length > 0) {
        const waveCycleSeconds = 4.4
        const hostWidth = host.clientWidth
        const hostHeight = host.clientHeight
        for (const marker of sceneMarkers) {
          const { element, members, waves, worldPosition, projectedPosition } = marker
          const markerEnabled = marker.kind === 'output'
            ? showOutputMarkersRef.current
              && (marker.hasDescription || pinnedOutputNamesRef.current.has(marker.variable.name))
            : showInputMarkersRef.current
              && inputEditingEnabledRef.current
              && interactiveInputVariablesRef.current.some((variable) => variable?.name === marker.variable.name)
          if (markerEnabled) {
            const bounds = new THREE.Box3().makeEmpty()
            for (const member of members) {
              if (!isVisibleInScene(member.node)) continue
              member.node.updateWorldMatrix(true, false)
              for (let index = 0; index < member.localCorners.length; index += 1) {
                const worldCorner = member.worldCorners[index]
                  .copy(member.localCorners[index])
                  .applyMatrix4(member.node.matrixWorld)
                bounds.expandByPoint(worldCorner)
              }
            }
            if (!bounds.isEmpty()) {
              bounds.getCenter(worldPosition)
              projectedPosition.copy(worldPosition).project(camera)
              const screenX = (projectedPosition.x + 1) * 0.5 * hostWidth
              const screenY = (1 - projectedPosition.y) * 0.5 * hostHeight
              marker.baseScreenX = screenX
              marker.screenX = screenX
              marker.screenY = screenY
              marker.visible = projectedPosition.z >= -1 && projectedPosition.z <= 1
                && screenX >= 0 && screenX <= hostWidth
                && screenY >= 0 && screenY <= hostHeight
              element.style.display = marker.visible ? 'block' : 'none'
            } else {
              marker.visible = false
              element.style.display = 'none'
            }
          } else {
            marker.visible = false
            element.style.display = 'none'
          }
          for (const wave of waves) {
            const waveVisible = marker.visible && !prefersReducedMotion
            wave.element.style.display = waveVisible ? 'block' : 'none'
            if (!waveVisible) continue
            const phase = ((markerPulseTime / waveCycleSeconds) + wave.phaseOffset) % 1
            wave.element.style.transform = `translate(-50%, -50%) scale(${1.15 + phase * 3.4})`
            wave.element.style.opacity = String((1 - phase) * 0.48)
          }
        }
        for (const marker of sceneMarkers) {
          if (!marker.visible) continue
          const overlapsOtherKind = sceneMarkers.some((other) => (
            other.visible
            && other.kind !== marker.kind
            && Math.hypot(other.baseScreenX - marker.baseScreenX, other.screenY - marker.screenY) < 12
          ))
          const offsetX = overlapsOtherKind ? (marker.kind === 'input' ? 7 : -7) : 0
          marker.screenX = marker.baseScreenX + offsetX
          marker.element.style.left = `${marker.screenX}px`
          marker.element.style.top = `${marker.screenY}px`
        }
      }
      renderer.render(scene, camera)
      if (gltfRoot && renderedSampleIndexRef.current !== sampleIndexRef.current) {
        renderedSampleIndexRef.current = sampleIndexRef.current
        onSampleRenderedRef.current?.(sampleIndexRef.current, performance.now())
      }
    }
    animate()
    onStatusRef.current?.('loading')

    return () => {
      disposed = true
      window.cancelAnimationFrame(frameId)
      resize.disconnect()
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown, true)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove, true)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp, true)
      renderer.domElement.removeEventListener('pointercancel', handlePointerUp, true)
      renderer.domElement.removeEventListener('lostpointercapture', handlePointerUp, true)
      renderer.domElement.removeEventListener('pointermove', showBoundVariableTooltip)
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
      controls.dispose()
      tooltip.remove()
      if (gltfRoot) disposeObject(gltfRoot)
      if (scene.background?.isTexture) scene.background.dispose()
      for (const { element } of sceneMarkers) element.remove()
      environmentTarget?.dispose()
      pmremGenerator?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [modelVariables, sceneUrl])

  return <div ref={hostRef} className="relative h-full w-full overflow-hidden" />
}
