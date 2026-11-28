export type FmiSceneBindingTarget =
  | 'position.x' | 'position.y' | 'position.z'
  | 'translation.x' | 'translation.y' | 'translation.z'
  | 'translation' | 'rotation' | 'scale' | 'weights'
  | 'rotation.x' | 'rotation.y' | 'rotation.z'
  | 'scale.x' | 'scale.y' | 'scale.z'
  | 'visible' | 'material.color'

export type FmiSceneColor = string | number
export type FmiSceneValueMapValue = boolean | FmiSceneColor

export interface FmiSceneBinding {
  variable: string
  target: FmiSceneBindingTarget
  scale?: number
  offset?: number
  index?: number
  indices?: number[]
  visibleWhenGreaterThanOrEqual?: number
  trueColor?: FmiSceneColor
  falseColor?: FmiSceneColor
  valueMap?: Record<string, FmiSceneValueMapValue>
}

export interface FmiSceneDimension {
  start?: number
  variableName?: string
  valueReference?: string | number
}

export interface FmiSceneModelVariable {
  name: string
  type?: string
  causality?: string
  start?: unknown
  min?: number | string
  max?: number | string
  valueReference?: string | number
  dimensions?: FmiSceneDimension[]
}

export interface NormalizedFmiSceneBinding {
  binding: FmiSceneBinding
  variable: FmiSceneModelVariable
  target: FmiSceneBindingTarget
  property: 'position' | 'rotation' | 'scale' | 'weights' | 'visible' | 'material'
  axis: 'x' | 'y' | 'z' | null
  indices: number[] | null
  index: number | null
  scale: number
  offset: number
}

export declare const FMI_SCENE_BINDING_TARGETS: readonly FmiSceneBindingTarget[]
export declare function getFmiInitialValue(variable: FmiSceneModelVariable | null | undefined): boolean | number | undefined
export declare function isFmiSceneBindingVisible(
  value: unknown,
  binding?: Pick<FmiSceneBinding, 'visibleWhenGreaterThanOrEqual'>,
): boolean
export declare function normalizeFmiSceneBinding(
  binding: unknown,
  variable: FmiSceneModelVariable | null | undefined,
  modelVariables?: FmiSceneModelVariable[],
): NormalizedFmiSceneBinding | null
export declare function getFmiSceneBoundValue(value: unknown, normalizedBinding: NormalizedFmiSceneBinding | null | undefined): number | null
export declare function getFmiSceneBindingValue(
  value: unknown,
  normalizedBinding: NormalizedFmiSceneBinding | null | undefined,
  modelVariables?: FmiSceneModelVariable[],
  runtimeValues?: Record<string, unknown>,
): unknown | null
export declare function isDraggableFmiSceneBinding(normalizedBinding: NormalizedFmiSceneBinding | null | undefined): boolean
export declare function getFmiSceneInputValueFromCoordinate(
  coordinate: unknown,
  normalizedBinding: NormalizedFmiSceneBinding | null | undefined,
): number | null
export declare function setFmiSceneArrayElementValue(
  value: unknown,
  indices: number[],
  nextValue: unknown,
  variable: FmiSceneModelVariable,
  modelVariables?: FmiSceneModelVariable[],
  runtimeValues?: Record<string, unknown>,
): unknown[] | null
