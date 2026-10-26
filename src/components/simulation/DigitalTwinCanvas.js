'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { getFmiInitialValue, isFmiBindingVisible } from './fmiBindingVisibility'
import { getVariableDescription } from './simulationParameters'

const ALLOWED_TARGETS = new Set([
  'position.x', 'position.y', 'position.z',
  'rotation.x', 'rotation.y', 'rotation.z',
  'scale.x', 'scale.y', 'scale.z',
  'visible',
  'material.color',
])

function disposeObject(object) {
  object.traverse((node) => {
    node.geometry?.dispose?.()
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    materials.filter(Boolean).forEach((material) => material.dispose?.())
  })
}

function numericValue(value) {
  if (typeof value === 'boolean') return value ? 1 : 0
  const number = Number(value)
  return Number.isFinite(number) ? number : null
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

function setTooltipContent(tooltip, bindings) {
  tooltip.replaceChildren()
  for (const { variable } of bindings) {
    const entry = document.createElement('div')
    entry.className = 'border-b border-white/10 py-1.5 last:border-0 last:pb-0 first:pt-0'

    const name = document.createElement('p')
    name.className = 'text-[11px] font-semibold text-white'
    name.textContent = variable.name
    entry.appendChild(name)

    const details = document.createElement('p')
    details.className = 'mt-0.5 text-[11px] leading-snug text-[#c1d2d5]'
    details.textContent = getVariableDescription(variable)
    entry.appendChild(details)

    tooltip.appendChild(entry)
  }
}

export default function DigitalTwinCanvas({ sceneUrl, values, modelVariables, onStatus, sampleIndex, onSampleRendered }) {
  const hostRef = useRef(null)
  const valuesRef = useRef(values)
  const variablesRef = useRef(modelVariables)
  const onStatusRef = useRef(onStatus)
  const sampleIndexRef = useRef(sampleIndex)
  const onSampleRenderedRef = useRef(onSampleRendered)
  const renderedSampleIndexRef = useRef(null)

  valuesRef.current = values
  variablesRef.current = modelVariables
  onStatusRef.current = onStatus
  sampleIndexRef.current = sampleIndex
  onSampleRenderedRef.current = onSampleRendered

  useEffect(() => {
    const host = hostRef.current
    if (!host || !sceneUrl) return undefined

    let disposed = false
    renderedSampleIndexRef.current = null
    let frameId = 0
    let mixer = null
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
    tooltip.style.zIndex = '10'
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

    const studioEnvironment = new RoomEnvironment()
    pmremGenerator = new THREE.PMREMGenerator(renderer)
    environmentTarget = pmremGenerator.fromScene(studioEnvironment, 0.04)
    scene.environment = environmentTarget.texture
    studioEnvironment.dispose()

    scene.add(new THREE.HemisphereLight('#d9f2ff', '#13212a', 1.3))
    const keyLight = new THREE.DirectionalLight('#fff2d4', 2.25)
    keyLight.position.set(-3, 7, 4)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    scene.add(keyLight)
    scene.add(keyLight.target)
    const fillLight = new THREE.DirectionalLight('#57b9d0', 0.75)
    fillLight.position.set(4, 3, -5)
    scene.add(fillLight)

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
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let gltfRoot = null
    let gltfBounds = null
    let autoFrame = true

    // Fit the projected scene bounds so wide viewers can use their extra horizontal space.
    const frameScene = () => {
      if (!gltfBounds || gltfBounds.isEmpty()) return

      const center = gltfBounds.getCenter(new THREE.Vector3())
      const size = gltfBounds.getSize(new THREE.Vector3())
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

      for (const x of [gltfBounds.min.x, gltfBounds.max.x]) {
        for (const y of [gltfBounds.min.y, gltfBounds.max.y]) {
          for (const z of [gltfBounds.min.z, gltfBounds.max.z]) {
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
    }
    const showBoundVariableTooltip = (event) => {
      if (!gltfRoot) return hideTooltip()

      const canvasBounds = renderer.domElement.getBoundingClientRect()
      if (canvasBounds.width <= 0 || canvasBounds.height <= 0) return hideTooltip()
      const hostBounds = host.getBoundingClientRect()
      pointer.x = ((event.clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1
      pointer.y = -((event.clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)

      const intersections = raycaster.intersectObjects([...raycastTargets], false)
      const bindings = intersections
        .filter(({ object }) => isVisibleInScene(object))
        .map(({ object }) => findBindingsForObject(object, bindingsByNode))
        .map((nodeBindings) => nodeBindings.filter(({ variable }) => getVariableDescription(variable)))
        .find((nodeBindings) => nodeBindings.length) || []
      const uniqueBindings = [...new Map(bindings.map((entry) => [entry.variable.name, entry])).values()]
      if (uniqueBindings.length === 0) return hideTooltip()

      setTooltipContent(tooltip, uniqueBindings)
      tooltip.style.display = 'block'
      const x = event.clientX - hostBounds.left
      const y = event.clientY - hostBounds.top
      const left = Math.max(8, Math.min(x + 14, host.clientWidth - tooltip.offsetWidth - 8))
      const top = Math.max(8, Math.min(y + 14, host.clientHeight - tooltip.offsetHeight - 8))
      tooltip.style.left = `${left}px`
      tooltip.style.top = `${top}px`
    }

    renderer.domElement.addEventListener('pointermove', showBoundVariableTooltip)
    renderer.domElement.addEventListener('pointerleave', hideTooltip)

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
      gltfBounds = new THREE.Box3().setFromObject(gltfRoot)
      if (!gltfBounds.isEmpty()) {
        autoFrame = true
        const center = gltfBounds.getCenter(new THREE.Vector3())
        const size = gltfBounds.getSize(new THREE.Vector3())
        const largestDimension = Math.max(size.x, size.y, size.z, 0.1)
        frameScene()

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
      const outputVariables = new Map(
        (Array.isArray(variablesRef.current) ? variablesRef.current : [])
          .filter((variable) => variable?.causality === 'output' && typeof variable.name === 'string')
          .map((variable) => [variable.name, variable]),
      )
      gltfRoot.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true
          node.receiveShadow = true
          const materials = Array.isArray(node.material) ? node.material : [node.material]
          materials.filter(Boolean).forEach((material) => { material.envMapIntensity = 0.48 })
        }

        const declaredBindings = node.userData?.fmiBindings
        if (!Array.isArray(declaredBindings)) return

        for (const binding of declaredBindings) {
          if (!binding || typeof binding.variable !== 'string' || !ALLOWED_TARGETS.has(binding.target)) continue
          const outputVariable = outputVariables.get(binding.variable)
          if (!outputVariable) continue
          const nodeBindings = bindingsByNode.get(node) || []
          nodeBindings.push({ binding, variable: outputVariable })
          bindingsByNode.set(node, nodeBindings)
          if (binding.target === 'visible') {
            const initialValue = valuesRef.current?.[binding.variable] ?? getFmiInitialValue(outputVariable)
            if (initialValue !== undefined && initialValue !== null) node.visible = isFmiBindingVisible(initialValue, binding)
          }
          boundObjects.push({ node, binding })
        }
      })
      for (const { node } of boundObjects) {
        if (node.isMesh) {
          raycastTargets.add(node)
        } else {
          node.traverse((child) => {
            if (child.isMesh) raycastTargets.add(child)
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
      if (mixer) mixer.update(delta)
      for (const { node, binding } of boundObjects) {
        const rawValue = valuesRef.current?.[binding.variable]
        if (rawValue === undefined || rawValue === null) continue

        if (binding.target === 'visible') {
          node.visible = isFmiBindingVisible(rawValue, binding)
          continue
        }
        if (binding.target === 'material.color') {
          if (!node.material?.color) continue
          node.material.color.set(rawValue ? binding.trueColor || '#ff2738' : binding.falseColor || '#4f2028')
          if (node.material.emissive) {
            node.material.emissive.set(rawValue ? binding.trueColor || '#ff2738' : '#160b0d')
          }
          continue
        }

        const numeric = numericValue(rawValue)
        if (numeric === null) continue
        const scale = Number.isFinite(Number(binding.scale)) ? Number(binding.scale) : 1
        const offset = Number.isFinite(Number(binding.offset)) ? Number(binding.offset) : 0
        const mapped = numeric * scale + offset
        if (Math.abs(mapped) > 100_000) continue
        const [property, axis] = binding.target.split('.')
        if (['position', 'rotation', 'scale'].includes(property) && ['x', 'y', 'z'].includes(axis)) {
          node[property][axis] = mapped
        }
      }
      controls.update()
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
      renderer.domElement.removeEventListener('pointermove', showBoundVariableTooltip)
      renderer.domElement.removeEventListener('pointerleave', hideTooltip)
      controls.dispose()
      tooltip.remove()
      if (gltfRoot) disposeObject(gltfRoot)
      environmentTarget?.dispose()
      pmremGenerator?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [sceneUrl])

  return <div ref={hostRef} className="h-full w-full" />
}
