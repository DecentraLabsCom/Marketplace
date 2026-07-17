const SAFE_FMU_FILENAME = /^[\p{L}\p{N}][-\p{L}\p{N} ._()]{0,250}\.fmu$/iu

export function normalizeFmuFileName(value) {
  if (typeof value !== 'string') return null

  const normalized = value.trim()
  if (!SAFE_FMU_FILENAME.test(normalized)) return null

  return normalized
}
