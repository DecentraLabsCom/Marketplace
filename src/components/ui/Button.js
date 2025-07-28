/**
 * UI Component Library - Button Components
 * Standardized button components using the design system
 */
import React from 'react'
import PropTypes from 'prop-types'
import { cn } from '@/utils/cn'

// Base button variants
const buttonVariants = {
  // Style variants
  variant: {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
    secondary: 'bg-secondary-200 text-secondary-900 hover:bg-secondary-300 focus:ring-secondary-500',
    outline: 'border-2 border-primary-600 text-primary-600 hover:bg-primary-50 focus:ring-primary-500',
    ghost: 'text-primary-600 hover:bg-primary-50 focus:ring-primary-500',
    success: 'bg-success text-white hover:bg-success-dark focus:ring-success',
    warning: 'bg-warning text-white hover:bg-warning-dark focus:ring-warning',
    error: 'bg-error text-white hover:bg-error-dark focus:ring-error',
    info: 'bg-info text-white hover:bg-info-dark focus:ring-info'
  },
  
  // Size variants
  size: {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
    xl: 'px-8 py-4 text-xl'
  },
  
  // Width variants
  width: {
    auto: 'w-auto',
    full: 'w-full',
    fit: 'w-fit'
  }
}

// Base button classes
const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'

/**
 * Primary Button Component
 * @param {Object} props - Button props
 * @param {React.ReactNode} props.children - Button content
 * @param {'primary'|'secondary'|'outline'|'ghost'|'success'|'warning'|'error'|'info'} props.variant - Button style variant
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} props.size - Button size
 * @param {'auto'|'full'|'fit'} props.width - Button width
 * @param {boolean} props.disabled - Whether button is disabled
 * @param {boolean} props.loading - Whether button is in loading state
 * @param {Function} props.onClick - Click handler
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.type - Button type
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  width = 'auto',
  disabled = false,
  loading = false,
  onClick,
  className = '',
  type = 'button',
  ...props
}) {
  const classes = cn(
    baseClasses,
    buttonVariants.variant[variant],
    buttonVariants.size[size],
    buttonVariants.width[width],
    {
      'opacity-50 cursor-not-allowed': disabled || loading,
      'pointer-events-none': loading
    },
    className
  )

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle 
            className="opacity-25" 
            cx="12" 
            cy="12" 
            r="10" 
            stroke="currentColor" 
            strokeWidth="4"
          />
          <path 
            className="opacity-75" 
            fill="currentColor" 
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}

/**
 * Icon Button Component
 * @param {Object} props - IconButton props
 * @param {React.ReactNode} props.icon - Icon component
 * @param {string} props.label - Accessible label
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} props.size - Button size
 * @param {'primary'|'secondary'|'ghost'} props.variant - Button style variant
 */
export function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'ghost',
  className = '',
  ...props
}) {
  const sizeClasses = {
    xs: 'p-1',
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
    xl: 'p-4'
  }

  const iconSizes = {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
    xl: 'h-8 w-8'
  }

  const classes = cn(
    baseClasses,
    buttonVariants.variant[variant],
    sizeClasses[size],
    'rounded-full',
    className
  )

  return (
    <button
      className={classes}
      aria-label={label}
      title={label}
      {...props}
    >
      <span className={iconSizes[size]}>
        {icon}
      </span>
    </button>
  )
}

/**
 * Button Group Component
 * @param {Object} props - ButtonGroup props
 * @param {React.ReactNode} props.children - Button components
 * @param {'horizontal'|'vertical'} props.orientation - Group orientation
 * @param {string} props.className - Additional CSS classes
 */
export function ButtonGroup({
  children,
  orientation = 'horizontal',
  className = '',
  ...props
}) {
  const orientationClasses = {
    horizontal: 'flex flex-row',
    vertical: 'flex flex-col'
  }

  const classes = cn(
    orientationClasses[orientation],
    'rounded-md overflow-hidden',
    className
  )

  return (
    <div className={classes} {...props}>
      {React.Children.map(children, (child, index) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, {
            className: cn(
              child.props.className,
              orientation === 'horizontal' ? 'rounded-none first:rounded-l-md last:rounded-r-md' : 'rounded-none first:rounded-t-md last:rounded-b-md',
              index > 0 && orientation === 'horizontal' && '-ml-px',
              index > 0 && orientation === 'vertical' && '-mt-px'
            )
          })
        }
        return child
      })}
    </div>
  )
}

// PropTypes
Button.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['primary', 'secondary', 'outline', 'ghost', 'success', 'warning', 'error', 'info']),
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),
  width: PropTypes.oneOf(['auto', 'full', 'fit']),
  disabled: PropTypes.bool,
  loading: PropTypes.bool,
  onClick: PropTypes.func,
  className: PropTypes.string,
  type: PropTypes.string
}

IconButton.propTypes = {
  icon: PropTypes.node.isRequired,
  label: PropTypes.string.isRequired,
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),
  variant: PropTypes.oneOf(['primary', 'secondary', 'ghost']),
  className: PropTypes.string
}

ButtonGroup.propTypes = {
  children: PropTypes.node.isRequired,
  orientation: PropTypes.oneOf(['horizontal', 'vertical']),
  className: PropTypes.string
}
