export function serializeIntent(intentPackage) {
  return JSON.parse(
    JSON.stringify(intentPackage, (_, value) => (typeof value === 'bigint' ? value.toString() : value)),
  )
}

export default {
  serializeIntent,
}
