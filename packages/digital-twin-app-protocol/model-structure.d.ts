export interface FmiOutputDependency {
  name: string
  dependencyNames?: string[]
  dependencies?: number[]
  dependenciesKind?: string[]
}

export interface FmiModelMetadata {
  modelVariables: Array<Record<string, unknown> & { name: string; causality?: string }>
  modelStructure: { outputs: FmiOutputDependency[]; [section: string]: unknown }
}

export interface DigitalTwinHostExtensions extends Record<string, unknown> {
  /** Reservation-authorized FMI variables and ModelStructure relations supplied by Marketplace. */
  fmiModelMetadata?: FmiModelMetadata
}

export declare function getDependentOutputRecommendations(
  modelStructure: { outputs?: FmiOutputDependency[] } | null | undefined,
  selectedInputNames: Iterable<string> | null | undefined,
): Array<{ outputName: string; dependencyNames: string[] }>
