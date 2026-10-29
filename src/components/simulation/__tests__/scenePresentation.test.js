import {
  SCENE_PRESENTATION_USER_DATA_KEY,
  SCENE_RENDERING_USER_DATA_KEY,
  applyScenePresentation,
  applySceneObjectRendering,
  attachScenePresentation,
  readScenePresentation,
} from '@decentralabs/digital-twin-app-protocol/scene-presentation'

class TestColor {
  constructor(value) { this.value = value }
}

class TestFog {
  constructor(color, near, far) { Object.assign(this, { color, near, far }) }
}

class TestHemisphereLight {
  constructor(skyColor, groundColor, intensity) {
    Object.assign(this, { isHemisphereLight: true, skyColor, groundColor, intensity })
  }
}

class TestTextureLoader {
  load(url) { return { isTexture: true, url, mapping: null } }
}

const THREE = {
  Color: TestColor,
  Fog: TestFog,
  HemisphereLight: TestHemisphereLight,
  TextureLoader: TestTextureLoader,
  EquirectangularReflectionMapping: 303,
  ACESFilmicToneMapping: 4,
  SRGBColorSpace: 'srgb',
  PCFSoftShadowMap: 2,
}

function createTestVector() {
  const vector = {
    values: [],
    set(...values) { this.values = values; return this },
    toArray() { return [...this.values] },
  }
  return vector
}

const authoredPresentation = {
  version: 1,
  camera: {
    position: [6.6, 4.6, 7.4],
    target: [0.15, 0.1, 0],
    fov: 38,
    near: 0.1,
    far: 80,
    minDistance: 5.6,
    maxDistance: 12,
    maxPolarAngle: Math.PI * 0.49,
    enableDamping: false,
    dampingFactor: 0.055,
  },
  scene: {
    background: '#0a141b',
    fog: { color: '#0a141b', near: 12, far: 25 },
  },
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

describe('Three.js scene presentation metadata', () => {
  test('applies the exported camera, scene, renderer, and supplemental lights without requesting studio lighting', () => {
    const scene = { add: jest.fn(), children: [] }
    scene.add.mockImplementation((child) => scene.children.push(child))
    const camera = {
      position: createTestVector(),
      updateProjectionMatrix: jest.fn(),
      lookAt: jest.fn(),
    }
    const renderer = { shadowMap: {} }
    const controls = { target: createTestVector() }

    const result = applyScenePresentation(THREE, authoredPresentation, {
      scene,
      camera,
      renderer,
      controls,
    })

    expect(result).toMatchObject({
      valid: true,
      lightingMode: 'authored',
      environment: 'none',
      useDefaultLighting: false,
      useAutomaticCameraFraming: false,
    })
    expect(scene.background.value).toBe('#0a141b')
    expect(scene.fog).toMatchObject({ near: 12, far: 25 })
    expect(camera.position.toArray()).toEqual([6.6, 4.6, 7.4])
    expect(camera.fov).toBe(38)
    expect(controls.target.toArray()).toEqual([0.15, 0.1, 0])
    expect(controls.minDistance).toBe(5.6)
    expect(controls.enableDamping).toBe(false)
    expect(controls.dampingFactor).toBe(0.055)
    expect(renderer.toneMapping).toBe(4)
    expect(renderer.toneMappingExposure).toBe(1.18)
    expect(renderer.outputColorSpace).toBe('srgb')
    expect(scene.children.filter((child) => child.isHemisphereLight)).toHaveLength(1)
  })

  test('stores serializable scene metadata and per-object render settings without clobbering bindings', () => {
    const mesh = {
      isMesh: true,
      castShadow: true,
      receiveShadow: true,
      userData: { fmiBindings: [{ variable: 'angle', target: 'rotation.x', scale: 1, offset: 0 }] },
    }
    const scene = {
      userData: {},
      traverse(callback) { callback(mesh) },
    }

    attachScenePresentation(scene, authoredPresentation)
    const profile = readScenePresentation(scene)

    expect(profile).toEqual(authoredPresentation)
    expect(scene.userData[SCENE_PRESENTATION_USER_DATA_KEY]).toEqual(authoredPresentation)
    expect(mesh.userData.fmiBindings).toEqual([{ variable: 'angle', target: 'rotation.x', scale: 1, offset: 0 }])
    expect(mesh.userData[SCENE_RENDERING_USER_DATA_KEY]).toEqual({ castShadow: true, receiveShadow: true })
  })

  test('stores the initial visibility of hidden scene objects', () => {
    const hiddenGroup = { visible: false, userData: {} }
    const root = { userData: {}, traverse(callback) { callback(hiddenGroup) } }

    attachScenePresentation(root, authoredPresentation)

    expect(hiddenGroup.userData[SCENE_RENDERING_USER_DATA_KEY]).toEqual({ visible: false })
    expect(applySceneObjectRendering(root)).toBe(1)
    hiddenGroup.visible = true
    applySceneObjectRendering(root)
    expect(hiddenGroup.visible).toBe(false)
  })

  test('restores object shadow flags carried in a GLB node extras block', () => {
    const mesh = {
      isMesh: true,
      castShadow: true,
      receiveShadow: true,
      userData: { [SCENE_RENDERING_USER_DATA_KEY]: { castShadow: false, receiveShadow: false } },
    }
    const light = {
      isLight: true,
      castShadow: false,
      shadow: {
        mapSize: { set: jest.fn() },
        camera: { updateProjectionMatrix: jest.fn() },
      },
      userData: {
        [SCENE_RENDERING_USER_DATA_KEY]: {
          castShadow: true,
          shadow: { mapSize: [2048, 2048], bias: -0.0001, camera: { near: 0.5, far: 500 } },
        },
      },
    }
    const root = { traverse: (callback) => { callback(mesh); callback(light) } }

    expect(applySceneObjectRendering(root)).toBe(2)
    expect(mesh).toMatchObject({ castShadow: false, receiveShadow: false })
    expect(light.castShadow).toBe(true)
    expect(light.shadow.mapSize.set).toHaveBeenCalledWith(2048, 2048)
    expect(light.shadow.bias).toBe(-0.0001)
    expect(light.shadow.camera.near).toBe(0.5)
    expect(light.shadow.camera.far).toBe(500)
    expect(light.shadow.camera.updateProjectionMatrix).toHaveBeenCalled()
  })

  test('ignores unknown versions and keeps the existing generic fallback available', () => {
    expect(readScenePresentation({ userData: { [SCENE_PRESENTATION_USER_DATA_KEY]: { ...authoredPresentation, version: 2 } } })).toBeNull()
    expect(applyScenePresentation(THREE, null, { scene: { add: jest.fn(), children: [] } })).toMatchObject({
      valid: false,
      useDefaultLighting: true,
      useAutomaticCameraFraming: true,
    })
  })

  test('applies a portable image background, environment intensity, and camera follow metadata', () => {
    const scene = { background: new TestColor('#000'), children: [], add: jest.fn() }
    const controls = { target: createTestVector() }
    const camera = {
      position: createTestVector(),
      updateProjectionMatrix: jest.fn(),
      lookAt: jest.fn(),
    }
    const presentation = {
      ...authoredPresentation,
      camera: {
        ...authoredPresentation.camera,
        follow: { node: 'vehicle', positionOffset: [1.5, 3.42, 8.4], targetOffset: [0, 0.79, 0] },
      },
      scene: {
        background: '#09151d',
        backgroundImage: 'data:image/png;base64,AAAA',
        backgroundMapping: 'EquirectangularReflectionMapping',
        fog: { color: '#09151d', near: 90, far: 280 },
      },
      lighting: { ...authoredPresentation.lighting, environmentIntensity: 0.72 },
    }

    applyScenePresentation(THREE, presentation, { scene, camera, controls })

    expect(scene.background).toMatchObject({ isTexture: true, url: presentation.scene.backgroundImage, mapping: 303 })
    expect(scene.environmentIntensity).toBe(0.72)
    expect(controls.enableDamping).toBe(false)
    expect(readScenePresentation({ userData: { [SCENE_PRESENTATION_USER_DATA_KEY]: presentation } }).camera.follow)
      .toEqual(presentation.camera.follow)
  })

  test('applies the source renderer pixel-ratio cap without increasing the host ratio', () => {
    const renderer = {
      ratio: 2,
      getPixelRatio() { return this.ratio },
      setPixelRatio(ratio) { this.ratio = ratio },
    }
    const presentation = {
      ...authoredPresentation,
      renderer: { pixelRatioLimit: 1.6 },
    }

    applyScenePresentation(THREE, presentation, { renderer })

    expect(renderer.ratio).toBe(1.6)
  })
})
