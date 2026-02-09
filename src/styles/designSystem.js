/**
 * DecentraLabs Design System - Color Palette and Design Tokens
 * Central source of truth for all styling variables and tokens
 */

// Brand Colors
export const colors = {
  // Primary brand colors
  primary: {
    50: 'oklch(0.9595 0.02 286.02)',
    100: 'oklch(0.9321 0.0351 291)',
    200: 'oklch(0.8776 0.0646 290.86)',
    300: 'oklch(0.8034 0.1067 290.42)',
    400: 'oklch(0.7129 0.1598 288.64)',
    500: 'oklch(0.6206 0.2149 285.55)',
    600: 'oklch(0.5147 0.0779 303.87)', // Main brand color
    700: 'oklch(0.4411 0.0639 303.2)',
    800: 'oklch(0.3868 0.0539 303.2)',
    900: 'oklch(0.3394 0.0436 305.14)',
    950: 'oklch(0.2481 0.0365 300.7)'
  },
  
  // Secondary colors
  secondary: {
    50: 'oklch(0.9842 0.0034 247.86)',
    100: 'oklch(0.9683 0.0069 247.9)',
    200: 'oklch(0.9288 0.0126 255.51)',
    300: 'oklch(0.869 0.0198 252.89)',
    400: 'oklch(0.7107 0.0351 256.79)',
    500: 'oklch(0.5544 0.0407 257.42)',
    600: 'oklch(0.4455 0.0374 257.28)',
    700: 'oklch(0.3717 0.0392 257.29)',
    800: 'oklch(0.2795 0.0368 260.03)',
    900: 'oklch(0.2077 0.0398 265.75)',
    950: 'oklch(0.1288 0.0406 264.7)'
  },
  
  // UI Colors  
  background: {
    light: '#ffffff',
    dark: '#0a0a0a',
    surface: 'oklch(0.2849 0.008 223.72)', // Main app background
    card: '#ffffff',
    overlay: 'rgba(0, 0, 0, 0.5)'
  },
  
  // Text colors
  text: {
    primary: '#171717',     // Main text color (gray-900)
    secondary: 'oklch(0.4346 0.0458 221.3)',   // Secondary color used in the project
    muted: 'oklch(0.551 0.0234 264.36)',       // Muted text (gray-500)
    inverse: '#ffffff',     // White text
    accent: 'oklch(0.5147 0.0779 303.87)',      // Brand accent text
    neutral: {
      50: 'oklch(0.9846 0.0017 247.84)',        // Very light gray
      100: 'oklch(0.967 0.0029 264.54)',       // Light gray
      200: 'oklch(0.9276 0.0058 264.53)',       // Border gray
      300: 'oklch(0.8717 0.0093 258.34)',       // Medium border
      400: 'oklch(0.7137 0.0192 261.32)',       // Muted text
      500: 'oklch(0.551 0.0234 264.36)',       // Standard muted
      600: 'oklch(0.4461 0.0263 256.8)',       // Dark muted
      700: 'oklch(0.3729 0.0306 259.73)',       // Darker text
      800: 'oklch(0.2781 0.0296 256.85)',       // Very dark text
      900: 'oklch(0.2101 0.0318 264.66)'        // Almost black
    }
  },
  
  // Status colors
  status: {
    success: {
      light: 'oklch(0.9624 0.0434 156.74)',     // bg-green-50 equivalent 
      DEFAULT: 'oklch(0.6861 0.073 155.61)',   // Light green used in the project
      dark: 'oklch(0.5903 0.0723 151.91)',      // Darker green for hover
      bg: 'oklch(0.9819 0.0181 155.83)',        // Very light background
      border: 'oklch(0.925 0.0806 155.99)',    // Light border
      text: 'oklch(0.5273 0.1371 150.07)'       // Dark text for contrast
    },
    warning: {
      light: 'oklch(0.9619 0.058 95.62)',     // bg-yellow-50 equivalent
      DEFAULT: 'oklch(0.7686 0.1647 70.08)',   // Warning yellow
      dark: 'oklch(0.6658 0.1574 58.32)',      // Darker yellow for hover
      bg: 'oklch(0.9869 0.0214 95.28)',        // Very light background
      border: 'oklch(0.9015 0.0729 70.7)',    // Light border
      text: 'oklch(0.4732 0.1247 46.2)'       // Dark text for contrast
    },
    error: {
      light: 'oklch(0.9705 0.0129 17.38)',     // bg-red-50 equivalent
      DEFAULT: 'oklch(0.6184 0.0666 1.23)',   // Light pink/red used in the project
      dark: 'oklch(0.5273 0.0618 5.15)',      // Darker pink for hover
      bg: 'oklch(0.9705 0.0129 17.38)',        // Very light background (red-50)
      border: 'oklch(0.8845 0.0593 18.33)',    // Light border (red-200)
      text: 'oklch(0.5771 0.2152 27.33)'       // Dark text for contrast (red-600)
    },
    info: {
      light: 'oklch(0.9319 0.0316 255.59)',     // bg-blue-50 equivalent
      DEFAULT: 'oklch(0.6231 0.188 259.81)',   // Info blue
      dark: 'oklch(0.4882 0.2172 264.38)',      // Darker blue for hover
      bg: 'oklch(0.9705 0.0142 254.6)',        // Very light background
      border: 'oklch(0.8823 0.0571 254.13)',    // Light border
      text: 'oklch(0.4882 0.2172 264.38)'       // Dark text for contrast
    }
  },
  
  // Calendar and booking colors
  calendar: {
    header: 'oklch(0.8943 0.0512 262.12)',    // Light blue header background
    selected: 'oklch(0.5147 0.0779 303.87)',  // Primary brand color for selected items
    hover: 'oklch(0.3744 0.064 269.15)',     // Dark blue for hover states
    booked: 'oklch(0.8151 0.0788 253.4)',    // Light blue for booked slots
    pending: 'oklch(0.7686 0.1647 70.08)',   // Warning yellow for pending
    available: 'oklch(0.6271 0.1699 149.21)'  // Success green for available slots
  },
  
  // Booking status colors (semantic)
  booking: {
    pending: {
      bg: 'oklch(0.9869 0.0214 95.28)',        // yellow-50
      text: 'oklch(0.4732 0.1247 46.2)',      // yellow-800  
      border: 'oklch(0.9015 0.0729 70.7)'     // yellow-200
    },
    confirmed: {
      bg: 'oklch(0.9819 0.0181 155.83)',        // green-50
      text: 'oklch(0.5273 0.1371 150.07)',      // green-700
      border: 'oklch(0.925 0.0806 155.99)'     // green-200
    },
    used: {
      bg: 'oklch(0.9705 0.0142 254.6)',        // blue-50
      text: 'oklch(0.4882 0.2172 264.38)',      // blue-700
      border: 'oklch(0.8823 0.0571 254.13)'     // blue-200
    },
    collected: {
      bg: 'oklch(0.9846 0.0017 247.84)',        // gray-50
      text: 'oklch(0.3729 0.0306 259.73)',      // gray-700
      border: 'oklch(0.9276 0.0058 264.53)'     // gray-200
    },
    cancelled: {
      bg: 'oklch(0.9705 0.0129 17.38)',        // red-50
      text: 'oklch(0.5771 0.2152 27.33)',      // red-600
      border: 'oklch(0.8845 0.0593 18.33)'     // red-200
    }
  },
  
  // Brand aliases for common use cases
  brand: {
    primary: 'oklch(0.5147 0.0779 303.87)',     // Main brand color (same as primary.600)
    secondary: 'oklch(0.8943 0.0512 262.12)',   // Light brand color for backgrounds
    dark: 'oklch(0.3744 0.064 269.15)',        // Dark brand color for hovers/emphasis
    light: 'oklch(0.9595 0.02 286.02)'        // Very light brand color
  },
  
  // Additional UI colors used in the application
  ui: {
    // Action colors
    action: {
      primary: 'oklch(0.6437 0.0672 135.92)',         // Main green for actions
      primaryHover: 'oklch(0.6908 0.083 137.3)',    // Green hover
      secondary: 'oklch(0.8334 0.079 278.21)',       // Light blue for secondary actions
      secondaryHover: 'oklch(0.7877 0.0674 271.58)',  // Blue hover
      neutral: 'oklch(0.6683 0.0462 218.71)',         // Neutral bluish gray
      neutralHover: 'oklch(0.5671 0.0475 244.47)'     // Neutral bluish gray hover
    },
    // Label/badge colors
    label: {
      dark: 'oklch(0.3581 0.0816 293.36)',        // Dark for labels
      medium: 'oklch(0.4346 0.0458 221.3)',      // Medium for labels
      light: 'oklch(0.6138 0.0631 269.53)',       // Light for labels
      purple: 'oklch(0.5852 0.0775 286.43)'       // Purple for special labels
    }
  }
}

// Typography scale
export const typography = {
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['Consolas', 'Monaco', 'monospace']
  },
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],
    sm: ['0.875rem', { lineHeight: '1.25rem' }],
    base: ['1rem', { lineHeight: '1.5rem' }],
    lg: ['1.125rem', { lineHeight: '1.75rem' }],
    xl: ['1.25rem', { lineHeight: '1.75rem' }],
    '2xl': ['1.5rem', { lineHeight: '2rem' }],
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
    '5xl': ['3rem', { lineHeight: '1' }],
    '6xl': ['3.75rem', { lineHeight: '1' }]
  },
  fontWeight: {
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800'
  }
}

// Spacing scale
export const spacing = {
  0: '0px',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
  32: '8rem',
  40: '10rem',
  48: '12rem',
  56: '14rem',
  64: '16rem'
}

// Border radius
export const borderRadius = {
  none: '0',
  sm: '0.125rem',
  DEFAULT: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  '3xl': '1.5rem',
  full: '9999px'
}

// Shadows
export const boxShadow = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  none: 'none',
  glow: '0 0 20px rgb(113 92 140 / 0.3)'
}

// Transitions
export const transitions = {
  duration: {
    75: '75ms',
    100: '100ms',
    150: '150ms',
    200: '200ms',
    300: '300ms',
    500: '500ms',
    700: '700ms',
    1000: '1000ms'
  },
  timingFunction: {
    DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)'
  }
}

// Component design tokens
export const components = {
  button: {
    padding: {
      sm: '0.375rem 0.75rem',
      md: '0.5rem 1rem',
      lg: '0.75rem 1.5rem',
      xl: '1rem 2rem'
    },
    borderRadius: borderRadius.md,
    fontWeight: typography.fontWeight.medium,
    transition: 'all 150ms ease-in-out'
  },
  
  input: {
    padding: '0.5rem 0.75rem',
    borderRadius: borderRadius.md,
    borderWidth: '1px',
    transition: 'border-color 150ms ease-in-out, box-shadow 150ms ease-in-out'
  },
  
  card: {
    padding: '1.5rem',
    borderRadius: borderRadius.lg,
    boxShadow: boxShadow.md,
    transition: 'transform 150ms ease-in-out, box-shadow 150ms ease-in-out'
  },
  
  modal: {
    borderRadius: borderRadius.lg,
    padding: '1.5rem',
    maxWidth: '32rem',
    boxShadow: boxShadow['2xl']
  }
}

// Animation presets
export const animations = {
  fadeIn: 'fadeIn 200ms ease-out',
  slideIn: 'slide-in 300ms ease-out forwards',
  glow: 'glow 2s infinite alternate',
  pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
}

// Breakpoints
export const screens = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px'
}

// Design system object
const designSystem = {
  colors,
  typography,
  spacing,
  borderRadius,
  boxShadow,
  transitions,
  components,
  animations,
  screens
}

export default designSystem
