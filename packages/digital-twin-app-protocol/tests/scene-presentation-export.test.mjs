import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  SCENE_PRESENTATION_USER_DATA_KEY,
  SCENE_RENDERING_USER_DATA_KEY,
  attachScenePresentation,
  applyScenePresentation,
  applySceneObjectRendering,
  applySceneMaterialRendering,
  captureScenePresentation,
  exportSceneWithPresentation,
  readScenePresentation,
} from '../scene-presentation.js'

globalThis.FileReader ||= class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer()
    this.onloadend?.()
  }

  async readAsDataURL(blob) {
    const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
    this.result = `data:${blob.type};base64,${base64}`
    this.onloadend?.()
  }
}

const profile = {
  version: 1,
  camera: {
    position: [6.6, 4.6, 7.4],
    target: [0.15, 0.1, 0],
    fov: 38,
    near: 0.1,
    far: 80,
    enableDamping: false,
    dampingFactor: 0.055,
  },
  scene: { background: '#0a141b', fog: { color: '#0a141b', near: 12, far: 25 } },
  renderer: {
    outputColorSpace: 'SRGBColorSpace',
    toneMapping: 'ACESFilmicToneMapping',
    toneMappingExposure: 1.18,
    shadowMap: { enabled: true, type: 'PCFSoftShadowMap' },
  },
  lighting: {
    mode: 'authored',
    environment: 'none',
    ambient: [{ type: 'hemisphere', skyColor: '#bfd9eb', groundColor: '#182128', intensity: 1.6 }],
  },
}

function exportContext(scene, overrides = {}) {
  const camera = new THREE.PerspectiveCamera(38, 1.6, 0.1, 80)
  camera.position.set(6.6, 4.6, 7.4)
  camera.lookAt(0.15, 0.1, 0)
  const renderer = {
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.18,
    shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap },
    getPixelRatio: () => 1.6,
    getClearColor: (target) => target.set('#0a141b'),
    getClearAlpha: () => 1,
  }
  return {
    THREE,
    scene,
    camera,
    renderer,
    controls: { target: new THREE.Vector3(0.15, 0.1, 0) },
    exporter: new GLTFExporter(),
    ...overrides,
  }
}

function readGlbJson(glb) {
  const bytes = Buffer.from(glb)
  const jsonLength = bytes.readUInt32LE(12)
  const jsonChunk = bytes.subarray(20, 20 + jsonLength).toString('utf8')
  return JSON.parse(jsonChunk.replaceAll(String.fromCharCode(0), '').trim())
}

test('GLTFExporter preserves the shared presentation profile and mesh shadow state in glTF extras', async () => {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#0a141b')
  scene.fog = new THREE.Fog('#0a141b', 12, 25)
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.fmiBindings = [{ variable: 'angle', target: 'rotation.x', scale: 1, offset: 0 }]
  const keyLight = new THREE.DirectionalLight('#ffffff', 2)
  keyLight.position.set(3, 4, 5)
  scene.add(keyLight, keyLight.target)
  const hemisphere = new THREE.HemisphereLight('#bfd9eb', '#182128', 1.6)
  scene.add(hemisphere)
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#55aaff' })
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]),
    lineMaterial,
  )
  scene.add(line)
  scene.add(mesh)
  attachScenePresentation(scene, profile, THREE)

  const gltf = await exportSceneWithPresentation(exportContext(scene, { options: { binary: false, trs: false } }))
  const exportedScene = gltf.scenes[gltf.scene]
  const exportedMesh = gltf.nodes.find(({ extras }) => extras?.fmiBindings)
  const exportedLight = gltf.nodes.find(({ extensions }) => extensions?.KHR_lights_punctual)
  const exportedLine = gltf.meshes.find(({ primitives }) => primitives.some(({ mode }) => mode === 1))
  const lineMaterialDef = gltf.materials[exportedLine.primitives[0].material]

  assert.equal(exportedScene.extras[SCENE_PRESENTATION_USER_DATA_KEY].camera.fov, profile.camera.fov)
  assert.equal(exportedScene.extras[SCENE_PRESENTATION_USER_DATA_KEY].scene.background, profile.scene.background)
  assert.deepEqual(exportedScene.extras[SCENE_PRESENTATION_USER_DATA_KEY].scene.fog, profile.scene.fog)
  assert.deepEqual(exportedMesh.extras.fmiBindings, mesh.userData.fmiBindings)
  assert.deepEqual(exportedMesh.extras[SCENE_RENDERING_USER_DATA_KEY], {
    castShadow: true,
    receiveShadow: true,
  })
  assert.ok(exportedLight, 'directional lights remain glTF punctual lights')
  assert.ok(Array.isArray(exportedLight.matrix), 'the export preserves the caller-selected glTF matrix transform')
  const exportedRotation = new THREE.Quaternion()
  new THREE.Matrix4().fromArray(exportedLight.matrix).decompose(new THREE.Vector3(), exportedRotation, new THREE.Vector3())
  const targetDirection = keyLight.target.getWorldPosition(new THREE.Vector3())
    .sub(keyLight.getWorldPosition(new THREE.Vector3()))
    .normalize()
  const exportedDirection = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(exportedRotation)
  assert.ok(
    exportedDirection.distanceTo(targetDirection) < 1e-6,
    'the exported light points at the same target as the Three.js scene',
  )
  assert.ok(lineMaterialDef.extensions?.KHR_materials_unlit, 'line materials are exported as unlit PBR materials')
  assert.equal(scene.children.includes(hemisphere), true, 'unsupported ambient lights remain in the live Three.js scene')
  assert.equal(line.material, lineMaterial, 'temporary export material conversion is restored on the source scene')
  assert.equal(keyLight.target.parent, scene, 'directional light targets return to their original parent')
  assert.deepEqual(keyLight.quaternion.toArray(), [0, 0, 0, 1], 'temporary light orientation is restored on the source scene')
})

test('GLTFExporter keeps bindings and hidden-object state when runtime userData has a cycle', async () => {
  const scene = new THREE.Scene()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
  const circular = {}
  circular.self = circular
  mesh.visible = false
  mesh.userData = {
    fmiBindings: [{ variable: 'level', target: 'visible', visibleWhenGreaterThanOrEqual: 0.01 }],
    runtimeState: circular,
  }
  scene.add(mesh)
  const testProfile = { ...profile, lighting: { ...profile.lighting, ambient: [] } }
  attachScenePresentation(scene, testProfile, THREE)

  const glb = await exportSceneWithPresentation(exportContext(scene, { options: { binary: true } }))
  const gltf = readGlbJson(glb)
  const exportedMesh = gltf.nodes.find(({ extras }) => extras?.fmiBindings)
  const loaded = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(glb, '', resolve, reject)
  })
  const loadedMeshes = []
  loaded.scene.traverse((node) => { if (node.isMesh) loadedMeshes.push(node) })
  applySceneObjectRendering(loaded.scene)

  assert.deepEqual(exportedMesh.extras.fmiBindings, mesh.userData.fmiBindings)
  assert.deepEqual(exportedMesh.extras[SCENE_RENDERING_USER_DATA_KEY], {
    castShadow: false,
    receiveShadow: false,
    visible: false,
  })
  assert.equal(Object.hasOwn(exportedMesh.extras, 'runtimeState'), false)
  assert.equal(mesh.visible, false, 'export restores the original source visibility')
  assert.equal(loadedMeshes.length, 1)
  assert.equal(loadedMeshes[0].visible, false, 'the GLB viewer restores hidden objects after load')
  assert.equal(Object.hasOwn(mesh.userData, 'runtimeState'), true, 'export restores circular runtime userData')
})

test('GLTFLoader restores the same profile and object rendering state from the exported GLB', async () => {
  const scene = new THREE.Scene()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
  mesh.castShadow = true
  mesh.receiveShadow = false
  scene.add(mesh)
  const keyLight = new THREE.DirectionalLight('#fff0d5', 4.2)
  keyLight.position.set(4, 8, 6)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(2048, 2048)
  scene.add(keyLight, keyLight.target)
  scene.add(new THREE.HemisphereLight('#bfd9eb', '#182128', 1.6))
  attachScenePresentation(scene, profile, THREE)

  const glb = await exportSceneWithPresentation(exportContext(scene, { options: { binary: true } }))
  const loaded = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(glb, '', resolve, reject)
  })
  const loadedMesh = []
  let loadedLight = null
  loaded.scene.traverse((node) => {
    if (node.isMesh) loadedMesh.push(node)
    if (node.isDirectionalLight) loadedLight = node
  })
  applySceneObjectRendering(loaded.scene)

  assert.equal(readScenePresentation(loaded.scene).lighting.ambient[0].intensity, 1.6)
  assert.deepEqual(readScenePresentation(loaded.scene).lighting.ambient[0].position, [0, 1, 0])
  assert.equal(loadedMesh.length, 1)
  assert.equal(loadedMesh[0].userData[SCENE_RENDERING_USER_DATA_KEY].castShadow, true)
  assert.equal(loadedMesh[0].userData[SCENE_RENDERING_USER_DATA_KEY].receiveShadow, false)
  assert.equal(loadedLight.castShadow, true)
  assert.deepEqual([loadedLight.shadow.mapSize.x, loadedLight.shadow.mapSize.y], [2048, 2048])
  const sourceDirection = keyLight.target.getWorldPosition(new THREE.Vector3())
    .sub(keyLight.getWorldPosition(new THREE.Vector3()))
    .normalize()
  const loadedDirection = loadedLight.target.getWorldPosition(new THREE.Vector3())
    .sub(loadedLight.getWorldPosition(new THREE.Vector3()))
    .normalize()
  assert.ok(loadedDirection.distanceTo(sourceDirection) < 1e-6, 'binary GLB keeps the source directional-light aim')
  assert.deepEqual(keyLight.quaternion.toArray(), [0, 0, 0, 1], 'binary export restores the source light orientation')
})

test('the Water Tank floor PBR material and transparent grid survive the canonical round trip', async () => {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: '#101e26', roughness: 0.78, metalness: 0.18 }),
  )
  floor.name = 'Water Tank floor fixture'
  const grid = new THREE.GridHelper(22, 44, '#24505c', '#17313b')
  grid.name = 'Water Tank grid fixture'
  grid.material.transparent = true
  grid.material.opacity = 0.48
  scene.add(floor, grid)
  const glb = await exportSceneWithPresentation(exportContext(scene, { options: { binary: true } }))
  const loaded = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(glb, '', resolve, reject)
  })
  const loadedObjects = []
  loaded.scene.traverse((node) => {
    if (node.isMesh || node.isLine) loadedObjects.push(node)
  })
  const loadedFloor = loadedObjects.find((node) => node.isMesh)
  const loadedGrid = loadedObjects.find((node) => node.isLine)

  assert.equal(loadedFloor.material.color.getHexString(), '101e26')
  assert.equal(loadedFloor.material.roughness, 0.78)
  assert.equal(loadedFloor.material.metalness, 0.18)
  assert.equal(loadedGrid.material.transparent, true)
  assert.equal(loadedGrid.material.opacity, 0.48)
})

test('captureScenePresentation derives the active camera, renderer, fog, and ambient lights', () => {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#101820')
  scene.fog = new THREE.FogExp2('#101820', 0.035)
  scene.add(new THREE.HemisphereLight('#b8d9e8', '#17231e', 1.65))
  const camera = new THREE.PerspectiveCamera(38, 1.6, 0.1, 80)
  camera.position.set(7, 5, 9)
  const controls = { target: new THREE.Vector3(0, 2, 0), enableDamping: true, dampingFactor: 0.07 }
  const renderer = {
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.2,
    shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap },
    getPixelRatio: () => 1.75,
    getClearColor: (target) => target.set('#020304'),
    getClearAlpha: () => 1,
  }

  const captured = captureScenePresentation(THREE, { scene, camera, renderer, controls })

  assert.deepEqual(captured.camera, {
    projection: 'perspective',
    position: [7, 5, 9],
    target: [0, 2, 0],
    fov: 38,
    up: [0, 1, 0],
    zoom: 1,
    filmGauge: 35,
    filmOffset: 0,
    near: 0.1,
    far: 80,
    aspectRatio: 1.6,
    enableDamping: true,
    dampingFactor: 0.07,
  })
  assert.deepEqual(captured.scene.fog, { type: 'exp2', color: '#101820', density: 0.035 })
  assert.deepEqual(captured.renderer, {
    outputColorSpace: 'SRGBColorSpace',
    toneMapping: 'ACESFilmicToneMapping',
    toneMappingExposure: 1.2,
    pixelRatio: 1.75,
    clearColor: '#020304',
    clearAlpha: 1,
    shadowMap: { enabled: true, type: 'PCFSoftShadowMap' },
  })
  assert.deepEqual(captured.lighting.ambient, [
    { type: 'hemisphere', skyColor: '#b8d9e8', groundColor: '#17231e', intensity: 1.65, position: [0, 1, 0] },
  ])
  const restoredScene = new THREE.Scene()
  const restoredRenderer = {
    shadowMap: {},
    ratio: 1,
    getPixelRatio() { return this.ratio },
    setPixelRatio(ratio) { this.ratio = ratio },
    setClearColor(color, alpha) { this.clearColor = color; this.clearAlpha = alpha },
  }
  applyScenePresentation(THREE, captured, { scene: restoredScene, camera: new THREE.PerspectiveCamera(), renderer: restoredRenderer })
  assert.ok(restoredScene.fog.isFogExp2)
  assert.equal(restoredRenderer.ratio, 1.75)
  assert.equal(restoredRenderer.clearColor.getHexString(), '020304')
  assert.equal(restoredRenderer.clearAlpha, 1)
})

test('the canonical exporter captures presentation, keeps initially hidden geometry, and preserves material render state', async () => {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#08151e')
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#101e26' }))
  mesh.visible = false
  mesh.material.depthWrite = false
  mesh.material.toneMapped = false
  scene.add(mesh, new THREE.HemisphereLight('#b8d3df', '#14202a', 2.05))
  const camera = new THREE.PerspectiveCamera(37, 1.25, 0.1, 100)
  camera.position.set(3.6, 3.3, 5.8)
  const controls = { target: new THREE.Vector3(0, 1.4, 0) }
  const renderer = {
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.05,
    shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap },
    getPixelRatio: () => 2,
    getClearColor: (target) => target.set('#000000'),
    getClearAlpha: () => 1,
  }

  const glb = await exportSceneWithPresentation({
    THREE,
    scene,
    camera,
    renderer,
    controls,
    exporter: new GLTFExporter(),
    options: { binary: true },
  })
  const gltf = readGlbJson(glb)
  const loaded = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(glb, '', resolve, reject)
  })
  applySceneObjectRendering(loaded.scene)
  applySceneMaterialRendering(loaded.scene, THREE)
  const loadedMeshes = []
  loaded.scene.traverse((node) => { if (node.isMesh) loadedMeshes.push(node) })

  assert.equal(gltf.nodes.some(({ mesh: meshIndex, extras }) => meshIndex !== undefined && extras?.decentralabsSceneRendering?.visible === false), true)
  assert.equal(readScenePresentation(loaded.scene).lighting.ambient[0].intensity, 2.05)
  assert.equal(mesh.visible, false, 'export does not change the source scene visibility')
  assert.equal(loadedMeshes.length, 1, 'hidden meshes remain in the GLB by default')
  assert.equal(loadedMeshes[0].visible, false)
  assert.equal(loadedMeshes[0].material.depthWrite, false)
  assert.equal(loadedMeshes[0].material.toneMapped, false)
})

test('the exporter rejects shader materials that cannot be represented faithfully in glTF', async () => {
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShaderMaterial()))
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  const renderer = {
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap },
    getPixelRatio: () => 1,
    getClearColor: (target) => target.set('#000000'),
    getClearAlpha: () => 1,
  }

  await assert.rejects(
    exportSceneWithPresentation({
      THREE,
      scene,
      camera,
      target: [0, 0, 0],
      renderer,
      exporter: new GLTFExporter(),
      options: { binary: true },
    }),
    /ShaderMaterial.*cannot be represented faithfully/u,
  )
})

test('the exporter rejects marked DOM effects layered over the Three.js canvas', async () => {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  const renderer = {
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap },
    getPixelRatio: () => 1,
    getClearColor: (target) => target.set('#000000'),
    getClearAlpha: () => 1,
  }
  const surfaceElement = {
    matches: () => true,
    querySelectorAll: () => [],
  }

  await assert.rejects(
    exportSceneWithPresentation({
      THREE,
      scene,
      camera,
      target: [0, 0, 0],
      renderer,
      surfaceElement,
      exporter: new GLTFExporter(),
      options: { binary: true },
    }),
    /DOM effects over the Three.js canvas are outside GLB scene presentation/u,
  )
})
