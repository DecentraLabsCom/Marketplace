/**
 * UI Component Library - Form Components
 * Standardized form components using the design system
 */
import React, { forwardRef } from 'react'
import PropTypes from 'prop-types'
import { cn } from '@/utils/cn'

// Base input classes
const baseInputClasses = 'block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:text-sm sm:leading-6 transition-all duration-150'

// Input variants
const inputVariants = {
  size: {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-1.5 text-base',
    lg: 'px-4 py-2 text-lg'
  },
  state: {
    default: 'ring-gray-300 focus:ring-primary-600',
    error: 'ring-error focus:ring-error',
    success: 'ring-success focus:ring-success'
  }
}

/**
 * Input Component
 * @param {Object} props - Input props
 * @param {string} props.label - Input label
 * @param {string} props.error - Error message
 * @param {string} props.helpText - Help text
 * @param {'sm'|'md'|'lg'} props.size - Input size
 * @param {'default'|'error'|'success'} props.state - Input state
 * @param {boolean} props.required - Whether input is required
 * @param {string} props.className - Additional CSS classes
 */
export const Input = forwardRef(({
  label,
  error,
  helpText,
  size = 'md',
  state = 'default',
  required = false,
  className = '',
  id,
  ...props
}, ref) => {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`
  const inputState = error ? 'error' : state

  const classes = cn(
    baseInputClasses,
    inputVariants.size[size],
    inputVariants.state[inputState],
    className
  )

  return (
    <div className="w-full">
      {label && (
        <label 
          htmlFor={inputId}
          className="block text-sm font-medium leading-6 text-gray-900 mb-2"
        >
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      
      <input
        ref={ref}
        id={inputId}
        className={classes}
        {...props}
      />
      
      {error && (
        <p className="mt-2 text-sm text-error" id={`${inputId}-error`}>
          {error}
        </p>
      )}
      
      {helpText && !error && (
        <p className="mt-2 text-sm text-gray-500" id={`${inputId}-description`}>
          {helpText}
        </p>
      )}
    </div>
  )
})

/**
 * Textarea Component
 * @param {Object} props - Textarea props
 * @param {string} props.label - Textarea label
 * @param {string} props.error - Error message
 * @param {string} props.helpText - Help text
 * @param {number} props.rows - Number of rows
 * @param {boolean} props.required - Whether textarea is required
 */
export const Textarea = forwardRef(({
  label,
  error,
  helpText,
  rows = 4,
  required = false,
  className = '',
  id,
  ...props
}, ref) => {
  const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`
  const textareaState = error ? 'error' : 'default'

  const classes = cn(
    baseInputClasses,
    inputVariants.state[textareaState],
    'resize-vertical',
    className
  )

  return (
    <div className="w-full">
      {label && (
        <label 
          htmlFor={textareaId}
          className="block text-sm font-medium leading-6 text-gray-900 mb-2"
        >
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        className={classes}
        {...props}
      />
      
      {error && (
        <p className="mt-2 text-sm text-error" id={`${textareaId}-error`}>
          {error}
        </p>
      )}
      
      {helpText && !error && (
        <p className="mt-2 text-sm text-gray-500" id={`${textareaId}-description`}>
          {helpText}
        </p>
      )}
    </div>
  )
})

/**
 * Select Component
 * @param {Object} props - Select props
 * @param {string} props.label - Select label
 * @param {string} props.error - Error message
 * @param {string} props.helpText - Help text
 * @param {Array} props.options - Select options
 * @param {string} props.placeholder - Placeholder text
 * @param {boolean} props.required - Whether select is required
 */
export const Select = forwardRef(({
  label,
  error,
  helpText,
  options = [],
  placeholder,
  required = false,
  className = '',
  id,
  ...props
}, ref) => {
  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`
  const selectState = error ? 'error' : 'default'

  const classes = cn(
    baseInputClasses,
    inputVariants.state[selectState],
    'cursor-pointer',
    className
  )

  return (
    <div className="w-full">
      {label && (
        <label 
          htmlFor={selectId}
          className="block text-sm font-medium leading-6 text-gray-900 mb-2"
        >
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      
      <select
        ref={ref}
        id={selectId}
        className={classes}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option, index) => (
          <option key={index} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      
      {error && (
        <p className="mt-2 text-sm text-error" id={`${selectId}-error`}>
          {error}
        </p>
      )}
      
      {helpText && !error && (
        <p className="mt-2 text-sm text-gray-500" id={`${selectId}-description`}>
          {helpText}
        </p>
      )}
    </div>
  )
})

/**
 * Checkbox Component
 * @param {Object} props - Checkbox props
 * @param {string} props.label - Checkbox label
 * @param {string} props.description - Checkbox description
 * @param {boolean} props.required - Whether checkbox is required
 */
export const Checkbox = forwardRef(({
  label,
  description,
  required = false,
  className = '',
  id,
  ...props
}, ref) => {
  const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`

  return (
    <div className="relative flex items-start">
      <div className="flex h-6 items-center">
        <input
          ref={ref}
          id={checkboxId}
          type="checkbox"
          className={cn(
            'h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600',
            className
          )}
          {...props}
        />
      </div>
      <div className="ml-3 text-sm leading-6">
        {label && (
          <label htmlFor={checkboxId} className="font-medium text-gray-900">
            {label}
            {required && <span className="text-error ml-1">*</span>}
          </label>
        )}
        {description && (
          <p className="text-gray-500">{description}</p>
        )}
      </div>
    </div>
  )
})

/**
 * Radio Group Component
 * @param {Object} props - RadioGroup props
 * @param {string} props.label - Group label
 * @param {Array} props.options - Radio options
 * @param {string} props.name - Input name
 * @param {string} props.value - Selected value
 * @param {Function} props.onChange - Change handler
 * @param {boolean} props.required - Whether selection is required
 */
export function RadioGroup({
  label,
  options = [],
  name,
  value,
  onChange,
  required = false,
  className = ''
}) {
  return (
    <fieldset className={cn('w-full', className)}>
      {label && (
        <legend className="text-sm font-medium leading-6 text-gray-900">
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </legend>
      )}
      <div className="mt-2 space-y-2">
        {options.map((option, index) => {
          const radioId = `${name}-${index}`
          return (
            <div key={index} className="flex items-center">
              <input
                id={radioId}
                name={name}
                type="radio"
                value={option.value}
                checked={value === option.value}
                onChange={onChange}
                className="h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-600"
              />
              <label htmlFor={radioId} className="ml-3 block text-sm font-medium leading-6 text-gray-900">
                {option.label}
              </label>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * Form Field Wrapper
 * @param {Object} props - FormField props
 * @param {React.ReactNode} props.children - Form field content
 * @param {string} props.className - Additional CSS classes
 */
export function FormField({ children, className = '' }) {
  return (
    <div className={cn('space-y-1', className)}>
      {children}
    </div>
  )
}

/**
 * Form Group Wrapper
 * @param {Object} props - FormGroup props
 * @param {React.ReactNode} props.children - Form group content
 * @param {string} props.title - Group title
 * @param {string} props.description - Group description
 */
export function FormGroup({ children, title, description, className = '' }) {
  return (
    <div className={cn('space-y-6', className)}>
      {(title || description) && (
        <div>
          {title && (
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              {title}
            </h3>
          )}
          {description && (
            <p className="mt-1 text-sm text-gray-500">
              {description}
            </p>
          )}
        </div>
      )}
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}

// Set display names
Input.displayName = 'Input'
Textarea.displayName = 'Textarea'
Select.displayName = 'Select'
Checkbox.displayName = 'Checkbox'

// PropTypes
Input.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  helpText: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  state: PropTypes.oneOf(['default', 'error', 'success']),
  required: PropTypes.bool,
  className: PropTypes.string,
  id: PropTypes.string
}

Textarea.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  helpText: PropTypes.string,
  rows: PropTypes.number,
  required: PropTypes.bool,
  className: PropTypes.string,
  id: PropTypes.string
}

Select.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  helpText: PropTypes.string,
  options: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired
  })),
  placeholder: PropTypes.string,
  required: PropTypes.bool,
  className: PropTypes.string,
  id: PropTypes.string
}

Checkbox.propTypes = {
  label: PropTypes.string,
  description: PropTypes.string,
  required: PropTypes.bool,
  className: PropTypes.string,
  id: PropTypes.string
}

RadioGroup.propTypes = {
  label: PropTypes.string,
  options: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired
  })).isRequired,
  name: PropTypes.string.isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func,
  required: PropTypes.bool,
  className: PropTypes.string
}

FormField.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string
}

FormGroup.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.string,
  description: PropTypes.string,
  className: PropTypes.string
}
