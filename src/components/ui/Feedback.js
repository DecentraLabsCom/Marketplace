/**
 * UI Component Library - Feedback Components
 * Standardized feedback components using the design system
 */
import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { cn } from '@/utils/cn'

/**
 * Alert Component
 * @param {Object} props - Alert props
 * @param {React.ReactNode} props.children - Alert content
 * @param {'info'|'success'|'warning'|'error'} props.variant - Alert variant
 * @param {string} props.title - Alert title
 * @param {boolean} props.dismissible - Whether alert can be dismissed
 * @param {Function} props.onDismiss - Dismiss handler
 * @param {React.ReactNode} props.icon - Custom icon
 */
export function Alert({
  children,
  variant = 'info',
  title,
  dismissible = false,
  onDismiss,
  icon,
  className = ''
}) {
  const [isVisible, setIsVisible] = useState(true)

  const variantClasses = {
    info: 'bg-info-light border-info text-info-dark',
    success: 'bg-success-light border-success text-success-dark',
    warning: 'bg-warning-light border-warning text-warning-dark',
    error: 'bg-error-light border-error text-error-dark'
  }

  const defaultIcons = {
    info: (
      <svg className="size-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    ),
    success: (
      <svg className="size-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
    warning: (
      <svg className="size-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
    error: (
      <svg className="size-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    )
  }

  const handleDismiss = () => {
    setIsVisible(false)
    if (onDismiss) {
      onDismiss()
    }
  }

  if (!isVisible) return null

  const classes = cn(
    'rounded-md border p-4',
    variantClasses[variant],
    className
  )

  return (
    <div className={classes}>
      <div className="flex">
        <div className="shrink-0">
          {icon || defaultIcons[variant]}
        </div>
        <div className="ml-3 flex-1">
          {title && (
            <h3 className="text-sm font-medium mb-1">
              {title}
            </h3>
          )}
          <div className="text-sm">
            {children}
          </div>
        </div>
        {dismissible && (
          <div className="ml-auto pl-3">
            <div className="-m-1.5">
              <button
                type="button"
                className="inline-flex rounded-md p-1.5 hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-offset-2"
                onClick={handleDismiss}
              >
                <span className="sr-only">Dismiss</span>
                <svg className="size-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Badge Component
 * @param {Object} props - Badge props
 * @param {React.ReactNode} props.children - Badge content
 * @param {'default'|'primary'|'secondary'|'success'|'warning'|'error'|'info'} props.variant - Badge variant
 * @param {'sm'|'md'|'lg'} props.size - Badge size
 * @param {boolean} props.dot - Whether to show as dot
 * @param {boolean} props.removable - Whether badge can be removed
 * @param {Function} props.onRemove - Remove handler
 */
export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  removable = false,
  onRemove,
  className = ''
}) {
  const variantClasses = {
    default: 'bg-gray-100 text-gray-800',
    primary: 'bg-primary-100 text-primary-800',
    secondary: 'bg-secondary-100 text-secondary-800',
    success: 'bg-success-light text-success-dark',
    warning: 'bg-warning-light text-warning-dark',
    error: 'bg-error-light text-error-dark',
    info: 'bg-info-light text-info-dark'
  }

  const sizeClasses = {
    sm: dot ? 'size-2' : 'px-2 py-0.5 text-xs',
    md: dot ? 'h-2.5 w-2.5' : 'px-2.5 py-0.5 text-sm',
    lg: dot ? 'size-3' : 'px-3 py-1 text-base'
  }

  const classes = cn(
    'inline-flex items-center font-medium rounded-full',
    variantClasses[variant],
    sizeClasses[size],
    {
      'justify-center': dot
    },
    className
  )

  if (dot) {
    return <span className={classes} />
  }

  return (
    <span className={classes}>
      {children}
      {removable && (
        <button
          type="button"
          className="shrink-0 ml-1 size-4 rounded-full inline-flex items-center justify-center hover:bg-black/20 focus:outline-none focus:bg-black/20"
          onClick={onRemove}
        >
          <span className="sr-only">Remove badge</span>
          <svg className="size-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
            <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6L1 7" />
          </svg>
        </button>
      )}
    </span>
  )
}

/**
 * Loading Spinner Component
 * @param {Object} props - Spinner props
 * @param {'sm'|'md'|'lg'|'xl'} props.size - Spinner size
 * @param {string} props.color - Spinner color
 * @param {string} props.label - Accessible label
 */
export function Spinner({
  size = 'md',
  color = 'primary-600',
  label = 'Loading...',
  className = ''
}) {
  const sizeClasses = {
    sm: 'size-4',
    md: 'size-8',
    lg: 'size-12',
    xl: 'size-16'
  }

  const classes = cn(
    'animate-spin',
    sizeClasses[size],
    className
  )

  return (
    <div className="flex items-center justify-center">
      <svg
        className={classes}
        fill="none"
        viewBox="0 0 24 24"
        aria-label={label}
      >
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
          style={{ color: `var(--${color})` }}
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  )
}

/**
 * Progress Bar Component
 * @param {Object} props - Progress props
 * @param {number} props.value - Progress value (0-100)
 * @param {number} props.max - Maximum value
 * @param {'sm'|'md'|'lg'} props.size - Progress bar size
 * @param {'primary'|'success'|'warning'|'error'} props.color - Progress color
 * @param {boolean} props.showLabel - Whether to show progress label
 * @param {string} props.label - Custom label
 */
export function Progress({
  value = 0,
  max = 100,
  size = 'md',
  color = 'primary',
  showLabel = false,
  label,
  className = ''
}) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  }

  const colorClasses = {
    primary: 'bg-primary-600',
    success: 'bg-success',
    warning: 'bg-warning',
    error: 'bg-error'
  }

  const classes = cn(
    'w-full bg-gray-200 rounded-full overflow-hidden',
    sizeClasses[size],
    className
  )

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>{label || 'Progress'}</span>
          <span>{Math.round(percentage)}%</span>
        </div>
      )}
      <div className={classes}>
        <div
          className={cn(
            'h-full transition-all duration-300 ease-out',
            colorClasses[color]
          )}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  )
}

/**
 * Skeleton Component
 * @param {Object} props - Skeleton props
 * @param {'text'|'circle'|'rect'} props.variant - Skeleton variant
 * @param {'sm'|'md'|'lg'|'xl'} props.size - Skeleton size
 * @param {string} props.width - Custom width
 * @param {string} props.height - Custom height
 * @param {number} props.lines - Number of text lines
 */
export function Skeleton({
  variant = 'rect',
  size = 'md',
  width,
  height,
  lines = 1,
  className = ''
}) {
  const baseClasses = 'animate-pulse bg-gray-200 rounded'

  const variantClasses = {
    text: 'h-4 rounded',
    circle: 'rounded-full',
    rect: 'rounded'
  }

  const sizeClasses = {
    text: {
      sm: 'h-3',
      md: 'h-4',
      lg: 'h-5',
      xl: 'h-6'
    },
    circle: {
      sm: 'size-8',
      md: 'size-10',
      lg: 'size-12',
      xl: 'size-16'
    },
    rect: {
      sm: 'h-16',
      md: 'h-20',
      lg: 'h-24',
      xl: 'h-32'
    }
  }

  if (variant === 'text' && lines > 1) {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className={cn(
              baseClasses,
              variantClasses.text,
              sizeClasses.text[size],
              index === lines - 1 ? 'w-3/4' : 'w-full'
            )}
            style={{ width, height }}
          />
        ))}
      </div>
    )
  }

  const classes = cn(
    baseClasses,
    variantClasses[variant],
    variant !== 'text' ? sizeClasses[variant][size] : sizeClasses.text[size],
    variant === 'rect' && !height && 'w-full',
    className
  )

  return (
    <div
      className={classes}
      style={{ width, height }}
    />
  )
}

/**
 * Empty State Component
 * @param {Object} props - EmptyState props
 * @param {React.ReactNode} props.icon - Empty state icon
 * @param {string} props.title - Empty state title
 * @param {string} props.description - Empty state description
 * @param {React.ReactNode} props.actions - Empty state actions
 */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  className = ''
}) {
  const classes = cn(
    'text-center py-12',
    className
  )

  return (
    <div className={classes}>
      {icon && (
        <div className="mx-auto size-12 text-gray-400 mb-4">
          {icon}
        </div>
      )}
      {title && (
        <h3 className="mt-2 text-sm font-medium text-gray-900">
          {title}
        </h3>
      )}
      {description && (
        <p className="mt-1 text-sm text-gray-500">
          {description}
        </p>
      )}
      {actions && (
        <div className="mt-6">
          {actions}
        </div>
      )}
    </div>
  )
}

// PropTypes
Alert.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['info', 'success', 'warning', 'error']),
  title: PropTypes.string,
  dismissible: PropTypes.bool,
  onDismiss: PropTypes.func,
  icon: PropTypes.node,
  className: PropTypes.string
}

Badge.propTypes = {
  children: PropTypes.node,
  variant: PropTypes.oneOf(['default', 'primary', 'secondary', 'success', 'warning', 'error', 'info']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  dot: PropTypes.bool,
  removable: PropTypes.bool,
  onRemove: PropTypes.func,
  className: PropTypes.string
}

Spinner.propTypes = {
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
  color: PropTypes.string,
  label: PropTypes.string,
  className: PropTypes.string
}

Progress.propTypes = {
  value: PropTypes.number,
  max: PropTypes.number,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  color: PropTypes.oneOf(['primary', 'success', 'warning', 'error']),
  showLabel: PropTypes.bool,
  label: PropTypes.string,
  className: PropTypes.string
}

Skeleton.propTypes = {
  variant: PropTypes.oneOf(['text', 'circle', 'rect']),
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
  width: PropTypes.string,
  height: PropTypes.string,
  lines: PropTypes.number,
  className: PropTypes.string
}

EmptyState.propTypes = {
  icon: PropTypes.node,
  title: PropTypes.string,
  description: PropTypes.string,
  actions: PropTypes.node,
  className: PropTypes.string
}
