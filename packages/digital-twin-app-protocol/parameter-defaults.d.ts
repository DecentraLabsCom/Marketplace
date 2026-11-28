export declare function omitParametersMatchingFmiStart<T extends Record<string, unknown>>(
  parameters: T,
  modelVariables?: Array<Record<string, unknown>>,
): Partial<T>
