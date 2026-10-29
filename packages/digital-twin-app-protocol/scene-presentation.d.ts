export type SceneVector3 = [number, number, number]

export interface ScenePresentationV1 {
  version: 1
  camera?: {
    projection?: 'perspective'
    position: SceneVector3
    target: SceneVector3
    fov: number
    up?: SceneVector3
    zoom?: number
    filmGauge?: number
    filmOffset?: number
    aspectRatio?: number
    near: number
    far: number
    follow?: {
      node: string
      positionOffset?: SceneVector3
      targetOffset?: SceneVector3
    }
    minDistance?: number
    maxDistance?: number
    minPolarAngle?: number
    maxPolarAngle?: number
    dampingFactor?: number
    enableDamping?: boolean
    enablePan?: boolean
    enableRotate?: boolean
    enableZoom?: boolean
    screenSpacePanning?: boolean
    rotateSpeed?: number
    zoomSpeed?: number
    panSpeed?: number
  }
  scene?: {
    background: string | null
    backgroundImage?: string
    backgroundMapping?: 'UVMapping' | 'EquirectangularReflectionMapping'
    backgroundColorSpace?: 'SRGBColorSpace' | 'LinearSRGBColorSpace' | 'DisplayP3ColorSpace'
    fog?: { color: string; near: number; far: number } | { type: 'exp2'; color: string; density: number } | null
  }
  renderer?: {
    outputColorSpace?: 'SRGBColorSpace' | 'LinearSRGBColorSpace' | 'DisplayP3ColorSpace'
    toneMapping?: 'NoToneMapping' | 'LinearToneMapping' | 'ReinhardToneMapping' | 'CineonToneMapping' | 'ACESFilmicToneMapping' | 'AgXToneMapping' | 'NeutralToneMapping'
    toneMappingExposure?: number
    pixelRatio?: number
    pixelRatioLimit?: number
    clearColor?: string | null
    clearAlpha?: number
    autoClear?: boolean
    autoClearColor?: boolean
    autoClearDepth?: boolean
    autoClearStencil?: boolean
    sortObjects?: boolean
    shadowMap?: { enabled: boolean; type?: 'BasicShadowMap' | 'PCFShadowMap' | 'PCFSoftShadowMap' | 'VSMShadowMap' }
  }
  lighting?: {
    mode: 'authored' | 'studio'
    environment?: 'none' | 'room'
    environmentIntensity?: number
    ambient?: Array<
      | { type: 'hemisphere'; skyColor: string; groundColor: string; intensity: number; position?: SceneVector3 }
      | { type: 'ambient'; color: string; intensity: number }
    >
  }
}

export interface SceneObjectRenderingV1 {
  visible?: boolean
  castShadow?: boolean
  receiveShadow?: boolean
  shadow?: {
    mapSize?: [number, number]
    bias?: number
    normalBias?: number
    radius?: number
    camera?: { left?: number; right?: number; top?: number; bottom?: number; near?: number; far?: number }
  }
}

export declare const SCENE_PRESENTATION_USER_DATA_KEY: string
export declare const SCENE_RENDERING_USER_DATA_KEY: string
export declare const SCENE_MATERIAL_RENDERING_USER_DATA_KEY: string
export declare function normalizeScenePresentation(value: unknown): ScenePresentationV1 | null
export declare function readScenePresentation(sceneOrUserData: unknown): ScenePresentationV1 | null
export declare function attachScenePresentation(scene: object, presentation: ScenePresentationV1, THREE?: Record<string, unknown>): ScenePresentationV1
export declare function captureScenePresentation(THREE: Record<string, unknown>, context: {
  scene: object
  camera: object
  renderer: object
  controls?: object
  target?: SceneVector3
  surfaceElement?: Element
  lighting?: ScenePresentationV1['lighting']
}): ScenePresentationV1
export declare function exportSceneWithPresentation(args: {
  THREE: Record<string, unknown>
  scene: object
  camera: object
  renderer: object
  controls?: object
  target?: SceneVector3
  surfaceElement?: Element
  lighting?: ScenePresentationV1['lighting']
  exporter: { parseAsync(scene: object, options?: Record<string, unknown>): Promise<unknown> }
  options?: Record<string, unknown>
}): Promise<unknown>
export declare function applyScenePresentation(THREE: Record<string, unknown>, presentation: unknown, context?: Record<string, unknown>): {
  valid: boolean
  lightingMode: 'authored' | 'studio'
  environment: 'none' | 'room'
  useDefaultLighting: boolean
  useAutomaticCameraFraming: boolean
}
export declare function applySceneObjectRendering(root: object): number
export declare function applySceneMaterialRendering(root: object, THREE: Record<string, unknown>): number
