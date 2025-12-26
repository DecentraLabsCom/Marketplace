const memoryStore = new Map()

const getStorage = () => {
  if (typeof window !== 'undefined') {
    try {
      if (window.localStorage) {
        return window.localStorage
      }
    } catch {
      // Fall back to in-memory storage when localStorage is unavailable.
    }
  }

  return {
    getItem: (key) => (memoryStore.has(key) ? memoryStore.get(key) : null),
    setItem: (key, value) => {
      memoryStore.set(key, value)
    },
    removeItem: (key) => {
      memoryStore.delete(key)
    },
    clear: () => {
      memoryStore.clear()
    },
    key: (index) => Array.from(memoryStore.keys())[index] || null,
    get length() {
      return memoryStore.size
    }
  }
}

const getAllKeys = (storage) => {
  if (storage && typeof storage.length === 'number' && typeof storage.key === 'function') {
    const keys = []
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (key !== null && key !== undefined) {
        keys.push(String(key))
      }
    }
    return keys
  }

  return Array.from(memoryStore.keys())
}

const AsyncStorage = {
  getItem: async (key) => {
    const storage = getStorage()
    return storage.getItem(String(key))
  },
  setItem: async (key, value) => {
    const storage = getStorage()
    storage.setItem(String(key), String(value))
  },
  removeItem: async (key) => {
    const storage = getStorage()
    storage.removeItem(String(key))
  },
  clear: async () => {
    const storage = getStorage()
    storage.clear()
  },
  getAllKeys: async () => {
    const storage = getStorage()
    return getAllKeys(storage)
  },
  multiGet: async (keys) => {
    const storage = getStorage()
    return keys.map((key) => [key, storage.getItem(String(key))])
  },
  multiSet: async (pairs) => {
    const storage = getStorage()
    pairs.forEach(([key, value]) => {
      storage.setItem(String(key), String(value))
    })
  },
  multiRemove: async (keys) => {
    const storage = getStorage()
    keys.forEach((key) => {
      storage.removeItem(String(key))
    })
  },
  mergeItem: async (key, value) => {
    const storage = getStorage()
    storage.setItem(String(key), String(value))
  },
  multiMerge: async (pairs) => {
    const storage = getStorage()
    pairs.forEach(([key, value]) => {
      storage.setItem(String(key), String(value))
    })
  }
}

export { AsyncStorage }
export default AsyncStorage
