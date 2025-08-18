/**
 * Utility function for conditional class name concatenation
 * Similar to clsx/classnames but simpler and tailored for this project
 */

/**
 * Concatenates class names conditionally
 * @param {...(string|object|array)} classes - Class names or conditional objects
 * @returns {string} - Concatenated class string
 * 
 * @example
 * cn('base-class', 'another-class') // 'base-class another-class'
 * cn('base', { 'active': isActive, 'disabled': isDisabled }) // 'base active' (if isActive is true)
 * cn(['class1', 'class2'], 'class3') // 'class1 class2 class3'
 */
export function cn(...classes) {
  const result = []
  
  for (const cls of classes) {
    if (!cls) continue
    
    if (typeof cls === 'string') {
      result.push(cls)
    } else if (Array.isArray(cls)) {
      const nested = cn(...cls)
      if (nested) result.push(nested)
    } else if (typeof cls === 'object') {
      for (const [key, value] of Object.entries(cls)) {
        if (value) result.push(key)
      }
    }
  }
  
  return result.join(' ')
}

export default cn
