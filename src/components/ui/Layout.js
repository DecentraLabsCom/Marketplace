/**
 * UI Component Library - Layout Components
 * Standardized layout components using the design system
 */
import React from 'react'
import PropTypes from 'prop-types'
import { cn } from '@/utils/cn'

/**
 * Card Component
 * @param {Object} props - Card props
 * @param {React.ReactNode} props.children - Card content
 * @param {'sm'|'md'|'lg'|'xl'} props.padding - Card padding size
 * @param {boolean} props.shadow - Whether to show shadow
 * @param {boolean} props.border - Whether to show border
 * @param {string} props.className - Additional CSS classes
 */
export function Card({
  children,
  padding = 'md',
  shadow = true,
  border = true,
  className = '',
  ...props
}) {
  const paddingClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
    xl: 'p-10'
  }

  const classes = cn(
    'bg-white rounded-lg',
    paddingClasses[padding],
    {
      'shadow-sm': shadow,
      'border border-gray-200': border
    },
    className
  )

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  )
}

/**
 * Card Header Component
 * @param {Object} props - CardHeader props
 * @param {React.ReactNode} props.children - Header content
 * @param {string} props.title - Header title
 * @param {string} props.subtitle - Header subtitle
 * @param {React.ReactNode} props.actions - Header actions
 */
export function CardHeader({
  children,
  title,
  subtitle,
  actions,
  className = ''
}) {
  const classes = cn('border-b border-gray-200 pb-4 mb-4', className)

  return (
    <div className={classes}>
      {(title || subtitle || actions) && (
        <div className="flex items-start justify-between">
          <div>
            {title && (
              <h3 className="text-lg font-medium leading-6 text-gray-900">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-gray-500">
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex items-center space-x-2">
              {actions}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * Card Content Component
 * @param {Object} props - CardContent props
 * @param {React.ReactNode} props.children - Content
 */
export function CardContent({ children, className = '' }) {
  return (
    <div className={cn('flex-1', className)}>
      {children}
    </div>
  )
}

/**
 * Card Footer Component
 * @param {Object} props - CardFooter props
 * @param {React.ReactNode} props.children - Footer content
 * @param {'left'|'center'|'right'|'between'} props.align - Footer alignment
 */
export function CardFooter({
  children,
  align = 'right',
  className = ''
}) {
  const alignClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
    between: 'justify-between'
  }

  const classes = cn(
    'border-t border-gray-200 pt-4 mt-4 flex items-center',
    alignClasses[align],
    className
  )

  return (
    <div className={classes}>
      {children}
    </div>
  )
}

/**
 * Container Component
 * @param {Object} props - Container props
 * @param {React.ReactNode} props.children - Container content
 * @param {'sm'|'md'|'lg'|'xl'|'2xl'|'full'} props.maxWidth - Maximum width
 * @param {boolean} props.centered - Whether to center content
 * @param {'none'|'sm'|'md'|'lg'|'xl'} props.padding - Container padding
 */
export function Container({
  children,
  maxWidth = 'lg',
  centered = true,
  padding = 'md',
  className = '',
  ...props
}) {
  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    '2xl': 'max-w-7xl',
    full: 'max-w-full'
  }

  const paddingClasses = {
    none: '',
    sm: 'px-4',
    md: 'px-6',
    lg: 'px-8',
    xl: 'px-10'
  }

  const classes = cn(
    maxWidthClasses[maxWidth],
    paddingClasses[padding],
    {
      'mx-auto': centered
    },
    className
  )

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  )
}

/**
 * Grid Component
 * @param {Object} props - Grid props
 * @param {React.ReactNode} props.children - Grid content
 * @param {number} props.cols - Number of columns
 * @param {'sm'|'md'|'lg'|'xl'} props.gap - Grid gap size
 * @param {Object} props.responsive - Responsive column configuration
 */
export function Grid({
  children,
  cols = 1,
  gap = 'md',
  responsive = {},
  className = '',
  ...props
}) {
  const gapClasses = {
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6',
    xl: 'gap-8'
  }

  const colClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
    12: 'grid-cols-12'
  }

  const responsiveClasses = Object.entries(responsive).map(([breakpoint, cols]) => {
    const prefix = breakpoint === 'base' ? '' : `${breakpoint}:`
    return `${prefix}${colClasses[cols]}`
  }).join(' ')

  const classes = cn(
    'grid',
    colClasses[cols],
    gapClasses[gap],
    responsiveClasses,
    className
  )

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  )
}

/**
 * Stack Component - Vertical stacking
 * @param {Object} props - Stack props
 * @param {React.ReactNode} props.children - Stack content
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} props.spacing - Stack spacing
 * @param {'start'|'center'|'end'|'stretch'} props.align - Alignment
 */
export function Stack({
  children,
  spacing = 'md',
  align = 'stretch',
  className = '',
  ...props
}) {
  const spacingClasses = {
    xs: 'space-y-1',
    sm: 'space-y-2',
    md: 'space-y-4',
    lg: 'space-y-6',
    xl: 'space-y-8'
  }

  const alignClasses = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch'
  }

  const classes = cn(
    'flex flex-col',
    spacingClasses[spacing],
    alignClasses[align],
    className
  )

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  )
}

/**
 * Inline Component - Horizontal stacking
 * @param {Object} props - Inline props
 * @param {React.ReactNode} props.children - Inline content
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} props.spacing - Inline spacing
 * @param {'start'|'center'|'end'|'between'|'around'} props.justify - Justification
 * @param {'start'|'center'|'end'|'stretch'} props.align - Alignment
 * @param {boolean} props.wrap - Whether to wrap items
 */
export function Inline({
  children,
  spacing = 'md',
  justify = 'start',
  align = 'center',
  wrap = false,
  className = '',
  ...props
}) {
  const spacingClasses = {
    xs: 'space-x-1',
    sm: 'space-x-2',
    md: 'space-x-4',
    lg: 'space-x-6',
    xl: 'space-x-8'
  }

  const justifyClasses = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
    around: 'justify-around'
  }

  const alignClasses = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch'
  }

  const classes = cn(
    'flex',
    spacingClasses[spacing],
    justifyClasses[justify],
    alignClasses[align],
    {
      'flex-wrap': wrap
    },
    className
  )

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  )
}

/**
 * Divider Component
 * @param {Object} props - Divider props
 * @param {'horizontal'|'vertical'} props.orientation - Divider orientation
 * @param {string} props.label - Optional label
 * @param {'solid'|'dashed'|'dotted'} props.style - Line style
 */
export function Divider({
  orientation = 'horizontal',
  label,
  style = 'solid',
  className = ''
}) {
  const orientationClasses = {
    horizontal: 'w-full h-px',
    vertical: 'h-full w-px'
  }

  const styleClasses = {
    solid: 'border-solid',
    dashed: 'border-dashed',
    dotted: 'border-dotted'
  }

  if (label && orientation === 'horizontal') {
    return (
      <div className={cn('relative', className)}>
        <div className="absolute inset-0 flex items-center">
          <div className={cn('w-full border-t border-gray-300', styleClasses[style])} />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-2 text-gray-500">{label}</span>
        </div>
      </div>
    )
  }

  const classes = cn(
    'border-gray-300',
    orientationClasses[orientation],
    styleClasses[style],
    orientation === 'horizontal' ? 'border-t' : 'border-l',
    className
  )

  return <div className={classes} />
}

/**
 * Spacer Component
 * @param {Object} props - Spacer props
 * @param {'xs'|'sm'|'md'|'lg'|'xl'|'2xl'} props.size - Spacer size
 * @param {'horizontal'|'vertical'} props.direction - Spacer direction
 */
export function Spacer({
  size = 'md',
  direction = 'vertical',
  className = ''
}) {
  const sizeClasses = {
    vertical: {
      xs: 'h-1',
      sm: 'h-2',
      md: 'h-4',
      lg: 'h-6',
      xl: 'h-8',
      '2xl': 'h-12'
    },
    horizontal: {
      xs: 'w-1',
      sm: 'w-2',
      md: 'w-4',
      lg: 'w-6',
      xl: 'w-8',
      '2xl': 'w-12'
    }
  }

  const classes = cn(
    sizeClasses[direction][size],
    className
  )

  return <div className={classes} />
}

// PropTypes
Card.propTypes = {
  children: PropTypes.node.isRequired,
  padding: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
  shadow: PropTypes.bool,
  border: PropTypes.bool,
  className: PropTypes.string
}

CardHeader.propTypes = {
  children: PropTypes.node,
  title: PropTypes.string,
  subtitle: PropTypes.string,
  actions: PropTypes.node,
  className: PropTypes.string
}

CardContent.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string
}

CardFooter.propTypes = {
  children: PropTypes.node.isRequired,
  align: PropTypes.oneOf(['left', 'center', 'right', 'between']),
  className: PropTypes.string
}

Container.propTypes = {
  children: PropTypes.node.isRequired,
  maxWidth: PropTypes.oneOf(['sm', 'md', 'lg', 'xl', '2xl', 'full']),
  centered: PropTypes.bool,
  padding: PropTypes.oneOf(['none', 'sm', 'md', 'lg', 'xl']),
  className: PropTypes.string
}

Grid.propTypes = {
  children: PropTypes.node.isRequired,
  cols: PropTypes.number,
  gap: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
  responsive: PropTypes.object,
  className: PropTypes.string
}

Stack.propTypes = {
  children: PropTypes.node.isRequired,
  spacing: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),
  align: PropTypes.oneOf(['start', 'center', 'end', 'stretch']),
  className: PropTypes.string
}

Inline.propTypes = {
  children: PropTypes.node.isRequired,
  spacing: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),
  justify: PropTypes.oneOf(['start', 'center', 'end', 'between', 'around']),
  align: PropTypes.oneOf(['start', 'center', 'end', 'stretch']),
  wrap: PropTypes.bool,
  className: PropTypes.string
}

Divider.propTypes = {
  orientation: PropTypes.oneOf(['horizontal', 'vertical']),
  label: PropTypes.string,
  style: PropTypes.oneOf(['solid', 'dashed', 'dotted']),
  className: PropTypes.string
}

Spacer.propTypes = {
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl', '2xl']),
  direction: PropTypes.oneOf(['horizontal', 'vertical']),
  className: PropTypes.string
}
