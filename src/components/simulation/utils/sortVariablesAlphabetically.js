const variableNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

export function compareVariablesAlphabetically(left, right) {
  return variableNameCollator.compare(String(left?.name ?? ''), String(right?.name ?? ''))
}

export function sortVariablesAlphabetically(variables) {
  return [...(Array.isArray(variables) ? variables : [])].sort(compareVariablesAlphabetically)
}
