function isSafeValue(value, depth = 0) {
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.length <= 65536
  if (Array.isArray(value)) {
    return depth < 2 && value.length <= 4096 && value.every((item) => (
      item === null ? false : isSafeValue(item, depth + 1)
    ))
  }
  return false
}

function normalizeInputSchedule(value) {
  if (!Array.isArray(value) || value.length > 128) return null
  let previousTime = -Infinity
  const schedule = []
  for (const event of value) {
    if (!event || typeof event !== 'object' || Array.isArray(event)
      || Object.keys(event).some((key) => !['time', 'values'].includes(key))
      || typeof event.time !== 'number' || !Number.isFinite(event.time) || event.time < previousTime
      || !event.values || typeof event.values !== 'object' || Array.isArray(event.values)
      || Object.keys(event.values).length === 0 || Object.keys(event.values).length > 32) return null
    const values = {}
    for (const [name, value] of Object.entries(event.values)) {
      if (!name || name.length > 512 || typeof value !== 'number' || !Number.isFinite(value)) return null
      values[name] = value
    }
    schedule.push({ time: event.time, values })
    previousTime = event.time
  }
  return schedule
}

/** Keep only bounded, executable experiments returned by the reservation Gateway. */
export function normalizeFmiLsExperiments(rawExperiments) {
  if (!Array.isArray(rawExperiments) || rawExperiments.length > 128) return []

  const ids = new Set()
  const experiments = []
  for (const raw of rawExperiments) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || typeof raw.id !== 'string' || !/^experiment-\d{1,2}-\d{1,2}$/.test(raw.id)
      || ids.has(raw.id)
      || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 180
      || !raw.parameters || typeof raw.parameters !== 'object' || Array.isArray(raw.parameters)
      || Object.keys(raw.parameters).length > 2048
      || !raw.options || typeof raw.options !== 'object' || Array.isArray(raw.options)) continue

    const parameters = {}
    let valid = true
    for (const [name, value] of Object.entries(raw.parameters)) {
      if (!name || name.length > 512 || !isSafeValue(value)) {
        valid = false
        break
      }
      parameters[name] = value
    }
    if (!valid) continue

    const options = {}
    for (const [name, value] of Object.entries(raw.options)) {
      if (!['startTime', 'stopTime', 'stepSize'].includes(name)
        || typeof value !== 'number' || !Number.isFinite(value)
        || (name === 'stepSize' && value <= 0)) {
        valid = false
        break
      }
      options[name] = value
    }
    const inputSchedule = raw.inputSchedule === undefined ? [] : normalizeInputSchedule(raw.inputSchedule)
    if (inputSchedule === null) valid = false
    if (!valid
      || (options.startTime !== undefined && options.stopTime !== undefined && options.stopTime <= options.startTime)
      || (!Object.keys(parameters).length && !Object.keys(options).length && inputSchedule.length === 0)) continue

    ids.add(raw.id)
    experiments.push({
      id: raw.id,
      name: raw.name.trim(),
      description: typeof raw.description === 'string' ? raw.description.slice(0, 2048) : '',
      parameters,
      options,
      ...(inputSchedule.length ? { inputSchedule } : {}),
    })
  }
  return experiments
}
