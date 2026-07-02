import {
  initialState,
  normalizeMaxConcurrentUsersForResource,
  reducer,
} from '../labModalReducer'

describe('labModalReducer FMU concurrency state', () => {
  test('defaults FMU labs without metadata to two concurrent users', () => {
    const state = initialState({ resourceType: 'fmu' })

    expect(state.localLab.maxConcurrentUsers).toBe(2)
  })

  test('preserves FMU maxConcurrentUsers from existing lab metadata', () => {
    expect(normalizeMaxConcurrentUsersForResource({
      resourceType: 'fmu',
      maxConcurrentUsers: 8,
    })).toBe(8)
  })

  test('normalizes regular labs to one concurrent user even after stale FMU state', () => {
    const state = initialState({ resourceType: 'fmu', maxConcurrentUsers: 6 })
    const nextState = reducer(state, {
      type: 'MERGE_LOCAL_LAB',
      value: {
        resourceType: 'lab',
        maxConcurrentUsers: 1,
        fmuFileName: '',
      },
    })

    expect(nextState.localLab.resourceType).toBe('lab')
    expect(nextState.localLab.maxConcurrentUsers).toBe(1)
    expect(nextState.localLab.fmuFileName).toBe('')
  })
})
