export declare function resolveEffectiveTolerance(
  options: { tolerance?: number } | null | undefined,
  defaultTolerance: number | string | null | undefined,
): { value: number; source: 'run-option' | 'default-experiment' } | null
