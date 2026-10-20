'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { getFmiInitialValue, isFmiBindingVisible } from './fmiBindingVisibility'

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

export default function DigitalTwinCanvas({ sceneUrl, values, modelVariables, onStatus }) {
  const hostRef = useRef(null)
  const valuesRef = useRef(values)
  const variablesRef = useRef(modelVariables)
  const onStatusRef = useRef(onStatus)

  valuesRef.current = values
  variablesRef.current = modelVariables
  onStatusRef.current = onStatus

  useEffect(() => {
    const host = hostRef.current
    if (!host || !sceneUrl) return undefined

    let disposed = false
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
    let gltfRoot = null
    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return
      camera.aspect = host.clientWidth / host.clientHeight
      camera.updateProjectionMatrix()
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
      const bounds = new THREE.Box3().setFromObject(gltfRoot)
      if (!bounds.isEmpty()) {
        const center = bounds.getCenter(new THREE.Vector3())
        const size = bounds.getSize(new THREE.Vector3())
        const largestDimension = Math.max(size.x, size.y, size.z, 0.1)
        const boundingRadius = Math.max(size.length() / 2, 0.1)
        const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2)
        const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(camera.aspect, 0.01))
        const effectiveHalfFov = Math.min(verticalHalfFov, horizontalHalfFov)
        const distance = (boundingRadius / Math.sin(effectiveHalfFov)) * 1.2
        const viewDirection = new THREE.Vector3(0.8, 0.6, 1).normalize()

        camera.position.copy(center).addScaledVector(viewDirection, distance)
        camera.near = Math.max(largestDimension / 1000, 0.01)
        camera.far = Math.max(distance * 20, 100)
        camera.lookAt(center)
        camera.updateProjectionMatrix()
        controls.target.copy(center)
        controls.minDistance = Math.max(largestDimension * 0.08, 0.1)
        controls.maxDistance = Math.max(distance * 8, 10)
        controls.update()

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
          if (binding.target === 'visible') {
            const initialValue = valuesRef.current?.[binding.variable] ?? getFmiInitialValue(outputVariable)
            if (initialValue !== undefined && initialValue !== null) node.visible = isFmiBindingVisible(initialValue, binding)
          }
          boundObjects.push({ node, binding })
        }
      })
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
    }
    animate()
    onStatusRef.current?.('loading')

    return () => {
      disposed = true
      window.cancelAnimationFrame(frameId)
      resize.disconnect()
      controls.dispose()
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
