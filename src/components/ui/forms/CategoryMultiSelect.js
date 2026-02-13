import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { ChevronDown, X } from 'lucide-react'
import { LAB_CATEGORIES_GROUPED } from '../../../constants/labCategories'

/**
 * Multi-select dropdown component for laboratory categories
 * Allows selecting multiple categories from predefined grouped lists
 * @param {Object} props
 * @param {string[]} props.value - Array of selected category values
 * @param {Function} props.onChange - Callback when selection changes
 * @param {boolean} props.disabled - Whether the component is disabled
 * @param {string} props.placeholder - Placeholder text when no categories selected
 * @param {string} props.error - Error message to display
 * @returns {JSX.Element} Multi-select category dropdown
 */
export default function CategoryMultiSelect({ value = [], onChange, disabled = false, placeholder = 'Select categories...', error }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  const selectedCategories = Array.isArray(value) ? value : []

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleCategory = (category) => {
    if (disabled) return

    const newSelection = selectedCategories.includes(category)
      ? selectedCategories.filter(c => c !== category)
      : [...selectedCategories, category]

    onChange(newSelection)
  }

  const removeCategory = (category, e) => {
    e.stopPropagation()
    if (disabled) return
    onChange(selectedCategories.filter(c => c !== category))
  }

  return (
    <div ref={dropdownRef} className="relative w-full">
      <div
        data-testid="category-multiselect"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full p-2 border rounded min-h-10.5 flex flex-wrap gap-2 items-center cursor-pointer
          ${disabled ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' : 'bg-white hover:border-gray-400'}
          ${error ? 'border-red-500' : 'border-gray-300'}
        `}
      >
        {selectedCategories.length === 0 ? (
          <span className="text-gray-400 flex-1">{placeholder}</span>
        ) : (
          <div className="flex flex-wrap gap-2 flex-1">
            {selectedCategories.map(category => (
              <span
                key={category}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm"
              >
                {category}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => removeCategory(category, e)}
                    className="hover:text-blue-900"
                  >
                    <X size={14} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {!disabled && (
          <ChevronDown
            size={20}
            className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        )}
      </div>

      {isOpen && !disabled && (
        <div role="listbox" className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-96 overflow-y-auto">
          {Object.entries(LAB_CATEGORIES_GROUPED).map(([groupName, categories]) => (
            <div key={groupName} className="border-b last:border-b-0">
              <div className="px-3 py-2 bg-gray-50 font-semibold text-sm text-gray-700 sticky top-0">
                {groupName}
              </div>
              <div className="py-1">
                {categories.map(category => (
                  <div
                    key={category}
                    role="option"
                    aria-selected={selectedCategories.includes(category)}
                    onClick={() => toggleCategory(category)}
                    className={`px-4 py-2 cursor-pointer hover:bg-blue-50 flex items-center gap-2
                      ${selectedCategories.includes(category) ? 'bg-blue-50' : ''}
                    `}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category)}
                      onChange={() => {}} // Controlled by parent div onClick
                      className="cursor-pointer"
                    />
                    <span className="text-sm">{category}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  )
}

CategoryMultiSelect.propTypes = {
  value: PropTypes.arrayOf(PropTypes.string),
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  placeholder: PropTypes.string,
  error: PropTypes.string
}